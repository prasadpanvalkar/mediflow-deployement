import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.db.models import Q, Sum
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
from decimal import Decimal

from apps.inventory.models import MasterProduct, Batch
from apps.core.models import Outlet
from apps.accounts.models import Staff

logger = logging.getLogger(__name__)


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


class ProductDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        try:
            product = MasterProduct.objects.get(id=pk)
            return Response(serialize_product(product), status=status.HTTP_200_OK)
        except MasterProduct.DoesNotExist:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)


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

        batches = Batch.objects.filter(product=product, outlet=outlet, is_active=True).order_by('expiry_date')
        return Response([serialize_batch(b) for b in batches], status=status.HTTP_200_OK)


class InventoryExportCSVView(APIView):
    permission_classes = [IsAuthenticated]

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
            return Response([], status=status.HTTP_200_OK)

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
            today = timezone.now().date()
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
                'outletProductId': str(product.id),
                'totalStock': total_stock,
                'nearestExpiry': nearest_expiry,
                'isLowStock': is_low_stock,
                'batches': batch_list,
            }

            results.append(result)

        logger.info(f"Returning {len(results)} products with stock data")
        return Response(results, status=status.HTTP_200_OK)


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

        logger.info(f"Found {products.count()} products matching filters")

        # Build ProductSearchResult for each product with batches
        today = timezone.now().date()
        results = []

        for product in products:
            # Get non-expired, active batches for this product at this outlet, ordered by expiry (FEFO)
            batches = Batch.objects.filter(
                product=product,
                outlet=outlet,
                is_active=True,
                expiry_date__gt=today
            ).order_by('expiry_date', '-created_at')

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

        today = timezone.now().date()
        low_stock = []
        expiring_in_30_days = []
        out_of_stock = []

        # Get all products
        products = MasterProduct.objects.all()

        for product in products:
            # Get batches for this product at this outlet
            batches = Batch.objects.filter(
                product=product,
                outlet=outlet,
                is_active=True
            ).order_by('expiry_date')

            # Aggregate total stock
            total_stock = batches.aggregate(total=Sum('qty_strips'))['total'] or 0

            # Get nearest expiry date
            nearest_expiry = (
                batches.first().expiry_date.isoformat()
                if batches.exists()
                else None
            )

            # Check for out of stock
            if total_stock == 0:
                out_of_stock.append({
                    'productId': str(product.id),
                    'productName': product.name,
                })
            # Check for low stock (0 < total_stock < 10)
            elif total_stock < 10:
                low_stock.append({
                    'productId': str(product.id),
                    'productName': product.name,
                    'totalStock': total_stock,
                    'reorderQty': 50,  # Default reorder qty
                    'nearestExpiry': nearest_expiry,
                })

            # Check for batches expiring in 30 days
            cutoff_date = today + timedelta(days=30)
            expiring_batches = batches.filter(
                expiry_date__lte=cutoff_date,
                expiry_date__gte=today,
                qty_strips__gt=0
            )

            for batch in expiring_batches:
                days_remaining = (batch.expiry_date - today).days
                expiring_in_30_days.append({
                    'productId': str(product.id),
                    'productName': product.name,
                    'batchNo': batch.batch_no,
                    'expiryDate': batch.expiry_date.isoformat(),
                    'daysRemaining': days_remaining,
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

    permission_classes = [IsAuthenticated]

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
