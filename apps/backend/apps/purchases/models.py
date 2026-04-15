from django.db import models
from decimal import Decimal
import uuid


class OutletFilteredManager(models.Manager):
    """Custom manager that filters queries by outletId for outlet-specific models."""

    def for_outlet(self, outlet_id):
        """Filter queryset by outlet_id."""
        return self.filter(outlet_id=outlet_id)


class Distributor(models.Model):
    """Distributor/Supplier profile with credit terms."""

    BALANCE_TYPE_CHOICES = [
        ('CR', 'Credit (Distributor Owes Us)'),
        ('DR', 'Debit (We Owe Distributor)'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='distributors')
    name = models.CharField(max_length=255)
    gstin = models.CharField(max_length=15, null=True, blank=True, unique=True)
    drug_license_no = models.CharField(max_length=100, null=True, blank=True)
    food_license_no = models.CharField(max_length=50, null=True, blank=True)
    phone = models.CharField(max_length=20)
    email = models.EmailField(null=True, blank=True)
    address = models.TextField()
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)

    # Credit terms
    credit_days = models.IntegerField(default=0, help_text='Credit period in days')
    opening_balance = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True,
                                          help_text='Opening balance for ledger')
    balance_type = models.CharField(max_length=2, choices=BALANCE_TYPE_CHOICES, default='CR',
                                    help_text='CR = distributor owes us, DR = we owe distributor')

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'purchases_distributor'
        ordering = ['name']
        indexes = [
            models.Index(fields=['outlet', 'is_active']),
            models.Index(fields=['gstin']),
        ]

    def __str__(self):
        return self.name


class PurchaseInvoice(models.Model):
    """Purchase GRN (Goods Receipt Note) with multi-godown support and bill-by-bill payment tracking."""

    GODOWN_LOCATION_CHOICES = [
        ('main', 'Main Warehouse'),
        ('cold_storage', 'Cold Storage'),
        ('secondary', 'Secondary Warehouse'),
    ]

    PURCHASE_TYPE_CHOICES = [
        ('cash', 'Cash Purchase'),
        ('credit', 'Credit Purchase'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='purchase_invoices')
    distributor = models.ForeignKey(Distributor, on_delete=models.PROTECT, related_name='purchase_invoices')

    # Invoice details
    invoice_no = models.CharField(max_length=50, help_text='Distributor invoice number')
    invoice_date = models.DateField()
    due_date = models.DateField(null=True, blank=True, help_text='Credit purchase due date')
    purchase_type = models.CharField(max_length=20, choices=PURCHASE_TYPE_CHOICES, default='credit')
    purchase_order_ref = models.CharField(max_length=100, null=True, blank=True, help_text='PO reference')

    # Godown/Warehouse location (Marg parity)
    godown = models.CharField(max_length=50, choices=GODOWN_LOCATION_CHOICES, default='main',
                              help_text='Physical warehouse location for stock')

    # Bill amounts
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, help_text='Sum of item amounts before discount')
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                          help_text='Total trade + cash discount')
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2, help_text='subtotal - discount')

    # GST
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                     help_text='Total SGST+CGST or IGST')
    cess_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                      help_text='Cess on applicable items')

    freight = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                  help_text='Transport/freight charges')
    round_off = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                    help_text='Penny rounding (±)')
    ledger_adjustment = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                            help_text='Adjustment amounts (e.g. from Debit Notes)')
    ledger_note = models.CharField(max_length=255, null=True, blank=True,
                                   help_text='Optional note explaining the ledger adjustment')

    # Grand total
    grand_total = models.DecimalField(max_digits=12, decimal_places=2,
                                      help_text='taxable + gst + cess + freight + roundOff - ledgerAdjustment')

    # Payment tracking (for bill-by-bill allocation)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                      help_text='Amount paid so far')
    outstanding = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                      help_text='grandTotal - amountPaid (used for payment allocation)')

    # Audit & notes
    created_by = models.ForeignKey('accounts.Staff', on_delete=models.SET_NULL, null=True,
                                   related_name='purchase_invoices_created')
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'purchases_purchaseinvoice'
        ordering = ['-invoice_date', '-created_at']
        indexes = [
            models.Index(fields=['outlet', 'invoice_date']),
            models.Index(fields=['outlet', 'distributor']),
            models.Index(fields=['invoice_no', 'outlet']),
        ]
        unique_together = [['outlet', 'invoice_no']]

    def __str__(self):
        return f"{self.invoice_no} - ₹{self.grand_total}"


class PurchaseItem(models.Model):
    """Individual line item in a purchase GRN (with batch & stock injection)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(PurchaseInvoice, on_delete=models.CASCADE, related_name='items')
    batch = models.ForeignKey('inventory.Batch', on_delete=models.PROTECT, related_name='purchase_items',
                              help_text='FK to Batch for stock injection on purchase save')

    # Product (can be custom if masterProductId is null)
    master_product = models.ForeignKey('inventory.MasterProduct', on_delete=models.SET_NULL,
                                       null=True, blank=True, related_name='purchase_items')
    custom_product_name = models.CharField(max_length=255, null=True, blank=True,
                                           help_text='For custom/unregistered products')
    is_custom_product = models.BooleanField(default=False)

    # Identification
    hsn_code = models.CharField(max_length=20, null=True, blank=True,
                                help_text='GST/GSTR-2 compliance code')
    batch_no = models.CharField(max_length=100)
    expiry_date = models.DateField()

    # Quantity structure (packs + loose units)
    pkg = models.IntegerField(help_text='Pack size (e.g., 10 tabs/strip)')
    qty = models.IntegerField(help_text='Number of packs purchased')
    actual_qty = models.IntegerField(help_text='pkg × qty — units added to inventory')
    free_qty = models.IntegerField(default=0, help_text='Free units from distributor')

    # Pricing (Marg tri-level pricing: MRP, PTR, PTS)
    purchase_rate = models.DecimalField(max_digits=10, decimal_places=2, help_text='Cost per pack')
    discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                                       help_text='Trade discount %')
    cash_discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                                            help_text='Cash discount %')
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text='GST rate %')
    cess = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                               help_text='Cess % (special category items)')

    # Tri-level pricing
    mrp = models.DecimalField(max_digits=10, decimal_places=2, help_text='Maximum Retail Price')
    ptr = models.DecimalField(max_digits=10, decimal_places=2,
                              help_text='Price to Retailer (distributor margin)')
    pts = models.DecimalField(max_digits=10, decimal_places=2,
                              help_text='Price to Stockist (wholesaler margin)')
    sale_rate = models.DecimalField(max_digits=10, decimal_places=2,
                                    help_text='Our sale rate for this batch')
                                    
    # Inward landing costs
    freight_per_unit = models.DecimalField(max_digits=10, decimal_places=4, default=0, help_text="Freight/transport cost apportioned per unit for this batch")
    other_cost_per_unit = models.DecimalField(max_digits=10, decimal_places=4, default=0, help_text="Any other inward cost per unit (loading, unloading, etc.)")

    def get_landing_cost(self, include_gst: bool = False) -> Decimal:
        """
        Compute the minimum price floor for this batch.
        include_gst: True if pharmacy does not claim ITC (GST is added to cost).
                     False if pharmacy claims ITC (GST is recovered as credit, not a cost).
        """
        base = self.purchase_rate
        if include_gst:
            gst_amount = base * (self.gst_rate / Decimal('100'))
            base = base + gst_amount
        base = base + self.freight_per_unit + self.other_cost_per_unit
        return base.quantize(Decimal('0.0001'))

    # Computed amounts (stored for reporting/audit)
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2)
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2)
    cess_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'purchases_purchaseitem'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['invoice', 'batch']),
        ]

    def __str__(self):
        product_name = self.master_product.name if self.master_product else self.custom_product_name
        return f"{product_name} - {self.batch_no}"
