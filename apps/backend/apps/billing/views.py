import logging
from django.db import transaction
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from decimal import Decimal
from datetime import datetime

from apps.billing.models import SaleInvoice, SaleItem, ScheduleHRegister, CreditTransaction, CreditAccount
from apps.billing.services import (
    fefo_batch_select,
    schedule_h_validate,
    generate_invoice_number,
    InsufficientStockError,
    ScheduleHViolationError,
)
from apps.inventory.models import Batch, MasterProduct
from apps.accounts.models import Staff, Customer
from apps.core.models import Outlet

logger = logging.getLogger(__name__)


class SaleCreateView(APIView):
    """
    POST /api/v1/sales/

    Create a new sale invoice with atomic stock deduction and payment recording.
    Validates Schedule H requirements, allocates batches using FEFO, and records
    customer credit transactions if applicable.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Create a sale invoice.

        Request body:
        {
            "outletId": "...",
            "customerId": "...",  // optional
            "items": [
                {
                    "batchId": "...",
                    "productId": "...",
                    "qtyStrips": 5,
                    "qtyLoose": 0,
                    "rate": 40.0,
                    "discountPct": 0,
                    "gstRate": 5,
                    "taxableAmount": 200,
                    "gstAmount": 10,
                    "totalAmount": 210
                }
            ],
            "subtotal": 2100,
            "discountAmount": 0,
            "taxableAmount": 2100,
            "cgstAmount": 105,
            "sgstAmount": 105,
            "igstAmount": 0,
            "cgst": 5,
            "sgst": 5,
            "igst": 0,
            "roundOff": 0,
            "grandTotal": 2310,
            "paymentMode": "split",
            "cashPaid": 1000,
            "upiPaid": 1310,
            "cardPaid": 0,
            "creditGiven": 0,
            "scheduleHData": {
                "patientName": "...",
                "patientAge": 45,
                "patientAddress": "...",
                "doctorName": "...",
                "doctorRegNo": "...",
                "prescriptionNo": "..."
            }
        }

        Response:
        {
            "id": "...",
            "outletId": "...",
            "invoiceNo": "INV-2026-000001",
            "invoiceDate": "2026-03-17T...",
            "customerId": "...",
            "subtotal": 2100,
            "discountAmount": 0,
            "taxableAmount": 2100,
            "cgstAmount": 105,
            "sgstAmount": 105,
            "igstAmount": 0,
            "cgst": 5,
            "sgst": 5,
            "igst": 0,
            "roundOff": 0,
            "grandTotal": 2310,
            "paymentMode": "split",
            "cashPaid": 1000,
            "upiPaid": 1310,
            "cardPaid": 0,
            "creditGiven": 0,
            "amountPaid": 2310,
            "amountDue": 0,
            "isReturn": false,
            "billedBy": "...",
            "items": [...],
            "createdAt": "2026-03-17T..."
        }
        """

        try:
            outlet_id = request.data.get('outletId')
            customer_id = request.data.get('customerId')
            items_data = request.data.get('items', [])
            schedule_h_data = request.data.get('scheduleHData')

            # Validate outlet exists
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                return Response(
                    {'detail': f'Outlet {outlet_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Validate customer exists if provided
            customer = None
            if customer_id:
                try:
                    customer = Customer.objects.get(id=customer_id, outlet=outlet)
                except Customer.DoesNotExist:
                    return Response(
                        {'detail': f'Customer {customer_id} not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )

            # Get billed_by staff (from request user - should be Staff instance)
            try:
                billed_by = Staff.objects.get(id=request.user.id)
            except (Staff.DoesNotExist, AttributeError):
                billed_by = None

            logger.info(f"Creating sale invoice for outlet {outlet.name}")

            # Entire transaction must be atomic - rollback on any failure
            with transaction.atomic():
                # Step 1: Validate Schedule H requirements BEFORE any stock deduction
                cart_items = []
                for item in items_data:
                    cart_items.append({
                        'scheduleType': item.get('scheduleType', 'OTC'),
                    })

                try:
                    schedule_h_validate(cart_items, schedule_h_data)
                except ScheduleHViolationError as e:
                    return Response(
                        {'detail': str(e)},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Step 2: Generate invoice number atomically
                try:
                    invoice_no = generate_invoice_number(outlet_id)
                except Exception as e:
                    logger.error(f"Failed to generate invoice number: {str(e)}")
                    return Response(
                        {'detail': 'Failed to generate invoice number'},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )

                # Step 3 & 5: Create SaleInvoice and SaleItems with FEFO batch selection and stock deduction
                sale_invoice = SaleInvoice.objects.create(
                    outlet=outlet,
                    invoice_no=invoice_no,
                    invoice_date=timezone.now(),
                    customer=customer,
                    subtotal=Decimal(str(request.data.get('subtotal', 0))),
                    discount_amount=Decimal(str(request.data.get('discountAmount', 0))),
                    taxable_amount=Decimal(str(request.data.get('taxableAmount', 0))),
                    cgst_amount=Decimal(str(request.data.get('cgstAmount', 0))),
                    sgst_amount=Decimal(str(request.data.get('sgstAmount', 0))),
                    igst_amount=Decimal(str(request.data.get('igstAmount', 0))),
                    cgst=Decimal(str(request.data.get('cgst', 0))),
                    sgst=Decimal(str(request.data.get('sgst', 0))),
                    igst=Decimal(str(request.data.get('igst', 0))),
                    round_off=Decimal(str(request.data.get('roundOff', 0))),
                    grand_total=Decimal(str(request.data.get('grandTotal', 0))),
                    payment_mode=request.data.get('paymentMode', 'cash'),
                    cash_paid=Decimal(str(request.data.get('cashPaid', 0))),
                    upi_paid=Decimal(str(request.data.get('upiPaid', 0))),
                    card_paid=Decimal(str(request.data.get('cardPaid', 0))),
                    credit_given=Decimal(str(request.data.get('creditGiven', 0))),
                    amount_paid=Decimal(str(
                        float(request.data.get('cashPaid', 0)) +
                        float(request.data.get('upiPaid', 0)) +
                        float(request.data.get('cardPaid', 0))
                    )),
                    amount_due=Decimal(str(request.data.get('creditGiven', 0))),
                    billed_by=billed_by,
                )

                logger.info(f"Created SaleInvoice {invoice_no}")

                # Create SaleItems and deduct stock
                sale_items = []
                for item_data in items_data:
                    batch_id = item_data.get('batchId')
                    product_id = item_data.get('productId')
                    qty_strips_needed = item_data.get('qtyStrips', 0)

                    try:
                        # Get product details
                        product = MasterProduct.objects.get(id=product_id)

                        # Get batch (either from batchId or use FEFO selection)
                        if batch_id:
                            # Batch specified by frontend (already FEFO-selected on client)
                            try:
                                batch = Batch.objects.get(id=batch_id, outlet=outlet, product=product)
                            except Batch.DoesNotExist:
                                raise InsufficientStockError(f"Batch {batch_id} not found")

                            # Verify sufficient stock in this batch
                            if batch.qty_strips < qty_strips_needed:
                                raise InsufficientStockError(
                                    f"Insufficient stock in batch {batch.batch_no}. "
                                    f"Required: {qty_strips_needed}, Available: {batch.qty_strips}"
                                )

                            batch_allocations = [{'batch': batch, 'qty_to_deduct': qty_strips_needed}]
                        else:
                            # Step 3: Select batches using FEFO
                            batch_allocations = fefo_batch_select(
                                outlet_id=str(outlet_id),
                                product_id=str(product_id),
                                qty_strips_needed=qty_strips_needed
                            )

                        # Step 5: Deduct stock and create SaleItems
                        for batch_alloc in batch_allocations:
                            batch = batch_alloc['batch']
                            qty_to_deduct = batch_alloc['qty_to_deduct']

                            # Deduct stock atomically
                            batch.qty_strips -= qty_to_deduct
                            batch.save()

                            logger.debug(f"Deducted {qty_to_deduct} strips from batch {batch.batch_no}")

                            # Create SaleItem
                            sale_item = SaleItem.objects.create(
                                invoice=sale_invoice,
                                batch=batch,
                                product_name=product.name,
                                composition=product.composition,
                                pack_size=product.pack_size,
                                pack_unit=product.pack_unit,
                                schedule_type=product.schedule_type,
                                batch_no=batch.batch_no,
                                expiry_date=batch.expiry_date,
                                mrp=batch.mrp,
                                sale_rate=batch.sale_rate,
                                rate=Decimal(str(item_data.get('rate', batch.sale_rate))),
                                qty_strips=qty_to_deduct,
                                qty_loose=item_data.get('qtyLoose', 0),
                                sale_mode=item_data.get('saleMode', 'strip'),
                                discount_pct=Decimal(str(item_data.get('discountPct', 0))),
                                gst_rate=Decimal(str(item_data.get('gstRate', 0))),
                                taxable_amount=Decimal(str(item_data.get('taxableAmount', 0))),
                                gst_amount=Decimal(str(item_data.get('gstAmount', 0))),
                                total_amount=Decimal(str(item_data.get('totalAmount', 0))),
                            )

                            sale_items.append(sale_item)

                            # Step 6: Create ScheduleHRegister if Schedule H drug
                            if product.schedule_type in ['H', 'H1', 'X', 'Narcotic']:
                                ScheduleHRegister.objects.create(
                                    sale_item=sale_item,
                                    patient_name=schedule_h_data.get('patientName') if schedule_h_data else None,
                                    patient_age=schedule_h_data.get('patientAge') if schedule_h_data else 0,
                                    patient_address=schedule_h_data.get('patientAddress') if schedule_h_data else '',
                                    doctor_name=schedule_h_data.get('doctorName') if schedule_h_data else None,
                                    doctor_reg_no=schedule_h_data.get('doctorRegNo') if schedule_h_data else '',
                                    prescription_no=schedule_h_data.get('prescriptionNo') if schedule_h_data else '',
                                )
                                logger.debug(f"Created ScheduleHRegister for {product.name}")

                    except MasterProduct.DoesNotExist:
                        logger.error(f"Product {product_id} not found")
                        raise
                    except InsufficientStockError as e:
                        logger.error(f"Insufficient stock: {str(e)}")
                        raise

                # Step 7: Create CreditTransaction if credit_given > 0
                credit_given = Decimal(str(request.data.get('creditGiven', 0)))
                if credit_given > 0 and customer:
                    # Get or create CreditAccount
                    credit_account, _ = CreditAccount.objects.get_or_create(
                        outlet=outlet,
                        customer=customer
                    )

                    # Update outstanding
                    credit_account.total_outstanding += credit_given
                    credit_account.total_borrowed += credit_given
                    credit_account.last_transaction_date = timezone.now()
                    credit_account.save()

                    # Create CreditTransaction (debit entry)
                    CreditTransaction.objects.create(
                        credit_account=credit_account,
                        customer=customer,
                        invoice=sale_invoice,
                        type='debit',
                        amount=credit_given,
                        description=f'Sale on {invoice_no}',
                        balance_after=credit_account.total_outstanding,
                        recorded_by=billed_by,
                        date=timezone.now().date(),
                    )

                    logger.info(f"Created CreditTransaction for customer {customer.name}: ₹{credit_given}")

            # Serialize response
            response_data = {
                'id': str(sale_invoice.id),
                'outletId': str(sale_invoice.outlet.id),
                'invoiceNo': sale_invoice.invoice_no,
                'invoiceDate': sale_invoice.invoice_date.isoformat(),
                'customerId': str(sale_invoice.customer.id) if sale_invoice.customer else None,
                'subtotal': float(sale_invoice.subtotal),
                'discountAmount': float(sale_invoice.discount_amount),
                'taxableAmount': float(sale_invoice.taxable_amount),
                'cgstAmount': float(sale_invoice.cgst_amount),
                'sgstAmount': float(sale_invoice.sgst_amount),
                'igstAmount': float(sale_invoice.igst_amount),
                'cgst': float(sale_invoice.cgst),
                'sgst': float(sale_invoice.sgst),
                'igst': float(sale_invoice.igst),
                'roundOff': float(sale_invoice.round_off),
                'grandTotal': float(sale_invoice.grand_total),
                'paymentMode': sale_invoice.payment_mode,
                'cashPaid': float(sale_invoice.cash_paid),
                'upiPaid': float(sale_invoice.upi_paid),
                'cardPaid': float(sale_invoice.card_paid),
                'creditGiven': float(sale_invoice.credit_given),
                'amountPaid': float(sale_invoice.amount_paid),
                'amountDue': float(sale_invoice.amount_due),
                'isReturn': sale_invoice.is_return,
                'billedBy': str(sale_invoice.billed_by.id) if sale_invoice.billed_by else None,
                'billedByName': sale_invoice.billed_by.name if sale_invoice.billed_by else None,
                'createdAt': sale_invoice.created_at.isoformat(),
            }

            logger.info(f"Sale invoice {invoice_no} created successfully with {len(sale_items)} items")

            return Response(response_data, status=status.HTTP_201_CREATED)

        except InsufficientStockError as e:
            logger.warning(f"Insufficient stock error: {str(e)}")
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error creating sale invoice: {str(e)}")
            return Response(
                {'detail': 'Internal server error'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SaleListView(APIView):
    """
    GET /api/v1/sales/?outletId=xxx

    List all sales invoices for an outlet (paginated, newest first).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        Get paginated list of sales invoices.

        Query parameters:
        - outletId: Outlet UUID to filter invoices (required)
        - page: Page number (default: 1)
        - pageSize: Items per page (default: 50, max: 100)

        Returns:
        {
            "data": [{SaleInvoice}],
            "pagination": {
                "page": 1,
                "pageSize": 50,
                "totalPages": 1,
                "totalRecords": 5
            }
        }
        """

        outlet_id = request.query_params.get('outletId')

        # Validate outlet exists
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        logger.info(f"Fetching sales invoices for outlet: {outlet.name}")

        # Get all invoices for this outlet, ordered by date (newest first)
        invoices = SaleInvoice.objects.filter(outlet=outlet).order_by('-invoice_date', '-created_at')

        # Pagination
        page = int(request.query_params.get('page', 1))
        page_size = min(int(request.query_params.get('pageSize', 50)), 100)

        total_records = invoices.count()
        total_pages = (total_records + page_size - 1) // page_size
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_invoices = invoices[start_idx:end_idx]

        # Serialize invoices
        results = []
        for invoice in paginated_invoices:
            result = {
                'id': str(invoice.id),
                'outletId': str(invoice.outlet.id),
                'invoiceNo': invoice.invoice_no,
                'invoiceDate': invoice.invoice_date.isoformat(),
                'customerId': str(invoice.customer.id) if invoice.customer else None,
                'subtotal': float(invoice.subtotal),
                'discountAmount': float(invoice.discount_amount),
                'taxableAmount': float(invoice.taxable_amount),
                'cgstAmount': float(invoice.cgst_amount),
                'sgstAmount': float(invoice.sgst_amount),
                'igstAmount': float(invoice.igst_amount),
                'cgst': float(invoice.cgst),
                'sgst': float(invoice.sgst),
                'igst': float(invoice.igst),
                'roundOff': float(invoice.round_off),
                'grandTotal': float(invoice.grand_total),
                'paymentMode': invoice.payment_mode,
                'cashPaid': float(invoice.cash_paid),
                'upiPaid': float(invoice.upi_paid),
                'cardPaid': float(invoice.card_paid),
                'creditGiven': float(invoice.credit_given),
                'amountPaid': float(invoice.amount_paid),
                'amountDue': float(invoice.amount_due),
                'isReturn': invoice.is_return,
                'billedBy': str(invoice.billed_by.id) if invoice.billed_by else None,
                'billedByName': invoice.billed_by.name if invoice.billed_by else None,
                'createdAt': invoice.created_at.isoformat(),
            }
            results.append(result)

        logger.info(f"Returning page {page} of {total_pages} ({len(results)} invoices)")

        return Response({
            'data': results,
            'pagination': {
                'page': page,
                'pageSize': page_size,
                'totalPages': total_pages,
                'totalRecords': total_records
            }
        }, status=status.HTTP_200_OK)
