from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils.translation import gettext_lazy as _
import uuid


class OutletFilteredManager(models.Manager):
    """Custom manager that filters queries by outletId for outlet-specific models."""

    def for_outlet(self, outlet_id):
        """Filter queryset by outlet_id."""
        return self.filter(outlet_id=outlet_id)


class StaffManager(BaseUserManager):
    """Custom manager for Staff user model."""

    def create_user(self, phone, password=None, **extra_fields):
        """Create and save a regular staff member."""
        if not phone:
            raise ValueError(_('Phone number is required'))
        user = self.model(phone=phone, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra_fields):
        """Create and save a superuser staff member."""
        extra_fields.setdefault('role', 'super_admin')
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(phone, password, **extra_fields)


class Staff(AbstractBaseUser, PermissionsMixin):
    """Custom User model for staff members with PIN auth and role-based permissions."""

    ROLE_CHOICES = [
        ('super_admin', 'Super Admin'),
        ('admin', 'Admin'),
        ('manager', 'Manager'),
        ('billing_staff', 'Billing Staff'),
        ('view_only', 'View Only'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='staff_members')
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, unique=True)
    email = models.EmailField(null=True, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='billing_staff')
    staff_pin = models.CharField(max_length=128, help_text='PIN for kiosk/quick auth')
    avatar_url = models.URLField(null=True, blank=True)
    max_discount = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    can_edit_rate = models.BooleanField(default=False)
    can_view_purchase_rates = models.BooleanField(default=False)
    can_create_purchases = models.BooleanField(default=False)
    can_access_reports = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    joining_date = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = StaffManager()
    outlet_objects = OutletFilteredManager()

    USERNAME_FIELD = 'phone'
    REQUIRED_FIELDS = ['name']

    class Meta:
        db_table = 'accounts_staff'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['outlet', 'is_active']),
            models.Index(fields=['phone']),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_role_display()})"


class Customer(models.Model):
    """Customer profile with credit and purchase history."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='customers')
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20)
    address = models.TextField(null=True, blank=True)
    state = models.CharField(max_length=100, null=True, blank=True)
    dob = models.DateField(null=True, blank=True)
    gstin = models.CharField(max_length=15, null=True, blank=True, help_text='For B2B customers')

    # Credit terms
    fixed_discount = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                                         help_text='Fixed discount % for this customer')
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    outstanding = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                      help_text='Current outstanding balance')

    # Purchase history
    total_purchases = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                          help_text='Lifetime purchase value')
    total_visits = models.IntegerField(default=0, help_text='Total number of visits/transactions')
    is_chronic = models.BooleanField(default=False, help_text='Chronic patient with regular medications')
    is_active = models.BooleanField(default=True)

    # Health & Medical
    blood_group = models.CharField(max_length=5, null=True, blank=True,
                                  help_text='Blood group (A+, A-, B+, B-, AB+, AB-, O+, O-)')
    allergies = models.JSONField(default=list, blank=True,
                                help_text='List of drug allergies as string array')
    chronic_conditions = models.JSONField(default=list, blank=True,
                                        help_text='List of chronic conditions/diseases as string array')

    # Doctor & Refills
    preferred_doctor = models.ForeignKey('accounts.Doctor', on_delete=models.SET_NULL, null=True, blank=True,
                                        related_name='patients', help_text='Patient\'s preferred doctor')
    last_refill_date = models.DateField(null=True, blank=True,
                                       help_text='Date of last medicine refill')
    next_refill_due = models.DateField(null=True, blank=True,
                                      help_text='Expected date of next medicine refill')
    notes = models.TextField(null=True, blank=True, help_text='Clinical notes or special instructions')

    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'accounts_customer'
        ordering = ['-created_at']
        unique_together = [('outlet', 'phone')]
        indexes = [
            models.Index(fields=['outlet', 'is_active']),
            models.Index(fields=['phone', 'outlet']),
        ]

    @property
    def outstanding_balance(self):
        from apps.accounts.models import Ledger
        ledger = Ledger.objects.filter(linked_customer=self, group__name='Sundry Debtors').first()
        return ledger.current_balance if ledger else self.outstanding

    def __str__(self):
        return self.name


class Doctor(models.Model):
    """Doctor profile for prescription details on Schedule H drugs."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='doctors')
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, null=True, blank=True)
    registration_no = models.CharField(max_length=50, null=True, blank=True, help_text='Medical registration number')
    degree = models.CharField(max_length=100, null=True, blank=True)
    qualification = models.CharField(max_length=255, null=True, blank=True)
    specialty = models.CharField(max_length=100, null=True, blank=True)
    hospital_name = models.CharField(max_length=255, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'accounts_doctor'
        ordering = ['name']
        indexes = [
            models.Index(fields=['outlet', 'is_active']),
        ]

    def __str__(self):
        return f"Dr. {self.name} ({self.specialty})"


class RegularMedicine(models.Model):
    """
    A medicine that a customer takes regularly (chronic patient refill tracking).
    Maps exactly to the RegularMedicine TypeScript interface:
      productId, name, qty, frequency (Daily | Weekly | Monthly)
    """

    FREQUENCY_CHOICES = [
        ('Daily', 'Daily'),
        ('Weekly', 'Weekly'),
        ('Monthly', 'Monthly'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='regular_medicines',
    )
    outlet = models.ForeignKey(
        'core.Outlet',
        on_delete=models.CASCADE,
        related_name='regular_medicines',
        help_text='Denormalized from customer for outlet-level filtering',
    )

    # Fields matching RegularMedicine TypeScript interface exactly
    product_id = models.CharField(
        max_length=255,
        help_text='productId — references the Product record',
    )
    name = models.CharField(
        max_length=255,
        help_text='Medicine name (denormalized for display speed)',
    )
    qty = models.PositiveIntegerField(
        default=1,
        help_text='Quantity per refill',
    )
    frequency = models.CharField(
        max_length=10,
        choices=FREQUENCY_CHOICES,
        default='Monthly',
        help_text='How often the medicine is refilled: Daily | Weekly | Monthly',
    )
    notes = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'accounts_regular_medicine'
        ordering = ['name']
        indexes = [
            models.Index(fields=['customer', 'outlet']),
            models.Index(fields=['outlet', 'product_id']),
        ]

    def __str__(self):
        return f"{self.name} x{self.qty} ({self.frequency}) — {self.customer.name}"


class LedgerGroup(models.Model):
    NATURE_CHOICES = [
        ('asset', 'Asset'),
        ('liability', 'Liability'),
        ('income', 'Income'),
        ('expense', 'Expense'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    parent = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children'
    )
    nature = models.CharField(max_length=20, choices=NATURE_CHOICES)
    is_system = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        unique_together = ['outlet', 'name']
        db_table = 'accounts_ledgergroup'

    def __str__(self):
        return self.name


class Ledger(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    group = models.ForeignKey(LedgerGroup, on_delete=models.PROTECT)
    opening_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    balance_type = models.CharField(max_length=5, default='Dr')
    current_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    phone = models.CharField(max_length=15, blank=True)
    gstin = models.CharField(max_length=15, blank=True)
    address = models.TextField(blank=True)
    linked_customer = models.ForeignKey(
        'accounts.Customer', null=True, blank=True, on_delete=models.SET_NULL, related_name='ledgers'
    )
    linked_distributor = models.ForeignKey(
        'purchases.Distributor', null=True, blank=True, on_delete=models.SET_NULL, related_name='ledgers'
    )
    is_system = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    # Contact
    station = models.CharField(max_length=100, blank=True)
    mail_to = models.CharField(max_length=255, blank=True)
    contact_person = models.CharField(max_length=255, blank=True)
    designation = models.CharField(max_length=100, blank=True)
    phone_office = models.CharField(max_length=15, blank=True)
    phone_residence = models.CharField(max_length=15, blank=True)
    fax_no = models.CharField(max_length=15, blank=True)
    website = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    pincode = models.CharField(max_length=10, blank=True)

    # Compliance
    freeze_upto = models.DateField(null=True, blank=True)
    dl_no = models.CharField(max_length=50, blank=True)
    dl_expiry = models.DateField(null=True, blank=True)
    vat_no = models.CharField(max_length=50, blank=True)
    vat_expiry = models.DateField(null=True, blank=True)
    st_no = models.CharField(max_length=50, blank=True)
    st_expiry = models.DateField(null=True, blank=True)
    food_licence_no = models.CharField(max_length=50, blank=True)
    food_licence_expiry = models.DateField(null=True, blank=True)
    extra_heading_no = models.CharField(max_length=50, blank=True)
    extra_heading_expiry = models.DateField(null=True, blank=True)
    pan_no = models.CharField(max_length=10, blank=True)
    it_pan_no = models.CharField(max_length=10, blank=True)

    # GST / Tax
    gst_heading = models.CharField(
        max_length=20,
        choices=[('local', 'Local'), ('central', 'Central'), ('exempt', 'Exempt')],
        default='local',
    )
    bill_export = models.CharField(
        max_length=20,
        choices=[('gstn', 'GSTN'), ('non_gstn', 'Non-GSTN')],
        default='gstn',
    )
    ledger_type = models.CharField(
        max_length=30,
        choices=[
            ('registered', 'Registered'),
            ('unregistered', 'Unregistered'),
            ('composition', 'Composition'),
            ('consumer', 'Consumer'),
        ],
        default='registered',
    )

    # Settings
    balancing_method = models.CharField(
        max_length=20,
        choices=[('bill_by_bill', 'Bill by Bill'), ('on_account', 'On Account')],
        default='bill_by_bill',
    )
    ledger_category = models.CharField(max_length=50, default='OTHERS')
    state = models.CharField(max_length=50, blank=True)
    country = models.CharField(max_length=50, default='India')
    color = models.CharField(
        max_length=20,
        choices=[('normal', 'Normal'), ('red', 'Red'), ('green', 'Green'), ('blue', 'Blue')],
        default='normal',
    )
    is_hidden = models.BooleanField(default=False)
    retailio_id = models.CharField(max_length=100, blank=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'accounts_ledger'
        unique_together = ['outlet', 'name']

    def __str__(self):
        return self.name


class Voucher(models.Model):
    VOUCHER_TYPES = [
        ('receipt', 'Receipt'),
        ('payment', 'Payment'),
        ('contra', 'Contra'),
        ('journal', 'Journal'),
    ]
    PAYMENT_MODES = [
        ('cash', 'Cash'),
        ('bank', 'Bank'),
        ('upi', 'UPI'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE)
    voucher_type = models.CharField(max_length=20, choices=VOUCHER_TYPES)
    voucher_no = models.CharField(max_length=50)
    date = models.DateField()
    narration = models.TextField(blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODES, default='cash')
    created_by = models.ForeignKey('accounts.Staff', on_delete=models.PROTECT, related_name='vouchers_created')
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        unique_together = ['outlet', 'voucher_no']
        db_table = 'accounts_voucher'

    def __str__(self):
        return f"{self.voucher_no} - ₹{self.total_amount}"


class VoucherLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    voucher = models.ForeignKey(Voucher, related_name='lines', on_delete=models.CASCADE)
    ledger = models.ForeignKey(Ledger, on_delete=models.PROTECT)
    debit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    description = models.TextField(blank=True)

    class Meta:
        db_table = 'accounts_voucherline'

    def __str__(self):
        return f"Dr:{self.debit} Cr:{self.credit}"


class VoucherBillAdjustment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    voucher = models.ForeignKey(
        'Voucher', related_name='bill_adjustments', on_delete=models.CASCADE
    )
    invoice_type = models.CharField(
        max_length=20,
        choices=[('sale', 'Sale Invoice'), ('purchase', 'Purchase Invoice')],
    )
    sale_invoice = models.ForeignKey(
        'billing.SaleInvoice', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='bill_adjustments',
    )
    purchase_invoice = models.ForeignKey(
        'purchases.PurchaseInvoice', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='bill_adjustments',
    )
    adjusted_amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'accounts_voucherbilladjustment'

    def __str__(self):
        return f"Adj ₹{self.adjusted_amount} on {self.invoice_type}"


class DebitNote(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE)
    debit_note_no = models.CharField(max_length=50)
    date = models.DateField()
    distributor = models.ForeignKey('purchases.Distributor', on_delete=models.PROTECT)
    purchase_invoice = models.ForeignKey(
        'purchases.PurchaseInvoice', null=True, blank=True, on_delete=models.SET_NULL
    )
    reason = models.TextField()
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=[('pending', 'Pending'), ('adjusted', 'Adjusted'), ('refunded', 'Refunded')],
        default='pending'
    )
    created_by = models.ForeignKey('accounts.Staff', on_delete=models.PROTECT, related_name='debit_notes_created')
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        unique_together = ['outlet', 'debit_note_no']
        db_table = 'accounts_debitnote'

    def __str__(self):
        return self.debit_note_no


class DebitNoteItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    debit_note = models.ForeignKey(DebitNote, related_name='items', on_delete=models.CASCADE)
    batch = models.ForeignKey('inventory.Batch', on_delete=models.PROTECT)
    product_name = models.CharField(max_length=255)
    qty = models.DecimalField(max_digits=10, decimal_places=2)
    rate = models.DecimalField(max_digits=10, decimal_places=2)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = 'accounts_debitnoteitem'


class CreditNote(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE)
    credit_note_no = models.CharField(max_length=50)
    date = models.DateField()
    customer = models.ForeignKey(
        'accounts.Customer', null=True, blank=True, on_delete=models.SET_NULL, related_name='credit_notes'
    )
    sale_invoice = models.ForeignKey(
        'billing.SaleInvoice', null=True, blank=True, on_delete=models.SET_NULL, related_name='credit_notes'
    )
    reason = models.TextField()
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=[('pending', 'Pending'), ('adjusted', 'Adjusted'), ('refunded', 'Refunded')],
        default='pending'
    )
    created_by = models.ForeignKey('accounts.Staff', on_delete=models.PROTECT, related_name='credit_notes_created')
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        unique_together = ['outlet', 'credit_note_no']
        db_table = 'accounts_creditnote'

    def __str__(self):
        return self.credit_note_no


class CreditNoteItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    credit_note = models.ForeignKey(CreditNote, related_name='items', on_delete=models.CASCADE)
    batch = models.ForeignKey('inventory.Batch', on_delete=models.PROTECT)
    product_name = models.CharField(max_length=255)
    qty = models.DecimalField(max_digits=10, decimal_places=2)
    rate = models.DecimalField(max_digits=10, decimal_places=2)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = 'accounts_creditnoteitem'


class JournalEntry(models.Model):
    """
    Double-entry journal entry created automatically when transactions (sales, purchases, vouchers) are saved.
    Provides audit trail and enforces double-entry accounting (total debits = total credits).
    """
    SOURCE_TYPES = [
        ('SALE', 'Sale Invoice'),
        ('PURCHASE', 'Purchase Invoice'),
        ('VOUCHER', 'Voucher'),
        ('RETURN', 'Return / Reversal'),
        ('CREDIT_PAYMENT', 'Credit Payment Collection'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='journal_entries')
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPES)
    source_id = models.UUIDField(help_text='ID of the SaleInvoice, PurchaseInvoice, Voucher, or source return')
    date = models.DateField(help_text='Transaction date')
    narration = models.TextField(blank=True, help_text='Transaction description')
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'accounts_journalentry'
        unique_together = ['outlet', 'source_type', 'source_id']
        indexes = [
            models.Index(fields=['outlet', 'source_type', 'source_id']),
            models.Index(fields=['outlet', 'date']),
        ]

    def __str__(self):
        return f"{self.source_type} {self.source_id} on {self.date}"


class JournalLine(models.Model):
    """
    Individual debit/credit line in a journal entry.
    Each line updates a single ledger account.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    journal_entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name='lines')
    ledger = models.ForeignKey(Ledger, on_delete=models.PROTECT, related_name='journal_lines')
    debit_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text='Amount debited to this ledger (if any)'
    )
    credit_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text='Amount credited to this ledger (if any)'
    )

    class Meta:
        db_table = 'accounts_journalline'

    def __str__(self):
        if self.debit_amount > 0:
            return f"Dr {self.ledger.name} ₹{self.debit_amount}"
        else:
            return f"Cr {self.ledger.name} ₹{self.credit_amount}"
