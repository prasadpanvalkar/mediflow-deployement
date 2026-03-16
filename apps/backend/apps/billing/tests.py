from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from datetime import date
from decimal import Decimal
import uuid

from apps.core.models import Organization, Outlet
from apps.accounts.models import Staff, Customer
from apps.purchases.models import Distributor, PurchaseInvoice
from apps.billing.models import CreditAccount, CreditTransaction, SaleInvoice


class PaymentAllocationTestCase(TestCase):
    """Test suite for payment allocation, overpayment blocking, and full clearance."""

    def setUp(self):
        """Create test data: organization, outlet, staff, distributor, customer, invoices."""
        # Create organization
        self.org = Organization.objects.create(
            name="Test Pharmacy Chain",
            slug="test-pharmacy",
            plan="pro",
            is_active=True
        )

        # Create outlet
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

        # Create staff member
        self.staff = Staff.objects.create(
            phone="9876543210",
            name="Rajesh Patil",
            outlet=self.outlet,
            role="super_admin",
            staff_pin="0000",
            is_active=True
        )

        # Create distributor
        self.distributor = Distributor.objects.create(
            outlet=self.outlet,
            name="ABC Pharma",
            gstin="27AABCT1234E1Z0",
            phone="9999888877",
            email="abc@pharma.com",
            address="456 Distributor Lane",
            city="Mumbai",
            state="Maharashtra",
            credit_days=30,
            opening_balance=10000.0,
            balance_type="CR",
            is_active=True
        )

        # Create purchase invoice
        self.invoice = PurchaseInvoice.objects.create(
            outlet=self.outlet,
            distributor=self.distributor,
            invoice_no="PU-001",
            invoice_date=date(2026, 3, 10),
            due_date=date(2026, 4, 9),
            purchase_type="credit",
            godown="main",
            subtotal=Decimal("1000.00"),
            discount_amount=Decimal("0.00"),
            taxable_amount=Decimal("1000.00"),
            gst_amount=Decimal("180.00"),
            cess_amount=Decimal("0.00"),
            freight=Decimal("0.00"),
            round_off=Decimal("0.00"),
            grand_total=Decimal("1180.00"),
            amount_paid=Decimal("0.00"),
            outstanding=Decimal("1180.00"),
            created_by=self.staff,
        )

        # Create customer and credit account
        self.customer = Customer.objects.create(
            outlet=self.outlet,
            name="John Patient",
            phone="9876543210",
            address="123 Patient St",
        )

        self.credit_account = CreditAccount.objects.create(
            outlet=self.outlet,
            customer=self.customer,
            credit_limit=Decimal("5000.00"),
            total_outstanding=Decimal("1000.00"),
            total_borrowed=Decimal("1000.00"),
            total_repaid=Decimal("0.00"),
            status='active',
        )

    def test_partial_payment_reduces_outstanding(self):
        """Verify partial payment correctly reduces invoice outstanding."""
        from apps.purchases.services import bill_by_bill_payment_allocate

        payload = {
            'distributorId': str(self.distributor.id),
            'date': '2026-03-17',
            'totalAmount': 500,
            'paymentMode': 'cash',
            'allocations': [
                {
                    'purchaseInvoiceId': str(self.invoice.id),
                    'allocatedAmount': 500
                }
            ]
        }

        payment_entry = bill_by_bill_payment_allocate(payload, str(self.outlet.id), str(self.staff.id))

        # Verify invoice outstanding was reduced
        self.invoice.refresh_from_db()
        self.assertEqual(float(self.invoice.outstanding), 680.0)  # 1180 - 500
        self.assertEqual(float(self.invoice.amount_paid), 500.0)

    def test_overpayment_raises_error(self):
        """Verify overpayment attempt raises OverpaymentError."""
        from apps.purchases.services import bill_by_bill_payment_allocate, OverpaymentError

        payload = {
            'distributorId': str(self.distributor.id),
            'date': '2026-03-17',
            'totalAmount': 2000,  # More than outstanding
            'paymentMode': 'cash',
            'allocations': [
                {
                    'purchaseInvoiceId': str(self.invoice.id),
                    'allocatedAmount': 2000  # More than invoice outstanding (1180)
                }
            ]
        }

        with self.assertRaises(OverpaymentError) as context:
            bill_by_bill_payment_allocate(payload, str(self.outlet.id), str(self.staff.id))

        self.assertIn('Overpayment', str(context.exception))

    def test_full_payment_clears_invoice(self):
        """Verify full payment reduces outstanding to zero."""
        from apps.purchases.services import bill_by_bill_payment_allocate

        payload = {
            'distributorId': str(self.distributor.id),
            'date': '2026-03-17',
            'totalAmount': 1180,  # Exact outstanding amount
            'paymentMode': 'cash',
            'allocations': [
                {
                    'purchaseInvoiceId': str(self.invoice.id),
                    'allocatedAmount': 1180
                }
            ]
        }

        payment_entry = bill_by_bill_payment_allocate(payload, str(self.outlet.id), str(self.staff.id))

        # Verify invoice fully paid
        self.invoice.refresh_from_db()
        self.assertEqual(float(self.invoice.outstanding), 0.0)
        self.assertEqual(float(self.invoice.amount_paid), 1180.0)

    def test_customer_payment_updates_credit_account(self):
        """Verify customer credit payment updates CreditAccount balance."""
        # Record a payment
        self.client = APIClient()

        # Login
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        payload = {
            "creditAccountId": str(self.credit_account.id),
            "amount": 500,
            "mode": "cash",
            "paymentDate": "2026-03-17"
        }

        response = self.client.post(
            f"/api/v1/credit/payment/?outletId={self.outlet.id}",
            payload,
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify credit account was updated
        self.credit_account.refresh_from_db()
        self.assertEqual(float(self.credit_account.total_outstanding), 500.0)  # 1000 - 500
        self.assertEqual(float(self.credit_account.total_repaid), 500.0)
        self.assertEqual(self.credit_account.status, 'partial')

    def test_full_customer_payment_clears_account(self):
        """Verify full customer payment marks account as cleared."""
        self.client = APIClient()

        # Login
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        payload = {
            "creditAccountId": str(self.credit_account.id),
            "amount": 1000,  # Exact outstanding
            "mode": "cash",
            "paymentDate": "2026-03-17"
        }

        response = self.client.post(
            f"/api/v1/credit/payment/?outletId={self.outlet.id}",
            payload,
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify credit account is cleared
        self.credit_account.refresh_from_db()
        self.assertEqual(float(self.credit_account.total_outstanding), 0.0)
        self.assertEqual(float(self.credit_account.total_repaid), 1000.0)
        self.assertEqual(self.credit_account.status, 'cleared')

    def test_customer_overpayment_blocked(self):
        """Verify overpayment on customer account is blocked."""
        self.client = APIClient()

        # Login
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        payload = {
            "creditAccountId": str(self.credit_account.id),
            "amount": 2000,  # More than outstanding (1000)
            "mode": "cash",
            "paymentDate": "2026-03-17"
        }

        response = self.client.post(
            f"/api/v1/credit/payment/?outletId={self.outlet.id}",
            payload,
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('OVERPAYMENT', response.data['error']['code'])

    def test_multiple_invoice_payment_allocation(self):
        """Verify payment can be split across multiple invoices."""
        from apps.purchases.services import bill_by_bill_payment_allocate

        # Create second invoice
        invoice2 = PurchaseInvoice.objects.create(
            outlet=self.outlet,
            distributor=self.distributor,
            invoice_no="PU-002",
            invoice_date=date(2026, 3, 12),
            due_date=date(2026, 4, 11),
            purchase_type="credit",
            godown="main",
            subtotal=Decimal("800.00"),
            discount_amount=Decimal("0.00"),
            taxable_amount=Decimal("800.00"),
            gst_amount=Decimal("144.00"),
            cess_amount=Decimal("0.00"),
            freight=Decimal("0.00"),
            round_off=Decimal("0.00"),
            grand_total=Decimal("944.00"),
            amount_paid=Decimal("0.00"),
            outstanding=Decimal("944.00"),
            created_by=self.staff,
        )

        # Pay 1000 split across both invoices
        payload = {
            'distributorId': str(self.distributor.id),
            'date': '2026-03-17',
            'totalAmount': 1000,
            'paymentMode': 'cash',
            'allocations': [
                {
                    'purchaseInvoiceId': str(self.invoice.id),
                    'allocatedAmount': 600
                },
                {
                    'purchaseInvoiceId': str(invoice2.id),
                    'allocatedAmount': 400
                }
            ]
        }

        payment_entry = bill_by_bill_payment_allocate(payload, str(self.outlet.id), str(self.staff.id))

        # Verify both invoices were updated
        self.invoice.refresh_from_db()
        invoice2.refresh_from_db()

        self.assertEqual(float(self.invoice.outstanding), 580.0)  # 1180 - 600
        self.assertEqual(float(self.invoice.amount_paid), 600.0)
        self.assertEqual(float(invoice2.outstanding), 544.0)  # 944 - 400
        self.assertEqual(float(invoice2.amount_paid), 400.0)
