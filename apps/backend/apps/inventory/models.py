from django.db import models
from django.core.exceptions import ValidationError
import uuid


class OutletFilteredManager(models.Manager):
    """Custom manager that filters queries by outletId for outlet-specific models."""

    def for_outlet(self, outlet_id):
        """Filter queryset by outlet_id."""
        return self.filter(outlet_id=outlet_id)


class MasterProduct(models.Model):
    """Global product catalog (not outlet-specific)."""

    DRUG_TYPE_CHOICES = [
        ('allopathy', 'Allopathy'),
        ('ayurveda', 'Ayurveda'),
        ('homeo', 'Homeopathy'),
        ('fmcg', 'FMCG'),
    ]

    SCHEDULE_TYPE_CHOICES = [
        ('OTC', 'OTC'),
        ('H', 'Schedule H'),
        ('H1', 'Schedule H1'),
        ('X', 'Schedule X'),
        ('Narcotic', 'Narcotic'),
    ]

    PACK_TYPE_CHOICES = [
        ('strip', 'Strip'),
        ('bottle', 'Bottle'),
        ('vial', 'Vial'),
        ('box', 'Box'),
        ('blister', 'Blister'),
        ('tube', 'Tube'),
        ('packet', 'Packet'),
        ('other', 'Other'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    composition = models.TextField()
    manufacturer = models.CharField(max_length=255)
    category = models.CharField(max_length=100)
    drug_type = models.CharField(max_length=20, choices=DRUG_TYPE_CHOICES)
    schedule_type = models.CharField(max_length=20, choices=SCHEDULE_TYPE_CHOICES, default='OTC')
    hsn_code = models.CharField(max_length=20, unique=True)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    pack_size = models.IntegerField(help_text='Number of units per pack (e.g., 10 tablets per strip)')
    pack_unit = models.CharField(max_length=50, help_text='Unit name (e.g., tablet, capsule, ml, etc.)')
    pack_type = models.CharField(max_length=20, choices=PACK_TYPE_CHOICES)
    barcode = models.CharField(max_length=100, null=True, blank=True, unique=True)
    is_fridge = models.BooleanField(default=False, help_text='Requires cold storage')
    is_discontinued = models.BooleanField(default=False)
    image_url = models.URLField(null=True, blank=True)
    min_qty = models.IntegerField(default=10, help_text='Low-stock threshold in strips')
    reorder_qty = models.IntegerField(default=50, help_text='Suggested reorder quantity')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inventory_masterproduct'
        ordering = ['name']
        indexes = [
            models.Index(fields=['hsn_code']),
            models.Index(fields=['schedule_type']),
            models.Index(fields=['drug_type']),
        ]

    def __str__(self):
        return f"{self.name} ({self.pack_size}{self.pack_unit})"


class Batch(models.Model):
    """Stock batch tracking per outlet, with FEFO management."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey('core.Outlet', on_delete=models.CASCADE, related_name='batches')
    product = models.ForeignKey(MasterProduct, on_delete=models.SET_NULL, null=True, blank=True, related_name='batches')
    batch_no = models.CharField(max_length=100)
    mfg_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField()
    mrp = models.DecimalField(max_digits=10, decimal_places=2, help_text='Maximum Retail Price')
    purchase_rate = models.DecimalField(max_digits=10, decimal_places=2, help_text='Cost price per pack')
    sale_rate = models.DecimalField(max_digits=10, decimal_places=2, help_text='Selling price per pack')
    qty_strips = models.IntegerField(default=0, help_text='Number of full strips/packs')
    qty_loose = models.IntegerField(default=0, help_text='Number of loose units (< 1 pack)')
    rack_location = models.CharField(max_length=100, null=True, blank=True, help_text='Physical shelf/rack location')
    is_active = models.BooleanField(default=True)
    is_opening_stock = models.BooleanField(default=False, help_text='True if imported as opening stock (Marg migration)')
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'inventory_batch'
        ordering = ['expiry_date', '-created_at']
        indexes = [
            models.Index(fields=['outlet', 'expiry_date']),
            models.Index(fields=['outlet', 'product', 'is_active']),
            models.Index(fields=['batch_no', 'outlet']),
        ]
        constraints = [
            models.CheckConstraint(check=models.Q(qty_strips__gte=0), name='batch_qty_strips_non_negative'),
            models.CheckConstraint(check=models.Q(qty_loose__gte=0), name='batch_qty_loose_non_negative'),
        ]

    def __str__(self):
        product_name = self.product.name if self.product else "Custom Product"
        return f"{product_name} - {self.batch_no} (Exp: {self.expiry_date})"

    def clean(self):
        """Validate that quantities never go below 0."""
        if self.qty_strips < 0:
            raise ValidationError({'qty_strips': 'Quantity cannot be negative'})
        if self.qty_loose < 0:
            raise ValidationError({'qty_loose': 'Loose quantity cannot be negative'})

    def save(self, *args, **kwargs):
        """Run validation before saving."""
        self.clean()
        super().save(*args, **kwargs)

    @property
    def total_stock(self):
        """Calculate total stock quantity (for reporting)."""
        pack_size = self.product.pack_size if self.product else 1
        return (self.qty_strips * pack_size) + self.qty_loose

    @property
    def stock_value(self):
        """Calculate stock value at purchase rate."""
        pack_size = self.product.pack_size if self.product else 1
        return float(self.purchase_rate) * (self.qty_strips + (self.qty_loose / pack_size))

    @property
    def mrp_value(self):
        """Calculate stock value at MRP."""
        pack_size = self.product.pack_size if self.product else 1
        return float(self.mrp) * (self.qty_strips + (self.qty_loose / pack_size))
