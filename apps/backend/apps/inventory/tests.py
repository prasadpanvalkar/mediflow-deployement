from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from datetime import timedelta
import uuid

from apps.core.models import Organization, Outlet
from apps.accounts.models import Staff
from apps.inventory.models import MasterProduct, Batch


class ProductSearchViewTestCase(TestCase):
    """Test suite for ProductSearchView endpoint."""

    def setUp(self):
        """Create test data: organization, outlet, staff, products, batches."""
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
            drug_license_no=f"DLN-{uuid.uuid4().hex[:12].upper()}",  # Unique
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

        # Create master products
        self.paracetamol = MasterProduct.objects.create(
            name="Paracetamol",
            composition="Paracetamol 500mg",
            manufacturer="Abbott",
            category="Pain Relief",
            drug_type="allopathy",
            schedule_type="OTC",
            hsn_code="3004901",
            gst_rate=5.0,
            pack_size=10,
            pack_unit="tablet",
            pack_type="strip",
            barcode="9876543210001",
            is_fridge=False,
            is_discontinued=False
        )

        self.amoxicillin = MasterProduct.objects.create(
            name="Amoxicillin",
            composition="Amoxicillin 500mg",
            manufacturer="Cipla",
            category="Antibiotic",
            drug_type="allopathy",
            schedule_type="H",
            hsn_code="3004902",
            gst_rate=12.0,
            pack_size=10,
            pack_unit="capsule",
            pack_type="strip",
            is_fridge=False,
            is_discontinued=False
        )

        self.aspirin = MasterProduct.objects.create(
            name="Aspirin",
            composition="Acetylsalicylic acid 500mg",
            manufacturer="Bayer",
            category="Pain Relief",
            drug_type="allopathy",
            schedule_type="OTC",
            hsn_code="3004903",
            gst_rate=5.0,
            pack_size=10,
            pack_unit="tablet",
            pack_type="strip",
            is_fridge=False,
            is_discontinued=False
        )

        # Create batches for paracetamol - multiple batches for aggregation test
        today = timezone.now().date()
        self.batch1 = Batch.objects.create(
            outlet=self.outlet,
            product=self.paracetamol,
            batch_no="BATCH001",
            expiry_date=today + timedelta(days=365),
            mrp=50.0,
            purchase_rate=25.0,
            sale_rate=40.0,
            qty_strips=10,
            qty_loose=0,
            rack_location="Shelf A1",
            is_active=True
        )

        self.batch2 = Batch.objects.create(
            outlet=self.outlet,
            product=self.paracetamol,
            batch_no="BATCH002",
            expiry_date=today + timedelta(days=200),  # Different expiry for FEFO test
            mrp=50.0,
            purchase_rate=25.0,
            sale_rate=40.0,
            qty_strips=15,
            qty_loose=5,
            rack_location="Shelf A2",
            is_active=True
        )

        # Expired batch - should not be included
        self.batch_expired = Batch.objects.create(
            outlet=self.outlet,
            product=self.paracetamol,
            batch_no="BATCH_EXPIRED",
            expiry_date=today - timedelta(days=1),
            mrp=50.0,
            purchase_rate=25.0,
            sale_rate=40.0,
            qty_strips=5,
            qty_loose=0,
            rack_location="Shelf A3",
            is_active=True
        )

        # Batch for amoxicillin
        self.batch3 = Batch.objects.create(
            outlet=self.outlet,
            product=self.amoxicillin,
            batch_no="BATCH003",
            expiry_date=today + timedelta(days=180),
            mrp=75.0,
            purchase_rate=40.0,
            sale_rate=60.0,
            qty_strips=8,
            qty_loose=0,
            rack_location="Shelf B1",
            is_active=True
        )

    def test_search_requires_authentication(self):
        """Verify JWT authentication is required."""
        response = self.client.get("/api/v1/products/search/?q=paracetamol&outletId=" + str(self.outlet.id))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_search_with_authentication(self):
        """Verify search works with valid JWT token."""
        # Get JWT token via login
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        access_token = login_response.data["access"]

        # Set auth header
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        # Search should succeed
        response = self.client.get(
            f"/api/v1/products/search/?q=paracetamol&outletId={self.outlet.id}"
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
            f"/api/v1/products/search/?q=&outletId={self.outlet.id}"
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
            f"/api/v1/products/search/?q=a&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_search_by_product_name(self):
        """Verify search by product name (case-insensitive)."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        # Search for "PARACETAMOL" in uppercase
        response = self.client.get(
            f"/api/v1/products/search/?q=PARACETAMOL&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Paracetamol")

    def test_search_by_partial_name(self):
        """Verify search by partial product name."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/products/search/?q=para&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Paracetamol")

    def test_search_by_composition(self):
        """Verify search by product composition."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/products/search/?q=Acetylsalicylic&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Aspirin")

    def test_search_by_manufacturer(self):
        """Verify search by manufacturer."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/products/search/?q=Cipla&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Amoxicillin")

    def test_stock_aggregation_multiple_batches(self):
        """Verify total stock is sum of qty_strips across all non-expired batches."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/products/search/?q=paracetamol&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        # Total should be batch1 (10) + batch2 (15) = 25, excluding expired batch (5)
        self.assertEqual(response.data[0]["totalStock"], 25)

    def test_expired_batches_excluded(self):
        """Verify expired batches are not included in search results."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/products/search/?q=paracetamol&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product = response.data[0]

        # Should have 2 batches (batch1, batch2), not the expired batch
        self.assertEqual(len(product["batches"]), 2)

    def test_fefo_ordering_by_expiry_date(self):
        """Verify batches are ordered by expiry_date (FEFO - First Expiry First Out)."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/products/search/?q=paracetamol&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product = response.data[0]

        # Batches should be ordered by expiry_date: batch2 (200 days) should come before batch1 (365 days)
        self.assertEqual(product["batches"][0]["batchNo"], "BATCH002")
        self.assertEqual(product["batches"][1]["batchNo"], "BATCH001")

    def test_nearest_expiry_date(self):
        """Verify nearestExpiry is set to earliest expiry date (FEFO)."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/products/search/?q=paracetamol&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product = response.data[0]

        # nearestExpiry should be batch2's expiry (200 days from now)
        today = timezone.now().date()
        expected_expiry = (today + timedelta(days=200)).isoformat()
        self.assertEqual(product["nearestExpiry"], expected_expiry)

    def test_low_stock_flag(self):
        """Verify isLowStock flag is set when total stock < 10."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        # Create a product with very low stock
        low_stock_product = MasterProduct.objects.create(
            name="Cough Syrup",
            composition="Dextromethorphan 10mg",
            manufacturer="Kharboosh",
            category="Cough Relief",
            drug_type="allopathy",
            schedule_type="OTC",
            hsn_code="3004904",
            gst_rate=5.0,
            pack_size=100,
            pack_unit="ml",
            pack_type="bottle",
            is_fridge=False,
            is_discontinued=False
        )

        # Create batch with only 5 strips (< 10)
        today = timezone.now().date()
        Batch.objects.create(
            outlet=self.outlet,
            product=low_stock_product,
            batch_no="LOW001",
            expiry_date=today + timedelta(days=365),
            mrp=100.0,
            purchase_rate=50.0,
            sale_rate=80.0,
            qty_strips=5,
            qty_loose=0,
            rack_location="Shelf C1",
            is_active=True
        )

        response = self.client.get(
            f"/api/v1/products/search/?q=Cough&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertTrue(response.data[0]["isLowStock"])

    def test_response_structure(self):
        """Verify response includes all required ProductSearchResult fields."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/products/search/?q=paracetamol&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product = response.data[0]

        # Verify all required fields exist
        required_fields = [
            "id", "name", "composition", "manufacturer", "category",
            "drugType", "scheduleType", "hsnCode", "gstRate",
            "packSize", "packUnit", "packType", "isFridge",
            "isDiscontinued", "imageUrl", "outletProductId",
            "totalStock", "nearestExpiry", "isLowStock", "batches"
        ]
        for field in required_fields:
            self.assertIn(field, product, f"Missing field: {field}")

    def test_batch_detail_fields(self):
        """Verify batch details include all required fields."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/products/search/?q=paracetamol&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        batch = response.data[0]["batches"][0]

        # Verify all required batch fields exist
        required_batch_fields = [
            "id", "outletId", "outletProductId", "batchNo",
            "expiryDate", "mrp", "purchaseRate", "saleRate",
            "qtyStrips", "qtyLoose", "rackLocation", "isActive", "createdAt"
        ]
        for field in required_batch_fields:
            self.assertIn(field, batch, f"Missing batch field: {field}")

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
            f"/api/v1/products/search/?q=paracetamol&outletId={fake_outlet_id}"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("detail", response.data)

    def test_multiple_products_search(self):
        """Verify search returns multiple matching products."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        # Create additional product to search across multiple matches
        penicillin = MasterProduct.objects.create(
            name="Penicillin",
            composition="Penicillin 500mg",
            manufacturer="Abbott",  # Same manufacturer as paracetamol
            category="Antibiotic",
            drug_type="allopathy",
            schedule_type="H",
            hsn_code="3004905",
            gst_rate=12.0,
            pack_size=10,
            pack_unit="capsule",
            pack_type="strip",
            is_fridge=False,
            is_discontinued=False
        )

        # Search for "Abbott" should match both Paracetamol and Penicillin
        response = self.client.get(
            f"/api/v1/products/search/?q=Abbott&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_no_matching_products(self):
        """Verify empty list when no products match."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/products/search/?q=NonExistentDrug&outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])


class InventoryListViewTestCase(TestCase):
    """Test suite for InventoryListView endpoint."""

    def setUp(self):
        """Create test data: organization, outlet, staff, products, batches."""
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

        # Create master products
        self.paracetamol = MasterProduct.objects.create(
            name="Paracetamol",
            composition="Paracetamol 500mg",
            manufacturer="Abbott",
            category="Pain Relief",
            drug_type="allopathy",
            schedule_type="OTC",
            hsn_code="3004901",
            gst_rate=5.0,
            pack_size=10,
            pack_unit="tablet",
            pack_type="strip",
            is_fridge=False,
            is_discontinued=False
        )

        self.aspirin = MasterProduct.objects.create(
            name="Aspirin",
            composition="Acetylsalicylic acid 500mg",
            manufacturer="Bayer",
            category="Pain Relief",
            drug_type="allopathy",
            schedule_type="OTC",
            hsn_code="3004903",
            gst_rate=5.0,
            pack_size=10,
            pack_unit="tablet",
            pack_type="strip",
            is_fridge=False,
            is_discontinued=False
        )

        self.amoxicillin = MasterProduct.objects.create(
            name="Amoxicillin",
            composition="Amoxicillin 500mg",
            manufacturer="Cipla",
            category="Antibiotic",
            drug_type="allopathy",
            schedule_type="H",
            hsn_code="3004902",
            gst_rate=12.0,
            pack_size=10,
            pack_unit="capsule",
            pack_type="strip",
            is_fridge=False,
            is_discontinued=False
        )

        # Create batches
        today = timezone.now().date()

        # Normal stock batches for paracetamol
        self.batch1 = Batch.objects.create(
            outlet=self.outlet,
            product=self.paracetamol,
            batch_no="BATCH001",
            expiry_date=today + timedelta(days=365),
            mrp=50.0,
            purchase_rate=25.0,
            sale_rate=40.0,
            qty_strips=25,
            qty_loose=0,
            rack_location="Shelf A1",
            is_active=True
        )

        # Low stock batch for paracetamol
        self.batch2 = Batch.objects.create(
            outlet=self.outlet,
            product=self.paracetamol,
            batch_no="BATCH002",
            expiry_date=today + timedelta(days=200),
            mrp=50.0,
            purchase_rate=25.0,
            sale_rate=40.0,
            qty_strips=5,
            qty_loose=0,
            rack_location="Shelf A2",
            is_active=True
        )

        # Expiring soon batch for aspirin (45 days)
        self.batch3 = Batch.objects.create(
            outlet=self.outlet,
            product=self.aspirin,
            batch_no="BATCH003",
            expiry_date=today + timedelta(days=45),
            mrp=45.0,
            purchase_rate=22.0,
            sale_rate=38.0,
            qty_strips=20,
            qty_loose=0,
            rack_location="Shelf B1",
            is_active=True
        )

        # Expired batch (should be excluded)
        self.batch_expired = Batch.objects.create(
            outlet=self.outlet,
            product=self.paracetamol,
            batch_no="BATCH_EXPIRED",
            expiry_date=today - timedelta(days=1),
            mrp=50.0,
            purchase_rate=25.0,
            sale_rate=40.0,
            qty_strips=100,
            qty_loose=0,
            rack_location="Shelf A3",
            is_active=True
        )

        # Batch for amoxicillin
        self.batch4 = Batch.objects.create(
            outlet=self.outlet,
            product=self.amoxicillin,
            batch_no="BATCH004",
            expiry_date=today + timedelta(days=180),
            mrp=75.0,
            purchase_rate=40.0,
            sale_rate=60.0,
            qty_strips=8,
            qty_loose=0,
            rack_location="Shelf C1",
            is_active=True
        )

    def test_inventory_requires_authentication(self):
        """Verify JWT authentication is required."""
        response = self.client.get(f"/api/v1/inventory/?outletId={self.outlet.id}")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inventory_list_with_authentication(self):
        """Verify inventory list works with valid JWT token."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        access_token = login_response.data["access"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/inventory/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('data', response.data)
        self.assertIn('pagination', response.data)

    def test_inventory_returns_paginated_response(self):
        """Verify response includes pagination metadata."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/inventory/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        pagination = response.data['pagination']
        self.assertIn('page', pagination)
        self.assertIn('pageSize', pagination)
        self.assertIn('totalPages', pagination)
        self.assertIn('totalRecords', pagination)
        self.assertEqual(pagination['page'], 1)
        self.assertEqual(pagination['pageSize'], 50)

    def test_search_filter(self):
        """Verify search filter works by product name."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/inventory/?outletId={self.outlet.id}&search=paracetamol"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['data']), 1)
        self.assertEqual(response.data['data'][0]['name'], 'Paracetamol')

    def test_schedule_type_filter(self):
        """Verify scheduleType filter works."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/inventory/?outletId={self.outlet.id}&scheduleType=H"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should only have Amoxicillin with Schedule H
        self.assertEqual(len(response.data['data']), 1)
        self.assertEqual(response.data['data'][0]['scheduleType'], 'H')

    def test_low_stock_filter(self):
        """Verify lowStock filter works (qty_strips < 10)."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/inventory/?outletId={self.outlet.id}&lowStock=true"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should include products with low stock: Paracetamol (5 strips from batch2), Amoxicillin (8 strips)
        self.assertGreaterEqual(len(response.data['data']), 1)
        for product in response.data['data']:
            self.assertTrue(product['isLowStock'])

    def test_expiring_soon_filter(self):
        """Verify expiringSoon filter works (expiry within 90 days)."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/inventory/?outletId={self.outlet.id}&expiringSoon=true"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should include Aspirin (45 days) and Paracetamol batch2 (200 days, so not included)
        # Only aspirin should be in expiringSoon
        self.assertEqual(len(response.data['data']), 1)
        self.assertEqual(response.data['data'][0]['name'], 'Aspirin')

    def test_expired_batches_excluded(self):
        """Verify expired batches are not included in results."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/inventory/?outletId={self.outlet.id}&search=paracetamol"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product = response.data['data'][0]

        # Should have 2 batches (batch1 and batch2), not the expired batch
        self.assertEqual(len(product['batches']), 2)
        # Total stock should be 30 (25 + 5), not 130
        self.assertEqual(product['totalStock'], 30)

    def test_fefo_ordering(self):
        """Verify batches are ordered by expiry_date (FEFO)."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/inventory/?outletId={self.outlet.id}&search=paracetamol"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product = response.data['data'][0]

        # Batches should be ordered by expiry_date: batch2 (200 days) should come before batch1 (365 days)
        self.assertEqual(product['batches'][0]['batchNo'], 'BATCH002')
        self.assertEqual(product['batches'][1]['batchNo'], 'BATCH001')

    def test_sort_by_expiry(self):
        """Verify sortBy=expiry works (default FEFO order)."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/inventory/?outletId={self.outlet.id}&sortBy=expiry&sortOrder=asc"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        products = response.data['data']

        # Aspirin (45 days) should come first, then Paracetamol (200 days)
        self.assertEqual(products[0]['name'], 'Aspirin')

    def test_sort_by_stock(self):
        """Verify sortBy=stock works."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/inventory/?outletId={self.outlet.id}&sortBy=stock&sortOrder=desc"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        products = response.data['data']

        # Paracetamol (30 strips) should be first, then Aspirin (20), then Amoxicillin (8)
        self.assertEqual(products[0]['totalStock'], 30)
        if len(products) > 1:
            self.assertGreaterEqual(products[0]['totalStock'], products[1]['totalStock'])

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
            f"/api/v1/inventory/?outletId={fake_outlet_id}"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_product_search_result_structure(self):
        """Verify response matches ProductSearchResult shape."""
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"phone": "9876543210", "password": "0000"},
            format="json"
        )
        access_token = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.get(
            f"/api/v1/inventory/?outletId={self.outlet.id}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product = response.data['data'][0]

        required_fields = [
            'id', 'name', 'composition', 'manufacturer', 'category',
            'drugType', 'scheduleType', 'hsnCode', 'gstRate',
            'packSize', 'packUnit', 'packType', 'isFridge',
            'isDiscontinued', 'outletProductId',
            'totalStock', 'nearestExpiry', 'isLowStock', 'batches'
        ]
        for field in required_fields:
            self.assertIn(field, product, f"Missing field: {field}")


class FEFOAndBatchSelectionTestCase(TestCase):
    """Test suite for FEFO batch ordering and auto-split logic."""

    def setUp(self):
        """Create test data: organization, outlet, staff, product, batches."""
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

        # Create staff member
        self.staff = Staff.objects.create(
            phone="9876543210",
            name="Rajesh Patil",
            outlet=self.outlet,
            role="super_admin",
            staff_pin="0000",
            is_active=True
        )

        # Create master product
        self.product = MasterProduct.objects.create(
            name="Dolo 650",
            composition="Paracetamol 650mg",
            manufacturer="Micro Labs",
            category="Pain Relief",
            drug_type="allopathy",
            schedule_type="OTC",
            hsn_code="3004901",
            gst_rate=5.0,
            pack_size=10,
            pack_unit="Strips",
            pack_type="strip",
            is_fridge=False,
            is_discontinued=False
        )

    def test_fefo_order_oldest_expiry_first(self):
        """Verify FEFO batch selection uses oldest expiry first."""
        from apps.billing.services import fefo_batch_select

        # Create batch 1: Expires 2027-12-31 (newer)
        batch1 = Batch.objects.create(
            outlet=self.outlet,
            product=self.product,
            batch_no="BATCH001",
            expiry_date=timezone.now().date() + timedelta(days=365),  # 1 year
            mrp=15.0,
            purchase_rate=10.0,
            sale_rate=14.0,
            qty_strips=20,
            qty_loose=0,
        )

        # Create batch 2: Expires 2026-06-30 (older)
        batch2 = Batch.objects.create(
            outlet=self.outlet,
            product=self.product,
            batch_no="BATCH002",
            expiry_date=timezone.now().date() + timedelta(days=100),  # ~3 months
            mrp=15.0,
            purchase_rate=10.0,
            sale_rate=14.0,
            qty_strips=20,
            qty_loose=0,
        )

        # Request 25 strips total
        allocations = fefo_batch_select(str(self.outlet.id), str(self.product.id), 25)

        # Should take from BATCH2 (older) first
        self.assertEqual(len(allocations), 2)
        self.assertEqual(allocations[0]['batch'].id, batch2.id)
        self.assertEqual(allocations[0]['qty_to_deduct'], 20)
        self.assertEqual(allocations[1]['batch'].id, batch1.id)
        self.assertEqual(allocations[1]['qty_to_deduct'], 5)

    def test_auto_split_across_batches(self):
        """Verify auto-split correctly allocates across multiple batches."""
        from apps.billing.services import fefo_batch_select

        # Batch1: 10 strips
        batch1 = Batch.objects.create(
            outlet=self.outlet,
            product=self.product,
            batch_no="BATCH001",
            expiry_date=timezone.now().date() + timedelta(days=60),
            mrp=15.0,
            purchase_rate=10.0,
            sale_rate=14.0,
            qty_strips=10,
            qty_loose=0,
        )

        # Batch2: 8 strips
        batch2 = Batch.objects.create(
            outlet=self.outlet,
            product=self.product,
            batch_no="BATCH002",
            expiry_date=timezone.now().date() + timedelta(days=120),
            mrp=15.0,
            purchase_rate=10.0,
            sale_rate=14.0,
            qty_strips=8,
            qty_loose=0,
        )

        # Request 15 strips
        allocations = fefo_batch_select(str(self.outlet.id), str(self.product.id), 15)

        # Should use all of batch1 (10) + 5 from batch2 (8)
        self.assertEqual(len(allocations), 2)
        self.assertEqual(allocations[0]['qty_to_deduct'], 10)
        self.assertEqual(allocations[1]['qty_to_deduct'], 5)
        self.assertEqual(allocations[0]['batch'].id, batch1.id)
        self.assertEqual(allocations[1]['batch'].id, batch2.id)

    def test_insufficient_stock_error(self):
        """Verify InsufficientStockError is raised when total stock is insufficient."""
        from apps.billing.services import fefo_batch_select, InsufficientStockError

        # Create batch with only 10 strips
        batch = Batch.objects.create(
            outlet=self.outlet,
            product=self.product,
            batch_no="BATCH001",
            expiry_date=timezone.now().date() + timedelta(days=90),
            mrp=15.0,
            purchase_rate=10.0,
            sale_rate=14.0,
            qty_strips=10,
            qty_loose=0,
        )

        # Try to request 20 strips (more than available)
        with self.assertRaises(InsufficientStockError):
            fefo_batch_select(str(self.outlet.id), str(self.product.id), 20)

    def test_fefo_excludes_expired_batches(self):
        """Verify FEFO selection excludes already-expired batches."""
        from apps.billing.services import fefo_batch_select

        # Expired batch (should be excluded)
        expired_batch = Batch.objects.create(
            outlet=self.outlet,
            product=self.product,
            batch_no="EXPIRED",
            expiry_date=timezone.now().date() - timedelta(days=10),  # Expired 10 days ago
            mrp=15.0,
            purchase_rate=10.0,
            sale_rate=14.0,
            qty_strips=100,  # Lots of stock, but expired
            qty_loose=0,
        )

        # Valid batch
        valid_batch = Batch.objects.create(
            outlet=self.outlet,
            product=self.product,
            batch_no="VALID",
            expiry_date=timezone.now().date() + timedelta(days=90),
            mrp=15.0,
            purchase_rate=10.0,
            sale_rate=14.0,
            qty_strips=5,
            qty_loose=0,
        )

        # Request 5 strips
        allocations = fefo_batch_select(str(self.outlet.id), str(self.product.id), 5)

        # Should only use valid batch, not expired
        self.assertEqual(len(allocations), 1)
        self.assertEqual(allocations[0]['batch'].id, valid_batch.id)
