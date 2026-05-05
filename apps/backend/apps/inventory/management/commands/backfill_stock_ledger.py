from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum
from decimal import Decimal
from apps.purchases.models import PurchaseItem
from apps.billing.models import SaleItem
from apps.inventory.models import StockLedger, Batch
from apps.inventory.services import post_stock_ledger_entry


class Command(BaseCommand):
    help = 'Backfill StockLedger entries from all existing purchases and sales'

    def handle(self, *args, **options):
        # Clear existing stock ledger entries before backfill to avoid duplicates
        count = StockLedger.objects.count()
        self.stdout.write(f'Clearing {count} existing StockLedger entries...')
        StockLedger.objects.all().delete()

        # ────────────────────────────────────────────────────
        # Build a unified event list per batch, sorted by date
        # ────────────────────────────────────────────────────
        # Each event: (txn_date, sort_priority, event_dict)
        #   sort_priority: 0=OPENING, 1=PURCHASE_IN, 2=SALE_OUT
        #   This ensures OPENING comes first on same-date ties.

        batch_events = {}  # batch_id -> list of (txn_date, priority, event_dict)

        # ── OPENING STOCK ──
        opening_batches = Batch.objects.filter(
            is_opening_stock=True
        ).select_related('product', 'outlet')

        self.stdout.write(f'Collecting {opening_batches.count()} opening stock batches...')
        for batch in opening_batches:
            if not batch.product:
                self.stderr.write(f'SKIP opening batch {batch.pk}: no product')
                continue
            opening_qty = batch.opening_qty if batch.opening_qty is not None else batch.qty_strips
            if opening_qty <= 0:
                continue
            event = {
                'outlet': batch.outlet,
                'product': batch.product,
                'batch': batch,
                'txn_type': 'OPENING',
                'txn_date': batch.created_at.date(),
                'voucher_type': 'Opening Stock',
                'voucher_number': 'OPENING',
                'party_name': '',
                'qty_in': Decimal(str(opening_qty)),
                'qty_out': Decimal('0'),
                'rate': batch.purchase_rate or 0,
                'source_object': None,
            }
            batch_events.setdefault(batch.pk, []).append(
                (batch.created_at.date(), 0, event)
            )

        # ── PURCHASES ──
        purchase_items = PurchaseItem.objects.select_related(
            'invoice', 'invoice__outlet',
            'invoice__distributor', 'batch', 'batch__product'
        ).order_by('invoice__invoice_date', 'invoice__created_at')

        self.stdout.write(f'Collecting {purchase_items.count()} purchase items...')
        for item in purchase_items:
            if not item.batch or not item.batch.product:
                self.stderr.write(f'SKIP PurchaseItem {item.pk}: missing batch/product')
                continue
            inv_date = item.invoice.invoice_date
            if hasattr(inv_date, 'date'):
                inv_date = inv_date.date()
            event = {
                'outlet': item.invoice.outlet,
                'product': item.batch.product,
                'batch': item.batch,
                'txn_type': 'PURCHASE_IN',
                'txn_date': inv_date,
                'voucher_type': 'Purchase Invoice',
                'voucher_number': item.invoice.invoice_no,
                'party_name': item.invoice.distributor.name,
                'qty_in': Decimal(str(item.qty)) + Decimal(str(item.free_qty)),
                'qty_out': Decimal('0'),
                'rate': item.purchase_rate,
                'source_object': item,
            }
            batch_events.setdefault(item.batch.pk, []).append(
                (inv_date, 1, event)
            )

        # ── SALES ──
        sale_items = SaleItem.objects.select_related(
            'invoice', 'invoice__outlet',
            'invoice__customer', 'batch', 'batch__product'
        ).order_by('invoice__invoice_date', 'invoice__created_at')

        self.stdout.write(f'Collecting {sale_items.count()} sale items...')
        skipped = 0
        for item in sale_items:
            if not item.batch or not item.batch.product:
                self.stderr.write(f'SKIP SaleItem {item.pk}: missing batch/product')
                skipped += 1
                continue
            pack_size = item.batch.product.pack_size or 1
            deducted_qty = Decimal(str(item.qty_strips)) + (
                Decimal(str(item.qty_loose)) / Decimal(str(pack_size))
                if item.qty_loose else Decimal('0')
            )
            inv_date = item.invoice.invoice_date
            if hasattr(inv_date, 'date'):
                inv_date = inv_date.date()
            event = {
                'outlet': item.invoice.outlet,
                'product': item.batch.product,
                'batch': item.batch,
                'txn_type': 'SALE_OUT',
                'txn_date': inv_date,
                'voucher_type': 'Sale Invoice',
                'voucher_number': item.invoice.invoice_no,
                'party_name': item.invoice.customer.name if item.invoice.customer else 'Walk-in',
                'qty_in': Decimal('0'),
                'qty_out': deducted_qty,
                'rate': item.rate,
                'source_object': item,
            }
            batch_events.setdefault(item.batch.pk, []).append(
                (inv_date, 2, event)
            )

        if skipped:
            self.stderr.write(f'Skipped {skipped} sale items with missing batch/product data')

        # ────────────────────────────────────────────────────
        # Inject phantom OPENING for batches with sales but
        # no opening/purchase entry
        # ────────────────────────────────────────────────────
        phantom_count = 0
        for batch in Batch.objects.select_related('product', 'outlet').all():
            if not batch.product:
                continue
            events = batch_events.get(batch.pk, [])
            has_in = any(e[2]['txn_type'] in ('OPENING', 'PURCHASE_IN') for e in events)
            has_sales = any(e[2]['txn_type'] == 'SALE_OUT' for e in events)

            if has_sales and not has_in:
                # Need synthetic OPENING so running_qty doesn't go negative
                sold_total = sum(e[2]['qty_out'] for e in events if e[2]['txn_type'] == 'SALE_OUT')
                opening_qty = batch.opening_qty if batch.opening_qty is not None else (batch.qty_strips + sold_total)

                earliest_date = min(e[0] for e in events)
                event = {
                    'outlet': batch.outlet,
                    'product': batch.product,
                    'batch': batch,
                    'txn_type': 'OPENING',
                    'txn_date': earliest_date,
                    'voucher_type': 'Opening Stock',
                    'voucher_number': 'OPENING',
                    'party_name': '',
                    'qty_in': Decimal(str(opening_qty)),
                    'qty_out': Decimal('0'),
                    'rate': batch.purchase_rate or 0,
                    'source_object': None,
                }
                events.append((earliest_date, 0, event))
                batch_events[batch.pk] = events
                phantom_count += 1
                self.stdout.write(f'  Injected phantom OPENING for {batch} (qty={opening_qty})')

        if phantom_count:
            self.stdout.write(f'Injected {phantom_count} phantom OPENING entries for legacy batches')

        # ────────────────────────────────────────────────────
        # Process all events per batch in chronological order
        # ────────────────────────────────────────────────────
        self.stdout.write(f'Processing events for {len(batch_events)} batches...')
        total_entries = 0
        for batch_id, events in batch_events.items():
            # Sort by (txn_date, priority) so OPENING < PURCHASE < SALE on same day
            events.sort(key=lambda x: (x[0], x[1]))
            for _, _, ev in events:
                with transaction.atomic():
                    try:
                        post_stock_ledger_entry(**ev)
                        total_entries += 1
                    except Exception as e:
                        self.stderr.write(
                            f'ERROR on {ev["txn_type"]} batch={ev["batch"]}: {e}'
                        )

        # ────────────────────────────────────────────────────
        # Reconciliation: inject ADJUSTMENT entries where
        # ledger running_qty doesn't match actual batch qty
        # ────────────────────────────────────────────────────
        self.stdout.write('Running reconciliation check...')
        adjustments = 0
        for batch in Batch.objects.select_related('product', 'outlet').all():
            if not batch.product:
                continue
            last = (
                StockLedger.objects
                .filter(batch=batch)
                .order_by('-txn_date', '-created_at')
                .first()
            )
            if not last:
                continue

            pack_size = batch.product.pack_size or 1
            actual_qty = Decimal(str(batch.qty_strips)) + (
                Decimal(str(batch.qty_loose)) / Decimal(str(pack_size))
            )
            diff = actual_qty - last.running_qty
            if abs(diff) > Decimal('0.001'):
                with transaction.atomic():
                    if diff > 0:
                        post_stock_ledger_entry(
                            outlet=batch.outlet,
                            product=batch.product,
                            batch=batch,
                            txn_type='ADJUSTMENT_IN',
                            txn_date=last.txn_date,
                            voucher_type='Reconciliation',
                            voucher_number='RECON',
                            party_name='System Reconciliation',
                            qty_in=diff,
                            qty_out=Decimal('0'),
                            rate=batch.purchase_rate or 0,
                            source_object=None,
                        )
                    else:
                        post_stock_ledger_entry(
                            outlet=batch.outlet,
                            product=batch.product,
                            batch=batch,
                            txn_type='ADJUSTMENT_OUT',
                            txn_date=last.txn_date,
                            voucher_type='Reconciliation',
                            voucher_number='RECON',
                            party_name='System Reconciliation',
                            qty_in=Decimal('0'),
                            qty_out=abs(diff),
                            rate=batch.purchase_rate or 0,
                            source_object=None,
                        )
                adjustments += 1
                self.stdout.write(
                    f'  Adjustment for {batch.batch_no}: diff={diff} '
                    f'(ledger={last.running_qty} -> actual={actual_qty})'
                )

        if adjustments:
            self.stdout.write(f'Created {adjustments} reconciliation adjustments')

        # Final count
        total = StockLedger.objects.count()
        self.stdout.write(self.style.SUCCESS(
            f'Backfill complete. Total StockLedger entries: {total}'
        ))
