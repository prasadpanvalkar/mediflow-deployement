from decimal import Decimal
from datetime import date
from django.db import transaction
from django.core.exceptions import ValidationError

from apps.accounts.models import (
    LedgerGroup, Ledger, Voucher, VoucherLine,
    DebitNote, DebitNoteItem, CreditNote, CreditNoteItem,
    Customer,
)


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
        ('GST Output', 'Duties & Taxes', False),
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
            Ledger.objects.get_or_create(
                outlet=outlet,
                linked_customer=customer,
                defaults={
                    'name': customer.name,
                    'group': group,
                    'phone': customer.phone or '',
                    'gstin': customer.gstin or '',
                },
            )

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
            Ledger.objects.get_or_create(
                outlet=outlet,
                linked_distributor=distributor,
                defaults={
                    'name': distributor.name,
                    'group': group,
                    'phone': distributor.phone or '',
                    'gstin': distributor.gstin or '',
                },
            )

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

        return voucher


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

        for item in items_data:
            batch = Batch.objects.select_for_update().get(id=item['batch_id'])
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

            # Restore stock
            batch.qty_strips += int(qty)
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

        # Mark original invoice as having a return
        if data.get('sale_invoice_id'):
            try:
                inv = SaleInvoice.objects.get(id=data['sale_invoice_id'])
                inv.has_return = True
                inv.save(update_fields=['has_return'])
            except SaleInvoice.DoesNotExist:
                pass

        return note
