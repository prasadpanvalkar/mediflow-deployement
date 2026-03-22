from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from datetime import date
import uuid

from apps.core.models import Organization, Outlet
from apps.accounts.models import Staff, Customer
import datetime
from apps.accounts.models import LedgerGroup, Ledger, Voucher, VoucherLine, DebitNote, CreditNote
from apps.accounts.services import LedgerService, VoucherService, DebitNoteService, CreditNoteService
from apps.inventory.models import MasterProduct, Batch
from apps.purchases.models import Distributor, PurchaseInvoice


class CustomerSearchViewTestCase(TestCase):
    """Test suite for CustomerSearchView endpoint."""

    def setUp(self):
        """Create test data: organization, outlet, staff, customers."""
        self.client = APIClient()

        # Create organization
        self.org = Organization.objects.create(
            name="Test Pharmacy Chain",
            slug="test-pharmacy",
            plan="pro",
            is_active=True
        )

        # Create outlet with unique drug_license_no
        self.outlet = Outlet.objects.create(
            organization=self.org,
            name="Test Outlet",
            address="123 Main St",
            city="Mumbai",
            state="Maharashtra",
            pincode="400001",
            gstin="27AAPCT1234E1Z0",
            drug_license_no=f"DLN-{uuid.uuid4().hex[:12].upper()}",
            phone="9876543210",
            is_active=True
        )

        # Create staff member for authentication
        self.staff = Staff.objects.create(
            phone="9876543210",
            name="Rajesh Patil",
            outlet=self.outlet,
            role="super_admin",
            staff_pin="0000",
            is_active=True
        )

        # Create customers
        self.customer1 = Customer.objects.create(
            outlet=self.outlet,
            name="Amit Kumar",
            phone="9999888877",
            address="456 Oak Ave, Mumbai",
            dob=date(1990, 5, 15),
            gstin="18AABCT1234E1Z0",
            fixed_discount=5.0,
            credit_limit=10000.0,
            outstanding=2500.0,
            total_purchases=15000.0,
            is_chronic=True,
            is_active=True
        )

        self.customer2 = Customer.objects.create(
            outlet=self.outlet,
            name="Priya Sharma",
            phone="8888777766",
            address="789 Pine St, Mumbai",
            dob=date(1985, 3, 20),
            gstin="27AABCT1234E1Z1",
            fixed_discount=3.0,
            credit_limit=5000.0,
            outstanding=500.0,
            total_purchases=8000.0,
            is_chronic=False,
            is_active=True
        )

        # Inactive customer
        self.customer_inactive = Customer.objects.create(
            outlet=self.outlet,
            name="Ramesh Singh",
            phone="7777666655",
            address="321 Elm St, Mumbai",
            dob=date(1992, 7, 10),
            fixed_discount=0,
            credit_limit=0,
            outstanding=0,
            total_purchases=0,
            is_chronic=False,
            is_active=False
        )

    def test_search_requires_authentication(self):
        """Verify JWT authentication is required."""
        response = self.client.get(f"/api/v1/auth/customers/search/?q=amit&outletId={self.outlet.id}")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_search_with_authentication(self):
        """Verify search works with valid JWT token."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        access_token = login_response.data["access"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/auth/customers/search/?q=amit&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

    def test_minimum_query_length_zero(self):
        """Verify empty query returns empty list."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/auth/customers/search/?q=&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_minimum_query_length_one_char(self):
        """Verify single character query returns empty list."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/auth/customers/search/?q=a&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_search_by_customer_name(self):
        """Verify search by customer name (case-insensitive)."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/auth/customers/search/?q=AMIT&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Amit Kumar")

    def test_search_by_partial_name(self):
        """Verify search by partial customer name."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/auth/customers/search/?q=shar&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Priya Sharma")

    def test_search_by_phone(self):
        """Verify search by customer phone."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/auth/customers/search/?q=9999888877&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["phone"], "9999888877")

    def test_inactive_customers_excluded(self):
        """Verify inactive customers are not included in search results."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/auth/customers/search/?q=singh&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should return empty list since Ramesh Singh is inactive
        self.assertEqual(response.data, [])

    def test_multiple_customers_search(self):
        """Verify search can return multiple matching customers."""
        # Create another customer with similar name
        Customer.objects.create(
            outlet=self.outlet,
            name="Amit Singh",
            phone="6666555544",
            address="999 Maple St, Mumbai",
            dob=date(1988, 1, 1),
            fixed_discount=2.0,
            credit_limit=3000.0,
            outstanding=0,
            total_purchases=5000.0,
            is_chronic=False,
            is_active=True
        )

        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/auth/customers/search/?q=amit&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_outlet_not_found(self):
        """Verify 404 when outlet does not exist."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        fake_outlet_id = uuid.uuid4()
        response = self.client.get(
            f"/api/v1/auth/customers/search/?q=amit&outletId={fake_outlet_id}"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("detail", response.data)

    def test_response_structure(self):
        """Verify response includes all required customer fields."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/auth/customers/search/?q=amit&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        customer = response.data[0]

        required_fields = [
            "id", "name", "phone", "address", "dob", "gstin",
            "fixedDiscount", "creditLimit", "outstanding",
            "totalPurchases", "isChronic", "isActive", "createdAt"
        ]
        for field in required_fields:
            self.assertIn(field, customer, f"Missing field: {field}")

    def test_credit_details_accuracy(self):
        """Verify customer credit details are accurate."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/auth/customers/search/?q=amit&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        customer = response.data[0]

        self.assertEqual(customer["creditLimit"], 10000.0)
        self.assertEqual(customer["outstanding"], 2500.0)
        self.assertEqual(customer["fixedDiscount"], 5.0)
        self.assertTrue(customer["isChronic"])


class VoucherServiceTests(TestCase):
    def setUp(self):
        from django.contrib.auth.hashers import make_password
        self.org = Organization.objects.create(
            name="Test Org Voucher", slug="test-org-voucher", plan="pro", is_active=True
        )
        self.outlet = Outlet.objects.create(
            organization=self.org, name="Test Outlet V",
            address="1 Main St", city="Mumbai", state="Maharashtra",
            pincode="400001", gstin="27AAPCT1234E1Z1",
            drug_license_no=f"DLN-{uuid.uuid4().hex[:8].upper()}",
            phone="9876543211", is_active=True
        )
        self.staff = Staff.objects.create(
            phone="9876500001", name="Test Staff",
            outlet=self.outlet, role="manager",
            staff_pin=make_password("1234"), is_active=True
        )
        LedgerService.seed_default_ledgers(self.outlet)
        self.cash_ledger = Ledger.objects.get(outlet=self.outlet, name='Cash')
        self.bank_ledger = Ledger.objects.get(outlet=self.outlet, name='State Bank of India')

    def test_receipt_voucher_created(self):
        # Create a sundry debtor ledger
        group = LedgerGroup.objects.get(outlet=self.outlet, name='Sundry Debtors')
        debtor = Ledger.objects.create(outlet=self.outlet, name='Test Customer', group=group)
        data = {
            'voucher_type': 'receipt',
            'date': str(datetime.date.today()),
            'total_amount': '1000',
            'payment_mode': 'cash',
            'lines': [
                {'ledger_id': str(self.cash_ledger.id), 'debit': 1000, 'credit': 0},
                {'ledger_id': str(debtor.id), 'debit': 0, 'credit': 1000},
            ]
        }
        voucher = VoucherService.create_voucher(str(self.outlet.id), str(self.staff.id), data)
        self.assertEqual(Voucher.objects.filter(outlet=self.outlet).count(), 1)
        self.assertTrue(voucher.voucher_no.startswith('REC-'))

    def test_payment_voucher_created(self):
        group = LedgerGroup.objects.get(outlet=self.outlet, name='Sundry Creditors')
        creditor = Ledger.objects.create(outlet=self.outlet, name='Test Supplier', group=group)
        data = {
            'voucher_type': 'payment',
            'date': str(datetime.date.today()),
            'total_amount': '500',
            'payment_mode': 'bank',
            'lines': [
                {'ledger_id': str(creditor.id), 'debit': 500, 'credit': 0},
                {'ledger_id': str(self.bank_ledger.id), 'debit': 0, 'credit': 500},
            ]
        }
        voucher = VoucherService.create_voucher(str(self.outlet.id), str(self.staff.id), data)
        self.assertTrue(voucher.voucher_no.startswith('PAY-'))

    def test_contra_rejects_non_cash_bank(self):
        group = LedgerGroup.objects.get(outlet=self.outlet, name='Sundry Debtors')
        debtor = Ledger.objects.create(outlet=self.outlet, name='Bad Ledger', group=group)
        data = {
            'voucher_type': 'contra',
            'date': str(datetime.date.today()),
            'total_amount': '200',
            'payment_mode': 'cash',
            'lines': [
                {'ledger_id': str(self.cash_ledger.id), 'debit': 200, 'credit': 0},
                {'ledger_id': str(debtor.id), 'debit': 0, 'credit': 200},
            ]
        }
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            VoucherService.create_voucher(str(self.outlet.id), str(self.staff.id), data)

    def test_journal_requires_balanced_entries(self):
        group = LedgerGroup.objects.get(outlet=self.outlet, name='Indirect Expenses')
        exp = Ledger.objects.create(outlet=self.outlet, name='Test Expense', group=group)
        data = {
            'voucher_type': 'journal',
            'date': str(datetime.date.today()),
            'total_amount': '300',
            'payment_mode': 'cash',
            'lines': [
                {'ledger_id': str(exp.id), 'debit': 300, 'credit': 0},
                {'ledger_id': str(self.cash_ledger.id), 'debit': 0, 'credit': 100},  # unbalanced
            ]
        }
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            VoucherService.create_voucher(str(self.outlet.id), str(self.staff.id), data)

    def test_voucher_no_auto_increments(self):
        group = LedgerGroup.objects.get(outlet=self.outlet, name='Sundry Debtors')
        debtor = Ledger.objects.create(outlet=self.outlet, name='Test Cust 2', group=group)
        base_data = {
            'voucher_type': 'receipt',
            'date': str(datetime.date.today()),
            'total_amount': '100',
            'payment_mode': 'cash',
            'lines': [
                {'ledger_id': str(self.cash_ledger.id), 'debit': 100, 'credit': 0},
                {'ledger_id': str(debtor.id), 'debit': 0, 'credit': 100},
            ]
        }
        v1 = VoucherService.create_voucher(str(self.outlet.id), str(self.staff.id), base_data)
        v2 = VoucherService.create_voucher(str(self.outlet.id), str(self.staff.id), base_data)
        self.assertNotEqual(v1.voucher_no, v2.voucher_no)


class DebitNoteServiceTests(TestCase):
    def setUp(self):
        from django.contrib.auth.hashers import make_password
        self.org = Organization.objects.create(
            name="Test Org DN", slug="test-org-dn", plan="pro", is_active=True
        )
        self.outlet = Outlet.objects.create(
            organization=self.org, name="Test Outlet DN",
            address="1 Main St", city="Mumbai", state="Maharashtra",
            pincode="400001", gstin="27AAPCT1234E1Z2",
            drug_license_no=f"DLN-{uuid.uuid4().hex[:8].upper()}",
            phone="9876500002", is_active=True
        )
        self.staff = Staff.objects.create(
            phone="9876500002", name="Test Staff DN",
            outlet=self.outlet, role="manager",
            staff_pin=make_password("1234"), is_active=True
        )
        self.distributor = Distributor.objects.create(
            outlet=self.outlet, name="Test Distributor",
            phone="9999999999", address="Dist Addr",
            city="Mumbai", state="Maharashtra"
        )
        self.product = MasterProduct.objects.create(
            name="Test Drug", composition="X",
            manufacturer="Cipla", category="Tablet",
            drug_type="allopathy", schedule_type="OTC",
            hsn_code="3004", gst_rate=12,
            pack_size=10, pack_unit="Tablet",
            pack_type="Strip"
        )
        self.batch = Batch.objects.create(
            outlet=self.outlet, product=self.product,
            batch_no="B001", expiry_date="2027-12-31",
            mrp=100, purchase_rate=80, sale_rate=90,
            qty_strips=50
        )

    def test_creates_debit_note(self):
        data = {
            'date': str(datetime.date.today()),
            'distributor_id': str(self.distributor.id),
            'reason': 'Damaged goods',
            'subtotal': 80,
            'gst_amount': 9.6,
            'total_amount': 89.6,
            'items': [{
                'batch_id': str(self.batch.id),
                'product_name': 'Test Drug',
                'qty': 1,
                'rate': 80,
                'gst_rate': 12,
                'total': 89.6,
            }]
        }
        note = DebitNoteService.create(str(self.outlet.id), str(self.staff.id), data)
        self.assertIsNotNone(note.id)
        self.assertTrue(note.debit_note_no.startswith('DN-'))

    def test_stock_restored_after_return(self):
        initial_qty = self.batch.qty_strips
        data = {
            'date': str(datetime.date.today()),
            'distributor_id': str(self.distributor.id),
            'reason': 'Expiry',
            'subtotal': 80,
            'gst_amount': 0,
            'total_amount': 80,
            'items': [{
                'batch_id': str(self.batch.id),
                'product_name': 'Test Drug',
                'qty': 5,
                'rate': 80,
                'gst_rate': 0,
                'total': 400,
            }]
        }
        DebitNoteService.create(str(self.outlet.id), str(self.staff.id), data)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, initial_qty + 5)

    def test_outstanding_reduced_for_supplier(self):
        inv = PurchaseInvoice.objects.create(
            outlet=self.outlet, distributor=self.distributor,
            invoice_no="INV-001", invoice_date=datetime.date.today(),
            subtotal=1000, discount_amount=0, taxable_amount=1000,
            gst_amount=120, grand_total=1120, outstanding=1120,
            created_by=self.staff
        )
        data = {
            'date': str(datetime.date.today()),
            'distributor_id': str(self.distributor.id),
            'purchase_invoice_id': str(inv.id),
            'reason': 'Return',
            'subtotal': 80,
            'gst_amount': 0,
            'total_amount': 80,
            'items': [{
                'batch_id': str(self.batch.id),
                'product_name': 'Test Drug',
                'qty': 1,
                'rate': 80,
                'gst_rate': 0,
                'total': 80,
            }]
        }
        DebitNoteService.create(str(self.outlet.id), str(self.staff.id), data)
        inv.refresh_from_db()
        self.assertEqual(float(inv.outstanding), 1040.0)


class CreditNoteServiceTests(TestCase):
    def setUp(self):
        from django.contrib.auth.hashers import make_password
        self.org = Organization.objects.create(
            name="Test Org CN", slug="test-org-cn", plan="pro", is_active=True
        )
        self.outlet = Outlet.objects.create(
            organization=self.org, name="Test Outlet CN",
            address="1 Main St", city="Mumbai", state="Maharashtra",
            pincode="400001", gstin="27AAPCT1234E1Z3",
            drug_license_no=f"DLN-{uuid.uuid4().hex[:8].upper()}",
            phone="9876500003", is_active=True
        )
        self.staff = Staff.objects.create(
            phone="9876500003", name="Test Staff CN",
            outlet=self.outlet, role="manager",
            staff_pin=make_password("1234"), is_active=True
        )
        self.customer = Customer.objects.create(
            outlet=self.outlet, name="Test Customer",
            phone="8888888888", outstanding=500
        )
        self.product = MasterProduct.objects.create(
            name="Return Drug", composition="Y",
            manufacturer="Sun", category="Syrup",
            drug_type="allopathy", schedule_type="OTC",
            hsn_code="3004", gst_rate=12,
            pack_size=1, pack_unit="Bottle",
            pack_type="Bottle"
        )
        self.batch = Batch.objects.create(
            outlet=self.outlet, product=self.product,
            batch_no="B002", expiry_date="2027-12-31",
            mrp=200, purchase_rate=150, sale_rate=180,
            qty_strips=20
        )

    def test_creates_credit_note(self):
        data = {
            'date': str(datetime.date.today()),
            'customer_id': str(self.customer.id),
            'reason': 'Wrong product',
            'subtotal': 180,
            'gst_amount': 0,
            'total_amount': 180,
            'items': [{
                'batch_id': str(self.batch.id),
                'product_name': 'Return Drug',
                'qty': 1,
                'rate': 180,
                'gst_rate': 0,
                'total': 180,
            }]
        }
        note = CreditNoteService.create(str(self.outlet.id), str(self.staff.id), data)
        self.assertIsNotNone(note.id)
        self.assertTrue(note.credit_note_no.startswith('CN-'))

    def test_stock_restored_after_return(self):
        initial_qty = self.batch.qty_strips
        data = {
            'date': str(datetime.date.today()),
            'reason': 'Return',
            'subtotal': 180,
            'gst_amount': 0,
            'total_amount': 180,
            'items': [{
                'batch_id': str(self.batch.id),
                'product_name': 'Return Drug',
                'qty': 3,
                'rate': 180,
                'gst_rate': 0,
                'total': 540,
            }]
        }
        CreditNoteService.create(str(self.outlet.id), str(self.staff.id), data)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, initial_qty + 3)

    def test_outstanding_reduced_for_customer(self):
        initial_outstanding = float(self.customer.outstanding)
        data = {
            'date': str(datetime.date.today()),
            'customer_id': str(self.customer.id),
            'reason': 'Refund',
            'subtotal': 180,
            'gst_amount': 0,
            'total_amount': 180,
            'items': [{
                'batch_id': str(self.batch.id),
                'product_name': 'Return Drug',
                'qty': 1,
                'rate': 180,
                'gst_rate': 0,
                'total': 180,
            }]
        }
        CreditNoteService.create(str(self.outlet.id), str(self.staff.id), data)
        self.customer.refresh_from_db()
        self.assertEqual(float(self.customer.outstanding), max(0, initial_outstanding - 180))
