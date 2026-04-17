from decimal import Decimal
from datetime import date
from django.db import transaction
from django.core.exceptions import ValidationError
import logging

from apps.accounts.models import (
    LedgerGroup, Ledger, Voucher, VoucherLine, VoucherBillAdjustment,
    DebitNote, DebitNoteItem, CreditNote, CreditNoteItem,
    Customer,
)

logger = logging.getLogger(__name__)


class LedgerService:

    DEFAULT_GROUPS = [
        ('Cash in Hand', 'asset', None),
        ('Bank Accounts', 'asset', None),
        ('Sundry Debtors', 'asset', None),
        ('Sundry Creditors', 'liability', None),
        ('Indirect Expenses', 'expense', None),
        ('Indirect Incomes', 'income', None),
        ('Duties & Taxes', 'liability', None),
        ('Capital Account', 'liability', None),
    ]

    DEFAULT_LEDGERS = [
        ('Cash', 'Cash in Hand', True),
        ('State Bank of India', 'Bank Accounts', False),
        ('Salary', 'Indirect Expenses', False),
        ('Shop Rent', 'Indirect Expenses', False),
        ('Electricity', 'Indirect Expenses', False),
        ('GST Input', 'Duties & Taxes', False),
        ('GST Payable', 'Current Liabilities', False),
    ]

    @staticmethod
    @transaction.atomic
    def seed_default_ledgers(outlet):
        """Auto-create standard ledger groups and ledgers for a new outlet."""
        group_map = {}
        for name, nature, _ in LedgerService.DEFAULT_GROUPS:
            group, _ = LedgerGroup.objects.get_or_create(
                outlet=outlet,
                name=name,
                defaults={'nature': nature, 'is_system': True},
            )
            group_map[name] = group

        for ledger_name, group_name, is_system in LedgerService.DEFAULT_LEDGERS:
            group = group_map.get(group_name)
            if group:
                Ledger.objects.get_or_create(
                    outlet=outlet,
                    name=ledger_name,
                    defaults={'group': group, 'is_system': is_system},
                )

    @staticmethod
    @transaction.atomic
    def sync_customer_ledgers(outlet):
        """Auto-create/update ledger for each customer as Sundry Debtor."""
        try:
            group = LedgerGroup.objects.get(outlet=outlet, name='Sundry Debtors')
        except LedgerGroup.DoesNotExist:
            return

        for customer in Customer.objects.for_outlet(outlet.id):
            ledger, created = Ledger.objects.get_or_create(
                outlet=outlet,
                linked_customer=customer,
                defaults={
                    'name': customer.name,
                    'group': group,
                    'phone': customer.phone or '',
                    'gstin': customer.gstin or '',
                },
            )
            if not created:
                # Sync phone (and other fields) even for existing ledgers
                updated_fields = []
                if ledger.phone != (customer.phone or ''):
                    ledger.phone = customer.phone or ''
                    updated_fields.append('phone')
                if ledger.gstin != (customer.gstin or ''):
                    ledger.gstin = customer.gstin or ''
                    updated_fields.append('gstin')
                if updated_fields:
                    ledger.save(update_fields=updated_fields)

    @staticmethod
    @transaction.atomic
    def sync_distributor_ledgers(outlet):
        """Auto-create/update ledger for each distributor as Sundry Creditor."""
        from apps.purchases.models import Distributor
        try:
            group = LedgerGroup.objects.get(outlet=outlet, name='Sundry Creditors')
        except LedgerGroup.DoesNotExist:
            return

        for distributor in Distributor.objects.for_outlet(outlet.id):
            ledger, created = Ledger.objects.get_or_create(
                outlet=outlet,
                linked_distributor=distributor,
                defaults={
                    'name': distributor.name,
                    'group': group,
                    'phone': distributor.phone or '',
                    'gstin': distributor.gstin or '',
                    'state': distributor.state or '',
                },
            )
            # Always keep ledger.state in sync with distributor.state
            if not created and ledger.state != (distributor.state or ''):
                ledger.state = distributor.state or ''
                ledger.save(update_fields=['state'])

    @staticmethod
    @transaction.atomic
    def update_balance(ledger_id, debit, credit):
        """Update ledger current_balance after a voucher line. Dr increases asset, Cr decreases."""
        ledger = Ledger.objects.select_for_update().get(id=ledger_id)
        debit = Decimal(str(debit))
        credit = Decimal(str(credit))
        # For asset/expense ledgers: Dr increases balance, Cr decreases
        # For liability/income ledgers: Cr increases balance, Dr decreases
        nature = ledger.group.nature
        if nature in ('asset', 'expense'):
            ledger.current_balance += debit - credit
        else:
            ledger.current_balance += credit - debit
        ledger.save(update_fields=['current_balance'])
        return ledger


class VoucherService:

    PREFIXES = {
        'receipt': 'REC',
        'payment': 'PAY',
        'contra': 'CON',
        'journal': 'JRN',
    }

    @staticmethod
    def generate_voucher_no(outlet_id, voucher_type):
        """Returns next voucher number e.g. REC-2026-0001."""
        prefix = VoucherService.PREFIXES.get(voucher_type, 'VCH')
        year = date.today().year
        count = Voucher.objects.filter(
            outlet_id=outlet_id,
            voucher_type=voucher_type,
            date__year=year,
        ).count()
        return f"{prefix}-{year}-{count + 1:04d}"

    @staticmethod
    @transaction.atomic
    def create_voucher(outlet_id, staff_id, data):
        """Validate and create a voucher, updating ledger balances."""
        voucher_type = data['voucher_type']
        lines_data = data.get('lines', [])

        if not lines_data:
            raise ValidationError('Voucher must have at least one line.')

        total_debit = sum(Decimal(str(l.get('debit', 0))) for l in lines_data)
        total_credit = sum(Decimal(str(l.get('credit', 0))) for l in lines_data)

        if voucher_type == 'journal' and total_debit != total_credit:
            raise ValidationError('Journal voucher: total debit must equal total credit.')

        # ── Direction guard for Receipt and Payment vouchers ──────────────────
        # Receipt: money comes IN → cash/bank ledger is DEBITED, party (income/customer) is CREDITED.
        #   If someone selects an Expense ledger in a Receipt, that is a user error.
        # Payment: money goes OUT → cash/bank ledger is CREDITED, party (expense/supplier) is DEBITED.
        #   If an Expense ledger appears as a CREDIT in a Payment, also wrong.
        if voucher_type in ('receipt', 'payment'):
            for line in lines_data:
                line_debit = Decimal(str(line.get('debit', 0)))
                line_credit = Decimal(str(line.get('credit', 0)))
                if line_debit == 0 and line_credit == 0:
                    continue
                try:
                    ledger = Ledger.objects.select_related('group').get(id=line['ledger_id'])
                except Ledger.DoesNotExist:
                    continue
                nature = ledger.group.nature
                if voucher_type == 'receipt' and nature == 'expense' and line_credit > 0:
                    raise ValidationError(
                        f"Receipt voucher: expense ledger '{ledger.name}' cannot be credited. "
                        f"Use a Payment voucher to record expenses paid out."
                    )
                if voucher_type == 'payment' and nature == 'expense' and line_credit > 0:
                    raise ValidationError(
                        f"Payment voucher: expense ledger '{ledger.name}' must be debited, not credited. "
                        f"Expenses are always on the debit side for a Payment voucher."
                    )
                if voucher_type == 'receipt' and nature == 'expense' and line_debit > 0:
                    raise ValidationError(
                        f"Receipt voucher: expense ledger '{ledger.name}' cannot be debited in a Receipt. "
                        f"Use a Payment voucher to record an expense."
                    )

        # Contra: both ledgers must be Cash in Hand or Bank Accounts
        if voucher_type == 'contra':
            for line in lines_data:
                ledger = Ledger.objects.select_related('group').get(id=line['ledger_id'])
                if ledger.group.name not in ('Cash in Hand', 'Bank Accounts'):
                    raise ValidationError(
                        f"Contra voucher: ledger '{ledger.name}' must be Cash or Bank."
                    )

        voucher_no = VoucherService.generate_voucher_no(outlet_id, voucher_type)

        voucher = Voucher.objects.create(
            outlet_id=outlet_id,
            voucher_type=voucher_type,
            voucher_no=voucher_no,
            date=data['date'],
            narration=data.get('narration', ''),
            total_amount=data['total_amount'],
            payment_mode=data.get('payment_mode', 'cash'),
            created_by_id=staff_id,
        )

        for line in lines_data:
            VoucherLine.objects.create(
                voucher=voucher,
                ledger_id=line['ledger_id'],
                debit=line.get('debit', 0),
                credit=line.get('credit', 0),
                description=line.get('description', ''),
            )
            LedgerService.update_balance(
                line['ledger_id'],
                line.get('debit', 0),
                line.get('credit', 0),
            )

        # Process bill adjustments (Receipt/Payment only)
        for adj in data.get('bill_adjustments', []):
            invoice_type = adj.get('invoice_type')
            adjusted_amount = Decimal(str(adj.get('adjusted_amount', 0)))
            if adjusted_amount <= 0:
                continue

            if invoice_type == 'sale':
                sale_inv_id = adj.get('invoice_id')
                VoucherBillAdjustment.objects.create(
                    voucher=voucher,
                    invoice_type='sale',
                    sale_invoice_id=sale_inv_id,
                    adjusted_amount=adjusted_amount,
                )
                # Reduce customer outstanding
                try:
                    from apps.billing.models import SaleInvoice
                    inv = SaleInvoice.objects.select_related('customer').get(id=sale_inv_id)
                    if inv.customer_id:
                        customer = Customer.objects.select_for_update().get(
                            id=inv.customer_id, outlet_id=outlet_id
                        )
                        customer.outstanding = max(
                            Decimal('0'), customer.outstanding - adjusted_amount
                        )
                        customer.save(update_fields=['outstanding'])
                except Exception:
                    pass

            elif invoice_type == 'purchase':
                purchase_inv_id = adj.get('invoice_id')
                VoucherBillAdjustment.objects.create(
                    voucher=voucher,
                    invoice_type='purchase',
                    purchase_invoice_id=purchase_inv_id,
                    adjusted_amount=adjusted_amount,
                )
                # Reduce purchase invoice outstanding
                try:
                    from apps.purchases.models import PurchaseInvoice
                    inv = PurchaseInvoice.objects.select_for_update().get(id=purchase_inv_id)
                    inv.outstanding = max(Decimal('0'), inv.outstanding - adjusted_amount)
                    inv.save(update_fields=['outstanding'])
                except Exception:
                    pass

        # Post journal entry to general ledger (auto journal posting)
        try:
            from apps.accounts.journal_service import post_voucher
            post_voucher(voucher)
        except Exception as e:
            logger.error(f"Journal posting failed for voucher {voucher.id}: {e}")
            raise  # Re-raise to rollback entire transaction

        return voucher

    @staticmethod
    def get_pending_bills(outlet_id, ledger_id):
        """
        Return unpaid/partially paid invoices for a ledger.
        For Sundry Debtor ledgers: returns SaleInvoices for linked customer.
        For Sundry Creditor ledgers: returns PurchaseInvoices for linked distributor.
        """
        from decimal import Decimal as D
        try:
            ledger = Ledger.objects.select_related('group').get(id=ledger_id, outlet_id=outlet_id)
        except Ledger.DoesNotExist:
            return []

        result = []
        group_name = ledger.group.name

        if group_name == 'Sundry Debtors' and ledger.linked_customer_id:
            from apps.billing.models import SaleInvoice
            from django.db.models import Sum
            invoices = SaleInvoice.objects.filter(
                outlet_id=outlet_id,
                customer_id=ledger.linked_customer_id,
                payment_mode='credit',
            ).order_by('invoice_date')
            for inv in invoices:
                already_adjusted = VoucherBillAdjustment.objects.filter(
                    sale_invoice_id=inv.id
                ).aggregate(total=Sum('adjusted_amount'))['total'] or D('0')
                outstanding = max(D('0'), inv.grand_total - already_adjusted)
                if outstanding > 0:
                    result.append({
                        'id': str(inv.id),
                        'invoiceNo': inv.invoice_no,
                        'date': str(inv.invoice_date.date()),
                        'grandTotal': float(inv.grand_total),
                        'outstanding': float(outstanding),
                        'invoiceType': 'sale',
                    })

        elif group_name == 'Sundry Creditors' and ledger.linked_distributor_id:
            from apps.purchases.models import PurchaseInvoice
            invoices = PurchaseInvoice.objects.filter(
                outlet_id=outlet_id,
                distributor_id=ledger.linked_distributor_id,
                outstanding__gt=0,
            ).order_by('date')
            for inv in invoices:
                result.append({
                    'id': str(inv.id),
                    'invoiceNo': inv.invoice_no,
                    'date': str(inv.date),
                    'grandTotal': float(inv.grand_total),
                    'outstanding': float(inv.outstanding),
                    'invoiceType': 'purchase',
                })

        return result


class DebitNoteService:

    @staticmethod
    def generate_debit_note_no(outlet_id):
        year = date.today().year
        count = DebitNote.objects.filter(outlet_id=outlet_id, date__year=year).count()
        return f"DN-{year}-{count + 1:04d}"

    @staticmethod
    @transaction.atomic
    def create(outlet_id, staff_id, data):
        """Create a debit note and restore batch stock."""
        from apps.inventory.models import Batch
        from apps.purchases.models import Distributor, PurchaseInvoice

        items_data = data.get('items', [])
        if not items_data:
            raise ValidationError('Debit note must have at least one item.')

        note_no = DebitNoteService.generate_debit_note_no(outlet_id)

        note = DebitNote.objects.create(
            outlet_id=outlet_id,
            debit_note_no=note_no,
            date=data['date'],
            distributor_id=data['distributor_id'],
            purchase_invoice_id=data.get('purchase_invoice_id'),
            reason=data['reason'],
            subtotal=data['subtotal'],
            gst_amount=data['gst_amount'],
            total_amount=data['total_amount'],
            created_by_id=staff_id,
        )

        ZERO_UUID = '00000000-0000-0000-0000-000000000000'
        for item in items_data:
            batch_id = item.get('batch_id')
            if not batch_id or str(batch_id) == ZERO_UUID:
                raise ValidationError(
                    f"Missing batch for item '{item.get('product_name', '?')}'. "
                    "Please select the item from a purchase invoice."
                )
            try:
                batch = Batch.objects.select_for_update().get(id=batch_id)
            except Batch.DoesNotExist:
                raise ValidationError(
                    f"Batch not found for item '{item.get('product_name', '?')}' (id={batch_id})."
                )
            qty = Decimal(str(item['qty']))

            DebitNoteItem.objects.create(
                debit_note=note,
                batch=batch,
                product_name=item['product_name'],
                qty=qty,
                rate=item['rate'],
                gst_rate=item.get('gst_rate', 0),
                total=item['total'],
            )

            # Reduce stock (goods are leaving the pharmacy to go back to the supplier)
            qty_to_return = int(qty)
            if batch.qty_strips < qty_to_return:
                raise ValidationError(f"Cannot return {qty_to_return}. Only {batch.qty_strips} available.")
            
            batch.qty_strips -= qty_to_return
            batch.save(update_fields=['qty_strips'])

        # Reduce distributor outstanding if linked to invoice
        if data.get('purchase_invoice_id'):
            try:
                inv = PurchaseInvoice.objects.select_for_update().get(
                    id=data['purchase_invoice_id']
                )
                inv.outstanding = max(
                    Decimal('0'), inv.outstanding - Decimal(str(data['total_amount']))
                )
                inv.save(update_fields=['outstanding'])
            except PurchaseInvoice.DoesNotExist:
                pass

        # Post the specific Debit Note amount to the ledger
        try:
            from apps.accounts.journal_service import post_debit_note
            post_debit_note(note)
            
            # Update the status so the UI knows it's fully processed!
            note.status = 'Completed'  # Note: If your system uses 'Approved' or 'Settled', use that instead
            note.save(update_fields=['status'])
            
        except Exception as e:
            logger.error(f"Journal posting failed for debit note {note.id}: {e}")
            raise ValidationError(f"Accounting failure: {e}")

        return note


class CreditNoteService:

    @staticmethod
    def generate_credit_note_no(outlet_id):
        year = date.today().year
        count = CreditNote.objects.filter(outlet_id=outlet_id, date__year=year).count()
        return f"CN-{year}-{count + 1:04d}"

    @staticmethod
    @transaction.atomic
    def create(outlet_id, staff_id, data):
        """Create a credit note, restore batch stock, and reduce customer outstanding."""
        from apps.inventory.models import Batch
        from apps.billing.models import SaleInvoice

        items_data = data.get('items', [])
        if not items_data:
            raise ValidationError('Credit note must have at least one item.')

        note_no = CreditNoteService.generate_credit_note_no(outlet_id)

        note = CreditNote.objects.create(
            outlet_id=outlet_id,
            credit_note_no=note_no,
            date=data['date'],
            customer_id=data.get('customer_id'),
            sale_invoice_id=data.get('sale_invoice_id'),
            reason=data['reason'],
            subtotal=data['subtotal'],
            gst_amount=data['gst_amount'],
            total_amount=data['total_amount'],
            created_by_id=staff_id,
        )

        for item in items_data:
            batch = Batch.objects.select_for_update().get(id=item['batch_id'])
            qty = Decimal(str(item['qty']))

            CreditNoteItem.objects.create(
                credit_note=note,
                batch=batch,
                product_name=item['product_name'],
                qty=qty,
                rate=item['rate'],
                gst_rate=item.get('gst_rate', 0),
                total=item['total'],
            )

            # Restore stock
            batch.qty_strips += int(qty)
            batch.save(update_fields=['qty_strips'])

        # Reduce customer outstanding
        if data.get('customer_id'):
            try:
                customer = Customer.objects.select_for_update().get(
                    id=data['customer_id'], outlet_id=outlet_id
                )
                customer.outstanding = max(
                    Decimal('0'),
                    customer.outstanding - Decimal(str(data['total_amount']))
                )
                customer.save(update_fields=['outstanding'])
            except Customer.DoesNotExist:
                pass

        # has_return is now a computed property on SaleInvoice (C10) — no DB write needed

        # Reverse journal entries from the original sale (if linked)
        if data.get('sale_invoice_id'):
            try:
                from apps.accounts.journal_service import reverse_journal
                reverse_journal('SALE', data['sale_invoice_id'], outlet_id, 'CREDIT NOTE REVERSAL OF')
            except Exception as e:
                logger.error(f"Journal reversal failed for credit note {note.id}: {e}")
                # Don't re-raise for reversals - note was created successfully

        return note
