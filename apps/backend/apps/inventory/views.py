import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.core.permissions import IsAuthenticated, IsManagerOrAbove
from rest_framework import status
from django.db.models import Q, Sum
from datetime import datetime
from django.db import transaction, IntegrityError
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from apps.inventory.models import MasterProduct, Batch
from apps.core.models import Outlet
from apps.accounts.models import Staff

logger = logging.getLogger(__name__)

from apps.purchases.models import PurchaseItem
from apps.billing.utils.pricing import get_landing_cost_for_batch

class BatchLandingCostView(APIView):
    """GET /api/v1/inventory/batches/{batch_id}/landing-cost/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id, *args, **kwargs):
        try:
            batch = Batch.objects.get(id=batch_id)
        except Batch.DoesNotExist:
            return Response({'detail': 'Batch not found'}, status=status.HTTP_404_NOT_FOUND)

        outlet_id = getattr(request.user, 'outlet_id', None) or getattr(request.user, 'pharmacy_id', None)

        landing_cost = get_landing_cost_for_batch(batch, outlet_id)
        
        # Details like freight and gst_rate live on PurchaseItem
        purchase_item = PurchaseItem.objects.filter(batch=batch).order_by('-created_at').first()
        freight_per_unit = purchase_item.freight_per_unit if purchase_item else Decimal('0')
        gst_percent = purchase_item.gst_rate if purchase_item else Decimal('0')

        return Response({
            'landing_cost': str(Decimal(landing_cost).quantize(Decimal('0.0001'))),
            'mrp': str(batch.mrp),
            'purchase_rate': str(batch.purchase_rate),
            'gst_percent': str(gst_percent),
            'freight_per_unit': str(freight_per_unit)
        }, status=status.HTTP_200_OK)

def serialize_product(product, total_stock=0, nearest_expiry="2099-12-31", is_low_stock=False, batches=None):
    return {
        'id': str(product.id),
        'name': product.name,
        'composition': product.composition,
        'manufacturer': product.manufacturer,
        'category': product.category,
        'drugType': product.drug_type,
        'scheduleType': product.schedule_type,
        'hsnCode': product.hsn_code,
        'gstRate': float(product.gst_rate),
        'packSize': product.pack_size,
        'packUnit': product.pack_unit,
        'packType': product.pack_type,
        'barcode': product.barcode,
        'isFridge': product.is_fridge,
        'isDiscontinued': product.is_discontinued,
        'imageUrl': product.image_url,
        'mrp': float(product.mrp),
        'saleRate': float(product.default_sale_rate),
        'outletProductId': str(product.id),
        'totalStock': total_stock,
        'nearestExpiry': nearest_expiry,
        'isLowStock': is_low_stock,
        'batches': batches or [],
    }

def serialize_batch(batch):
    return {
        'id': str(batch.id),
        'outletId': str(batch.outlet.id),
        'outletProductId': str(batch.product.id),
        'batchNo': batch.batch_no,
        'mfgDate': batch.mfg_date.isoformat() if batch.mfg_date else None,
        'expiryDate': batch.expiry_date.isoformat() if batch.expiry_date else None,
        'mrp': float(batch.mrp),
        'purchaseRate': float(batch.purchase_rate),
        'saleRate': float(batch.sale_rate),
        'qtyStrips': batch.qty_strips,
        'qtyLoose': batch.qty_loose,
        'rackLocation': batch.rack_location,
        'isActive': batch.is_active,
        'createdAt': batch.created_at.isoformat(),
    }


class ProductListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        products = MasterProduct.objects.all()
        return Response([serialize_product(p) for p in products], status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        data = request.data
        name = (data.get('name') or '').strip()
        hsn_code = (data.get('hsnCode') or '').strip()
        pack_unit = (data.get('packUnit') or '').strip()
        schedule_type = (data.get('scheduleType') or 'OTC').strip()

        errors = {}
        if not name:
            errors['name'] = 'Product name is required'
        if not hsn_code:
            errors['hsnCode'] = 'HSN code is required'
        if not pack_unit:
            errors['packUnit'] = 'Pack unit is required'

        try:
            gst_rate = Decimal(str(data.get('gstRate', 0)))
        except (InvalidOperation, TypeError):
            errors['gstRate'] = 'Invalid GST rate'
            gst_rate = Decimal('0')

        try:
            pack_size = int(data.get('packSize', 1))
            if pack_size < 1:
                errors['packSize'] = 'Pack size must be ≥ 1'
        except (ValueError, TypeError):
            errors['packSize'] = 'Invalid pack size'
            pack_size = 1

        try:
            mrp = Decimal(str(data.get('mrp', 0)))
            if mrp <= 0:
                errors['mrp'] = 'MRP must be > 0'
        except (InvalidOperation, TypeError):
            errors['mrp'] = 'Invalid MRP'
            mrp = Decimal('0')

        try:
            sale_rate = Decimal(str(data.get('saleRate', 0)))
            if sale_rate <= 0:
                errors['saleRate'] = 'Sale rate must be > 0'
        except (InvalidOperation, TypeError):
            errors['saleRate'] = 'Invalid sale rate'
            sale_rate = Decimal('0')

        if errors:
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        # Derive drug_type from schedule_type
        schedule_to_drug = {
            'OTC': 'allopathy', 'G': 'allopathy', 'H': 'allopathy', 'H1': 'allopathy',
            'X': 'allopathy', 'C': 'allopathy', 'Narcotic': 'allopathy',
            'Ayurvedic': 'ayurveda', 'Surgical': 'allopathy',
            'Cosmetic': 'fmcg', 'Veterinary': 'allopathy',
        }
        drug_type = schedule_to_drug.get(schedule_type, 'allopathy')

        composition = (data.get('composition') or '')
        manufacturer = (data.get('manufacturer') or '')

        try:
            with transaction.atomic():
                product = MasterProduct.objects.create(
                    name=name,
                    composition=composition,
                    manufacturer=manufacturer,
                    category='general',
                    drug_type=drug_type,
                    schedule_type=schedule_type,
                    hsn_code=hsn_code,
                    gst_rate=gst_rate,
                    pack_size=pack_size,
                    pack_unit=pack_unit,
                    pack_type='strip',
                    mrp=mrp,
                    default_sale_rate=sale_rate,
                )
        except IntegrityError as e:
            return Response(
                {'errors': {'detail': 'A database integrity error occurred (e.g. duplicate barcode).'}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(serialize_product(product), status=status.HTTP_201_CREATED)


class ProductDetailView(APIView):

    def get_permissions(self):
        if self.request.method in ('PUT', 'PATCH'):
            return [IsManagerOrAbove()]
        return [IsAuthenticated()]

    def get(self, request, pk, *args, **kwargs):
        try:
            product = MasterProduct.objects.get(id=pk)
            return Response(serialize_product(product), status=status.HTTP_200_OK)
        except MasterProduct.DoesNotExist:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, pk, *args, **kwargs):
        try:
            product = MasterProduct.objects.get(id=pk)
        except MasterProduct.DoesNotExist:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        errors = {}

        # --- Validate & apply fields ---
        SCHEDULE_TO_DRUG = {
            'OTC': 'allopathy', 'G': 'allopathy', 'H': 'allopathy', 'H1': 'allopathy',
            'X': 'allopathy', 'C': 'allopathy', 'Narcotic': 'allopathy',
            'Ayurvedic': 'ayurveda', 'Surgical': 'allopathy',
            'Cosmetic': 'fmcg', 'Veterinary': 'allopathy',
        }

        if 'name' in data:
            name = (data['name'] or '').strip()
            if not name:
                errors['name'] = 'Product name is required'
            else:
                product.name = name

        if 'composition' in data:
            product.composition = (data['composition'] or '').strip()

        if 'manufacturer' in data:
            product.manufacturer = (data['manufacturer'] or '').strip()

        if 'hsnCode' in data:
            hsn = (data['hsnCode'] or '').strip()
            if not hsn:
                errors['hsnCode'] = 'HSN code is required'
            else:
                product.hsn_code = hsn

        if 'gstRate' in data:
            try:
                product.gst_rate = Decimal(str(data['gstRate']))
            except (InvalidOperation, TypeError):
                errors['gstRate'] = 'Invalid GST rate'

        if 'packSize' in data:
            try:
                ps = int(data['packSize'])
                if ps < 1:
                    errors['packSize'] = 'Pack size must be ≥ 1'
                else:
                    product.pack_size = ps
            except (ValueError, TypeError):
                errors['packSize'] = 'Invalid pack size'

        if 'packUnit' in data:
            pu = (data['packUnit'] or '').strip()
            if not pu:
                errors['packUnit'] = 'Pack unit is required'
            else:
                product.pack_unit = pu

        if 'packType' in data and data['packType']:
            product.pack_type = data['packType']

        if 'scheduleType' in data:
            st = (data['scheduleType'] or 'OTC').strip()
            product.schedule_type = st
            product.drug_type = SCHEDULE_TO_DRUG.get(st, 'allopathy')

        if 'mrp' in data:
            try:
                mrp = Decimal(str(data['mrp']))
                if mrp < 0:
                    errors['mrp'] = 'MRP cannot be negative'
                else:
                    product.mrp = mrp
            except (InvalidOperation, TypeError):
                errors['mrp'] = 'Invalid MRP'

        if 'saleRate' in data:
            try:
                sr = Decimal(str(data['saleRate']))
                if sr < 0:
                    errors['saleRate'] = 'Sale rate cannot be negative'
                else:
                    product.default_sale_rate = sr
            except (InvalidOperation, TypeError):
                errors['saleRate'] = 'Invalid sale rate'

        if 'minQty' in data:
            try:
                product.min_qty = int(data['minQty'])
            except (ValueError, TypeError):
                errors['minQty'] = 'Invalid min qty'

        if 'reorderQty' in data:
            try:
                product.reorder_qty = int(data['reorderQty'])
            except (ValueError, TypeError):
                errors['reorderQty'] = 'Invalid reorder qty'

        if 'isFridge' in data:
            product.is_fridge = bool(data['isFridge'])

        if 'isDiscontinued' in data:
            product.is_discontinued = bool(data['isDiscontinued'])

        if 'barcode' in data:
            product.barcode = (data['barcode'] or '').strip() or None

        if errors:
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        try:
            product.save()
        except IntegrityError:
            return Response(
                {'errors': {'barcode': 'This barcode is already used by another product.'}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info(f"MasterProduct {product.id} updated by {request.user}")
        return Response(serialize_product(product), status=status.HTTP_200_OK)


class ProductBatchesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)
            
        try:
            product = MasterProduct.objects.get(id=pk)
        except MasterProduct.DoesNotExist:
            return Response({'detail': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

        batches = Batch.objects.filter(
            product=product, 
            outlet=outlet, 
            is_active=True
        ).exclude(qty_strips=0, qty_loose=0).order_by('expiry_date')
        
        return Response([serialize_batch(b) for b in batches], status=status.HTTP_200_OK)


class InventoryExportCSVView(APIView):
    permission_classes = [IsManagerOrAbove]

    def get(self, request, *args, **kwargs):
        import csv
        from django.http import StreamingHttpResponse
        
        class Echo:
            def write(self, value): return value
            
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        batches = Batch.objects.filter(outlet=outlet, qty_strips__gt=0).select_related('product')
        
        def iter_items():
            yield ['product_name', 'batch_no', 'expiry_date', 'qty_strips', 'mrp', 'purchase_rate', 'rack_location']
            for b in batches:
                yield [
                    b.product.name,
                    b.batch_no,
                    b.expiry_date.isoformat() if b.expiry_date else '',
                    str(b.qty_strips),
                    str(b.mrp),
                    str(b.purchase_rate),
                    b.rack_location or ''
                ]

        writer = csv.writer(Echo())
        response = StreamingHttpResponse((writer.write(r) for r in iter_items()), content_type="text/csv")
        response['Content-Disposition'] = 'attachment; filename="stock_export.csv"'
        return response


class ProductSearchView(APIView):
    """
    GET /api/v1/products/search/?q=paracetamol&outletId=xxx

    Search products by name, composition, or manufacturer.
    Returns ProductSearchResult with aggregated stock and batch details.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        Search for products by query string.

        Query parameters:
        - q: Search query (minimum 2 characters)
        - outletId: Outlet UUID to filter batches

        Returns:
        [
            {
                "id": "...",
                "name": "Paracetamol",
                "composition": "...",
                "manufacturer": "...",
                "category": "...",
                "drugType": "...",
                "scheduleType": "...",
                "hsnCode": "...",
                "gstRate": 0,
                "packSize": 10,
                "packUnit": "tablet",
                "packType": "strip",
                "isFridge": false,
                "isDiscontinued": false,
                "outletProductId": "...",
                "totalStock": 150,
                "nearestExpiry": "2026-12-31",
                "isLowStock": false,
                "batches": [
                    {
                        "id": "...",
                        "outletId": "...",
                        "outletProductId": "...",
                        "batchNo": "BATCH123",
                        "expiryDate": "2026-12-31",
                        "mrp": 50.0,
                        "purchaseRate": 25.0,
                        "saleRate": 40.0,
                        "qtyStrips": 10,
                        "qtyLoose": 0,
                        "isActive": true,
                        "createdAt": "2026-03-17T..."
                    }
                ]
            }
        ]
        """

        query = request.query_params.get('q', '').strip()
        outlet_id = request.query_params.get('outletId')

        # Validate query length
        if len(query) < 2:
            logger.debug(f"Search query too short: {len(query)} chars")
            return Response({'data': []}, status=status.HTTP_200_OK)

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        logger.info(f"Searching products for: {query} (outlet: {outlet.name})")

        # Search MasterProducts by name, composition, manufacturer (case-insensitive)
        query_lower = query.lower()
        products = MasterProduct.objects.filter(
            Q(name__icontains=query_lower) |
            Q(composition__icontains=query_lower) |
            Q(manufacturer__icontains=query_lower)
        ).distinct()

        logger.info(f"Found {products.count()} products matching: {query}")

        # Build response with batches and aggregated stock
        results = []

        for product in products:
            # Get batches for this product at this outlet, filtered by:
            # - Not expired
            # - Active
            # - Sort by expiry_date (FEFO)
            today = datetime.now().date()
            batches = Batch.objects.filter(
                product=product,
                outlet=outlet,
                is_active=True,
                expiry_date__gt=today
            ).order_by('expiry_date')

            # Aggregate stock
            total_stock = batches.aggregate(
                total=Sum('qty_strips')
            )['total'] or 0

            # Get nearest expiry date (first batch in FEFO order)
            nearest_expiry = (
                batches.first().expiry_date.isoformat()
                if batches.exists()
                else "2099-12-31"
            )

            # Determine if low stock (< 10 strips)
            is_low_stock = total_stock < 10

            # Serialize batches
            batch_list = [
                {
                    'id': str(batch.id),
                    'outletId': str(batch.outlet.id),
                    'outletProductId': str(batch.product.id),
                    'batchNo': batch.batch_no,
                    'mfgDate': batch.mfg_date.isoformat() if batch.mfg_date else None,
                    'expiryDate': batch.expiry_date.isoformat(),
                    'mrp': float(batch.mrp),
                    'purchaseRate': float(batch.purchase_rate),
                    'saleRate': float(batch.sale_rate),
                    'qtyStrips': batch.qty_strips,
                    'qtyLoose': batch.qty_loose,
                    'rackLocation': batch.rack_location,
                    'isActive': batch.is_active,
                    'createdAt': batch.created_at.isoformat(),
                }
                for batch in batches
            ]

            # Build ProductSearchResult
            result = {
                'id': str(product.id),
                'name': product.name,
                'composition': product.composition,
                'manufacturer': product.manufacturer,
                'category': product.category,
                'drugType': product.drug_type,
                'scheduleType': product.schedule_type,
                'hsnCode': product.hsn_code,
                'gstRate': float(product.gst_rate),
                'packSize': product.pack_size,
                'packUnit': product.pack_unit,
                'packType': product.pack_type,
                'barcode': product.barcode,
                'isFridge': product.is_fridge,
                'isDiscontinued': product.is_discontinued,
                'imageUrl': product.image_url,
                'mrp': float(product.mrp),
                'saleRate': float(product.default_sale_rate),
                'outletProductId': str(product.id),
                'totalStock': total_stock,
                'nearestExpiry': nearest_expiry,
                'isLowStock': is_low_stock,
                'batches': batch_list,
            }

            results.append(result)

        logger.info(f"Returning {len(results)} products with stock data")
        return Response({'data': results}, status=status.HTTP_200_OK)


class InventoryListView(APIView):
    """
    GET /api/v1/inventory/?outletId=xxx&search=para&lowStock=true&expiringSoon=true

    List all batches with product details, supporting filters and sorting.
    Returns paginated ProductSearchResult with aggregated stock and batch details.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        List inventory with optional filters.

        Query parameters:
        - outletId: Outlet UUID to filter batches (required)
        - search: Search by product name, composition, manufacturer
        - scheduleType: Filter by drug schedule (OTC, H, H1, X, Narcotic)
        - lowStock: Filter for products with totalStock < 10 (true/false)
        - expiringSoon: Filter for batches expiring within 90 days (true/false)
        - sortBy: 'name' | 'stock' | 'expiry' | 'mrp' (default: 'expiry')
        - sortOrder: 'asc' | 'desc' (default: 'asc')
        - page: Page number for pagination (default: 1)
        - pageSize: Items per page (default: 50, max: 100)

        Returns:
        {
            "data": [{ProductSearchResult with batches}],
            "pagination": {
                "page": 1,
                "pageSize": 50,
                "totalPages": 1,
                "totalRecords": 5
            }
        }
        """

        outlet_id = request.query_params.get('outletId')

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        logger.info(f"Fetching inventory for outlet: {outlet.name}")

        # Get all MasterProducts (not filtered by search yet)
        products = MasterProduct.objects.all()

        # Apply search filter
        search_query = request.query_params.get('search', '').strip()
        if search_query:
            search_lower = search_query.lower()
            products = products.filter(
                Q(name__icontains=search_lower) |
                Q(composition__icontains=search_lower) |
                Q(manufacturer__icontains=search_lower)
            )

        # Apply scheduleType filter
        schedule_type = request.query_params.get('scheduleType')
        if schedule_type and schedule_type != 'all':
            products = products.filter(schedule_type=schedule_type)

        # CRITICAL: Only show products that have at least one batch at this outlet
        # Without this, all products are shown globally across outlets
        products_with_batches_at_outlet = Batch.objects.filter(
            outlet=outlet,
            is_active=True,
        ).values_list('product_id', flat=True).distinct()
        products = products.filter(id__in=products_with_batches_at_outlet)

        # OPTIMIZED: Bulk-fetch ALL active, non-expired batches for all outlet products
        # in a single query, then group by product in Python.
        # Before: O(N*3) DB queries (filter + aggregate + first per product).
        # After:  O(1) DB queries total.
        today = datetime.now().date()
        products_list = list(products)  # execute products query once
        logger.info(f"Found {len(products_list)} products with stock at outlet {outlet.name}")

        product_ids = [p.id for p in products_list]
        all_batches_qs = Batch.objects.filter(
            product_id__in=product_ids,
            outlet=outlet,
            is_active=True,
            expiry_date__gt=today,
        ).order_by('expiry_date', '-created_at')

        # Group batches by product_id — pure Python, zero extra DB hits
        from collections import defaultdict
        batches_map = defaultdict(list)
        for batch in all_batches_qs:
            batches_map[batch.product_id].append(batch)

        results = []
        for product in products_list:
            product_batches = batches_map.get(product.id, [])

            # All aggregations done in Python (batches already in memory)
            total_stock = sum(b.qty_strips for b in product_batches)
            nearest_expiry = (
                product_batches[0].expiry_date.isoformat()
                if product_batches
                else "2099-12-31"
            )
            is_low_stock = total_stock < 10

            batch_list = [
                {
                    'id': str(batch.id),
                    'outletId': str(outlet.id),
                    'outletProductId': str(product.id),
                    'batchNo': batch.batch_no,
                    'mfgDate': batch.mfg_date.isoformat() if batch.mfg_date else None,
                    'expiryDate': batch.expiry_date.isoformat(),
                    'mrp': float(batch.mrp),
                    'purchaseRate': float(batch.purchase_rate),
                    'saleRate': float(batch.sale_rate),
                    'qtyStrips': batch.qty_strips,
                    'qtyLoose': batch.qty_loose,
                    'rackLocation': batch.rack_location,
                    'isActive': batch.is_active,
                    'createdAt': batch.created_at.isoformat(),
                }
                for batch in product_batches
            ]

            result = {
                'id': str(product.id),
                'name': product.name,
                'composition': product.composition,
                'manufacturer': product.manufacturer,
                'category': product.category,
                'drugType': product.drug_type,
                'scheduleType': product.schedule_type,
                'hsnCode': product.hsn_code,
                'gstRate': float(product.gst_rate),
                'packSize': product.pack_size,
                'packUnit': product.pack_unit,
                'packType': product.pack_type,
                'barcode': product.barcode,
                'isFridge': product.is_fridge,
                'isDiscontinued': product.is_discontinued,
                'imageUrl': product.image_url,
                'mrp': float(product.mrp),
                'saleRate': float(product.default_sale_rate),
                'outletProductId': str(product.id),
                'totalStock': total_stock,
                'nearestExpiry': nearest_expiry,
                'isLowStock': is_low_stock,
                'batches': batch_list,
            }
            results.append(result)

        # Apply lowStock filter
        if request.query_params.get('lowStock', '').lower() == 'true':
            results = [r for r in results if r['isLowStock']]

        # Apply expiringSoon filter (within 90 days)
        if request.query_params.get('expiringSoon', '').lower() == 'true':
            from datetime import timedelta
            cutoff_date = today + timedelta(days=90)
            results = [r for r in results if r['nearestExpiry'] != "2099-12-31" and r['nearestExpiry'][:10] <= cutoff_date.isoformat()]

        # Apply sorting
        sort_by = request.query_params.get('sortBy', 'expiry')
        sort_order = request.query_params.get('sortOrder', 'asc')

        if sort_by == 'name':
            results.sort(key=lambda r: r['name'], reverse=(sort_order == 'desc'))
        elif sort_by == 'stock':
            results.sort(key=lambda r: r['totalStock'], reverse=(sort_order == 'desc'))
        elif sort_by == 'expiry':
            results.sort(
                key=lambda r: r['nearestExpiry'] if r['nearestExpiry'] != "2099-12-31" else "9999-12-31",
                reverse=(sort_order == 'desc')
            )
        elif sort_by == 'mrp':
            # For MRP, we need to get the first batch's MRP or average
            results.sort(
                key=lambda r: float(r['batches'][0]['mrp']) if r['batches'] else 0,
                reverse=(sort_order == 'desc')
            )

        # Pagination
        page = int(request.query_params.get('page', 1))
        page_size = min(int(request.query_params.get('pageSize', 50)), 100)  # Max 100 items per page

        total_records = len(results)
        total_pages = (total_records + page_size - 1) // page_size
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_results = results[start_idx:end_idx]

        logger.info(f"Returning page {page} of {total_pages} ({len(paginated_results)} items)")

        return Response({
            'data': paginated_results,
            'pagination': {
                'page': page,
                'pageSize': page_size,
                'totalPages': total_pages,
                'totalRecords': total_records
            }
        }, status=status.HTTP_200_OK)


class InventoryAlertsView(APIView):
    """
    GET /api/v1/inventory/alerts/?outletId=xxx

    Get inventory alerts: low stock, expiring soon, and out of stock products.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        Get inventory alerts.

        Query parameters:
        - outletId: Outlet UUID to filter batches (required)

        Returns:
        {
            "lowStock": [{ "productId", "productName", "totalStock", "reorderQty", "nearestExpiry" }],
            "expiringIn30Days": [{ "productId", "productName", "batchNo", "expiryDate", "daysRemaining", "qty" }],
            "outOfStock": [{ "productId", "productName" }]
        }
        """

        outlet_id = request.query_params.get('outletId')

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        logger.info(f"Fetching inventory alerts for outlet: {outlet.name}")

        today = datetime.now().date()
        cutoff_30 = today + timedelta(days=30)
        low_stock = []
        expiring_in_30_days = []
        out_of_stock = []

        # OPTIMIZED: Fetch ALL batches for this outlet in ONE query (with product joined).
        # Before: MasterProduct.objects.all() then N queries per product.
        # After:  1 query total, O(N) Python grouping.
        outlet_batches = Batch.objects.filter(
            outlet=outlet,
            is_active=True,
        ).select_related('product').order_by('expiry_date')

        # Group batches by product; track the product object via first seen batch
        from collections import defaultdict
        batches_map = defaultdict(list)
        product_map = {}
        for batch in outlet_batches:
            batches_map[batch.product_id].append(batch)
            if batch.product_id not in product_map:
                product_map[batch.product_id] = batch.product

        for product_id, product_batches in batches_map.items():
            product = product_map[product_id]

            # Aggregate total stock in Python (no extra DB queries)
            total_stock = sum(b.qty_strips for b in product_batches)

            # Nearest expiry = first batch (already sorted asc by expiry_date)
            nearest_expiry = (
                product_batches[0].expiry_date.isoformat()
                if product_batches
                else None
            )

            if total_stock == 0:
                out_of_stock.append({
                    'productId': str(product.id),
                    'productName': product.name,
                })
            elif total_stock < 10:
                low_stock.append({
                    'productId': str(product.id),
                    'productName': product.name,
                    'totalStock': total_stock,
                    'reorderQty': 50,
                    'nearestExpiry': nearest_expiry,
                })

            # Batches expiring within 30 days with stock remaining
            for batch in product_batches:
                if (batch.expiry_date and
                        today <= batch.expiry_date <= cutoff_30 and
                        batch.qty_strips > 0):
                    expiring_in_30_days.append({
                        'productId': str(product.id),
                        'productName': product.name,
                        'batchNo': batch.batch_no,
                        'expiryDate': batch.expiry_date.isoformat(),
                        'daysRemaining': (batch.expiry_date - today).days,
                        'qty': batch.qty_strips,
                    })

        result = {
            'lowStock': low_stock,
            'expiringIn30Days': expiring_in_30_days,
            'outOfStock': out_of_stock,
        }

        logger.info(f"Returning alerts: {len(low_stock)} low stock, {len(expiring_in_30_days)} expiring, {len(out_of_stock)} out of stock")
        return Response(result, status=status.HTTP_200_OK)


class InventoryAdjustView(APIView):
    """
    POST /api/v1/inventory/adjust/

    Adjust batch stock for damage, return, or correction.
    """

    permission_classes = [IsManagerOrAbove]

    def post(self, request, *args, **kwargs):
        """
        Adjust batch stock.

        Request body:
        {
            "batchId": "...",
            "type": "damage" | "return" | "correction",
            "qty": 5,  # Can be negative
            "reason": "Batch damaged in transport",
            "pin": "1234"
        }

        Response:
        {
            "success": true,
            "message": "Stock adjusted successfully"
        }
        """

        outlet_id = request.query_params.get('outletId')
        batch_id = request.data.get('batchId')
        adjust_type = request.data.get('type')
        qty = request.data.get('qty')
        reason = request.data.get('reason')
        pin = request.data.get('pin')

        # Validate required fields
        if not all([batch_id, adjust_type, qty is not None, pin]):
            return Response(
                {'detail': 'batchId, type, qty, and pin are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Validate PIN - staff exists in this outlet
        staff = None
        if pin:
            try:
                staff = Staff.objects.get(outlet=outlet, staff_pin=pin)
            except Staff.DoesNotExist:
                return Response(
                    {'error': {'code': 'INVALID_PIN', 'message': 'Invalid PIN'}},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Fetch batch
        try:
            batch = Batch.objects.get(id=batch_id, outlet=outlet)
        except Batch.DoesNotExist:
            return Response(
                {'detail': f'Batch {batch_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Update stock in transaction
        try:
            with transaction.atomic():
                batch.qty_strips += qty

                # Validate stock never goes below 0
                if batch.qty_strips < 0:
                    return Response(
                        {'detail': f'Stock cannot go below 0. Current: {batch.qty_strips - qty}, Adjustment: {qty}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                batch.save()
                logger.info(f"Adjusted batch {batch_id} stock by {qty} ({adjust_type}): {reason}")

        except Exception as e:
            logger.error(f"Error adjusting batch stock: {str(e)}")
            return Response(
                {'detail': f'Error adjusting stock: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        result = {
            'success': True,
            'message': f'Stock adjusted successfully. New stock: {batch.qty_strips}',
        }

        return Response(result, status=status.HTTP_200_OK)


from apps.inventory.models import StockLedger
from datetime import datetime

class StockLedgerView(APIView):
    """
    GET /api/v1/inventory/stockledger/?outletId=xxx&batchId=yyy&productId=zzz
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        # Accept both camelCase and snake_case query parameters
        outlet_id  = request.query_params.get('outletId')  or request.query_params.get('outlet_id')
        batch_id   = request.query_params.get('batchId')   or request.query_params.get('batch_id')
        product_id = request.query_params.get('productId') or request.query_params.get('product_id')
        start_date = request.query_params.get('startDate') or request.query_params.get('start_date') or request.query_params.get('date_from')
        end_date   = request.query_params.get('endDate')   or request.query_params.get('end_date')   or request.query_params.get('date_to')

        if not outlet_id:
            return Response({'detail': 'outletId is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = StockLedger.objects.filter(outlet=outlet).select_related('product', 'batch').order_by('-created_at')

        if batch_id:
            qs = qs.filter(batch_id=batch_id)
        if product_id:
            qs = qs.filter(product_id=product_id)
        
        if start_date:
            try:
                dt = datetime.fromisoformat(start_date).date()
                qs = qs.filter(txn_date__gte=dt)
            except ValueError:
                pass
        
        if end_date:
            try:
                dt = datetime.fromisoformat(end_date).date()
                qs = qs.filter(txn_date__lte=dt)
            except ValueError:
                pass

        # Calculate totals
        total_in = qs.aggregate(Sum('qty_in'))['qty_in__sum'] or Decimal('0')
        total_out = qs.aggregate(Sum('qty_out'))['qty_out__sum'] or Decimal('0')

        # Pagination
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('pageSize') or request.query_params.get('page_size', 50))
        total_records = qs.count()
        total_pages = (total_records + page_size - 1) // page_size
        
        qs = qs[(page - 1) * page_size : page * page_size]

        data = []
        for entry in qs:
            data.append({
                'id': str(entry.id),
                'txn_date': entry.txn_date.isoformat(),
                'txn_type': entry.txn_type,
                'voucher_type': entry.voucher_type,
                'voucher_number': entry.voucher_number,
                'party_name': entry.party_name,
                'product_name': entry.product.name if entry.product else '',
                'batch_number': entry.batch_number,
                'expiry_date': entry.expiry_date.isoformat() if entry.expiry_date else None,
                'qty_in': float(entry.qty_in),
                'qty_out': float(entry.qty_out),
                'rate': float(entry.rate),
                'running_qty': float(entry.running_qty),
                'running_value': float(entry.running_value),
                'created_at': entry.created_at.isoformat(),
            })

        return Response({
            'data': data,
            'summary': {
                'total_in': float(total_in),
                'total_out': float(total_out),
            },
            'pagination': {
                'page': page,
                'pageSize': page_size,
                'totalPages': total_pages,
                'totalRecords': total_records
            }
        })
