# =============================================================================
# seed_ledgers.py — DO NOT DELETE THIS FILE
# =============================================================================
#
# PURPOSE:
#   This Django management command creates the complete accounting structure
#   (LedgerGroups + Ledgers) for a new pharmacy outlet.
#
# WHY IT IS NEEDED:
#   MediFlow's accounting system works like a filing cabinet. Every outlet
#   needs its own set of "drawers" (Ledger accounts) with the correct labels
#   before any transactions can be recorded:
#       - Sales Account         → receives all sale entries
#       - Purchase Account      → receives all purchase entries
#       - Cash in Hand          → receives cash payments
#       - GST Payable CGST/SGST → receives GST tax entries
#       - Sundry Debtors        → tracks credit customers
#       - Capital Account       → tracks owner capital
#       ... and many more.
#
#   When a brand NEW outlet is created in MediFlow, none of these ledgers
#   exist yet. The very first sale/purchase will try to post to "Sales Account"
#   or "Purchase Account" — if those ledgers don't exist, it crashes or posts
#   nowhere. The Balance Sheet, P&L, and Trial Balance will all show ₹0
#   or break completely.
#
# WHEN TO RUN:
#   Run this ONCE for every new outlet after creating it in the admin panel:
#
#       python manage.py seed_ledgers
#           → seeds for ALL outlets that are missing ledgers
#
#       python manage.py seed_ledgers --outlet <outlet_uuid>
#           → seeds only a specific outlet
#
# IMPORTANT:
#   - This command is SAFE to re-run. It uses get_or_create, so it will
#     never create duplicates or overwrite existing data.
#   - It does NOT copy data from other outlets. Each outlet gets its own
#     clean, empty set of ledgers.
#   - Without running this, accounting is broken from day 1 for any new outlet.
#
# =============================================================================

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.models import Outlet


PRIMARY_GROUPS = [
    ('Capital Account',     'liability'),
    ('Fixed Assets',        'asset'),
    ('Current Assets',      'asset'),
    ('Stock in Hand',       'asset'),
    ('Investments',         'asset'),
    ('Sundry Debtors',      'asset'),
    ('Bank Accounts',       'asset'),
    ('Bank OD',             'liability'),
    ('Cash in Hand',        'asset'),
    ('Loans (Liability)',   'liability'),
    ('Current Liabilities', 'liability'),
    ('Sundry Creditors',    'liability'),
    ('Branch / Division',   'asset'),
    ('Suspense Account',    'liability'),
    ('Sales Account',       'income'),
    ('Direct Incomes',      'income'),
    ('Indirect Incomes',    'income'),
    ('Purchase Account',    'expense'),
    ('Direct Expenses',     'expense'),
    ('Indirect Expenses',   'expense'),
    ('Duties & Taxes',      'liability'),
]

# Tax sub-groups that go UNDER 'Duties & Taxes' parent.
# These hold rate-specific Input (asset) ledgers.
# nature='asset' because GST Input is recoverable from government.
TAX_SUB_GROUPS = [
    ('Tax-CGST', 'asset'),
    ('Tax-SGST', 'asset'),
    ('Tax-IGST', 'asset'),
]

# (name, group_name, balance_type, opening_balance)
DEFAULT_LEDGERS = [
    # ── CASH & BANK ──
    ('Cash',                    'Cash in Hand',        'Dr', 0),
    ('Bank Account (HDFC)',     'Bank Accounts',       'Dr', 0),
    ('Bank Account',            'Bank Accounts',       'Dr', 0),
    ('Bank Overdraft',          'Bank OD',             'Cr', 0),

    # ── CAPITAL ──
    ('Capital Account',         'Capital Account',     'Cr', 0),
    ('Drawings',                'Capital Account',     'Dr', 0),

    # ── SALES & PURCHASE ──
    ('Sales',                   'Sales Account',       'Cr', 0),
    ('Sales Return',            'Sales Account',       'Dr', 0),
    ('Purchase',                'Purchase Account',    'Dr', 0),
    ('Purchase Return',         'Purchase Account',    'Cr', 0),

    # ── STOCK ──
    ('Opening Stock',           'Stock in Hand',       'Dr', 0),
    ('Closing Stock',           'Stock in Hand',       'Dr', 0),

    # ── INDIRECT EXPENSES ──
    ('Salary',                  'Indirect Expenses',   'Dr', 0),
    ('Shop Rent',               'Indirect Expenses',   'Dr', 0),
    ('Electricity Expenses',    'Indirect Expenses',   'Dr', 0),
    ('Telephone Expenses',      'Indirect Expenses',   'Dr', 0),
    ('Internet Expenses',       'Indirect Expenses',   'Dr', 0),
    ('Office Expenses',         'Indirect Expenses',   'Dr', 0),
    ('Printing & Stationery',   'Indirect Expenses',   'Dr', 0),
    ('Travelling Expenses',     'Indirect Expenses',   'Dr', 0),
    ('Petrol Expenses',         'Indirect Expenses',   'Dr', 0),
    ('Repair & Renovation',     'Indirect Expenses',   'Dr', 0),
    ('Insurance',               'Indirect Expenses',   'Dr', 0),
    ('Packing Expenses',        'Indirect Expenses',   'Dr', 0),
    ('Advertisement Expenses',  'Indirect Expenses',   'Dr', 0),
    ('Audit Fees',              'Indirect Expenses',   'Dr', 0),
    ('Bank Charges',            'Indirect Expenses',   'Dr', 0),
    ('Bank Commission',         'Indirect Expenses',   'Dr', 0),
    ('Depreciation',            'Indirect Expenses',   'Dr', 0),
    ('Donation',                'Indirect Expenses',   'Dr', 0),
    ('General Expenses',        'Indirect Expenses',   'Dr', 0),
    ('Miscellaneous Expenses',  'Indirect Expenses',   'Dr', 0),
    ('Car Expenses',            'Indirect Expenses',   'Dr', 0),
    ('Car Repair',              'Indirect Expenses',   'Dr', 0),
    ('Vehicle Repair',          'Indirect Expenses',   'Dr', 0),
    ('Godown Rent',             'Indirect Expenses',   'Dr', 0),
    ('Labour Charges',          'Indirect Expenses',   'Dr', 0),
    ('Legal Expenses',          'Indirect Expenses',   'Dr', 0),
    ('Postage & Telegram',      'Indirect Expenses',   'Dr', 0),
    ('Rates & Taxes',           'Indirect Expenses',   'Dr', 0),
    ('Staff Welfare',           'Indirect Expenses',   'Dr', 0),
    ('Pan & Tea Expenses',      'Indirect Expenses',   'Dr', 0),
    ('Bad Debts',               'Indirect Expenses',   'Dr', 0),

    # ── PHARMACY-SPECIFIC INDIRECT EXPENSES ──
    ('Cold Storage Expenses',   'Indirect Expenses',   'Dr', 0),
    ('Drug Licence Fees',       'Indirect Expenses',   'Dr', 0),
    ('Schedule H Compliance',   'Indirect Expenses',   'Dr', 0),
    ('Narcotic Register Fees',  'Indirect Expenses',   'Dr', 0),
    ('Medicine Disposal',       'Indirect Expenses',   'Dr', 0),

    # ── DIRECT EXPENSES ──
    ('Freight Inward',          'Direct Expenses',     'Dr', 0),
    ('Freight Outward',         'Direct Expenses',     'Dr', 0),
    ('Carriage',                'Direct Expenses',     'Dr', 0),
    ('Octroi',                  'Direct Expenses',     'Dr', 0),
    ('Import Duty',             'Direct Expenses',     'Dr', 0),
    ('Power & Fuel',            'Direct Expenses',     'Dr', 0),
    ('Wages',                   'Direct Expenses',     'Dr', 0),

    # ── INDIRECT INCOMES ──
    ('Commission Received',     'Indirect Incomes',    'Cr', 0),
    ('Rent Received',           'Indirect Incomes',    'Cr', 0),
    ('Interest Received',       'Indirect Incomes',    'Cr', 0),
    ('Discount Received',       'Indirect Incomes',    'Cr', 0),
    ('Insurance Claim',         'Indirect Incomes',    'Cr', 0),
    ('Miscellaneous Income',    'Indirect Incomes',    'Cr', 0),
    ('Bad Debts Recovered',     'Indirect Incomes',    'Cr', 0),
    ('Income From Repair',      'Indirect Incomes',    'Cr', 0),

    # ── FIXED ASSETS ──
    ('Furniture & Fixture',     'Fixed Assets',        'Dr', 0),
    ('Computer',                'Fixed Assets',        'Dr', 0),
    ('Air Conditioner',         'Fixed Assets',        'Dr', 0),
    ('Refrigerator',            'Fixed Assets',        'Dr', 0),
    ('Shop / Showroom',         'Fixed Assets',        'Dr', 0),
    ('Vehicle',                 'Fixed Assets',        'Dr', 0),
    ('Scooter / Bike',          'Fixed Assets',        'Dr', 0),
    ('Plant & Machine',         'Fixed Assets',        'Dr', 0),
    ('Loose Tools',             'Fixed Assets',        'Dr', 0),
    ('Goodwill',                'Fixed Assets',        'Dr', 0),

    # ── CURRENT ASSETS ──
    ('Prepaid Expenses',        'Current Assets',      'Dr', 0),
    ('FDR',                     'Current Assets',      'Dr', 0),
    ('Advance to Staff',        'Current Assets',      'Dr', 0),
    ('Bills Receivable',        'Current Assets',      'Dr', 0),
    ('Accrued Income',          'Current Assets',      'Dr', 0),
    ('Deposits',                'Current Assets',      'Dr', 0),

    # ── CURRENT LIABILITIES ──
    ('Salary Payable',          'Current Liabilities', 'Cr', 0),
    ('Rent Payable',            'Current Liabilities', 'Cr', 0),
    ('Outstanding Expenses',    'Current Liabilities', 'Cr', 0),
    ('Advance from Customer',   'Current Liabilities', 'Cr', 0),
    ('Bills Payable',           'Current Liabilities', 'Cr', 0),

    # ── DUTIES & TAXES — Consolidated fallback ledgers ──
    # These are kept for backwards compatibility and as fallbacks
    # when rate-specific ledgers are not found.
    ('GST Input (CGST)',        'Duties & Taxes',      'Dr', 0),
    ('GST Input (SGST)',        'Duties & Taxes',      'Dr', 0),
    ('GST Input (IGST)',        'Duties & Taxes',      'Dr', 0),  # Interstate purchases
    ('GST Payable CGST',        'Current Liabilities', 'Cr', 0),
    ('GST Payable SGST',        'Current Liabilities', 'Cr', 0),
    ('GST Payable IGST',        'Current Liabilities', 'Cr', 0),  # Interstate sales
    # Rate-specific GST ledgers (kept for backwards compatibility)
    ('GST Input (5%)',          'Duties & Taxes',      'Dr', 0),
    ('GST Input (12%)',         'Duties & Taxes',      'Dr', 0),
    ('GST Input (18%)',         'Duties & Taxes',      'Dr', 0),
    ('GST Payable (5%)',        'Current Liabilities', 'Cr', 0),
    ('GST Payable (12%)',       'Current Liabilities', 'Cr', 0),
    ('GST Payable (18%)',       'Current Liabilities', 'Cr', 0),
    ('GST Payable',             'Current Liabilities', 'Cr', 0),
    ('TDS Payable',             'Duties & Taxes',      'Cr', 0),
    ('VAT Payable',             'Duties & Taxes',      'Cr', 0),
    ('Income Tax',              'Duties & Taxes',      'Cr', 0),

    # ── INVESTMENTS ──
    ('Investment',              'Investments',         'Dr', 0),
    ('Shares & Bonds',          'Investments',         'Dr', 0),
    ('Mutual Fund',             'Investments',         'Dr', 0),

    # ── LOANS ──
    ('Bank Loan',               'Loans (Liability)',   'Cr', 0),
    ('Loan on Mortgage',        'Loans (Liability)',   'Cr', 0),

    # ── JOURNAL POSTING LEDGERS (used by auto-journal system) ──
    # These are the canonical ledger names referenced by journal_service.py
    ('Sales Account',           'Sales Account',       'Cr', 0),   # Cr for sales journal entries
    ('Purchase Account',        'Purchase Account',    'Dr', 0),   # Dr for purchase journal entries
    ('UPI Collections',         'Bank Accounts',       'Dr', 0),   # UPI payment receipts
    ('Card/POS Settlement',     'Bank Accounts',       'Dr', 0),   # Card/POS payment receipts
    ('Round Off',               'Indirect Incomes',    'Cr', 0),   # Penny rounding adjustments
    ('Ledger Adjustment',       'Indirect Incomes',    'Cr', 0),   # Purchase ledger adjustments
    ('Purchase Returns',        'Purchase Account',    'Cr', 0),   # Purchase return (Debit Note)
]

# ── RATE-SPECIFIC GST PAYABLE LEDGERS (Liability — money collected from customer) ──
# These are credit-nature ledgers grouped under Current Liabilities.
# Format: (name, group_name, balance_type, opening_balance)
RATE_SPECIFIC_GST_PAYABLE = [
    # CGST Payable (intrastate sales — half the total GST rate)
    ('CGST Payable 2.5%',   'Current Liabilities', 'Cr', 0),   # total GST 5%
    ('CGST Payable 6%',     'Current Liabilities', 'Cr', 0),   # total GST 12%
    ('CGST Payable 9%',     'Current Liabilities', 'Cr', 0),   # total GST 18%
    ('CGST Payable 14%',    'Current Liabilities', 'Cr', 0),   # total GST 28%
    ('CGST Payable 20%',    'Current Liabilities', 'Cr', 0),   # total GST 40%

    # SGST Payable (intrastate sales — half the total GST rate)
    ('SGST Payable 2.5%',   'Current Liabilities', 'Cr', 0),
    ('SGST Payable 6%',     'Current Liabilities', 'Cr', 0),
    ('SGST Payable 9%',     'Current Liabilities', 'Cr', 0),
    ('SGST Payable 14%',    'Current Liabilities', 'Cr', 0),
    ('SGST Payable 20%',    'Current Liabilities', 'Cr', 0),

    # IGST Payable (interstate sales — full GST rate)
    ('IGST Payable 5%',     'Current Liabilities', 'Cr', 0),
    ('IGST Payable 12%',    'Current Liabilities', 'Cr', 0),
    ('IGST Payable 18%',    'Current Liabilities', 'Cr', 0),
    ('IGST Payable 28%',    'Current Liabilities', 'Cr', 0),
]

# ── RATE-SPECIFIC GST INPUT LEDGERS (Asset — recoverable from government) ──
# These are debit-nature ledgers grouped under Tax-CGST / Tax-SGST / Tax-IGST.
RATE_SPECIFIC_GST_INPUT = [
    # CGST Input (purchases — half the total GST rate)
    ('CGST Input 2.5%',     'Tax-CGST', 'Dr', 0),
    ('CGST Input 6%',       'Tax-CGST', 'Dr', 0),
    ('CGST Input 9%',       'Tax-CGST', 'Dr', 0),
    ('CGST Input 14%',      'Tax-CGST', 'Dr', 0),
    ('CGST Input 20%',      'Tax-CGST', 'Dr', 0),

    # SGST Input (purchases — half the total GST rate)
    ('SGST Input 2.5%',     'Tax-SGST', 'Dr', 0),
    ('SGST Input 6%',       'Tax-SGST', 'Dr', 0),
    ('SGST Input 9%',       'Tax-SGST', 'Dr', 0),
    ('SGST Input 14%',      'Tax-SGST', 'Dr', 0),
    ('SGST Input 20%',      'Tax-SGST', 'Dr', 0),

    # IGST Input (interstate purchases — full GST rate)
    ('IGST Input 5%',       'Tax-IGST', 'Dr', 0),
    ('IGST Input 12%',      'Tax-IGST', 'Dr', 0),
    ('IGST Input 18%',      'Tax-IGST', 'Dr', 0),
    ('IGST Input 28%',      'Tax-IGST', 'Dr', 0),
]


@transaction.atomic
def seed_outlet_ledgers(outlet):
    """
    Seed all standard ledger groups and ledgers for a single outlet.
    Safe to call multiple times — uses get_or_create throughout.
    Returns dict with counts of newly created records.
    """
    from apps.accounts.models import LedgerGroup, Ledger
    from apps.accounts.models import Customer
    from apps.purchases.models import Distributor

    groups_created = 0
    sub_groups_created = 0
    ledgers_created = 0
    rate_ledgers_created = 0
    customers_synced = 0
    distributors_synced = 0

    # ── STEP 1: Create all primary groups ──
    group_map = {}
    for name, nature in PRIMARY_GROUPS:
        group, created = LedgerGroup.objects.get_or_create(
            outlet=outlet,
            name=name,
            defaults={
                'nature': nature,
                'is_system': True,
                'parent': None,
            },
        )
        if created:
            groups_created += 1
        group_map[name] = group

    # ── STEP 1b: Create Tax sub-groups under 'Duties & Taxes' parent ──
    duties_taxes_group = group_map.get('Duties & Taxes')
    if duties_taxes_group:
        for sub_name, sub_nature in TAX_SUB_GROUPS:
            sub_group, created = LedgerGroup.objects.get_or_create(
                outlet=outlet,
                name=sub_name,
                defaults={
                    'nature': sub_nature,
                    'is_system': True,
                    'parent': duties_taxes_group,
                },
            )
            if created:
                sub_groups_created += 1
            group_map[sub_name] = sub_group

    # ── STEP 2: Create all default ledgers ──
    for name, group_name, balance_type, opening_balance in DEFAULT_LEDGERS:
        group = group_map.get(group_name)
        if not group:
            continue
        _, created = Ledger.objects.get_or_create(
            outlet=outlet,
            name=name,
            defaults={
                'group': group,
                'balance_type': balance_type,
                'opening_balance': opening_balance,
                'current_balance': opening_balance,
                'is_system': True,
            },
        )
        if created:
            ledgers_created += 1

    # ── STEP 2b: Create rate-specific GST Payable ledgers (liability) ──
    for name, group_name, balance_type, opening_balance in RATE_SPECIFIC_GST_PAYABLE:
        group = group_map.get(group_name)
        if not group:
            continue
        _, created = Ledger.objects.get_or_create(
            outlet=outlet,
            name=name,
            defaults={
                'group': group,
                'balance_type': balance_type,
                'opening_balance': opening_balance,
                'current_balance': opening_balance,
                'is_system': True,
            },
        )
        if created:
            rate_ledgers_created += 1

    # ── STEP 2c: Create rate-specific GST Input ledgers (asset) ──
    for name, group_name, balance_type, opening_balance in RATE_SPECIFIC_GST_INPUT:
        group = group_map.get(group_name)
        if not group:
            continue
        _, created = Ledger.objects.get_or_create(
            outlet=outlet,
            name=name,
            defaults={
                'group': group,
                'balance_type': balance_type,
                'opening_balance': opening_balance,
                'current_balance': opening_balance,
                'is_system': True,
            },
        )
        if created:
            rate_ledgers_created += 1

    # ── STEP 3: Sync customers as Sundry Debtors ──
    debtors_group = group_map.get('Sundry Debtors')
    if debtors_group:
        for customer in Customer.objects.for_outlet(outlet.id):
            if not Ledger.objects.filter(outlet=outlet, linked_customer=customer).exists():
                Ledger.objects.create(
                    outlet=outlet,
                    linked_customer=customer,
                    name=customer.name[:255],
                    group=debtors_group,
                    balance_type='Dr',
                    current_balance=customer.outstanding,
                    phone=(customer.phone or '')[:15],
                    is_system=False,
                )
                customers_synced += 1

    # ── STEP 4: Sync distributors as Sundry Creditors ──
    creditors_group = group_map.get('Sundry Creditors')
    if creditors_group:
        for distributor in Distributor.objects.for_outlet(outlet.id):
            if not Ledger.objects.filter(outlet=outlet, linked_distributor=distributor).exists():
                Ledger.objects.create(
                    outlet=outlet,
                    linked_distributor=distributor,
                    name=distributor.name[:255],
                    group=creditors_group,
                    balance_type='Cr',
                    current_balance=distributor.opening_balance or 0,
                    gstin=(distributor.gstin or '')[:15],
                    phone=(distributor.phone or '')[:15],
                    is_system=False,
                )
                distributors_synced += 1

    return {
        'groups_created': groups_created,
        'sub_groups_created': sub_groups_created,
        'ledgers_created': ledgers_created,
        'rate_ledgers_created': rate_ledgers_created,
        'customers_synced': customers_synced,
        'distributors_synced': distributors_synced,
    }


class Command(BaseCommand):
    help = 'Seed all standard Tally/Marg ledger groups and ledgers for every outlet'

    def add_arguments(self, parser):
        parser.add_argument(
            '--outlet',
            type=str,
            dest='outlet_id',
            help='UUID of a specific outlet to seed (default: all active outlets)',
        )

    def handle(self, *args, **options):
        outlet_id = options.get('outlet_id')
        if outlet_id:
            outlets = Outlet.objects.filter(id=outlet_id, is_active=True)
            if not outlets.exists():
                self.stdout.write(self.style.ERROR(f'No active outlet found with id={outlet_id}'))
                return
        else:
            outlets = Outlet.objects.filter(is_active=True)

        if not outlets.exists():
            self.stdout.write(self.style.WARNING('No active outlets found.'))
            return

        for outlet in outlets:
            counts = seed_outlet_ledgers(outlet)
            self.stdout.write(f'\nOutlet: {outlet.name}')
            self.stdout.write(f'  Primary groups created:    {counts["groups_created"]}')
            self.stdout.write(f'  Tax sub-groups created:    {counts["sub_groups_created"]}')
            self.stdout.write(f'  Standard ledgers created:  {counts["ledgers_created"]}')
            self.stdout.write(f'  Rate-specific GST ledgers: {counts["rate_ledgers_created"]}')
            self.stdout.write(f'  Customers synced:          {counts["customers_synced"]}')
            self.stdout.write(f'  Distributors synced:       {counts["distributors_synced"]}')

        from apps.accounts.models import LedgerGroup, Ledger
        self.stdout.write(self.style.SUCCESS(
            f'\nDone. Total groups in DB: {LedgerGroup.objects.count()}, '
            f'Total ledgers in DB: {Ledger.objects.count()}'
        ))
