from django.db import models
import uuid

# GST state codes per GSTN portal — mirrors packages/constants/index.ts STATE_CODES.
# Always derive state_code from state using this map; never store it independently.
_STATE_CODES: dict[str, str] = {
    'Jammu & Kashmir': '01',
    'Himachal Pradesh': '02',
    'Punjab': '03',
    'Chandigarh': '04',
    'Uttarakhand': '05',
    'Haryana': '06',
    'Delhi': '07',
    'Rajasthan': '08',
    'Uttar Pradesh': '09',
    'Bihar': '10',
    'Sikkim': '11',
    'Arunachal Pradesh': '12',
    'Nagaland': '13',
    'Manipur': '14',
    'Mizoram': '15',
    'Tripura': '16',
    'Meghalaya': '17',
    'Assam': '18',
    'West Bengal': '19',
    'Jharkhand': '20',
    'Odisha': '21',
    'Chhattisgarh': '22',
    'Madhya Pradesh': '23',
    'Gujarat': '24',
    'Dadra & Nagar Haveli and Daman & Diu': '26',
    'Maharashtra': '27',
    'Karnataka': '29',
    'Goa': '30',
    'Lakshadweep': '31',
    'Kerala': '32',
    'Tamil Nadu': '33',
    'Puducherry': '34',
    'Andaman & Nicobar Islands': '35',
    'Telangana': '36',
    'Andhra Pradesh': '37',
    'Ladakh': '38',
}


class OutletFilteredManager(models.Manager):
    """Custom manager that filters queries by outletId for outlet-specific models."""

    def for_outlet(self, outlet_id):
        """Filter queryset by outlet_id."""
        return self.filter(outlet_id=outlet_id)


class Organization(models.Model):
    """Represents a multitenancy organization (e.g., pharmacy chain)."""

    PLAN_CHOICES = [
        ('starter', 'Starter'),
        ('pro', 'Pro'),
        ('enterprise', 'Enterprise'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default='starter')
    master_gstin = models.CharField(max_length=15, blank=True, default='')
    phone = models.CharField(max_length=20, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'core_organization'
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class Outlet(models.Model):
    """Represents a specific pharmacy branch/outlet."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='outlets')
    name = models.CharField(max_length=255)
    address = models.TextField()
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    state_code = models.CharField(max_length=2, blank=True, default='',
                                  help_text='2-digit GST state code, derived from state on save')
    pincode = models.CharField(max_length=10)
    gstin = models.CharField(max_length=15, unique=True)
    drug_license_no = models.CharField(max_length=100, unique=True)
    phone = models.CharField(max_length=20)
    logo_url = models.URLField(null=True, blank=True)
    invoice_footer = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OutletFilteredManager()

    class Meta:
        db_table = 'core_outlet'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organization', 'is_active']),
        ]

    def save(self, *args, **kwargs):
        # M9: always derive state_code from state so they never drift.
        self.state_code = _STATE_CODES.get(self.state, '')
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class OutletSettings(models.Model):
    """Per-outlet configuration (get_or_create, never crash if missing)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.OneToOneField(Outlet, on_delete=models.CASCADE, related_name='settings')

    opening_time = models.TimeField(default='09:00')
    closing_time = models.TimeField(default='21:00')
    grace_period_minutes = models.IntegerField(default=15)
    default_credit_days = models.IntegerField(default=30)
    invoice_prefix = models.CharField(max_length=10, default='INV')
    gst_registered = models.BooleanField(default=True)
    print_logo = models.BooleanField(default=True)
    thermal_print = models.BooleanField(default=False)
    printer_width = models.IntegerField(default=80)
    low_stock_alert_days = models.IntegerField(default=7)
    expiry_alert_days = models.IntegerField(default=30)
    enable_whatsapp = models.BooleanField(default=False)
    whatsapp_api_key = models.CharField(max_length=200, null=True, blank=True)
    currency_symbol = models.CharField(max_length=5, default='₹')
    
    # Landing Cost & Margin Settings
    landing_cost_include_gst = models.BooleanField(
        default=False,
        help_text="ON = Include purchase GST in landing cost floor (for pharmacies that do NOT claim ITC). OFF = Exclude GST from landing cost (for ITC-registered pharmacies — GST is recovered as credit)."
    )
    landing_cost_include_freight = models.BooleanField(
        default=True,
        help_text="Include per-unit freight in landing cost floor calculation."
    )
    min_margin_warning_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.00,
        help_text="Optional: Show a soft warning if margin falls below this percentage. Set 0 to disable."
    )
    
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_outletsettings'

    def __str__(self):
        return f"Settings for {self.outlet.name}"
