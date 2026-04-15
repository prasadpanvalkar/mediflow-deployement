import logging
from decimal import Decimal
from datetime import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.core.permissions import IsManagerOrAbove
from rest_framework import status
from django.db.models import Q

from apps.purchases.models import Distributor, PurchaseInvoice
from apps.billing.models import LedgerEntry, PaymentEntry, PaymentAllocation
from apps.accounts.models import Ledger, JournalLine
from apps.core.models import Outlet
from apps.purchases.services import atomic_purchase_save, PurchaseServiceError, bill_by_bill_payment_allocate, OverpaymentError

logger = logging.getLogger(__name__)


class DistributorListView(APIView):
    """
    GET /api/v1/purchases/distributors/?outletId=xxx

    List all active distributors for an outlet.
    Returns list of distributor profiles with credit terms.
    """

    permission_classes = [IsManagerOrAbove]

    def get(self, request, *args, **kwargs):
        """
        Get list of distributors.

        Query parameters:
        - outletId: Outlet UUID to filter distributors

        Returns:
        [
            {
                "id": "...",
                "name": "...",
                "gstin": "...",
                "phone": "...",
                "email": "...",
                "address": "...",
                "city": "...",
                "state": "...",
                "creditDays": 30,
                "openingBalance": 0,
                "balanceType": "CR",
                "isActive": true,
                "createdAt": "2026-03-17T..."
            }
        ]
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

        logger.info(f"Fetching distributors for outlet: {outlet.name}")

        # Get all active distributors for this outlet
        distributors = Distributor.objects.filter(
            outlet=outlet,
            is_active=True
        ).order_by('name')

        logger.info(f"Found {distributors.count()} active distributors")

        # Pre-fetch linked ledger balances in one query
        ledger_map = {
            ledger.linked_distributor_id: ledger
            for ledger in Ledger.objects.filter(
                outlet=outlet,
                linked_distributor__in=distributors,
            )
        }

        # Serialize distributors
        results = []
        for distributor in distributors:
            linked_ledger = ledger_map.get(distributor.id)
            current_balance = float(linked_ledger.current_balance) if linked_ledger else float(distributor.opening_balance or 0)
            result = {
                'id': str(distributor.id),
                'name': distributor.name,
                'gstin': distributor.gstin,
                'drugLicenseNo': distributor.drug_license_no,
                'foodLicenseNo': distributor.food_license_no,
                'phone': distributor.phone,
                'email': distributor.email,
                'address': distributor.address,
                'city': distributor.city,
                'state': distributor.state,
                'creditDays': distributor.credit_days,
                'openingBalance': float(distributor.opening_balance) if distributor.opening_balance else 0,
                'currentBalance': current_balance,
                'balanceType': distributor.balance_type,
                'isActive': distributor.is_active,
                'createdAt': distributor.created_at.isoformat(),
            }
            results.append(result)

        return Response(results, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        """Create a new distributor."""
        outlet_id = request.data.get('outletId')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
            
        distributor = Distributor.objects.create(
            outlet=outlet,
            name=request.data.get('name'),
            gstin=request.data.get('gstin'),
            drug_license_no=request.data.get('drugLicenseNo'),
            food_license_no=request.data.get('foodLicenseNo'),
            phone=request.data.get('phone', ''),
            email=request.data.get('email'),
            address=request.data.get('address', ''),
            city=request.data.get('city', ''),
            state=request.data.get('state', ''),
            credit_days=request.data.get('creditDays', 0),
            opening_balance=Decimal(str(request.data.get('openingBalance', 0))),
            balance_type=request.data.get('balanceType', 'CR'),
            is_active=True,
        )
        
        logger.info(f"Created distributor {distributor.id} ({distributor.name})")
        
        result = {
            'id': str(distributor.id),
            'name': distributor.name,
            'gstin': distributor.gstin,
            'drugLicenseNo': distributor.drug_license_no,
            'foodLicenseNo': distributor.food_license_no,
            'phone': distributor.phone,
            'email': distributor.email,
            'address': distributor.address,
            'city': distributor.city,
            'state': distributor.state,
            'creditDays': distributor.credit_days,
            'openingBalance': float(distributor.opening_balance) if distributor.opening_balance else 0,
            'balanceType': distributor.balance_type,
            'isActive': distributor.is_active,
            'createdAt': distributor.created_at.isoformat(),
        }

        return Response(result, status=status.HTTP_201_CREATED)

class DistributorDetailView(APIView):
    """
    GET /api/v1/purchases/distributors/{id}/?outletId=xxx

    Get distributor details by ID.
    """

    permission_classes = [IsManagerOrAbove]

    def get(self, request, distributor_id, *args, **kwargs):
        """Get distributor details."""
        outlet_id = request.query_params.get('outletId')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            distributor = Distributor.objects.get(id=distributor_id, outlet=outlet)
        except Distributor.DoesNotExist:
            return Response(
                {'detail': f'Distributor {distributor_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        result = {
            'id': str(distributor.id),
            'name': distributor.name,
            'gstin': distributor.gstin,
            'drugLicenseNo': distributor.drug_license_no,
            'foodLicenseNo': distributor.food_license_no,
            'phone': distributor.phone,
            'email': distributor.email,
            'address': distributor.address,
            'city': distributor.city,
            'state': distributor.state,
            'creditDays': distributor.credit_days,
            'openingBalance': float(distributor.opening_balance) if distributor.opening_balance else 0,
            'balanceType': distributor.balance_type,
            'isActive': distributor.is_active,
            'createdAt': distributor.created_at.isoformat(),
        }

        return Response(result, status=status.HTTP_200_OK)

    def put(self, request, distributor_id, *args, **kwargs):
        """Update distributor details."""
        outlet_id = request.data.get('outletId')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            distributor = Distributor.objects.get(id=distributor_id, outlet=outlet)
        except Distributor.DoesNotExist:
            return Response(
                {'detail': f'Distributor {distributor_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Update allowed fields
        allowed_fields = [
            'name', 'gstin', 'drug_license_no', 'food_license_no', 'phone', 'email',
            'address', 'city', 'state', 'credit_days', 'opening_balance', 'balance_type', 'is_active'
        ]

        for field in allowed_fields:
            camel_field = {
                'drug_license_no': 'drugLicenseNo',
                'food_license_no': 'foodLicenseNo',
                'credit_days': 'creditDays',
                'opening_balance': 'openingBalance',
                'balance_type': 'balanceType',
                'is_active': 'isActive'
            }.get(field, field)

            if camel_field in request.data:
                val = request.data[camel_field]
                if field == 'opening_balance':
                    val = Decimal(str(val))
                setattr(distributor, field, val)

        distributor.save()
        logger.info(f"Updated distributor {distributor_id}")

        result = {
            'id': str(distributor.id),
            'name': distributor.name,
            'gstin': distributor.gstin,
            'drugLicenseNo': distributor.drug_license_no,
            'foodLicenseNo': distributor.food_license_no,
            'phone': distributor.phone,
            'email': distributor.email,
            'address': distributor.address,
            'city': distributor.city,
            'state': distributor.state,
            'creditDays': distributor.credit_days,
            'openingBalance': float(distributor.opening_balance) if distributor.opening_balance else 0,
            'balanceType': distributor.balance_type,
            'isActive': distributor.is_active,
            'createdAt': distributor.created_at.isoformat(),
        }

        return Response(result, status=status.HTTP_200_OK)


class DistributorLedgerView(APIView):
    """
    GET /api/v1/purchases/distributors/{id}/ledger/?outletId=xxx

    Get distributor ledger entries with running balance.
    Returns list of all debit/credit entries for the distributor.
    """

    permission_classes = [IsManagerOrAbove]

    def get(self, request, distributor_id, *args, **kwargs):
        """
        Get distributor ledger.

        Query parameters:
        - outletId: Outlet UUID to filter ledger

        Returns:
        {
            "distributor": {...},
            "ledger": [
                {
                    "id": "...",
                    "date": "2026-03-17",
                    "entryType": "purchase",
                    "referenceNo": "PU-001",
                    "description": "Purchase invoice",
                    "debit": 5000.0,
                    "credit": 0,
                    "runningBalance": 5000.0,
                    "createdAt": "2026-03-17T..."
                }
            ],
            "summary": {
                "totalDebit": 50000.0,
                "totalCredit": 10000.0,
                "runningBalance": 40000.0
            }
        }
        """

        outlet_id = request.query_params.get('outletId')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            distributor = Distributor.objects.get(id=distributor_id, outlet=outlet)
        except Distributor.DoesNotExist:
            return Response(
                {'detail': f'Distributor {distributor_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        logger.info(f"Fetching ledger for distributor: {distributor.name}")

        # Find the accounts.Ledger linked to this distributor (created by partyLedgerId flow)
        linked_ledger = Ledger.objects.filter(
            outlet=outlet,
            linked_distributor=distributor
        ).first()

        entries = []
        opening_balance = 0.0
        closing_balance = 0.0

        if linked_ledger:
            opening_balance = float(linked_ledger.opening_balance)
            closing_balance = float(linked_ledger.current_balance)

            SOURCE_TYPE_MAP = {
                'PURCHASE': 'purchase',
                'VOUCHER': 'payment',
                'SALE': 'sale',
                'RETURN': 'debit_note',
                'CREDIT_PAYMENT': 'payment',
            }

            lines = (
                JournalLine.objects
                .filter(ledger=linked_ledger)
                .select_related('journal_entry')
                .order_by('journal_entry__date', 'journal_entry__created_at')
            )

            running = opening_balance
            for line in lines:
                je = line.journal_entry
                debit = float(line.debit_amount)
                credit = float(line.credit_amount)
                running = running + credit - debit  # creditor: credit ↑ balance, debit ↓ balance
                entries.append({
                    'id': str(line.id),
                    'date': str(je.date),
                    'entryType': SOURCE_TYPE_MAP.get(je.source_type, 'purchase'),
                    'referenceNo': '',
                    'description': je.narration,
                    'debit': debit,
                    'credit': credit,
                    'balance': round(running, 2),
                })

        distributor_data = {
            'id': str(distributor.id),
            'name': distributor.name,
            'gstin': distributor.gstin,
            'phone': distributor.phone,
            'email': distributor.email,
            'address': distributor.address,
            'city': distributor.city,
            'state': distributor.state,
            'creditDays': distributor.credit_days,
            'openingBalance': float(distributor.opening_balance) if distributor.opening_balance else 0,
            'balanceType': distributor.balance_type,
            'isActive': distributor.is_active,
        }

        result = {
            'distributor': distributor_data,
            'entries': entries,
            'openingBalance': opening_balance,
            'closingBalance': closing_balance,
        }

        return Response(result, status=status.HTTP_200_OK)


class PurchaseCreateView(APIView):
    """
    POST /api/v1/purchases/

    Create a new purchase invoice with items, batch creation/merging, and ledger entry.
    All operations are wrapped in transaction.atomic() — full rollback on any failure.

    Request body: CreatePurchasePayload
    Response: PurchaseInvoiceFull (201 Created) or error (400/404/500)
    """

    permission_classes = [IsManagerOrAbove]

    def post(self, request, *args, **kwargs):
        """
        Create a new purchase invoice.

        Request body:
        {
            "outletId": "...",
            "distributorId": "...",
            "purchaseType": "cash" | "credit",
            "invoiceNo": "...",
            "invoiceDate": "2026-03-17",
            "dueDate": "2026-04-16",
            "purchaseOrderRef": "...",
            "godown": "main",
            "freight": 0,
            "notes": "...",
            "subtotal": 10000,
            "discountAmount": 0,
            "taxableAmount": 10000,
            "gstAmount": 1800,
            "cessAmount": 0,
            "roundOff": 0,
            "grandTotal": 11800,
            "items": [
                {
                    "masterProductId": "...",
                    "customProductName": null,
                    "isCustomProduct": false,
                    "hsnCode": "...",
                    "batchNo": "...",
                    "expiryDate": "2026-12-31",
                    "pkg": 10,
                    "qty": 10,
                    "actualQty": 100,
                    "freeQty": 0,
                    "purchaseRate": 100,
                    "discountPct": 0,
                    "cashDiscountPct": 0,
                    "gstRate": 18,
                    "cess": 0,
                    "mrp": 150,
                    "ptr": 125,
                    "pts": 110,
                    "saleRate": 140,
                    "taxableAmount": 1000,
                    "gstAmount": 180,
                    "cessAmount": 0,
                    "totalAmount": 1180
                }
            ]
        }

        Returns:
        {
            "id": "...",
            "outletId": "...",
            "distributorId": "...",
            "distributor": {...},
            "invoiceNo": "...",
            "invoiceDate": "2026-03-17",
            "dueDate": "2026-04-16",
            "purchaseType": "credit",
            "purchaseOrderRef": "...",
            "godown": "main",
            "subtotal": 10000,
            "discountAmount": 0,
            "taxableAmount": 10000,
            "gstAmount": 1800,
            "cessAmount": 0,
            "freight": 0,
            "roundOff": 0,
            "grandTotal": 11800,
            "amountPaid": 0,
            "outstanding": 11800,
            "items": [...],
            "createdByName": "...",
            "createdAt": "2026-03-17T..."
        }
        """

        try:
            payload = request.data
            outlet_id = payload.get('outletId')
            created_by_id = request.user.id  # From JWT token

            # Validate outlet exists
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                logger.warning(f"Outlet {outlet_id} not found")
                return Response(
                    {'error': {'code': 'OUTLET_NOT_FOUND', 'message': f'Outlet {outlet_id} not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            logger.info(f"Incoming Purchase Payload: {payload}")
            logger.info(f"Creating purchase for outlet {outlet.name}")

            # Call atomic_purchase_save service (wraps entire transaction)
            purchase_invoice = atomic_purchase_save(payload, outlet_id, created_by_id)

            logger.info(f"Created PurchaseInvoice {purchase_invoice.invoice_no}")

            # Serialize response matching PurchaseInvoiceFull shape
            result = self._serialize_purchase_full(purchase_invoice)
            return Response(result, status=status.HTTP_201_CREATED)

        except PurchaseServiceError as e:
            logger.warning(f"Purchase service error: {str(e)}")
            return Response(
                {'error': {'code': 'PURCHASE_ERROR', 'message': str(e)}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Unexpected error creating purchase: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to create purchase'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _serialize_purchase_full(self, purchase_invoice):
        """Serialize PurchaseInvoice to PurchaseInvoiceFull response shape."""
        return {
            'id': str(purchase_invoice.id),
            'outletId': str(purchase_invoice.outlet_id),
            'distributorId': str(purchase_invoice.distributor_id),
            'distributor': {
                'id': str(purchase_invoice.distributor.id),
                'name': purchase_invoice.distributor.name,
                'gstin': purchase_invoice.distributor.gstin,
                'drugLicenseNo': purchase_invoice.distributor.drug_license_no,
                'phone': purchase_invoice.distributor.phone,
                'email': purchase_invoice.distributor.email,
                'address': purchase_invoice.distributor.address,
                'city': purchase_invoice.distributor.city,
                'state': purchase_invoice.distributor.state,
                'creditDays': purchase_invoice.distributor.credit_days,
                'openingBalance': float(purchase_invoice.distributor.opening_balance) if purchase_invoice.distributor.opening_balance else 0,
                'balanceType': purchase_invoice.distributor.balance_type,
                'isActive': purchase_invoice.distributor.is_active,
                'createdAt': purchase_invoice.distributor.created_at.isoformat(),
            },
            'invoiceNo': purchase_invoice.invoice_no,
            'invoiceDate': purchase_invoice.invoice_date.isoformat(),
            'dueDate': purchase_invoice.due_date.isoformat() if purchase_invoice.due_date else None,
            'purchaseType': purchase_invoice.purchase_type,
            'purchaseOrderRef': purchase_invoice.purchase_order_ref,
            'godown': purchase_invoice.godown,
            'subtotal': float(purchase_invoice.subtotal),
            'discountAmount': float(purchase_invoice.discount_amount),
            'taxableAmount': float(purchase_invoice.taxable_amount),
            'gstAmount': float(purchase_invoice.gst_amount),
            'cessAmount': float(purchase_invoice.cess_amount),
            'freight': float(purchase_invoice.freight),
            'roundOff': float(purchase_invoice.round_off),
            'ledgerAdjustment': float(purchase_invoice.ledger_adjustment),
            'ledgerNote': purchase_invoice.ledger_note or '',
            'grandTotal': float(purchase_invoice.grand_total),
            'amountPaid': float(purchase_invoice.amount_paid),
            'outstanding': float(purchase_invoice.outstanding),
            'items': [self._serialize_purchase_item(item) for item in purchase_invoice.items.all()],
            'createdByName': purchase_invoice.created_by.name if purchase_invoice.created_by else 'Unknown',
            'notes': purchase_invoice.notes,
            'createdAt': purchase_invoice.created_at.isoformat(),
        }

    def _serialize_purchase_item(self, item):
        """Serialize PurchaseItem to response shape."""
        return {
            'id': str(item.id),
            'purchaseId': str(item.invoice_id),
            'masterProductId': str(item.master_product_id) if item.master_product_id else None,
            'customProductName': item.custom_product_name,
            'isCustomProduct': item.is_custom_product,
            'hsnCode': item.hsn_code,
            'batchNo': item.batch_no,
            'expiryDate': item.expiry_date.isoformat(),
            'pkg': item.master_product.pack_size if item.master_product and item.master_product.pack_size else (item.pkg or 1),
            'packUnitLabel': item.master_product.pack_unit if item.master_product else '',
            'qty': item.qty,
            'actualQty': item.actual_qty,
            'freeQty': item.free_qty,
            'purchaseRate': float(item.purchase_rate),
            'discountPct': float(item.discount_pct),
            'cashDiscountPct': float(item.cash_discount_pct),
            'gstRate': float(item.gst_rate),
            'cess': float(item.cess),
            'mrp': float(item.mrp),
            'ptr': float(item.ptr),
            'pts': float(item.pts),
            'saleRate': float(item.sale_rate),
            'taxableAmount': float(item.taxable_amount),
            'gstAmount': float(item.gst_amount),
            'cessAmount': float(item.cess_amount),
            'totalAmount': float(item.total_amount),
        }


class PurchaseListView(APIView):
    """
    GET /api/v1/purchases/?outletId=xxx

    List purchase invoices for an outlet with pagination and filtering.
    Ordered newest first (-invoice_date, -created_at).

    Query parameters:
    - outletId: Outlet UUID (required)
    - distributorId: Filter by distributor (optional)
    - startDate: Filter purchases >= startDate (yyyy-MM-dd, optional)
    - endDate: Filter purchases <= endDate (yyyy-MM-dd, optional)
    - page: Page number (default 1)
    - pageSize: Items per page (default 50, max 100)

    Response: PaginatedResponse<PurchaseInvoice>
    """

    permission_classes = [IsManagerOrAbove]

    def get(self, request, *args, **kwargs):
        """
        Get paginated list of purchase invoices.

        Query parameters:
        - outletId: Required
        - distributorId: Optional
        - startDate: Optional (yyyy-MM-dd)
        - endDate: Optional (yyyy-MM-dd)
        - page: Default 1
        - pageSize: Default 50, max 100

        Returns:
        {
            "data": [
                {
                    "id": "...",
                    "outletId": "...",
                    "distributorId": "...",
                    "distributor": {...},
                    "invoiceNo": "...",
                    "invoiceDate": "2026-03-17",
                    "dueDate": "2026-04-16",
                    "subtotal": 10000,
                    "discountAmount": 0,
                    "taxableAmount": 10000,
                    "gstAmount": 1800,
                    "cessAmount": 0,
                    "freight": 0,
                    "roundOff": 0,
                    "grandTotal": 11800,
                    "amountPaid": 0,
                    "outstanding": 11800,
                    "createdAt": "2026-03-17T..."
                }
            ],
            "pagination": {
                "page": 1,
                "pageSize": 50,
                "totalPages": 1,
                "totalRecords": 5
            }
        }
        """

        try:
            outlet_id = request.query_params.get('outletId')

            # Validate outlet
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                logger.warning(f"Outlet {outlet_id} not found")
                return Response(
                    {'error': {'code': 'OUTLET_NOT_FOUND', 'message': f'Outlet {outlet_id} not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            logger.info(f"Fetching purchases for outlet {outlet.name}")

            # Start with all invoices for this outlet
            queryset = PurchaseInvoice.objects.filter(outlet=outlet).select_related('distributor')

            # Filter by distributor if provided
            distributor_id = request.query_params.get('distributorId')
            if distributor_id:
                queryset = queryset.filter(distributor_id=distributor_id)
                logger.info(f"Filtered by distributor {distributor_id}")

            # Filter by date range if provided
            start_date = request.query_params.get('startDate')
            end_date = request.query_params.get('endDate')

            if start_date:
                try:
                    start_dt = datetime.fromisoformat(start_date).date()
                    queryset = queryset.filter(invoice_date__gte=start_dt)
                    logger.info(f"Filtered from {start_date}")
                except (ValueError, TypeError):
                    logger.warning(f"Invalid startDate format: {start_date}")

            if end_date:
                try:
                    end_dt = datetime.fromisoformat(end_date).date()
                    queryset = queryset.filter(invoice_date__lte=end_dt)
                    logger.info(f"Filtered to {end_date}")
                except (ValueError, TypeError):
                    logger.warning(f"Invalid endDate format: {end_date}")

            # Order by newest first
            queryset = queryset.order_by('-invoice_date', '-created_at')

            # Pagination
            page = int(request.query_params.get('page', 1))
            page_size = min(int(request.query_params.get('pageSize', 50)), 100)

            total_records = queryset.count()
            total_pages = (total_records + page_size - 1) // page_size
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size

            invoices = queryset[start_idx:end_idx]

            logger.info(f"Returning {len(invoices)} invoices (page {page}/{total_pages}, total {total_records})")

            # Serialize invoices
            data = [self._serialize_purchase(inv) for inv in invoices]

            result = {
                'data': data,
                'pagination': {
                    'page': page,
                    'pageSize': page_size,
                    'totalPages': total_pages,
                    'totalRecords': total_records,
                }
            }

            return Response(result, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error fetching purchase list: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to fetch purchase list'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _serialize_purchase(self, purchase_invoice):
        """Serialize PurchaseInvoice (without items) to response shape."""
        return {
            'id': str(purchase_invoice.id),
            'outletId': str(purchase_invoice.outlet_id),
            'distributorId': str(purchase_invoice.distributor_id),
            'distributor': {
                'id': str(purchase_invoice.distributor.id),
                'name': purchase_invoice.distributor.name,
                'gstin': purchase_invoice.distributor.gstin,
                'phone': purchase_invoice.distributor.phone,
                'email': purchase_invoice.distributor.email,
                'address': purchase_invoice.distributor.address,
                'city': purchase_invoice.distributor.city,
                'state': purchase_invoice.distributor.state,
                'creditDays': purchase_invoice.distributor.credit_days,
                'openingBalance': float(purchase_invoice.distributor.opening_balance) if purchase_invoice.distributor.opening_balance else 0,
                'balanceType': purchase_invoice.distributor.balance_type,
                'isActive': purchase_invoice.distributor.is_active,
                'createdAt': purchase_invoice.distributor.created_at.isoformat(),
            },
            'invoiceNo': purchase_invoice.invoice_no,
            'invoiceDate': purchase_invoice.invoice_date.isoformat(),
            'dueDate': purchase_invoice.due_date.isoformat() if purchase_invoice.due_date else None,
            'subtotal': float(purchase_invoice.subtotal),
            'discountAmount': float(purchase_invoice.discount_amount),
            'taxableAmount': float(purchase_invoice.taxable_amount),
            'gstAmount': float(purchase_invoice.gst_amount),
            'cessAmount': float(purchase_invoice.cess_amount),
            'freight': float(purchase_invoice.freight),
            'roundOff': float(purchase_invoice.round_off),
            'ledgerAdjustment': float(purchase_invoice.ledger_adjustment),
            'ledgerNote': purchase_invoice.ledger_note or '',
            'grandTotal': float(purchase_invoice.grand_total),
            'amountPaid': float(purchase_invoice.amount_paid),
            'outstanding': float(purchase_invoice.outstanding),
            'createdAt': purchase_invoice.created_at.isoformat(),
        }


class DistributorPaymentView(APIView):
    """
    POST /api/v1/purchases/payments/

    Record a payment to a distributor with bill-by-bill allocation.
    All operations wrapped in transaction.atomic() — full rollback on any failure.

    Request body: CreatePaymentPayload
    Response: PaymentEntry (201 Created) or error (400/404/500)
    """

    permission_classes = [IsManagerOrAbove]

    def post(self, request, *args, **kwargs):
        try:
            payload = request.data
            outlet_id = request.query_params.get('outletId') or payload.get('outletId')
            created_by_id = request.user.id  # From JWT token

            # Validate outlet exists
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                logger.warning(f"Outlet {outlet_id} not found")
                return Response(
                    {'error': {'code': 'OUTLET_NOT_FOUND', 'message': f'Outlet {outlet_id} not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            logger.info(f"Recording payment for outlet {outlet.name}")

            # Call bill_by_bill_payment_allocate service (wraps entire transaction)
            payment_entry = bill_by_bill_payment_allocate(payload, outlet_id, created_by_id)

            logger.info(f"Created PaymentEntry {payment_entry.id}")

            # Serialize response matching PaymentEntry shape
            result = self._serialize_payment_entry(payment_entry)
            return Response(result, status=status.HTTP_201_CREATED)

        except OverpaymentError as e:
            logger.warning(f"Overpayment error: {str(e)}")
            return Response(
                {'error': {'code': 'OVERPAYMENT_ERROR', 'message': str(e)}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except PurchaseServiceError as e:
            logger.warning(f"Purchase service error: {str(e)}")
            return Response(
                {'error': {'code': 'PAYMENT_ERROR', 'message': str(e)}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Unexpected error recording payment: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to record payment'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _serialize_payment_entry(self, payment_entry):
        """Serialize PaymentEntry to response shape."""
        return {
            'id': str(payment_entry.id),
            'outletId': str(payment_entry.outlet_id),
            'distributorId': str(payment_entry.distributor_id),
            'distributor': {
                'id': str(payment_entry.distributor.id),
                'name': payment_entry.distributor.name,
                'gstin': payment_entry.distributor.gstin,
                'drugLicenseNo': payment_entry.distributor.drug_license_no,
                'phone': payment_entry.distributor.phone,
                'email': payment_entry.distributor.email,
                'address': payment_entry.distributor.address,
                'city': payment_entry.distributor.city,
                'state': payment_entry.distributor.state,
                'creditDays': payment_entry.distributor.credit_days,
                'openingBalance': float(payment_entry.distributor.opening_balance) if payment_entry.distributor.opening_balance else 0,
                'balanceType': payment_entry.distributor.balance_type,
                'isActive': payment_entry.distributor.is_active,
                'createdAt': payment_entry.distributor.created_at.isoformat(),
            },
            'date': payment_entry.date.isoformat(),
            'totalAmount': float(payment_entry.total_amount),
            'paymentMode': payment_entry.payment_mode,
            'referenceNo': payment_entry.reference_no,
            'notes': payment_entry.notes,
            'allocations': [self._serialize_allocation(alloc) for alloc in payment_entry.allocations.all()],
            'createdBy': payment_entry.created_by.id if payment_entry.created_by else None,
            'createdAt': payment_entry.created_at.isoformat(),
        }

    def _serialize_allocation(self, allocation):
        """Serialize PaymentAllocation to response shape."""
        return {
            'purchaseInvoiceId': str(allocation.invoice_id),
            'invoiceNo': allocation.invoice_no,
            'invoiceDate': allocation.invoice_date.isoformat(),
            'invoiceTotal': float(allocation.invoice_total),
            'currentOutstanding': float(allocation.current_outstanding),
            'allocatedAmount': float(allocation.allocated_amount),
        }

class PurchaseDetailView(APIView):
    """
    GET /api/v1/purchases/{id}/
    
    Get details of a specific purchase invoice, including its items.
    """
    
    permission_classes = [IsManagerOrAbove]

    def get(self, request, purchase_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
            
        try:
            # Prefetch distributor for full response shape
            invoice = PurchaseInvoice.objects.select_related('distributor', 'created_by').prefetch_related('items', 'items__master_product').get(id=purchase_id, outlet=outlet)
        except PurchaseInvoice.DoesNotExist:
            return Response(
                {'detail': f'Purchase invoice {purchase_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
            
        result = {
            'id': str(invoice.id),
            'outletId': str(invoice.outlet_id),
            'distributorId': str(invoice.distributor_id),
            'distributor': {
                'id': str(invoice.distributor.id),
                'name': invoice.distributor.name,
                'gstin': invoice.distributor.gstin,
                'drugLicenseNo': invoice.distributor.drug_license_no,
                'phone': invoice.distributor.phone,
                'email': invoice.distributor.email,
                'address': invoice.distributor.address,
                'city': invoice.distributor.city,
                'state': invoice.distributor.state,
                'creditDays': invoice.distributor.credit_days,
                'openingBalance': float(invoice.distributor.opening_balance) if invoice.distributor.opening_balance else 0,
                'balanceType': invoice.distributor.balance_type,
                'isActive': invoice.distributor.is_active,
                'createdAt': invoice.distributor.created_at.isoformat(),
            },
            'invoiceNo': invoice.invoice_no,
            'invoiceDate': invoice.invoice_date.isoformat(),
            'dueDate': invoice.due_date.isoformat() if invoice.due_date else None,
            'purchaseType': invoice.purchase_type,
            'purchaseOrderRef': invoice.purchase_order_ref,
            'godown': invoice.godown,
            'subtotal': float(invoice.subtotal),
            'discountAmount': float(invoice.discount_amount),
            'taxableAmount': float(invoice.taxable_amount),
            'gstAmount': float(invoice.gst_amount),
            'cessAmount': float(invoice.cess_amount),
            'freight': float(invoice.freight),
            'roundOff': float(invoice.round_off),
            'ledgerAdjustment': float(invoice.ledger_adjustment),
            'ledgerNote': invoice.ledger_note or '',
            'grandTotal': float(invoice.grand_total),
            'amountPaid': float(invoice.amount_paid),
            'outstanding': float(invoice.outstanding),
            'items': [
                {
                    'id': str(item.id),
                    'purchaseId': str(item.invoice_id),
                    'masterProductId': str(item.master_product_id) if item.master_product_id else None,
                    'product': {
                        'id': str(item.master_product.id),
                        'name': item.master_product.name,
                    } if item.master_product else None,
                    'customProductName': item.custom_product_name,
                    'isCustomProduct': item.is_custom_product,
                    'hsnCode': item.hsn_code,
                    'batchNo': item.batch_no,
                    'expiryDate': item.expiry_date.isoformat(),
                    'pkg': item.pkg,
                    'qty': item.qty,
                    'actualQty': item.actual_qty,
                    'freeQty': item.free_qty,
                    'purchaseRate': float(item.purchase_rate),
                    'discountPct': float(item.discount_pct),
                    'cashDiscountPct': float(item.cash_discount_pct),
                    'gstRate': float(item.gst_rate),
                    'cess': float(item.cess),
                    'mrp': float(item.mrp),
                    'ptr': float(item.ptr),
                    'pts': float(item.pts),
                    'saleRate': float(item.sale_rate),
                    'taxableAmount': float(item.taxable_amount),
                    'gstAmount': float(item.gst_amount),
                    'cessAmount': float(item.cess_amount),
                    'totalAmount': float(item.total_amount),
                } for item in invoice.items.all()
            ],
            'createdByName': invoice.created_by.name if invoice.created_by else 'Unknown',
            'notes': invoice.notes,
            'createdAt': invoice.created_at.isoformat(),
        }
        
        return Response(result, status=status.HTTP_200_OK)


class PaymentListView(APIView):
    """
    GET /api/v1/purchases/payments/?distributorId=&from=&to=
    Lists PaymentEntry records for an outlet with optional filters.
    """
    permission_classes = [IsManagerOrAbove]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = PaymentEntry.objects.filter(outlet=outlet)

        distributor_id = request.query_params.get('distributorId')
        if distributor_id:
            qs = qs.filter(distributor_id=distributor_id)

        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        if from_str:
            try:
                qs = qs.filter(date__gte=datetime.fromisoformat(from_str).date())
            except ValueError:
                pass
        if to_str:
            try:
                qs = qs.filter(date__lte=datetime.fromisoformat(to_str).date())
            except ValueError:
                pass

        data = []
        for p in qs.select_related('distributor').order_by('-date', '-created_at'):
            data.append({
                'id': str(p.id),
                'distributorId': str(p.distributor_id),
                'distributorName': p.distributor.name,
                'date': p.date.isoformat(),
                'totalAmount': float(p.total_amount),
                'paymentMode': p.payment_mode,
                'referenceNo': p.reference_no,
                'notes': p.notes,
                'createdAt': p.created_at.isoformat(),
            })

        return Response({'success': True, 'data': data, 'meta': {'total': len(data)}}, status=status.HTTP_200_OK)


class DistributorOutstandingView(APIView):
    """
    GET /api/v1/purchases/distributors/{pk}/outstanding/
    Returns all unpaid PurchaseInvoices for a distributor.
    """
    permission_classes = [IsManagerOrAbove]

    def get(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            distributor = Distributor.objects.get(id=pk, outlet=outlet)
        except Distributor.DoesNotExist:
            return Response({'detail': 'Distributor not found'}, status=status.HTTP_404_NOT_FOUND)

        today = datetime.now().date()
        invoices = PurchaseInvoice.objects.filter(
            outlet=outlet, distributor=distributor, outstanding__gt=0
        ).order_by('due_date')

        data = []
        for inv in invoices:
            days_past = (today - inv.due_date).days if inv.due_date and inv.due_date < today else 0
            data.append({
                'id': str(inv.id),
                'invoiceNo': inv.invoice_no,
                'invoiceDate': inv.invoice_date.isoformat(),
                'dueDate': inv.due_date.isoformat() if inv.due_date else None,
                'grandTotal': float(inv.grand_total),
                'amountPaid': float(inv.amount_paid),
                'outstanding': float(inv.outstanding),
                'isOverdue': inv.due_date is not None and inv.due_date < today,
                'daysPastDue': max(0, days_past),
            })

        return Response({'success': True, 'data': data, 'meta': {'total': len(data)}}, status=status.HTTP_200_OK)


class PurchaseInvoiceSearchView(APIView):
    """GET /api/v1/purchases/invoices/search/?outletId=xxx&q=INV-001"""
    permission_classes = [IsManagerOrAbove]

    def get(self, request):
        outlet_id = request.query_params.get('outletId')
        q = request.query_params.get('q', '').strip()
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=404)

        qs = PurchaseInvoice.objects.filter(outlet=outlet).select_related('distributor').prefetch_related('items')
        if q:
            qs = qs.filter(
                Q(invoice_no__icontains=q) | Q(distributor__name__icontains=q)
            )
        qs = qs.order_by('-invoice_date')[:20]

        results = []
        for inv in qs:
            items = []
            for item in inv.items.all():
                product_name = item.master_product.name if item.master_product else (item.custom_product_name or 'Unknown')
                items.append({
                    'productName': product_name,
                    'batchId': str(item.batch_id),
                    'batchNo': item.batch_no,
                    'expiry': str(item.expiry_date),
                    'qty': item.qty,
                    'rate': float(item.purchase_rate),
                    'gstRate': float(item.gst_rate),
                })
            results.append({
                'id': str(inv.id),
                'invoiceNo': inv.invoice_no,
                'date': str(inv.invoice_date),
                'distributorName': inv.distributor.name,
                'distributorId': str(inv.distributor.id),
                'grandTotal': float(inv.grand_total),
                'items': items,
            })
        return Response({'data': results})
