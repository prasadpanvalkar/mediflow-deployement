from django.db import models
from django.core.exceptions import ValidationError
import uuid


class OutletFilteredManager(models.Manager):
    """Custom manager that filters queries by outletId for outlet-specific models."""

    def for_outlet(self, outlet_id):
        """Filter queryset by outlet_id."""
        return self.filter(outlet_id=outlet_id)


class SaleInvoice(models.Model):
    """Sales invoice/billing document with multi-split payment support."""

    PAYMENT_MODE_CHOICES = [
        ('cash', 'Cash'),
        ('upi', 'UPI'),
        ('card', 'Card'),
        ('credit', 'Credit'),
        ('cheque', 'Cheque'),
        ('bank_transfer', 'Bank Transfer'),
        ('split', 'Split'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='sale_invoices')
    invoice_no = models.CharField(max_length=50, help_text='e.g., INV-2026-000001')
    invoice_date = models.DateTimeField()
    customer = models.ForeignKey('accounts.Customer', on_delete=models.SET_NULL, null=True, blank=True)
    doctor = models.ForeignKey('accounts.Doctor', on_delete=models.SET_NULL, null=True, blank=True,
                               help_text='For Schedule H prescriptions')

    # Bill amounts
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, help_text='Before discount and tax')
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    extra_discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                                             help_text='Cart-level extra discount percentage')
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2)

    # GST (CGST + SGST for intrastate, IGST for interstate)
    cgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    igst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cgst = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text='CGST rate %')
    sgst = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text='SGST rate %')
    igst = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text='IGST rate %')

    round_off = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='Penny rounding adjustment')
    grand_total = models.DecimalField(max_digits=12, decimal_places=2)

    # Payment tracking (supports multi-split: cash + upi + card + credit)
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODE_CHOICES)
    cash_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    upi_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    card_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    credit_given = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, help_text='Total paid (cash+upi+card)')
    amount_due = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='Outstanding for credit sales')

    # Sale type
    is_return = models.BooleanField(default=False, help_text='Sales return/credit note')

    # Audit
    billed_by = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'billing_saleinvoice'
        ordering = ['-invoice_date', '-created_at']
        indexes = [
            models.Index(fields=['outlet', 'invoice_date']),
            models.Index(fields=['outlet', 'customer']),
            models.Index(fields=['invoice_no', 'outlet']),
        ]
        unique_together = [['outlet', 'invoice_no']]

    def __str__(self):
        return f"{self.invoice_no} - ₹{self.grand_total}"

    @property
    def has_return(self):
        """True when every item on this invoice has been fully returned."""
        items = list(self.items.all())
        # qty_returned is tracked in loose units (tablets/capsules), so compare against
        # total original units = (qty_strips * pack_size) + qty_loose
        return bool(items) and all(
            item.qty_returned >= (item.qty_strips * (item.pack_size or 1)) + item.qty_loose
            for item in items
        )

    def clean(self):
        """Validate invoice amounts and payment splits."""
        # Validate payment split sums to amount_paid
        split_total = self.cash_paid + self.upi_paid + self.card_paid
        if abs(float(split_total) - float(self.amount_paid)) > 0.01:
            raise ValidationError({
                'amount_paid': f'Amount paid ({self.amount_paid}) must equal sum of payment splits ({split_total})'
            })

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class SaleItem(models.Model):
    """Individual line item in a sale invoice (with FEFO batch tracking)."""

    SALE_MODE_CHOICES = [
        ('strip', 'Strip'),
        ('loose', 'Loose'),
        ('bottle', 'Bottle'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(SaleInvoice, on_delete=models.CASCADE, related_name='items')
    batch = models.ForeignKey('inventory.Batch', on_delete=models.PROTECT, related_name='sale_items',
                              help_text='FK to Batch ensures FEFO tracking and stock deduction')

    # Product details (denormalized from batch.product for reporting)
    product_name = models.CharField(max_length=255)
    composition = models.CharField(max_length=255, null=True, blank=True)
    pack_size = models.IntegerField(help_text='Units per pack (from product)')
    pack_unit = models.CharField(max_length=50)
    schedule_type = models.CharField(max_length=20, help_text='OTC/H/H1/X/Narcotic (from product)')

    # Pricing
    batch_no = models.CharField(max_length=100)
    expiry_date = models.DateField()
    mrp = models.DecimalField(max_digits=10, decimal_places=2)
    sale_rate = models.DecimalField(max_digits=10, decimal_places=2, help_text='Selling price per pack')
    rate = models.DecimalField(max_digits=10, decimal_places=2, help_text='Final charged rate per pack')

    # Quantity (supports negative for returns)
    qty_strips = models.IntegerField(help_text='Strips/packs (can be negative for returns)')
    qty_loose = models.IntegerField(default=0, help_text='Loose units (can be negative for returns)')
    qty_returned = models.PositiveIntegerField(default=0, help_text='Total units (tablets/capsules) returned so far across all return transactions')
    sale_mode = models.CharField(max_length=20, choices=SALE_MODE_CHOICES, default='strip')

    # Discount and tax
    discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, help_text='GST rate %')

    # Computed amounts
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2)
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'billing_saleitem'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.product_name} (Batch: {self.batch_no})"


class ScheduleHRegister(models.Model):
    """Regulatory compliance register for Schedule H/H1/X/Narcotic drugs."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale_item = models.OneToOneField(SaleItem, on_delete=models.CASCADE, related_name='schedule_h_register',
                                     help_text='FK to SaleItem for H/H1/X drug sales')

    # Patient details
    patient_name = models.CharField(max_length=255)
    patient_age = models.IntegerField()
    patient_address = models.TextField()

    # Doctor details
    doctor_name = models.CharField(max_length=255)
    doctor_reg_no = models.CharField(max_length=50, help_text='Medical registration number')
    prescription_no = models.CharField(max_length=100)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'billing_schedulehregister'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['sale_item']),
        ]

    def __str__(self):
        return f"Rx {self.prescription_no} - {self.patient_name}"


class CreditAccount(models.Model):
    """Customer credit/Udhari account management."""

    CREDIT_STATUS_CHOICES = [
        ('active', 'Active'),
        ('partial', 'Partially Paid'),
        ('cleared', 'Cleared'),
        ('overdue', 'Overdue'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='credit_accounts')
    customer = models.ForeignKey('accounts.Customer', on_delete=models.CASCADE, related_name='credit_accounts')

    # Credit terms
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_outstanding = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                            help_text='Current outstanding balance')

    # Totals (for reporting)
    total_borrowed = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                         help_text='Lifetime credit given')
    total_repaid = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                       help_text='Lifetime credit repaid')

    # Status
    status = models.CharField(max_length=20, choices=CREDIT_STATUS_CHOICES, default='active')
    last_transaction_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'billing_creditaccount'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['outlet', 'customer']),
            models.Index(fields=['outlet', 'status']),
        ]

    def __str__(self):
        return f"{self.customer.name} - Outstanding: ₹{self.total_outstanding}"


class CreditTransaction(models.Model):
    """Individual transaction on a customer credit account (Udhari ledger)."""

    TRANSACTION_TYPE_CHOICES = [
        ('debit', 'Debit (Credit Given)'),
        ('credit', 'Credit (Payment Received)'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    credit_account = models.ForeignKey(CreditAccount, on_delete=models.CASCADE, related_name='transactions')
    customer = models.ForeignKey('accounts.Customer', on_delete=models.CASCADE, related_name='credit_transactions')
    invoice = models.ForeignKey(SaleInvoice, on_delete=models.SET_NULL, null=True, blank=True,
                                help_text='Sale invoice for debit, null for payments')

    # Transaction details
    type = models.CharField(max_length=20, choices=TRANSACTION_TYPE_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=255)
    balance_after = models.DecimalField(max_digits=12, decimal_places=2,
                                        help_text='Running balance after this transaction')

    # Audit
    recorded_by = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    date = models.DateField(null=True, blank=True, help_text='Transaction date (if different from created_at)')

    class Meta:
        db_table = 'billing_credittransaction'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['credit_account', 'created_at']),
        ]

    def __str__(self):
        return f"{self.type.upper()}: ₹{self.amount} (Bal: ₹{self.balance_after})"


class PaymentEntry(models.Model):
    """Payment made to a distributor (with bill-by-bill allocation)."""

    PAYMENT_MODE_CHOICES = [
        ('cash', 'Cash'),
        ('upi', 'UPI'),
        ('card', 'Card'),
        ('cheque', 'Cheque'),
        ('bank_transfer', 'Bank Transfer'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='payment_entries')
    distributor = models.ForeignKey('purchases.Distributor', on_delete=models.PROTECT, related_name='payments')

    # Payment details
    date = models.DateField()
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODE_CHOICES)
    reference_no = models.CharField(max_length=100, null=True, blank=True,
                                    help_text='UTR/check number/transaction ID')
    notes = models.TextField(null=True, blank=True)

    # Audit
    created_by = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'billing_paymententry'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['outlet', 'distributor']),
            models.Index(fields=['outlet', 'date']),
        ]

    def __str__(self):
        return f"Payment to {self.distributor.name}: ₹{self.total_amount}"


class PaymentAllocation(models.Model):
    """Bill-by-bill allocation of a payment to specific purchase invoices (Marg-style offsetting)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(PaymentEntry, on_delete=models.CASCADE, related_name='allocations',
                                help_text='Parent payment entry')
    invoice = models.ForeignKey('purchases.PurchaseInvoice', on_delete=models.PROTECT, related_name='payment_allocations',
                                help_text='Invoice being paid off')

    # Allocation details (snapshot of invoice at time of payment)
    invoice_no = models.CharField(max_length=50, help_text='Invoice number (denormalized)')
    invoice_date = models.DateField(help_text='Invoice date (denormalized)')
    invoice_total = models.DecimalField(max_digits=12, decimal_places=2,
                                        help_text='Invoice grand total (denormalized)')
    current_outstanding = models.DecimalField(max_digits=12, decimal_places=2,
                                              help_text='Outstanding before this payment')
    allocated_amount = models.DecimalField(max_digits=12, decimal_places=2,
                                          help_text='Amount allocated to this invoice')

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'billing_paymentallocation'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['payment', 'invoice']),
            models.Index(fields=['invoice']),
        ]

    def __str__(self):
        return f"Allocation: {self.invoice_no} ← ₹{self.allocated_amount}"


class LedgerEntry(models.Model):
    """
    Immutable append-only ledger for both Distributor and Customer accounts.
    Tracks debit/credit/running balance (Marg accounting parity).
    """

    LEDGER_ENTRY_TYPE_CHOICES = [
        ('purchase', 'Purchase'),
        ('payment', 'Payment'),
        ('sale', 'Sale'),
        ('receipt', 'Receipt'),
        ('debit_note', 'Debit Note'),
        ('credit_note', 'Credit Note'),
        ('expense', 'Expense'),
        ('opening_balance', 'Opening Balance'),
    ]

    ENTITY_TYPE_CHOICES = [
        ('distributor', 'Distributor'),
        ('customer', 'Customer'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='ledger_entries')

    # Entity (supports both Distributor and Customer)
    entity_type = models.CharField(max_length=20, choices=ENTITY_TYPE_CHOICES)
    distributor = models.ForeignKey('purchases.Distributor', on_delete=models.PROTECT, null=True, blank=True,
                                    related_name='ledger_entries')
    customer = models.ForeignKey('accounts.Customer', on_delete=models.PROTECT, null=True, blank=True,
                                 related_name='ledger_entries')

    # Ledger details
    date = models.DateField()
    entry_type = models.CharField(max_length=30, choices=LEDGER_ENTRY_TYPE_CHOICES)
    reference_no = models.CharField(max_length=100, help_text='Invoice/Payment/Receipt number')
    description = models.CharField(max_length=255)

    # Debit/Credit amounts
    debit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    running_balance = models.DecimalField(max_digits=12, decimal_places=2,
                                          help_text='Balance after this entry (append-only)')

    # Immutability metadata
    created_at = models.DateTimeField(auto_now_add=True)
    # No update timestamps — this is append-only

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'billing_ledgerentry'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['outlet', 'distributor', 'date']),
            models.Index(fields=['outlet', 'customer', 'date']),
            models.Index(fields=['outlet', 'reference_no']),
        ]
        # Prevent updates and deletes at the database level (append-only)
        permissions = [
            ('cannot_update_ledger', 'User cannot update ledger entries'),
            ('cannot_delete_ledger', 'User cannot delete ledger entries'),
        ]

    def __str__(self):
        entity = self.distributor.name if self.entity_type == 'distributor' else self.customer.name
        return f"{self.entry_type.upper()}: {entity} - Bal: ₹{self.running_balance}"

    def clean(self):
        """Validate that either distributor or customer is set (but not both)."""
        if self.entity_type == 'distributor' and not self.distributor:
            raise ValidationError('Distributor must be set when entity_type is distributor')
        if self.entity_type == 'customer' and not self.customer:
            raise ValidationError('Customer must be set when entity_type is customer')

    def save(self, *args, **kwargs):
        """Append-only: block any UPDATE attempt at the ORM level."""
        if self.pk is not None:
            try:
                LedgerEntry.objects.get(pk=self.pk)
                # Record already exists in DB — this is an update, reject it
                raise ValidationError("LedgerEntry is append-only. Updates are not allowed.")
            except LedgerEntry.DoesNotExist:
                # pk set but not yet in DB (e.g. force_insert with explicit pk) — allow
                pass
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Append-only: block any DELETE attempt at the ORM level."""
        raise ValidationError("LedgerEntry is append-only. Deletion is not allowed.")


class ReceiptEntry(models.Model):
    """Payment received from a customer (with sale-invoice-level allocation)."""

    PAYMENT_MODE_CHOICES = [
        ('cash', 'Cash'),
        ('upi', 'UPI'),
        ('card', 'Card'),
        ('cheque', 'Cheque'),
        ('bank_transfer', 'Bank Transfer'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='receipt_entries')
    customer = models.ForeignKey('accounts.Customer', on_delete=models.PROTECT, related_name='receipt_entries')

    date = models.DateField()
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODE_CHOICES)
    reference_no = models.CharField(max_length=100, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    created_by = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'billing_receiptentry'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['outlet', 'customer']),
            models.Index(fields=['outlet', 'date']),
        ]

    def __str__(self):
        return f"Receipt from {self.customer.name}: ₹{self.total_amount}"


class ReceiptAllocation(models.Model):
    """Invoice-level allocation of a customer receipt."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt = models.ForeignKey(ReceiptEntry, on_delete=models.CASCADE, related_name='allocations')
    invoice = models.ForeignKey(SaleInvoice, on_delete=models.PROTECT, related_name='receipt_allocations')
    allocated_amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'billing_receiptallocation'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['receipt', 'invoice']),
        ]

    def __str__(self):
        return f"Allocation: {self.invoice.invoice_no} ← ₹{self.allocated_amount}"


class ExpenseEntry(models.Model):
    """Cash/operational expense entry."""

    EXPENSE_HEAD_CHOICES = [
        ('rent', 'Rent'),
        ('salary', 'Salary'),
        ('electricity', 'Electricity'),
        ('transport', 'Transport'),
        ('maintenance', 'Maintenance'),
        ('marketing', 'Marketing'),
        ('other', 'Other'),
    ]

    PAYMENT_MODE_CHOICES = [
        ('cash', 'Cash'),
        ('upi', 'UPI'),
        ('card', 'Card'),
        ('cheque', 'Cheque'),
        ('bank_transfer', 'Bank Transfer'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='expense_entries')

    date = models.DateField()
    expense_head = models.CharField(max_length=50, choices=EXPENSE_HEAD_CHOICES)
    custom_head = models.CharField(max_length=100, null=True, blank=True,
                                   help_text='Only used when expense_head=other')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODE_CHOICES)
    reference_no = models.CharField(max_length=100, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    created_by = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'billing_expenseentry'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['outlet', 'date']),
            models.Index(fields=['outlet', 'expense_head']),
        ]

    def __str__(self):
        return f"{self.expense_head}: ₹{self.amount} on {self.date}"


class SalesReturn(models.Model):
    """Sales return / credit note for a previously issued sale invoice."""

    REFUND_MODE_CHOICES = [
        ('cash', 'Cash'),
        ('upi', 'UPI'),
        ('credit_note', 'Credit Note'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='sales_returns')
    original_sale = models.ForeignKey(SaleInvoice, on_delete=models.PROTECT, related_name='returns')

    return_no = models.CharField(max_length=100, help_text='e.g., RTN-2026-000001')
    return_date = models.DateField()
    reason = models.TextField()
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    refund_mode = models.CharField(max_length=20, choices=REFUND_MODE_CHOICES)

    created_by = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'billing_salesreturn'
        ordering = ['-return_date', '-created_at']
        indexes = [
            models.Index(fields=['outlet', 'return_date']),
            models.Index(fields=['outlet', 'original_sale']),
            models.Index(fields=['return_no', 'outlet']),
        ]
        unique_together = [['outlet', 'return_no']]

    def __str__(self):
        return f"{self.return_no} - ₹{self.total_amount}"


class SalesReturnItem(models.Model):
    """Individual item line in a sales return."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sales_return = models.ForeignKey(SalesReturn, on_delete=models.CASCADE, related_name='items')
    original_sale_item = models.ForeignKey(SaleItem, on_delete=models.PROTECT, related_name='return_items')
    batch = models.ForeignKey('inventory.Batch', on_delete=models.PROTECT, related_name='return_items')

    # Denormalized from product/batch for reporting
    product_name = models.CharField(max_length=255)
    batch_no = models.CharField(max_length=100)

    qty_returned = models.IntegerField()
    return_rate = models.DecimalField(max_digits=10, decimal_places=2)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = 'billing_salesreturnitem'
        ordering = ['-id']

    def __str__(self):
        return f"{self.product_name} x{self.qty_returned} @ ₹{self.return_rate}"


class NotificationLog(models.Model):
    """Log of WhatsApp/SMS notifications sent to customers."""

    CHANNEL_CHOICES = [
        ('whatsapp', 'WhatsApp'),
        ('sms', 'SMS'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('sent', 'Sent'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='notification_logs')
    customer = models.ForeignKey('accounts.Customer', on_delete=models.CASCADE, related_name='notification_logs')
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, default='whatsapp')
    message = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'billing_notificationlog'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['outlet', 'customer']),
            models.Index(fields=['outlet', 'status']),
        ]

    def __str__(self):
        return f"{self.channel.upper()} to {self.customer.name}: {self.status}"
