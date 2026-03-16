from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from datetime import date, datetime
from decimal import Decimal
import uuid

from apps.core.models import Organization, Outlet
from apps.accounts.models import Staff
from apps.purchases.models import Distributor, PurchaseInvoice, PurchaseItem
from apps.inventory.models import MasterProduct, Batch
from apps.billing.models import LedgerEntry, PaymentEntry


class DistributorListViewTestCase(TestCase):
    """Test suite for DistributorListView endpoint."""

    def setUp(self):
        """Create test data: organization, outlet, staff, distributors."""
        self.client = APIClient()

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

        # Create staff member for authentication
        self.staff = Staff.objects.create(
            phone="9876543210",
            name="Rajesh Patil",
            outlet=self.outlet,
            role="super_admin",
            staff_pin="0000",
            is_active=True
        )

        # Create distributors
        self.dist1 = Distributor.objects.create(
            outlet=self.outlet,
            name="ABC Pharma",
            gstin="27AABCT1234E1Z0",
            drug_license_no="DL001",
            phone="9999888877",
            email="abc@pharma.com",
            address="456 Distributor Lane",
            city="Mumbai",
            state="Maharashtra",
            credit_days=30,
            opening_balance=5000.0,
            balance_type="CR",
            is_active=True
        )

        self.dist2 = Distributor.objects.create(
            outlet=self.outlet,
            name="XYZ Supplies",
            gstin="27AXYZT1234E1Z0",
            drug_license_no="DL002",
            phone="8888777766",
            email="xyz@supplies.com",
            address="789 Supplier Ave",
            city="Pune",
            state="Maharashtra",
            credit_days=45,
            opening_balance=0,
            balance_type="DR",
            is_active=True
        )

        # Inactive distributor
        self.dist_inactive = Distributor.objects.create(
            outlet=self.outlet,
            name="Old Distributor",
            phone="7777666655",
            address="321 Old St",
            city="Bangalore",
            state="Karnataka",
            credit_days=0,
            is_active=False
        )

    def test_list_requires_authentication(self):
        """Verify JWT authentication is required."""
        response = self.client.get(f"/api/v1/purchases/distributors/?outletId={self.outlet.id}")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_with_authentication(self):
        """Verify list works with valid JWT token."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        access_token = login_response.data["access"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/purchases/distributors/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 2)  # Only active distributors

    def test_inactive_distributors_excluded(self):
        """Verify inactive distributors are not included in list."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/purchases/distributors/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should only have 2 active distributors
        self.assertEqual(len(response.data), 2)
        names = [d["name"] for d in response.data]
        self.assertNotIn("Old Distributor", names)

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
            f"/api/v1/purchases/distributors/?outletId={fake_outlet_id}"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("detail", response.data)

    def test_response_structure(self):
        """Verify response includes all required distributor fields."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/purchases/distributors/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        distributor = response.data[0]

        required_fields = [
            "id", "name", "gstin", "phone", "email", "address",
            "city", "state", "creditDays", "openingBalance", "balanceType", "isActive", "createdAt"
        ]
        for field in required_fields:
            self.assertIn(field, distributor, f"Missing field: {field}")

    def test_credit_terms_accuracy(self):
        """Verify distributor credit terms are accurate."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/purchases/distributors/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Find ABC Pharma
        dist = next(d for d in response.data if d["name"] == "ABC Pharma")

        self.assertEqual(dist["creditDays"], 30)
        self.assertEqual(dist["openingBalance"], 5000.0)
        self.assertEqual(dist["balanceType"], "CR")


class DistributorLedgerViewTestCase(TestCase):
    """Test suite for DistributorLedgerView endpoint."""

    def setUp(self):
        """Create test data: organization, outlet, staff, distributor, ledger entries."""
        self.client = APIClient()

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

        # Create staff member for authentication
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

        # Create ledger entries
        self.ledger1 = LedgerEntry.objects.create(
            outlet=self.outlet,
            entity_type="distributor",
            distributor=self.distributor,
            date=date(2026, 3, 1),
            entry_type="opening_balance",
            reference_no="OPENING",
            description="Opening balance",
            debit=10000.0,
            credit=0,
            running_balance=10000.0
        )

        self.ledger2 = LedgerEntry.objects.create(
            outlet=self.outlet,
            entity_type="distributor",
            distributor=self.distributor,
            date=date(2026, 3, 5),
            entry_type="purchase",
            reference_no="PU-001",
            description="Purchase invoice",
            debit=5000.0,
            credit=0,
            running_balance=15000.0
        )

        self.ledger3 = LedgerEntry.objects.create(
            outlet=self.outlet,
            entity_type="distributor",
            distributor=self.distributor,
            date=date(2026, 3, 10),
            entry_type="payment",
            reference_no="PAY-001",
            description="Payment made",
            debit=0,
            credit=3000.0,
            running_balance=12000.0
        )

    def test_ledger_requires_authentication(self):
        """Verify JWT authentication is required."""
        response = self.client.get(
            f"/api/v1/purchases/distributors/{self.distributor.id}/ledger/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_ledger(self):
        """Verify ledger endpoint returns all entries."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/purchases/distributors/{self.distributor.id}/ledger/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("distributor", response.data)
        self.assertIn("ledger", response.data)
        self.assertIn("summary", response.data)

        # Verify ledger entries
        self.assertEqual(len(response.data["ledger"]), 3)

    def test_ledger_running_balance(self):
        """Verify running balance is correctly calculated."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/purchases/distributors/{self.distributor.id}/ledger/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        ledger = response.data["ledger"]
        # Should be in order: opening, purchase, payment
        self.assertEqual(ledger[0]["runningBalance"], 10000.0)
        self.assertEqual(ledger[1]["runningBalance"], 15000.0)
        self.assertEqual(ledger[2]["runningBalance"], 12000.0)

    def test_ledger_summary(self):
        """Verify ledger summary totals are correct."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/purchases/distributors/{self.distributor.id}/ledger/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        summary = response.data["summary"]
        # Total debit: 10000 + 5000 = 15000
        # Total credit: 3000
        # Running balance: 12000
        self.assertEqual(summary["totalDebit"], 15000.0)
        self.assertEqual(summary["totalCredit"], 3000.0)
        self.assertEqual(summary["runningBalance"], 12000.0)

    def test_distributor_not_found(self):
        """Verify 404 when distributor does not exist."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        fake_dist_id = uuid.uuid4()
        response = self.client.get(
            f"/api/v1/purchases/distributors/{fake_dist_id}/ledger/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("detail", response.data)

    def test_ledger_entry_structure(self):
        """Verify ledger entry includes all required fields."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/purchases/distributors/{self.distributor.id}/ledger/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        entry = response.data["ledger"][0]
        required_fields = [
            "id", "date", "entryType", "referenceNo", "description",
            "debit", "credit", "runningBalance", "createdAt"
        ]
        for field in required_fields:
            self.assertIn(field, entry, f"Missing field: {field}")


class PurchaseCreateViewTestCase(TestCase):
    """Test suite for PurchaseCreateView endpoint (POST /api/v1/purchases/)."""

    def setUp(self):
        """Create test data: organization, outlet, staff, distributor, product, batch."""
        self.client = APIClient()

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

        # Create staff member for authentication
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

        # Create master product
        self.product = MasterProduct.objects.create(
            name="Dolo 650 Tablet",
            composition="Paracetamol 650mg",
            manufacturer="Micro Labs",
            category="Pain Relief",
            drug_type="allopathy",
            schedule_type="OTC",
            hsn_code="3004",
            gst_rate=Decimal("5.00"),
            pack_size=10,
            pack_unit="Strips",
            pack_type="Blister",
            is_fridge=False,
            is_discontinued=False
        )

    def test_create_requires_authentication(self):
        """Verify JWT authentication is required."""
        payload = {
            "outletId": str(self.outlet.id),
            "distributorId": str(self.distributor.id),
            "purchaseType": "credit",
            "invoiceNo": "PU-001",
            "invoiceDate": "2026-03-17",
            "dueDate": "2026-04-16",
            "godown": "main",
            "freight": 0,
            "subtotal": 1000,
            "discountAmount": 0,
            "taxableAmount": 1000,
            "gstAmount": 180,
            "cessAmount": 0,
            "roundOff": 0,
            "grandTotal": 1180,
            "items": []
        }
        response = self.client.post("/api/v1/purchases/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_purchase_success(self):
        """Verify successful purchase creation."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        payload = {
            "outletId": str(self.outlet.id),
            "distributorId": str(self.distributor.id),
            "purchaseType": "credit",
            "invoiceNo": f"PU-{uuid.uuid4().hex[:6].upper()}",
            "invoiceDate": "2026-03-17",
            "dueDate": "2026-04-16",
            "godown": "main",
            "freight": 0,
            "subtotal": 1000,
            "discountAmount": 0,
            "taxableAmount": 1000,
            "gstAmount": 180,
            "cessAmount": 0,
            "roundOff": 0,
            "grandTotal": 1180,
            "items": [
                {
                    "masterProductId": str(self.product.id),
                    "customProductName": None,
                    "isCustomProduct": False,
                    "hsnCode": "3004",
                    "batchNo": "BATCH001",
                    "expiryDate": "2026-12-31",
                    "pkg": 10,
                    "qty": 10,
                    "actualQty": 100,
                    "freeQty": 0,
                    "purchaseRate": 10,
                    "discountPct": 0,
                    "cashDiscountPct": 0,
                    "gstRate": 5,
                    "cess": 0,
                    "mrp": 15,
                    "ptr": 12,
                    "pts": 11,
                    "saleRate": 14,
                    "taxableAmount": 1000,
                    "gstAmount": 180,
                    "cessAmount": 0,
                    "totalAmount": 1180
                }
            ]
        }

        response = self.client.post("/api/v1/purchases/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify response structure
        result = response.data
        self.assertIn("id", result)
        self.assertIn("invoiceNo", result)
        self.assertEqual(result["distributorId"], str(self.distributor.id))
        self.assertEqual(result["grandTotal"], 1180)
        self.assertEqual(result["amountPaid"], 0)
        self.assertEqual(result["outstanding"], 1180)

        # Verify invoice was created in DB
        invoice = PurchaseInvoice.objects.get(id=result["id"])
        self.assertEqual(invoice.invoice_no, payload["invoiceNo"])
        self.assertEqual(invoice.outlet_id, self.outlet.id)
        self.assertEqual(invoice.distributor_id, self.distributor.id)

    def test_create_with_invalid_outlet(self):
        """Verify 404 when outlet does not exist."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        fake_outlet_id = uuid.uuid4()
        payload = {
            "outletId": str(fake_outlet_id),
            "distributorId": str(self.distributor.id),
            "purchaseType": "credit",
            "invoiceNo": "PU-999",
            "invoiceDate": "2026-03-17",
            "dueDate": "2026-04-16",
            "godown": "main",
            "freight": 0,
            "subtotal": 1000,
            "discountAmount": 0,
            "taxableAmount": 1000,
            "gstAmount": 180,
            "cessAmount": 0,
            "roundOff": 0,
            "grandTotal": 1180,
            "items": []
        }

        response = self.client.post("/api/v1/purchases/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("error", response.data)

    def test_create_response_structure(self):
        """Verify response includes all required invoice fields."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        payload = {
            "outletId": str(self.outlet.id),
            "distributorId": str(self.distributor.id),
            "purchaseType": "credit",
            "invoiceNo": f"PU-{uuid.uuid4().hex[:6].upper()}",
            "invoiceDate": "2026-03-17",
            "dueDate": "2026-04-16",
            "godown": "main",
            "freight": 0,
            "subtotal": 1000,
            "discountAmount": 0,
            "taxableAmount": 1000,
            "gstAmount": 180,
            "cessAmount": 0,
            "roundOff": 0,
            "grandTotal": 1180,
            "items": [
                {
                    "masterProductId": str(self.product.id),
                    "customProductName": None,
                    "isCustomProduct": False,
                    "hsnCode": "3004",
                    "batchNo": "BATCH002",
                    "expiryDate": "2026-12-31",
                    "pkg": 10,
                    "qty": 10,
                    "actualQty": 100,
                    "freeQty": 0,
                    "purchaseRate": 10,
                    "discountPct": 0,
                    "cashDiscountPct": 0,
                    "gstRate": 5,
                    "cess": 0,
                    "mrp": 15,
                    "ptr": 12,
                    "pts": 11,
                    "saleRate": 14,
                    "taxableAmount": 1000,
                    "gstAmount": 180,
                    "cessAmount": 0,
                    "totalAmount": 1180
                }
            ]
        }

        response = self.client.post("/api/v1/purchases/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        result = response.data
        required_fields = [
            "id", "outletId", "distributorId", "distributor", "invoiceNo",
            "invoiceDate", "dueDate", "purchaseType", "godown", "subtotal",
            "discountAmount", "taxableAmount", "gstAmount", "cessAmount",
            "freight", "roundOff", "grandTotal", "amountPaid", "outstanding",
            "items", "createdByName", "createdAt"
        ]
        for field in required_fields:
            self.assertIn(field, result, f"Missing field: {field}")


class PurchaseListViewTestCase(TestCase):
    """Test suite for PurchaseListView endpoint (GET /api/v1/purchases/)."""

    def setUp(self):
        """Create test data: organization, outlet, staff, distributors, invoices."""
        self.client = APIClient()

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

        # Create staff member for authentication
        self.staff = Staff.objects.create(
            phone="9876543210",
            name="Rajesh Patil",
            outlet=self.outlet,
            role="super_admin",
            staff_pin="0000",
            is_active=True
        )

        # Create distributors
        self.dist1 = Distributor.objects.create(
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

        self.dist2 = Distributor.objects.create(
            outlet=self.outlet,
            name="XYZ Supplies",
            gstin="27AXYZT1234E1Z0",
            phone="8888777766",
            email="xyz@supplies.com",
            address="789 Supplier Ave",
            city="Pune",
            state="Maharashtra",
            credit_days=45,
            opening_balance=0,
            balance_type="DR",
            is_active=True
        )

        # Create purchase invoices
        self.invoice1 = PurchaseInvoice.objects.create(
            outlet=self.outlet,
            distributor=self.dist1,
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

        self.invoice2 = PurchaseInvoice.objects.create(
            outlet=self.outlet,
            distributor=self.dist1,
            invoice_no="PU-002",
            invoice_date=date(2026, 3, 15),
            due_date=date(2026, 4, 14),
            purchase_type="credit",
            godown="main",
            subtotal=Decimal("2000.00"),
            discount_amount=Decimal("0.00"),
            taxable_amount=Decimal("2000.00"),
            gst_amount=Decimal("360.00"),
            cess_amount=Decimal("0.00"),
            freight=Decimal("0.00"),
            round_off=Decimal("0.00"),
            grand_total=Decimal("2360.00"),
            amount_paid=Decimal("500.00"),
            outstanding=Decimal("1860.00"),
            created_by=self.staff,
        )

        self.invoice3 = PurchaseInvoice.objects.create(
            outlet=self.outlet,
            distributor=self.dist2,
            invoice_no="PU-003",
            invoice_date=date(2026, 3, 12),
            due_date=date(2026, 4, 26),
            purchase_type="credit",
            godown="cold_storage",
            subtotal=Decimal("3000.00"),
            discount_amount=Decimal("0.00"),
            taxable_amount=Decimal("3000.00"),
            gst_amount=Decimal("540.00"),
            cess_amount=Decimal("0.00"),
            freight=Decimal("0.00"),
            round_off=Decimal("0.00"),
            grand_total=Decimal("3540.00"),
            amount_paid=Decimal("0.00"),
            outstanding=Decimal("3540.00"),
            created_by=self.staff,
        )

    def test_list_requires_authentication(self):
        """Verify JWT authentication is required."""
        response = self.client.get(f"/api/v1/purchases/?outletId={self.outlet.id}")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_all_invoices(self):
        """Verify list returns all invoices for outlet."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(f"/api/v1/purchases/?outletId={self.outlet.id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("data", response.data)
        self.assertIn("pagination", response.data)
        self.assertEqual(len(response.data["data"]), 3)

    def test_list_newest_first(self):
        """Verify invoices are ordered newest first."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(f"/api/v1/purchases/?outletId={self.outlet.id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        invoices = response.data["data"]
        # Should be ordered: PU-003 (3/15), PU-002 (3/15), PU-001 (3/10)
        self.assertEqual(invoices[0]["invoiceNo"], "PU-002")
        self.assertEqual(invoices[1]["invoiceNo"], "PU-003")
        self.assertEqual(invoices[2]["invoiceNo"], "PU-001")

    def test_list_filter_by_distributor(self):
        """Verify filtering by distributorId."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/purchases/?outletId={self.outlet.id}&distributorId={self.dist1.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 2)
        for invoice in response.data["data"]:
            self.assertEqual(invoice["distributorId"], str(self.dist1.id))

    def test_list_filter_by_date_range(self):
        """Verify filtering by startDate and endDate."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/purchases/?outletId={self.outlet.id}&startDate=2026-03-12&endDate=2026-03-14"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should only include PU-003 (3/12)
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["data"][0]["invoiceNo"], "PU-003")

    def test_list_pagination(self):
        """Verify pagination works correctly."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/purchases/?outletId={self.outlet.id}&page=1&pageSize=2"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 2)
        self.assertEqual(response.data["pagination"]["page"], 1)
        self.assertEqual(response.data["pagination"]["pageSize"], 2)
        self.assertEqual(response.data["pagination"]["totalPages"], 2)
        self.assertEqual(response.data["pagination"]["totalRecords"], 3)

    def test_list_response_structure(self):
        """Verify response includes all required fields."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(f"/api/v1/purchases/?outletId={self.outlet.id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        invoice = response.data["data"][0]
        required_fields = [
            "id", "outletId", "distributorId", "distributor", "invoiceNo",
            "invoiceDate", "dueDate", "subtotal", "discountAmount",
            "taxableAmount", "gstAmount", "cessAmount", "freight", "roundOff",
            "grandTotal", "amountPaid", "outstanding", "createdAt"
        ]
        for field in required_fields:
            self.assertIn(field, invoice, f"Missing field: {field}")


class DistributorPaymentViewTestCase(TestCase):
    """Test suite for DistributorPaymentView endpoint (POST /api/v1/purchases/payments/)."""

    def setUp(self):
        """Create test data: organization, outlet, staff, distributor, invoices."""
        self.client = APIClient()

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

        # Create staff member for authentication
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

        # Create purchase invoices
        self.invoice1 = PurchaseInvoice.objects.create(
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

        self.invoice2 = PurchaseInvoice.objects.create(
            outlet=self.outlet,
            distributor=self.distributor,
            invoice_no="PU-002",
            invoice_date=date(2026, 3, 12),
            due_date=date(2026, 4, 11),
            purchase_type="credit",
            godown="main",
            subtotal=Decimal("2000.00"),
            discount_amount=Decimal("0.00"),
            taxable_amount=Decimal("2000.00"),
            gst_amount=Decimal("360.00"),
            cess_amount=Decimal("0.00"),
            freight=Decimal("0.00"),
            round_off=Decimal("0.00"),
            grand_total=Decimal("2360.00"),
            amount_paid=Decimal("0.00"),
            outstanding=Decimal("2360.00"),
            created_by=self.staff,
        )

    def test_payment_requires_authentication(self):
        """Verify JWT authentication is required."""
        payload = {
            "distributorId": str(self.distributor.id),
            "date": "2026-03-17",
            "totalAmount": 1000,
            "paymentMode": "cash",
            "allocations": []
        }
        response = self.client.post(f"/api/v1/purchases/payments/?outletId={self.outlet.id}", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_record_payment_success(self):
        """Verify successful payment recording with allocation."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        payload = {
            "distributorId": str(self.distributor.id),
            "date": "2026-03-17",
            "totalAmount": 1000,
            "paymentMode": "cash",
            "referenceNo": "CHQ12345",
            "notes": "Payment for invoices",
            "allocations": [
                {
                    "purchaseInvoiceId": str(self.invoice1.id),
                    "allocatedAmount": 1000
                }
            ]
        }

        response = self.client.post(
            f"/api/v1/purchases/payments/?outletId={self.outlet.id}",
            payload,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify response structure
        result = response.data
        self.assertIn("id", result)
        self.assertEqual(result["distributorId"], str(self.distributor.id))
        self.assertEqual(result["totalAmount"], 1000)
        self.assertEqual(result["paymentMode"], "cash")
        self.assertEqual(len(result["allocations"]), 1)

        # Verify invoice outstanding was updated
        invoice = PurchaseInvoice.objects.get(id=self.invoice1.id)
        self.assertEqual(float(invoice.outstanding), 180.0)  # 1180 - 1000
        self.assertEqual(float(invoice.amount_paid), 1000.0)

    def test_record_payment_with_invalid_outlet(self):
        """Verify 404 when outlet does not exist."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        fake_outlet_id = uuid.uuid4()
        payload = {
            "distributorId": str(self.distributor.id),
            "date": "2026-03-17",
            "totalAmount": 1000,
            "paymentMode": "cash",
            "allocations": []
        }

        response = self.client.post(
            f"/api/v1/purchases/payments/?outletId={fake_outlet_id}",
            payload,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("error", response.data)

    def test_record_payment_overpayment_error(self):
        """Verify overpayment error when trying to allocate more than outstanding."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        payload = {
            "distributorId": str(self.distributor.id),
            "date": "2026-03-17",
            "totalAmount": 5000,  # More than total outstanding
            "paymentMode": "cash",
            "allocations": [
                {
                    "purchaseInvoiceId": str(self.invoice1.id),
                    "allocatedAmount": 5000  # More than invoice outstanding (1180)
                }
            ]
        }

        response = self.client.post(
            f"/api/v1/purchases/payments/?outletId={self.outlet.id}",
            payload,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)

    def test_record_payment_response_structure(self):
        """Verify response includes all required payment fields."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        payload = {
            "distributorId": str(self.distributor.id),
            "date": "2026-03-17",
            "totalAmount": 1000,
            "paymentMode": "upi",
            "referenceNo": "UTR12345",
            "notes": "Online payment",
            "allocations": [
                {
                    "purchaseInvoiceId": str(self.invoice1.id),
                    "allocatedAmount": 1000
                }
            ]
        }

        response = self.client.post(
            f"/api/v1/purchases/payments/?outletId={self.outlet.id}",
            payload,
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        result = response.data
        required_fields = [
            "id", "outletId", "distributorId", "distributor", "date",
            "totalAmount", "paymentMode", "referenceNo", "notes",
            "allocations", "createdBy", "createdAt"
        ]
        for field in required_fields:
            self.assertIn(field, result, f"Missing field: {field}")

        # Verify allocation structure
        allocation = result["allocations"][0]
        allocation_fields = [
            "purchaseInvoiceId", "invoiceNo", "invoiceDate",
            "invoiceTotal", "currentOutstanding", "allocatedAmount"
        ]
        for field in allocation_fields:
            self.assertIn(field, allocation, f"Missing allocation field: {field}")


class BatchMergeAndAtomicityTestCase(TestCase):
    """Test suite for batch merge logic and atomic transaction rollback."""

    def setUp(self):
        """Create test data: organization, outlet, staff, distributor, product."""
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

        # Create master product
        self.product = MasterProduct.objects.create(
            name="Dolo 650 Tablet",
            composition="Paracetamol 650mg",
            manufacturer="Micro Labs",
            category="Pain Relief",
            drug_type="allopathy",
            schedule_type="OTC",
            hsn_code="3004",
            gst_rate=Decimal("5.00"),
            pack_size=10,
            pack_unit="Strips",
            pack_type="Blister",
            is_fridge=False,
            is_discontinued=False
        )

    def test_batch_merge_adds_quantity(self):
        """Verify batch merge adds quantity to existing batch instead of creating duplicate."""
        from apps.purchases.services import atomic_purchase_save

        # Create first purchase with batch BATCH001
        payload1 = {
            "outletId": str(self.outlet.id),
            "distributorId": str(self.distributor.id),
            "purchaseType": "credit",
            "invoiceNo": f"PU-{uuid.uuid4().hex[:6].upper()}",
            "invoiceDate": "2026-03-17",
            "dueDate": "2026-04-16",
            "godown": "main",
            "freight": 0,
            "subtotal": 1000,
            "discountAmount": 0,
            "taxableAmount": 1000,
            "gstAmount": 180,
            "cessAmount": 0,
            "roundOff": 0,
            "grandTotal": 1180,
            "items": [
                {
                    "masterProductId": str(self.product.id),
                    "customProductName": None,
                    "isCustomProduct": False,
                    "hsnCode": "3004",
                    "batchNo": "BATCH001",
                    "expiryDate": "2026-12-31",
                    "pkg": 10,
                    "qty": 10,
                    "actualQty": 100,
                    "freeQty": 0,
                    "purchaseRate": 10,
                    "discountPct": 0,
                    "cashDiscountPct": 0,
                    "gstRate": 5,
                    "cess": 0,
                    "mrp": 15,
                    "ptr": 12,
                    "pts": 11,
                    "saleRate": 14,
                    "taxableAmount": 1000,
                    "gstAmount": 180,
                    "cessAmount": 0,
                    "totalAmount": 1180
                }
            ]
        }

        inv1 = atomic_purchase_save(payload1, str(self.outlet.id), str(self.staff.id))
        batch_count_after_first = Batch.objects.filter(batch_no="BATCH001").count()
        self.assertEqual(batch_count_after_first, 1)

        # Get the created batch
        batch1 = Batch.objects.get(batch_no="BATCH001")
        self.assertEqual(batch1.qty_strips, 100)

        # Create second purchase with same batch number
        payload2 = {
            "outletId": str(self.outlet.id),
            "distributorId": str(self.distributor.id),
            "purchaseType": "credit",
            "invoiceNo": f"PU-{uuid.uuid4().hex[:6].upper()}",
            "invoiceDate": "2026-03-18",
            "dueDate": "2026-04-17",
            "godown": "main",
            "freight": 0,
            "subtotal": 500,
            "discountAmount": 0,
            "taxableAmount": 500,
            "gstAmount": 90,
            "cessAmount": 0,
            "roundOff": 0,
            "grandTotal": 590,
            "items": [
                {
                    "masterProductId": str(self.product.id),
                    "customProductName": None,
                    "isCustomProduct": False,
                    "hsnCode": "3004",
                    "batchNo": "BATCH001",  # Same batch number
                    "expiryDate": "2026-12-31",  # Same expiry
                    "pkg": 10,
                    "qty": 5,
                    "actualQty": 50,
                    "freeQty": 0,
                    "purchaseRate": 10,
                    "discountPct": 0,
                    "cashDiscountPct": 0,
                    "gstRate": 5,
                    "cess": 0,
                    "mrp": 15,
                    "ptr": 12,
                    "pts": 11,
                    "saleRate": 14,
                    "taxableAmount": 500,
                    "gstAmount": 90,
                    "cessAmount": 0,
                    "totalAmount": 590
                }
            ]
        }

        inv2 = atomic_purchase_save(payload2, str(self.outlet.id), str(self.staff.id))

        # Verify batch was merged, not created new
        batch_count_after_second = Batch.objects.filter(batch_no="BATCH001").count()
        self.assertEqual(batch_count_after_second, 1, "Batch should not be duplicated")

        # Verify quantity was added
        batch1_updated = Batch.objects.get(batch_no="BATCH001")
        self.assertEqual(batch1_updated.qty_strips, 150, "Batch quantity should be 100 + 50 = 150")

    def test_batch_with_different_expiry_creates_separate_batch(self):
        """Verify batches with same batch_no but different expiry create separate entries."""
        from apps.purchases.services import atomic_purchase_save

        # First purchase: BATCH002, expiry 2026-12-31
        payload1 = {
            "outletId": str(self.outlet.id),
            "distributorId": str(self.distributor.id),
            "purchaseType": "credit",
            "invoiceNo": f"PU-{uuid.uuid4().hex[:6].upper()}",
            "invoiceDate": "2026-03-17",
            "dueDate": "2026-04-16",
            "godown": "main",
            "freight": 0,
            "subtotal": 1000,
            "discountAmount": 0,
            "taxableAmount": 1000,
            "gstAmount": 180,
            "cessAmount": 0,
            "roundOff": 0,
            "grandTotal": 1180,
            "items": [
                {
                    "masterProductId": str(self.product.id),
                    "customProductName": None,
                    "isCustomProduct": False,
                    "hsnCode": "3004",
                    "batchNo": "BATCH002",
                    "expiryDate": "2026-12-31",
                    "pkg": 10,
                    "qty": 10,
                    "actualQty": 100,
                    "freeQty": 0,
                    "purchaseRate": 10,
                    "discountPct": 0,
                    "cashDiscountPct": 0,
                    "gstRate": 5,
                    "cess": 0,
                    "mrp": 15,
                    "ptr": 12,
                    "pts": 11,
                    "saleRate": 14,
                    "taxableAmount": 1000,
                    "gstAmount": 180,
                    "cessAmount": 0,
                    "totalAmount": 1180
                }
            ]
        }

        inv1 = atomic_purchase_save(payload1, str(self.outlet.id), str(self.staff.id))

        # Second purchase: BATCH002, different expiry 2027-06-30
        payload2 = {
            "outletId": str(self.outlet.id),
            "distributorId": str(self.distributor.id),
            "purchaseType": "credit",
            "invoiceNo": f"PU-{uuid.uuid4().hex[:6].upper()}",
            "invoiceDate": "2026-03-18",
            "dueDate": "2026-04-17",
            "godown": "main",
            "freight": 0,
            "subtotal": 500,
            "discountAmount": 0,
            "taxableAmount": 500,
            "gstAmount": 90,
            "cessAmount": 0,
            "roundOff": 0,
            "grandTotal": 590,
            "items": [
                {
                    "masterProductId": str(self.product.id),
                    "customProductName": None,
                    "isCustomProduct": False,
                    "hsnCode": "3004",
                    "batchNo": "BATCH002",  # Same batch number
                    "expiryDate": "2027-06-30",  # Different expiry
                    "pkg": 10,
                    "qty": 5,
                    "actualQty": 50,
                    "freeQty": 0,
                    "purchaseRate": 10,
                    "discountPct": 0,
                    "cashDiscountPct": 0,
                    "gstRate": 5,
                    "cess": 0,
                    "mrp": 15,
                    "ptr": 12,
                    "pts": 11,
                    "saleRate": 14,
                    "taxableAmount": 500,
                    "gstAmount": 90,
                    "cessAmount": 0,
                    "totalAmount": 590
                }
            ]
        }

        inv2 = atomic_purchase_save(payload2, str(self.outlet.id), str(self.staff.id))

        # Verify two separate batches were created (different expiry)
        batch_count = Batch.objects.filter(batch_no="BATCH002").count()
        self.assertEqual(batch_count, 2, "Different expiry dates should create separate batches")

        # Verify each has correct quantity
        batch_2026 = Batch.objects.get(batch_no="BATCH002", expiry_date=date(2026, 12, 31))
        batch_2027 = Batch.objects.get(batch_no="BATCH002", expiry_date=date(2027, 6, 30))
        self.assertEqual(batch_2026.qty_strips, 100)
        self.assertEqual(batch_2027.qty_strips, 50)
