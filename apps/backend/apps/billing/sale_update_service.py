from datetime import datetime, date, timedelta
from typing import Dict, Any, List
from decimal import Decimal, ROUND_FLOOR
from django.db import transaction
from django.db.models import Sum

from apps.core.models import Outlet, Staff
from apps.inventory.models import Batch, MasterProduct
from apps.billing.models import SaleInvoice, SaleItem, ScheduleHRegister, CreditAccount, CreditTransaction
from apps.accounts.models import Customer, Ledger, LedgerEntry, JournalEntry
from apps.accounts.services import LedgerService
from apps.accounts.journal_service import _get_ledger, _create_lines_and_update_balances, post_sale_invoice
from apps.billing.services import validate_sale_price, fefo_batch_select, schedule_h_validate

class SaleServiceError(Exception):
    pass

def rebuild_customer_ledger(outlet_id: str, customer_id: str, from_date: date):
    """Recalculate running_balance for a customer from a specific date."""
    entries = LedgerEntry.objects.filter(
        outlet_id=outlet_id, 
        customer_id=customer_id, 
        date__gte=from_date
    ).order_by('date', 'created_at')
    
    prev = LedgerEntry.objects.filter(
        outlet_id=outlet_id, 
        customer_id=customer_id, 
        date__lt=from_date
    ).order_by('-date', '-created_at').first()
    
    running = prev.running_balance if prev else Decimal('0')
    
    for entry in entries:
        running = running + entry.debit - entry.credit
        LedgerEntry.objects.filter(pk=entry.pk).update(running_balance=running)

@transaction.atomic
def atomic_sale_update(sale_id: str, payload: Dict[str, Any], outlet_id: str, updated_by_id: str) -> SaleInvoice:
    try:
        # Step 1: Validate and get SaleInvoice
        outlet = Outlet.objects.get(id=outlet_id)
        try:
            sale_invoice = SaleInvoice.objects.select_for_update().get(id=sale_id, outlet=outlet)
        except SaleInvoice.DoesNotExist:
            raise SaleServiceError(f"Sale {sale_id} not found")
        
        # Determine Billed By
        try:
            billed_by = Staff.objects.get(id=updated_by_id)
        except Staff.DoesNotExist:
            billed_by = None
            
        items_data = payload.get('items', [])
        schedule_h_data = payload.get('scheduleHData')
        client_grand_total = Decimal(str(payload.get('grandTotal', 0)))
        extra_discount_pct = Decimal(str(payload.get('extraDiscountPct', 0)))

        # Enforce max discount
        if billed_by:
            staff_max_discount = billed_by.max_discount
            for item_data in items_data:
                item_disc = Decimal(str(item_data.get('discountPct', 0)))
                if item_disc > staff_max_discount:
                    raise SaleServiceError(f"Discount {item_disc}% exceeds your maximum allowed discount of {staff_max_discount}%")

        # Validate payments
        cash_paid_val = Decimal(str(payload.get('cashPaid', 0)))
        upi_paid_val = Decimal(str(payload.get('upiPaid', 0)))
        card_paid_val = Decimal(str(payload.get('cardPaid', 0)))
        credit_given_val = Decimal(str(payload.get('creditGiven', 0)))
        payment_sum = cash_paid_val + upi_paid_val + card_paid_val + credit_given_val
        if abs(payment_sum - client_grand_total) > Decimal('0.01'):
            raise SaleServiceError(f"Payment amounts ({payment_sum}) do not match grand total ({client_grand_total})")

        # Step 2: Validate Schedule H
        cart_items = [{'scheduleType': item.get('scheduleType', 'OTC')} for item in items_data]
        try:
            schedule_h_validate(cart_items, schedule_h_data)
        except Exception as e:
            raise SaleServiceError(str(e))

        # Step 3: Identify new Customer
        party_ledger_id = payload.get('partyLedgerId')
        customer_id = payload.get('customerId')
        new_customer = None
        if party_ledger_id:
            try:
                party_ledger = Ledger.objects.select_related('linked_customer').get(id=party_ledger_id, outlet=outlet)
                if party_ledger.linked_customer:
                    new_customer = party_ledger.linked_customer
            except Ledger.DoesNotExist:
                raise SaleServiceError(f"Ledger {party_ledger_id} not found")
        elif customer_id:
            try:
                new_customer = Customer.objects.get(id=customer_id, outlet=outlet)
            except Customer.DoesNotExist:
                raise SaleServiceError(f"Customer {customer_id} not found")

        # Step 4: Revert old items and restore Batch stock
        old_items = sale_invoice.items.all()
        for old_item in old_items:
            batch = old_item.batch
            batch.qty_strips += old_item.qty_strips
            batch.qty_loose += old_item.qty_loose
            if batch.product.pack_size:
                while batch.qty_loose >= batch.product.pack_size:
                    batch.qty_strips += 1
                    batch.qty_loose -= batch.product.pack_size
            batch.save(update_fields=['qty_strips', 'qty_loose'])
            old_item.delete()

        # Step 5: Revert old accounting
        old_customer = sale_invoice.customer
        if old_customer:
            old_customer.total_purchases -= sale_invoice.grand_total
            old_customer.save(update_fields=['total_purchases'])

        # Reverse CreditTransaction
        old_credit_txs = CreditTransaction.objects.filter(invoice=sale_invoice)
        for tx in old_credit_txs:
            account = tx.credit_account
            account.total_outstanding -= tx.amount
            if tx.type == 'debit':
                account.total_borrowed -= tx.amount
            account.save(update_fields=['total_outstanding', 'total_borrowed'])
            tx.delete()

        # Reverse JournalEntry
        old_jes = JournalEntry.objects.filter(outlet=outlet, source_type='SALE', source_id=sale_invoice.id)
        for old_je in old_jes:
            for line in old_je.lines.all():
                LedgerService.update_balance(line.ledger.id, debit=line.credit_amount, credit=line.debit_amount)
            old_je.delete()

        # Step 6: Create new items and deduct stock
        sale_items = []
        for item_data in items_data:
            batch_id = item_data.get('batchId')
            product_id = item_data.get('productId')
            qty_strips_needed = item_data.get('qtyStrips', 0)
            qty_loose_needed = item_data.get('qtyLoose', 0)

            product = MasterProduct.objects.get(id=product_id)
            if batch_id:
                batch = Batch.objects.get(id=batch_id, outlet=outlet)
                total_loose_needed = (qty_strips_needed * (product.pack_size or 1)) + qty_loose_needed
                total_loose_available = (batch.qty_strips * (product.pack_size or 1)) + batch.qty_loose
                if total_loose_available < total_loose_needed:
                    raise SaleServiceError(f"Insufficient stock in batch {batch.batch_no}")
                batch_allocations = [{'batch': batch, 'qty_to_deduct': qty_strips_needed, 'loose_to_deduct': qty_loose_needed}]
            else:
                try:
                    batch_allocations = fefo_batch_select(str(outlet.id), str(product.id), qty_strips_needed)
                except Exception as e:
                    raise SaleServiceError(str(e))
                
            for batch_alloc in batch_allocations:
                batch = batch_alloc['batch']
                qty_to_deduct = batch_alloc.get('qty_to_deduct', 0)
                loose_to_deduct = batch_alloc.get('loose_to_deduct', 0)
                batch.qty_strips -= qty_to_deduct
                batch.qty_loose -= loose_to_deduct
                while batch.qty_loose < 0:
                    batch.qty_strips -= 1
                    batch.qty_loose += (product.pack_size or 1)
                batch.save()

                proposed_rate = Decimal(str(item_data.get('rate', batch.sale_rate)))
                pricing_check = validate_sale_price(proposed_rate, batch, str(outlet.id))
                if pricing_check.get('block'):
                    raise SaleServiceError(pricing_check['message'])

                sale_item = SaleItem.objects.create(
                    invoice=sale_invoice,
                    batch=batch,
                    product_name=product.name,
                    composition=product.composition,
                    pack_size=product.pack_size,
                    pack_unit=product.pack_unit,
                    schedule_type=product.schedule_type,
                    batch_no=batch.batch_no,
                    expiry_date=batch.expiry_date,
                    mrp=batch.mrp,
                    sale_rate=batch.sale_rate,
                    rate=proposed_rate,
                    qty_strips=qty_to_deduct,
                    qty_loose=loose_to_deduct, # Fix: Use loose_to_deduct
                    sale_mode=item_data.get('saleMode', 'strip'),
                    discount_pct=Decimal(str(item_data.get('discountPct', 0))),
                    gst_rate=Decimal(str(item_data.get('gstRate', 0))),
                    taxable_amount=Decimal(str(item_data.get('taxableAmount', 0))),
                    gst_amount=Decimal(str(item_data.get('gstAmount', 0))),
                    total_amount=Decimal(str(item_data.get('totalAmount', 0))),
                )
                sale_items.append(sale_item)

                if product.schedule_type in ['G', 'H', 'H1', 'X', 'C', 'Narcotic']:
                    ScheduleHRegister.objects.create(
                        sale_item=sale_item,
                        patient_name=schedule_h_data.get('patientName') if schedule_h_data else None,
                        patient_age=schedule_h_data.get('patientAge') if schedule_h_data else 0,
                        patient_address=schedule_h_data.get('patientAddress') if schedule_h_data else '',
                        doctor_name=schedule_h_data.get('doctorName') if schedule_h_data else None,
                        doctor_reg_no=schedule_h_data.get('doctorRegNo') if schedule_h_data else '',
                        prescription_no=schedule_h_data.get('prescriptionNo') if schedule_h_data else '',
                    )

        # Step 7: Update SaleInvoice
        invoice_date_str = payload['invoiceDate'].rstrip('Z').split('+')[0]
        invoice_date = datetime.fromisoformat(invoice_date_str)
        
        sale_invoice.customer = new_customer
        sale_invoice.invoice_date = invoice_date
        sale_invoice.subtotal = Decimal(str(payload.get('subtotal', 0)))
        sale_invoice.discount_amount = Decimal(str(payload.get('discountAmount', 0)))
        sale_invoice.extra_discount_pct = extra_discount_pct
        sale_invoice.payment_mode = payload.get('paymentMode', 'cash')
        sale_invoice.cash_paid = cash_paid_val
        sale_invoice.upi_paid = upi_paid_val
        sale_invoice.card_paid = card_paid_val
        sale_invoice.credit_given = credit_given_val
        sale_invoice.amount_paid = cash_paid_val + upi_paid_val + card_paid_val
        sale_invoice.amount_due = max(Decimal('0'), client_grand_total - sale_invoice.amount_paid)
        sale_invoice.grand_total = client_grand_total
        sale_invoice.billed_by = billed_by

        # Step 8: Re-derive GST
        discount_factor = Decimal('1') - extra_discount_pct / Decimal('100')
        server_taxable = Decimal('0')
        server_cgst = Decimal('0')
        server_sgst = Decimal('0')
        server_igst = Decimal('0')
        max_gst_rate = Decimal('0')

        for si in sale_items:
            pack_size = Decimal(str(si.pack_size)) if si.pack_size else Decimal('1')
            total_fractional_strips = Decimal(str(si.qty_strips)) + (Decimal(str(si.qty_loose)) / pack_size)
            raw_total = si.rate * total_fractional_strips
            discounted_total = (raw_total * discount_factor).quantize(Decimal('0.01'))
            gst_rate = si.gst_rate
            if gst_rate > 0:
                item_taxable = (discounted_total * Decimal('100') / (Decimal('100') + gst_rate)).quantize(Decimal('0.01'))
                item_gst = discounted_total - item_taxable
            else:
                item_taxable = discounted_total
                item_gst = Decimal('0')
            server_taxable += item_taxable
            item_cgst = (item_gst / 2).quantize(Decimal('0.01'), rounding=ROUND_FLOOR)
            item_sgst = item_gst - item_cgst
            server_cgst += item_cgst
            server_sgst += item_sgst
            if gst_rate > max_gst_rate:
                max_gst_rate = gst_rate

        raw_exact = server_taxable + server_cgst + server_sgst + server_igst
        server_round_off = client_grand_total - raw_exact

        sale_invoice.taxable_amount = server_taxable
        sale_invoice.cgst_amount = server_cgst
        sale_invoice.sgst_amount = server_sgst
        sale_invoice.igst_amount = server_igst
        sale_invoice.cgst = max_gst_rate / 2 if max_gst_rate > 0 else Decimal('0')
        sale_invoice.sgst = max_gst_rate / 2 if max_gst_rate > 0 else Decimal('0')
        sale_invoice.round_off = server_round_off
        sale_invoice.save()

        # Step 9: Credit Transactions
        if credit_given_val > 0 and new_customer:
            credit_account, _ = CreditAccount.objects.get_or_create(outlet=outlet, customer=new_customer)
            credit_account.total_outstanding += credit_given_val
            credit_account.total_borrowed += credit_given_val
            credit_account.last_transaction_date = datetime.now()
            credit_account.save()

            CreditTransaction.objects.create(
                credit_account=credit_account,
                customer=new_customer,
                invoice=sale_invoice,
                type='debit',
                amount=credit_given_val,
                description=f'Sale on {sale_invoice.invoice_no}',
                balance_after=credit_account.total_outstanding,
                recorded_by=billed_by,
                date=invoice_date.date(),
            )

        if new_customer:
            new_customer.total_purchases += sale_invoice.grand_total
            new_customer.save(update_fields=['total_purchases'])

            # Ledger entries
            invoice_d = invoice_date.date()
            
            # Sale Entry
            sale_entry = LedgerEntry.objects.filter(outlet=outlet, entity_type='customer', entry_type='sale', reference_no=sale_invoice.invoice_no).first()
            if sale_entry:
                LedgerEntry.objects.filter(pk=sale_entry.pk).update(
                    debit=sale_invoice.grand_total,
                    date=invoice_d,
                    customer=new_customer
                )
            else:
                last_ledger = LedgerEntry.objects.filter(outlet=outlet, customer=new_customer, date__lte=invoice_d).order_by('-date', '-created_at').first()
                running = (last_ledger.running_balance if last_ledger else Decimal('0')) + sale_invoice.grand_total
                LedgerEntry.objects.create(
                    outlet=outlet, entity_type='customer', customer=new_customer, date=invoice_d,
                    entry_type='sale', reference_no=sale_invoice.invoice_no, debit=sale_invoice.grand_total, credit=Decimal('0'), running_balance=running
                )
            
            # Receipt Entry
            total_paid = sale_invoice.amount_paid
            receipt_entry = LedgerEntry.objects.filter(outlet=outlet, entity_type='customer', entry_type='receipt', reference_no=sale_invoice.invoice_no).first()
            
            if total_paid > Decimal('0'):
                if receipt_entry:
                    LedgerEntry.objects.filter(pk=receipt_entry.pk).update(
                        credit=total_paid, date=invoice_d, customer=new_customer
                    )
                else:
                    # we will rebuild running balance anyway
                    LedgerEntry.objects.create(
                        outlet=outlet, entity_type='customer', customer=new_customer, date=invoice_d,
                        entry_type='receipt', reference_no=sale_invoice.invoice_no, debit=Decimal('0'), credit=total_paid, running_balance=Decimal('0')
                    )
            elif receipt_entry:
                # Need to delete the receipt entry. But since it's append-only, we can do `.all().delete()`
                LedgerEntry.objects.filter(pk=receipt_entry.pk).delete()

            rebuild_customer_ledger(str(outlet.id), str(new_customer.id), invoice_d)
            if old_customer and old_customer.id != new_customer.id:
                rebuild_customer_ledger(str(outlet.id), str(old_customer.id), min(invoice_d, old_customer.created_at.date()))

        # Post journal
        post_sale_invoice(sale_invoice)

        return sale_invoice

    except SaleServiceError:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise SaleServiceError(f"Unexpected error: {str(e)}")
