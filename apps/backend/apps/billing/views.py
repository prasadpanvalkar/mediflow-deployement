import logging
from django.db import transaction
from django.utils import timezone
from django.db.models import Sum, Count, Q, F
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.core.permissions import IsManagerOrAbove
from rest_framework import status
from decimal import Decimal, ROUND_FLOOR
from datetime import datetime, timedelta, date

from apps.billing.models import (
    SaleInvoice, SaleItem, ScheduleHRegister, CreditTransaction, CreditAccount, LedgerEntry,
    ReceiptEntry, ReceiptAllocation, ExpenseEntry, SalesReturn, SalesReturnItem,
)
from apps.billing.services import (
    fefo_batch_select,
    schedule_h_validate,
    generate_invoice_number,
    InsufficientStockError,
    ScheduleHViolationError,
)
from apps.inventory.models import Batch, MasterProduct
from apps.accounts.models import Staff, Customer, Ledger
from apps.accounts.journal_service import post_sale_invoice
from apps.core.models import Outlet
from apps.billing.payment_services import (
    create_receipt_payment, create_expense_entry, create_sales_return,
    ReceiptServiceError, ExpenseServiceError, ReturnServiceError,
)

class NextInvoiceNumberView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)
        
        invoice_no = generate_invoice_number(outlet)
        return Response({'invoiceNo': invoice_no}, status=status.HTTP_200_OK)

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

            # Resolve customer — ledger-first (Marg-style) or legacy customerId
            party_ledger_id = request.data.get('partyLedgerId')
            customer = None
            if party_ledger_id:
                try:
                    party_ledger = Ledger.objects.select_related('linked_customer').get(
                        id=party_ledger_id, outlet=outlet
                    )
                except Ledger.DoesNotExist:
                    return Response({'detail': f'Ledger {party_ledger_id} not found'}, status=404)

                if party_ledger.linked_customer:
                    customer = party_ledger.linked_customer
                else:
                    # Safely get or create the Customer to avoid duplicate phone crashes
                    phone_number = party_ledger.phone or '0000000000'
                    customer, created = Customer.objects.get_or_create(
                        outlet=outlet,
                        phone=phone_number,
                        defaults={
                            'name': party_ledger.name or 'Walk-in Customer',
                            'address': party_ledger.address or '',
                            'gstin': party_ledger.gstin or None,
                        }
                    )
                    party_ledger.linked_customer = customer
                    party_ledger.save(update_fields=['linked_customer'])
            elif customer_id:
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

            # H5: Enforce per-staff max_discount before entering the transaction
            if billed_by:
                staff_max_discount = billed_by.max_discount
                for item_data in items_data:
                    item_disc = Decimal(str(item_data.get('discountPct', 0)))
                    if item_disc > staff_max_discount:
                        return Response(
                            {'detail': (
                                f"Discount {item_disc}% exceeds your maximum allowed "
                                f"discount of {staff_max_discount}%"
                            )},
                            status=status.HTTP_400_BAD_REQUEST
                        )

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

                # Step 3 & 5: Create SaleInvoice (GST fields are placeholders — re-derived after items are created)
                client_grand_total = Decimal(str(request.data.get('grandTotal', 0)))
                extra_discount_pct = Decimal(str(request.data.get('extraDiscountPct', 0)))

                # M1: Validate payment amounts sum to grandTotal (tolerance ±₹0.01)
                cash_paid_val = Decimal(str(request.data.get('cashPaid', 0)))
                upi_paid_val = Decimal(str(request.data.get('upiPaid', 0)))
                card_paid_val = Decimal(str(request.data.get('cardPaid', 0)))
                credit_given_val = Decimal(str(request.data.get('creditGiven', 0)))
                payment_sum = cash_paid_val + upi_paid_val + card_paid_val + credit_given_val
                if abs(payment_sum - client_grand_total) > Decimal('0.01'):
                    return Response(
                        {'detail': f'Payment amounts ({payment_sum}) do not match grand total ({client_grand_total})'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                sale_invoice = SaleInvoice.objects.create(
                    outlet=outlet,
                    invoice_no=invoice_no,
                    invoice_date=timezone.now(),
                    customer=customer,
                    subtotal=Decimal(str(request.data.get('subtotal', 0))),
                    discount_amount=Decimal(str(request.data.get('discountAmount', 0))),
                    extra_discount_pct=extra_discount_pct,
                    # Placeholder GST values — overwritten by server re-derivation below
                    taxable_amount=Decimal('0'),
                    cgst_amount=Decimal('0'),
                    sgst_amount=Decimal('0'),
                    igst_amount=Decimal('0'),
                    cgst=Decimal('0'),
                    sgst=Decimal('0'),
                    igst=Decimal('0'),
                    round_off=Decimal('0'),
                    grand_total=client_grand_total,
                    payment_mode=request.data.get('paymentMode', 'cash'),
                    cash_paid=cash_paid_val,
                    upi_paid=upi_paid_val,
                    card_paid=card_paid_val,
                    credit_given=credit_given_val,
                    amount_paid=cash_paid_val + upi_paid_val + card_paid_val,
                    amount_due=max(Decimal('0'), client_grand_total - (cash_paid_val + upi_paid_val + card_paid_val)),
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
                        qty_loose_needed = item_data.get('qtyLoose', 0)

                        if batch_id:
                            try:
                                batch = Batch.objects.get(id=batch_id, outlet=outlet, product=product)
                            except Batch.DoesNotExist:
                                raise InsufficientStockError(f"Batch {batch_id} not found")

                            # --- THE PHARMACY MATH: Check total tablets available ---
                            total_loose_needed = (qty_strips_needed * product.pack_size) + qty_loose_needed
                            total_loose_available = (batch.qty_strips * product.pack_size) + batch.qty_loose
                            
                            if total_loose_available < total_loose_needed:
                                raise InsufficientStockError(
                                    f"Insufficient stock in batch {batch.batch_no}."
                                )

                            # We pass BOTH strips and loose to the allocation
                            batch_allocations = [{
                                'batch': batch, 
                                'qty_to_deduct': qty_strips_needed,
                                'loose_to_deduct': qty_loose_needed
                            }]
                        else:
                            # FEFO logic (assumes strips for now)
                            batch_allocations = fefo_batch_select(
                                outlet_id=str(outlet_id), product_id=str(product_id), qty_strips_needed=qty_strips_needed
                            )

                        # Step 5: Deduct stock and Create SaleItems
                        for batch_alloc in batch_allocations:
                            batch = batch_alloc['batch']
                            qty_to_deduct = batch_alloc.get('qty_to_deduct', 0)
                            loose_to_deduct = batch_alloc.get('loose_to_deduct', 0)

                            # Deduct what the user asked for
                            batch.qty_strips -= qty_to_deduct
                            batch.qty_loose -= loose_to_deduct

                            # MAGIC: If loose tablets go below 0, break open a strip!
                            while batch.qty_loose < 0:
                                batch.qty_strips -= 1
                                batch.qty_loose += product.pack_size

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
                            if product.schedule_type in ['G', 'H', 'H1', 'X', 'C', 'Narcotic']:
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

                # ── C3 fix: Re-derive GST server-side from line items ──
                # Never trust client-sent cgst/sgst/igst values.
                discount_factor = Decimal('1') - extra_discount_pct / Decimal('100')
                server_taxable = Decimal('0')
                server_cgst = Decimal('0')
                server_sgst = Decimal('0')
                server_igst = Decimal('0')
                max_gst_rate = Decimal('0')

                for si in sale_items:
                    # Account for loose tablets by adding fractional strip equivalents
                    pack_size = Decimal(str(si.pack_size)) if si.pack_size else Decimal('1')
                    total_fractional_strips = Decimal(str(si.qty_strips)) + (Decimal(str(si.qty_loose)) / pack_size)
                    raw_total = si.rate * total_fractional_strips
                    
                    # Apply extra discount proportionally before GST extraction
                    discounted_total = (raw_total * discount_factor).quantize(Decimal('0.01'))
                    gst_rate = si.gst_rate

                    if gst_rate > 0:
                        item_taxable = (discounted_total * Decimal('100') / (Decimal('100') + gst_rate)).quantize(Decimal('0.01'))
                        item_gst = discounted_total - item_taxable
                    else:
                        item_taxable = discounted_total
                        item_gst = Decimal('0')

                    server_taxable += item_taxable

                    # H8 fix: floor-based CGST/SGST split — guarantees cgst + sgst = item_gst exactly
                    # TODO: use outlet state vs customer state to determine IGST (C9)
                    item_cgst = (item_gst / 2).quantize(Decimal('0.01'), rounding=ROUND_FLOOR)
                    item_sgst = item_gst - item_cgst
                    server_cgst += item_cgst
                    server_sgst += item_sgst

                    if gst_rate > max_gst_rate:
                        max_gst_rate = gst_rate

                # round_off absorbs any sub-rupee difference
                raw_exact = server_taxable + server_cgst + server_sgst + server_igst
                server_round_off = client_grand_total - raw_exact

                # Sanity check: round_off should never exceed ±₹1
                if abs(server_round_off) > Decimal('1.00'):
                    logger.warning(
                        f"Large round-off ₹{server_round_off} for invoice {invoice_no}: "
                        f"client_grand_total={client_grand_total}, server_exact={raw_exact}"
                    )

                # Update invoice with server-computed GST values
                sale_invoice.taxable_amount = server_taxable
                sale_invoice.cgst_amount = server_cgst
                sale_invoice.sgst_amount = server_sgst
                sale_invoice.igst_amount = server_igst
                sale_invoice.cgst = max_gst_rate / 2 if max_gst_rate > 0 else Decimal('0')
                sale_invoice.sgst = max_gst_rate / 2 if max_gst_rate > 0 else Decimal('0')
                sale_invoice.igst = Decimal('0')
                sale_invoice.round_off = server_round_off
                sale_invoice.save()

                logger.info(
                    f"Server-derived GST for {invoice_no}: "
                    f"taxable={server_taxable}, cgst={server_cgst}, sgst={server_sgst}, "
                    f"round_off={server_round_off}, extra_disc={extra_discount_pct}%"
                )

                # Step 7: Create CreditTransaction if credit_given > 0
                if credit_given_val > 0 and customer:
                    # Get or create CreditAccount
                    credit_account, _ = CreditAccount.objects.get_or_create(
                        outlet=outlet,
                        customer=customer
                    )

                    # Update outstanding
                    credit_account.total_outstanding += credit_given_val
                    credit_account.total_borrowed += credit_given_val
                    credit_account.last_transaction_date = timezone.now()
                    credit_account.save()

                    # Create CreditTransaction (debit entry)
                    CreditTransaction.objects.create(
                        credit_account=credit_account,
                        customer=customer,
                        invoice=sale_invoice,
                        type='debit',
                        amount=credit_given_val,
                        description=f'Sale on {invoice_no}',
                        balance_after=credit_account.total_outstanding,
                        recorded_by=billed_by,
                        date=timezone.now().date(),
                    )

                    logger.info(f"Created CreditTransaction for customer {customer.name}: ₹{credit_given_val}")

                # Step 7b: Update customer's total_purchases
                if customer:
                    customer.total_purchases += sale_invoice.grand_total
                    customer.save(update_fields=['total_purchases'])
                    logger.debug(f"Updated total_purchases for {customer.name}: +{sale_invoice.grand_total}")

                # Post journal entry to general ledger (auto journal posting)
                try:
                    post_sale_invoice(sale_invoice)
                except Exception as e:
                    logger.error(f"Journal posting failed for sale {sale_invoice.id}: {e}")
                    raise  # Re-raise to rollback entire transaction

            # Serialize response
            response_data = {
                'id': str(sale_invoice.id),
                'outletId': str(sale_invoice.outlet.id),
                'invoiceNo': sale_invoice.invoice_no,
                'invoiceDate': sale_invoice.invoice_date.isoformat(),
                'customerId': str(sale_invoice.customer.id) if sale_invoice.customer else None,
                'customer': {
                    'id': str(sale_invoice.customer.id),
                    'name': sale_invoice.customer.name,
                    'phone': sale_invoice.customer.phone,
                    'address': sale_invoice.customer.address,
                } if sale_invoice.customer else None,
                'items': [
                    {
                        'batchId': str(si.batch_id) if si.batch_id else '',
                        'productId': str(si.batch.product_id) if si.batch and si.batch.product_id else '',
                        'name': si.product_name,
                        'composition': si.composition,
                        'manufacturer': si.batch.product.manufacturer if si.batch and si.batch.product else None,
                        'packSize': si.pack_size,
                        'packUnit': si.pack_unit,
                        'batchNo': si.batch_no,
                        'expiryDate': si.expiry_date.isoformat(),
                        'scheduleType': si.schedule_type,
                        'mrp': float(si.mrp),
                        'rate': float(si.rate),
                        'qtyStrips': si.qty_strips,
                        'qtyLoose': si.qty_loose,
                        'totalQty': si.qty_strips * si.pack_size + si.qty_loose if si.pack_size else si.qty_strips,
                        'saleMode': si.sale_mode,
                        'discountPct': float(si.discount_pct),
                        'gstRate': float(si.gst_rate),
                        'taxableAmount': float(si.taxable_amount),
                        'gstAmount': float(si.gst_amount),
                        'totalAmount': float(si.total_amount),
                    }
                    for si in sale_items
                ],
                'subtotal': float(sale_invoice.subtotal),
                'discountAmount': float(sale_invoice.discount_amount),
                'extraDiscountPct': float(sale_invoice.extra_discount_pct),
                'extraDiscountAmount': float(
                    (sale_invoice.subtotal - sale_invoice.discount_amount)
                    * sale_invoice.extra_discount_pct / Decimal('100')
                ),
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
        invoices = SaleInvoice.objects.filter(outlet=outlet).annotate(
            items_count=Count('items')
        ).order_by('-invoice_date', '-created_at')

        # Optional customer filter
        customer_id = request.query_params.get('customerId') or request.query_params.get('customer_id')
        if customer_id:
            invoices = invoices.filter(customer_id=customer_id)

        # Pagination
        page = int(request.query_params.get('page', 1))
        page_size = min(int(request.query_params.get('pageSize', 50)), 200)

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
                'itemsCount': getattr(invoice, 'items_count', 0),
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


class SaleItemsView(APIView):
    """
    GET /api/v1/sales/{id}/items/

    Returns the full line-item list for a single sale invoice.
    Used by the customer invoice history expandable rows.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, sale_id, *args, **kwargs):
        try:
            invoice = SaleInvoice.objects.get(id=sale_id)
        except SaleInvoice.DoesNotExist:
            return Response({'detail': 'Invoice not found'}, status=status.HTTP_404_NOT_FOUND)

        items = invoice.items.all().order_by('created_at')
        results = []
        for item in items:
            results.append({
                'id': str(item.id),
                'productName': item.product_name,
                'qtyStrips': item.qty_strips,
                'qtyLoose': item.qty_loose,
                'totalQty': item.qty_strips + item.qty_loose,
                'rate': float(item.rate),
                'discountPct': float(item.discount_pct),
                'totalAmount': float(item.total_amount),
                'packSize': item.pack_size,
                'packUnit': item.pack_unit,
                'batchNo': item.batch_no,
                'expiryDate': item.expiry_date.isoformat() if item.expiry_date else None,
                'gstRate': float(item.gst_rate),
            })
        return Response({'data': results}, status=status.HTTP_200_OK)


class CustomerCreditPaymentView(APIView):
    """
    POST /api/v1/credit/payment/

    Record a customer credit repayment (Udhari collection).
    Updates CreditAccount.total_outstanding, creates CreditTransaction and LedgerEntry.
    All operations wrapped in transaction.atomic().

    Request body: RecordCreditPaymentPayload
    Response: CreditAccount (201 Created) or error (400/404/500)
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        Record a customer credit repayment.

        Request body:
        {
            "creditAccountId": "...",
            "amount": 1000,
            "mode": "cash",
            "reference": "CHQ12345",
            "notes": "Payment received",
            "paymentDate": "2026-03-17"
        }

        Returns:
        {
            "id": "...",
            "customerId": "...",
            "customer": {...},
            "outletId": "...",
            "creditLimit": 5000,
            "totalOutstanding": 500,
            "totalBorrowed": 2000,
            "totalRepaid": 1500,
            "status": "partial",
            "lastTransactionDate": "2026-03-17T...",
            "createdAt": "2026-03-17T..."
        }
        """

        try:
            payload = request.data
            credit_account_id = payload.get('creditAccountId')
            outlet_id = request.query_params.get('outletId') or payload.get('outletId')
            created_by_id = request.user.id  # From JWT token
            amount = Decimal(str(payload.get('amount', 0)))
            payment_mode = payload.get('mode') or payload.get('paymentMode')
            reference_no = payload.get('reference')
            notes = payload.get('notes')
            payment_date = payload.get('paymentDate')

            # Validate outlet
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                logger.warning(f"Outlet {outlet_id} not found")
                return Response(
                    {'error': {'code': 'OUTLET_NOT_FOUND', 'message': f'Outlet {outlet_id} not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Validate credit account
            try:
                credit_account = CreditAccount.objects.get(id=credit_account_id, outlet=outlet)
            except CreditAccount.DoesNotExist:
                logger.warning(f"Credit account {credit_account_id} not found for outlet {outlet_id}")
                return Response(
                    {'error': {'code': 'ACCOUNT_NOT_FOUND', 'message': 'Credit account not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Validate amount
            if amount <= 0:
                return Response(
                    {'error': {'code': 'INVALID_AMOUNT', 'message': 'Amount must be greater than 0'}},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if amount > credit_account.total_outstanding:
                logger.warning(f"Overpayment: trying to pay {amount}, outstanding is {credit_account.total_outstanding}")
                return Response(
                    {'error': {'code': 'OVERPAYMENT', 'message': f'Amount exceeds outstanding ₹{credit_account.total_outstanding}'}},
                    status=status.HTTP_400_BAD_REQUEST
                )

            logger.info(f"Recording credit payment from {credit_account.customer.name}: ₹{amount}")

            # Use transaction.atomic() for consistency
            with transaction.atomic():
                # Step 1: Update CreditAccount
                credit_account.total_outstanding -= amount
                credit_account.total_repaid += amount

                # Update status based on outstanding
                if credit_account.total_outstanding <= 0:
                    credit_account.status = 'cleared'
                elif credit_account.total_outstanding < credit_account.total_borrowed:
                    credit_account.status = 'partial'

                credit_account.last_transaction_date = timezone.now()
                credit_account.save()

                logger.info(f"Updated CreditAccount: outstanding={credit_account.total_outstanding}, status={credit_account.status}")

                # Step 2: Create CreditTransaction
                credit_transaction = CreditTransaction.objects.create(
                    credit_account=credit_account,
                    customer=credit_account.customer,
                    type='credit',
                    amount=amount,
                    description=f"Payment via {payment_mode or 'cash'}",
                    balance_after=credit_account.total_outstanding,
                    recorded_by_id=created_by_id,
                    date=datetime.fromisoformat(payment_date).date() if payment_date else None,
                )

                logger.info(f"Created CreditTransaction {credit_transaction.id}")

                # Step 3: Create LedgerEntry for customer
                # Query last ledger entry to calculate running balance
                last_ledger = LedgerEntry.objects.filter(
                    outlet=outlet,
                    customer=credit_account.customer,
                    entity_type='customer',
                ).order_by('-date', '-created_at').first()

                if last_ledger:
                    running_balance = last_ledger.running_balance - amount
                else:
                    running_balance = -amount

                ledger_entry = LedgerEntry.objects.create(
                    outlet=outlet,
                    entity_type='customer',
                    customer=credit_account.customer,
                    date=datetime.fromisoformat(payment_date).date() if payment_date else timezone.now().date(),
                    entry_type='receipt',
                    reference_no=reference_no or str(credit_transaction.id)[:20],
                    description=f"Credit payment from {credit_account.customer.name}",
                    debit=Decimal('0'),
                    credit=amount,
                    running_balance=running_balance,
                )

                logger.info(f"Created LedgerEntry with running_balance={running_balance}")

                # Step 4: Post double-entry journal for this payment collection
                try:
                    from apps.accounts.journal_service import post_credit_payment
                    post_credit_payment(
                        outlet=outlet,
                        customer=credit_account.customer,
                        amount=amount,
                        payment_mode=payment_mode or 'cash',
                        source_id=credit_transaction.id,
                        narration=f"Credit payment received - {credit_account.customer.name}",
                    )
                except Exception as e:
                    logger.error(
                        f"Journal posting failed for credit payment {credit_transaction.id}: {e}"
                    )
                    raise  # Re-raise to rollback entire transaction

            # Serialize response matching CreditAccount shape
            result = self._serialize_credit_account(credit_account)
            return Response(result, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Unexpected error recording credit payment: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to record payment'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _serialize_credit_account(self, credit_account):
        """Serialize CreditAccount to response shape."""
        return {
            'id': str(credit_account.id),
            'customerId': str(credit_account.customer_id),
            'customer': {
                'id': str(credit_account.customer.id),
                'name': credit_account.customer.name,
                'phone': credit_account.customer.phone,
                'address': credit_account.customer.address,
            },
            'outletId': str(credit_account.outlet_id),
            'creditLimit': float(credit_account.credit_limit),
            'totalOutstanding': float(credit_account.total_outstanding),
            'totalBorrowed': float(credit_account.total_borrowed),
            'totalRepaid': float(credit_account.total_repaid),
            'status': credit_account.status,
            'lastTransactionDate': credit_account.last_transaction_date.isoformat() if credit_account.last_transaction_date else None,
            'createdAt': credit_account.created_at.isoformat(),
        }


class DashboardDailyView(APIView):
    """
    GET /api/v1/dashboard/daily/?outletId=xxx&date=2026-03-17

    Get aggregated daily KPIs and alerts for an outlet.
    Includes sales totals, payment breakdown, top selling items, hourly sales, and alerts.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        Get daily dashboard KPIs and alerts.

        Query parameters:
        - outletId: Outlet UUID (required)
        - date: Date in yyyy-MM-dd format (default: today)

        Returns:
        {
            "date": "2026-03-17",
            "totalSales": 15000,
            "totalBills": 25,
            "cashCollected": 10000,
            "upiCollected": 3000,
            "cardCollected": 2000,
            "creditGiven": 0,
            "topSellingItems": [
                {
                    "productId": "...",
                    "name": "Dolo 650",
                    "totalQty": 150,
                    "totalRevenue": 3000
                }
            ],
            "hourlySales": [
                {
                    "hour": "09:00",
                    "bills": 5,
                    "sales": 2000
                }
            ],
            "paymentBreakdown": {
                "cash": 10000,
                "upi": 3000,
                "card": 2000,
                "credit": 0
            },
            "alerts": {
                "lowStock": [...],
                "expiringSoon": [...],
                "overdueAccounts": [...]
            }
        }
        """

        try:
            outlet_id = request.query_params.get('outletId')
            date_str = request.query_params.get('date', timezone.now().date().isoformat())

            # Validate outlet
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                logger.warning(f"Outlet {outlet_id} not found")
                return Response(
                    {'error': {'code': 'OUTLET_NOT_FOUND', 'message': 'Outlet not found'}},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Parse date
            try:
                target_date = datetime.fromisoformat(date_str).date()
            except (ValueError, TypeError):
                target_date = timezone.now().date()

            logger.info(f"Fetching dashboard for {outlet.name} on {target_date}")

            # Get sales for the date (using date() extraction from DateTimeField)
            sales = SaleInvoice.objects.filter(
                outlet=outlet,
                invoice_date__date=target_date,
                is_return=False
            )

            # Aggregate KPIs
            aggregates = sales.aggregate(
                total_sales=Sum('grand_total'),
                total_bills=Count('id'),
                cash_collected=Sum('cash_paid'),
                upi_collected=Sum('upi_paid'),
                card_collected=Sum('card_paid'),
                credit_given=Sum('credit_given'),
            )

            total_sales = float(aggregates['total_sales'] or 0)
            total_bills = aggregates['total_bills'] or 0
            cash_collected = float(aggregates['cash_collected'] or 0)
            upi_collected = float(aggregates['upi_collected'] or 0)
            card_collected = float(aggregates['card_collected'] or 0)
            credit_given = float(aggregates['credit_given'] or 0)

            logger.info(f"Daily totals: Sales={total_sales}, Bills={total_bills}")

            # Top selling items (by quantity)
            top_items = SaleItem.objects.filter(
                invoice__outlet=outlet,
                invoice__invoice_date__date=target_date,
                invoice__is_return=False
            ).values('batch__product_id', 'product_name').annotate(
                total_qty=Sum('qty_strips'),
                total_revenue=Sum('total_amount')
            ).order_by('-total_qty')[:5]

            top_selling = [
                {
                    'productId': str(item['batch__product_id']) if item['batch__product_id'] else 'custom',
                    'name': item['product_name'],
                    'totalQty': int(item['total_qty'] or 0),
                    'totalRevenue': float(item['total_revenue'] or 0),
                }
                for item in top_items
            ]

            # Hourly sales aggregation (by hour)
            from django.db.models.functions import ExtractHour
            hourly = sales.annotate(
                hour=ExtractHour('invoice_date')
            ).values('hour').annotate(
                bills=Count('id'),
                sales=Sum('grand_total')
            ).order_by('hour')

            hourly_sales = [
                {
                    'hour': f"{item['hour']:02d}:00",
                    'bills': item['bills'],
                    'sales': float(item['sales'] or 0),
                }
                for item in hourly
            ]

            # Payment breakdown
            payment_breakdown = {
                'cash': cash_collected,
                'upi': upi_collected,
                'card': card_collected,
                'credit': credit_given,
            }

            # Top Staff Leaderboard
            staff_qs = sales.values('billed_by__id', 'billed_by__name', 'billed_by__role', 'billed_by__avatar_url').annotate(
                billsCount=Count('id'),
                totalSales=Sum('grand_total')
            ).order_by('-totalSales')[:5]

            staff_leaderboard = [
                {
                    'staffId': str(s['billed_by__id']) if s['billed_by__id'] else '',
                    'name': s['billed_by__name'] or 'Unknown',
                    'role': s['billed_by__role'] or 'billing_staff',
                    'avatarUrl': s['billed_by__avatar_url'],
                    'billsCount': s['billsCount'],
                    'totalSales': float(s['totalSales'] or 0)
                }
                for s in staff_qs if s['billed_by__id']
            ]

            # Overall Discounts & GST
            total_discount = float(sales.aggregate(v=Sum('discount_amount'))['v'] or 0)
            gst_agg = sales.aggregate(
                c=Sum('cgst_amount'), 
                s=Sum('sgst_amount'), 
                i=Sum('igst_amount')
            )
            total_gst = float((gst_agg['c'] or 0) + (gst_agg['s'] or 0) + (gst_agg['i'] or 0))

            # Alerts
            alerts = self._get_daily_alerts(outlet, target_date)

            result = {
                'date': target_date.isoformat(),
                'totalSales': total_sales,
                'totalBills': total_bills,
                'cashCollected': cash_collected,
                'upiCollected': upi_collected,
                'cardCollected': card_collected,
                'creditGiven': credit_given,
                'totalDiscount': total_discount,
                'totalGst': total_gst,
                'topSellingItems': top_selling,
                'staffLeaderboard': staff_leaderboard,
                'hourlySales': hourly_sales,
                'paymentBreakdown': payment_breakdown,
                'alerts': alerts,
            }

            return Response(result, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error fetching dashboard: {e}", exc_info=True)
            return Response(
                {'error': {'code': 'INTERNAL_ERROR', 'message': 'Failed to fetch dashboard'}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _get_daily_alerts(self, outlet, target_date):
        """Get alerts: low stock, expiring soon, overdue accounts."""
        alerts = {
            'lowStock': [],
            'expiringSoon': [],
            'overdueAccounts': [],
        }

        # Low stock: batches with qty_strips < 10
        low_stock_batches = Batch.objects.filter(
            outlet=outlet,
            qty_strips__lt=10,
            is_active=True,
        ).select_related('product')

        for batch in low_stock_batches:
            if batch.product is None:
                continue
            alerts['lowStock'].append({
                'batch': {
                    'productName': batch.product.name,
                    'batchNumber': batch.batch_no,
                    'expiryDate': batch.expiry_date.isoformat(),
                },
                'currentStock': batch.qty_strips,
                'reorderLevel': 10,
            })

        # Expiring soon: batches expiring within 90 days
        expiry_cutoff = target_date + timedelta(days=90)
        expiring_batches = Batch.objects.filter(
            outlet=outlet,
            expiry_date__lte=expiry_cutoff,
            expiry_date__gt=target_date,
            is_active=True,
        ).select_related('product')

        for batch in expiring_batches:
            if batch.product is None:
                continue
            days_until = (batch.expiry_date - target_date).days
            alerts['expiringSoon'].append({
                'batch': {
                    'productName': batch.product.name,
                    'batchNumber': batch.batch_no,
                    'expiryDate': batch.expiry_date.isoformat(),
                },
                'daysUntilExpiry': days_until,
            })

        # Overdue accounts: credit accounts with outstanding > 0 and due date passed
        # This requires CreditAccount to have a due_date field or calculation from invoice dates
        # For now, we'll check accounts with status 'overdue'
        overdue_accounts = CreditAccount.objects.filter(
            outlet=outlet,
            status='overdue',
            total_outstanding__gt=0,
        ).select_related('customer')

        for account in overdue_accounts:
            # Calculate days overdue (estimate from last transaction)
            days_overdue = 0
            if account.last_transaction_date:
                days_overdue = (timezone.now() - account.last_transaction_date).days

            alerts['overdueAccounts'].append({
                'customerId': str(account.customer_id),
                'customerName': account.customer.name,
                'outstandingAmount': float(account.total_outstanding),
                'daysOverdue': days_overdue,
            })

        return alerts


class CreditAccountListView(APIView):
    """
    GET /api/v1/credit/accounts/?outletId=xxx

    List all credit accounts for an outlet with customer details.
    Returns paginated list of CreditAccount objects with customer information.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """List credit accounts for outlet."""
        outlet_id = request.query_params.get('outletId')
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('pageSize', 50))
        search = request.query_params.get('search', '').strip()

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Query credit accounts
        accounts = CreditAccount.objects.filter(outlet=outlet).select_related('customer')

        # Apply search filter (by customer name or phone)
        if search:
            query_lower = search.lower()
            accounts = accounts.filter(
                Q(customer__name__icontains=query_lower) |
                Q(customer__phone__icontains=query_lower)
            )

        # Apply pagination
        total_records = accounts.count()
        start = (page - 1) * page_size
        end = start + page_size
        accounts_page = accounts[start:end]

        # Serialize accounts
        results = []
        for account in accounts_page:
            result = {
                'id': str(account.id),
                'customerId': str(account.customer_id),
                'customer': {
                    'id': str(account.customer.id),
                    'name': account.customer.name,
                    'phone': account.customer.phone,
                    'address': account.customer.address,
                },
                'outletId': str(account.outlet_id),
                'creditLimit': float(account.credit_limit),
                'totalOutstanding': float(account.total_outstanding),
                'totalBorrowed': float(account.total_borrowed),
                'totalRepaid': float(account.total_repaid),
                'status': account.status,
                'lastTransactionDate': account.last_transaction_date.isoformat() if account.last_transaction_date else None,
                'createdAt': account.created_at.isoformat(),
            }
            results.append(result)

        total_pages = (total_records + page_size - 1) // page_size

        response_data = {
            'data': results,
            'pagination': {
                'page': page,
                'pageSize': page_size,
                'totalPages': total_pages,
                'totalRecords': total_records,
            }
        }

        logger.info(f"Listed {len(results)} credit accounts for outlet {outlet.name}")
        return Response(response_data, status=status.HTTP_200_OK)


class CreditAccountDetailView(APIView):
    """
    GET /api/v1/credit/accounts/{id}/

    Get details of a specific credit account with customer information.
    Returns full CreditAccount object with linked customer profile.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, account_id, *args, **kwargs):
        """Get credit account details."""
        try:
            account = CreditAccount.objects.get(id=account_id)
        except CreditAccount.DoesNotExist:
            return Response(
                {'detail': f'Credit account {account_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        result = {
            'id': str(account.id),
            'customerId': str(account.customer_id),
            'customer': {
                'id': str(account.customer.id),
                'name': account.customer.name,
                'phone': account.customer.phone,
                'address': account.customer.address,
            },
            'outletId': str(account.outlet_id),
            'creditLimit': float(account.credit_limit),
            'totalOutstanding': float(account.total_outstanding),
            'totalBorrowed': float(account.total_borrowed),
            'totalRepaid': float(account.total_repaid),
            'status': account.status,
            'lastTransactionDate': account.last_transaction_date.isoformat() if account.last_transaction_date else None,
            'createdAt': account.created_at.isoformat(),
        }

        logger.info(f"Retrieved credit account {account_id}")
        return Response(result, status=status.HTTP_200_OK)


class SalePrintView(APIView):
    """
    GET /api/v1/sales/{id}/print/

    Get sale invoice details for printing.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, sale_id, *args, **kwargs):
        """
        Get sale invoice for printing.

        Query parameters:
        - outletId: Outlet UUID to filter invoices

        Returns:
        {
            "id": "...",
            "invoiceNo": "...",
            "invoiceDate": "...",
            "grandTotal": ...,
            "paymentMode": "...",
            "customer": { "name", "phone", "address" } | null,
            "outlet": { "name", "address", "phone", "gstin", "drugLicenseNo" },
            "billedBy": "staff name",
            "items": [{ "productName", "composition", "batchNo", "expiryDate", "qty", "mrp", "saleRate", "discountPct", "gstRate", "totalAmount" }]
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

        # Fetch sale invoice
        try:
            invoice = SaleInvoice.objects.select_related(
                'customer', 'billed_by', 'outlet'
            ).get(id=sale_id, outlet=outlet)
        except SaleInvoice.DoesNotExist:
            return Response(
                {'detail': f'Sale {sale_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Fetch sale items
        items = SaleItem.objects.filter(invoice=invoice).select_related('batch', 'batch__product')

        # Build items list
        items_list = []
        for item in items:
            items_list.append({
                'productName': item.product_name,
                'composition': item.composition,
                'batchNo': item.batch_no,
                'expiryDate': item.expiry_date.isoformat(),
                'qty': item.qty_strips,
                'mrp': float(item.mrp),
                'saleRate': float(item.sale_rate),
                'discountPct': float(item.discount_pct),
                'gstRate': float(item.gst_rate),
                'totalAmount': float(item.total_amount),
            })

        # Build response
        result = {
            'id': str(invoice.id),
            'invoiceNo': invoice.invoice_no,
            'invoiceDate': invoice.invoice_date.isoformat(),
            'grandTotal': float(invoice.grand_total),
            'paymentMode': invoice.payment_mode,
            'customer': {
                'name': invoice.customer.name,
                'phone': invoice.customer.phone,
                'address': invoice.customer.address,
            } if invoice.customer else None,
            'outlet': {
                'name': outlet.name,
                'address': outlet.address,
                'phone': outlet.phone,
                'gstin': outlet.gstin,
                'drugLicenseNo': outlet.drug_license_no,
            },
            'billedBy': invoice.billed_by.name if invoice.billed_by else 'Unknown',
            'items': items_list,
        }

        logger.info(f"Retrieved sale {sale_id} for printing")
        return Response(result, status=status.HTTP_200_OK)

class SaleDetailView(APIView):
    """
    GET /api/v1/sales/{id}/
    
    Get details of a specific sale invoice.
    """
    
    permission_classes = [IsAuthenticated]

    def get(self, request, sale_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
            
        try:
            invoice = SaleInvoice.objects.select_related('customer', 'billed_by').get(id=sale_id, outlet=outlet)
        except SaleInvoice.DoesNotExist:
            return Response(
                {'detail': f'Sale {sale_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
            
        items = SaleItem.objects.filter(invoice=invoice).select_related('batch', 'batch__product')
        
        items_list = []
        for item in items:
            items_list.append({
                'batchId': str(item.batch_id) if item.batch_id else '',
                'productId': str(item.batch.product_id) if item.batch and item.batch.product_id else '',
                'name': item.product_name,
                'composition': item.composition,
                'manufacturer': item.batch.product.manufacturer if item.batch and item.batch.product else None,
                'packSize': item.pack_size,
                'packUnit': item.pack_unit,
                'batchNo': item.batch_no,
                'expiryDate': item.expiry_date.isoformat(),
                'scheduleType': item.schedule_type,
                'mrp': float(item.mrp),
                'saleRate': float(item.sale_rate),
                'rate': float(item.rate),
                'qtyStrips': item.qty_strips,
                'qtyLoose': item.qty_loose,
                'totalQty': item.qty_strips * item.pack_size + item.qty_loose if item.pack_size else item.qty_strips,
                'saleMode': item.sale_mode,
                'discountPct': float(item.discount_pct),
                'gstRate': float(item.gst_rate),
                'taxableAmount': float(item.taxable_amount),
                'gstAmount': float(item.gst_amount),
                'totalAmount': float(item.total_amount),
            })
            
        result = {
            'id': str(invoice.id),
            'outletId': str(invoice.outlet_id),
            'invoiceNo': invoice.invoice_no,
            'invoiceDate': invoice.invoice_date.isoformat(),
            'customerId': str(invoice.customer.id) if invoice.customer else None,
            'customer': {
                'id': str(invoice.customer.id),
                'name': invoice.customer.name,
                'phone': invoice.customer.phone,
                'address': invoice.customer.address,
            } if invoice.customer else None,
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
            'billedByName': invoice.billed_by.name if invoice.billed_by else 'Unknown',
            'items': items_list,
            'createdAt': invoice.created_at.isoformat(),
        }
        
        return Response(result, status=status.HTTP_200_OK)


class CreditTransactionListView(APIView):
    """
    GET /api/v1/credit/{id}/transactions/ 
    """
    
    permission_classes = [IsAuthenticated]

    def get(self, request, account_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=404)
            
        try:
            account = CreditAccount.objects.get(id=account_id, outlet=outlet)
        except CreditAccount.DoesNotExist:
            return Response({'detail': f'Credit Account {account_id} not found'}, status=404)
            
        transactions = CreditTransaction.objects.filter(credit_account=account).order_by('-created_at')
        
        result = []
        for tx in transactions:
            result.append({
                'id': str(tx.id),
                'creditAccountId': str(tx.credit_account_id),
                'customerId': str(tx.customer_id),
                'invoiceId': str(tx.invoice_id) if tx.invoice_id else None,
                'type': tx.type,
                'amount': float(tx.amount),
                'description': tx.description,
                'balanceAfter': float(tx.balance_after),
                'recordedBy': str(tx.recorded_by_id) if tx.recorded_by else None,
                'createdAt': tx.created_at.isoformat(),
                'date': tx.date.isoformat() if tx.date else None,
            })
            
        return Response(result, status=status.HTTP_200_OK)


class CreditLedgerView(APIView):
    """
    GET /api/v1/credit/{id}/ledger/
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')
        
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': f'Outlet {outlet_id} not found'}, status=404)
            
        try:
            customer = Customer.objects.get(id=customer_id, outlet=outlet)
        except Customer.DoesNotExist:
            return Response({'detail': f'Customer {customer_id} not found'}, status=404)
            
        ledger_entries = LedgerEntry.objects.filter(
            outlet=outlet,
            customer=customer,
            entity_type='customer'
        ).order_by('date', 'created_at')
        
        result = []
        for entry in ledger_entries:
            result.append({
                'id': str(entry.id),
                'date': entry.date.isoformat(),
                'entryType': entry.entry_type,
                'referenceNo': entry.reference_no,
                'description': entry.description,
                'debit': float(entry.debit),
                'credit': float(entry.credit),
                'runningBalance': float(entry.running_balance),
                'createdAt': entry.created_at.isoformat(),
            })
            
        return Response(result, status=status.HTTP_200_OK)


# ─── Phase 2 Batch 1 Views ────────────────────────────────────────────────────

class ReceiptListCreateView(APIView):
    """
    GET /api/v1/receipts/?customerId=&from=&to=
    POST /api/v1/receipts/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = ReceiptEntry.objects.filter(outlet=outlet)

        customer_id = request.query_params.get('customerId')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)

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
        for r in qs.order_by('-date', '-created_at'):
            data.append({
                'id': str(r.id),
                'customerId': str(r.customer_id),
                'customerName': r.customer.name,
                'date': r.date.isoformat(),
                'totalAmount': float(r.total_amount),
                'paymentMode': r.payment_mode,
                'referenceNo': r.reference_no,
                'notes': r.notes,
                'createdAt': r.created_at.isoformat(),
            })

        return Response({'success': True, 'data': data, 'meta': {'total': len(data)}}, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        created_by_id = request.user.id
        try:
            receipt = create_receipt_payment(request.data, outlet_id, created_by_id)
        except ReceiptServiceError as e:
            return Response({'error': {'code': 'RECEIPT_ERROR', 'message': str(e)}}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Unexpected error creating receipt: {e}", exc_info=True)
            return Response({'error': {'code': 'INTERNAL_ERROR', 'message': str(e)}}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'success': True,
            'data': {
                'id': str(receipt.id),
                'referenceNo': receipt.reference_no,
                'totalAmount': float(receipt.total_amount),
                'date': receipt.date.isoformat(),
            }
        }, status=status.HTTP_201_CREATED)


class DistributorOutstandingSummaryView(APIView):
    """GET /api/v1/outstanding/distributors/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from apps.purchases.models import Distributor, PurchaseInvoice
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.now().date()
        distributors = Distributor.objects.filter(outlet=outlet, is_active=True)

        data = []
        for dist in distributors:
            invoices = PurchaseInvoice.objects.filter(
                outlet=outlet, distributor=dist, outstanding__gt=0
            )
            total_outstanding = float(invoices.aggregate(t=Sum('outstanding'))['t'] or 0)
            if total_outstanding <= 0:
                continue

            overdue_invoices = invoices.filter(due_date__lt=today)
            overdue_amount = float(overdue_invoices.aggregate(t=Sum('outstanding'))['t'] or 0)
            oldest = invoices.order_by('due_date').values_list('due_date', flat=True).first()

            data.append({
                'distributorId': str(dist.id),
                'distributorName': dist.name,
                'totalOutstanding': total_outstanding,
                'overdueAmount': overdue_amount,
                'invoiceCount': invoices.count(),
                'oldestDueDate': oldest.isoformat() if oldest else None,
            })

        data.sort(key=lambda x: x['overdueAmount'], reverse=True)
        return Response({'success': True, 'data': data, 'meta': {'total': len(data)}}, status=status.HTTP_200_OK)


class CustomerOutstandingSummaryView(APIView):
    """GET /api/v1/outstanding/customers/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        customers = Customer.objects.filter(outlet=outlet, is_active=True, outstanding__gt=0)

        data = []
        for cust in customers:
            oldest_unpaid = SaleInvoice.objects.filter(
                outlet=outlet, customer=cust, amount_due__gt=0
            ).order_by('invoice_date').first()

            last_receipt = ReceiptEntry.objects.filter(
                outlet=outlet, customer=cust
            ).order_by('-date').values_list('date', flat=True).first()

            data.append({
                'customerId': str(cust.id),
                'customerName': cust.name,
                'phone': cust.phone,
                'totalOutstanding': float(cust.outstanding),
                'overdueAmount': float(oldest_unpaid.amount_due) if oldest_unpaid else 0,
                'creditLimit': float(cust.credit_limit),
                'lastPaymentDate': last_receipt.isoformat() if last_receipt else None,
            })

        data.sort(key=lambda x: x['totalOutstanding'], reverse=True)
        return Response({'success': True, 'data': data, 'meta': {'total': len(data)}}, status=status.HTTP_200_OK)


class ExpenseListCreateView(APIView):
    """
    GET /api/v1/expenses/?from=&to=&head=
    POST /api/v1/expenses/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = ExpenseEntry.objects.filter(outlet=outlet)
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        head = request.query_params.get('head')
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
        if head:
            qs = qs.filter(expense_head=head)

        data = []
        breakdown = {}
        total_amount = 0
        for exp in qs.order_by('-date', '-created_at'):
            data.append({
                'id': str(exp.id),
                'date': exp.date.isoformat(),
                'expenseHead': exp.expense_head,
                'customHead': exp.custom_head,
                'amount': float(exp.amount),
                'paymentMode': exp.payment_mode,
                'referenceNo': exp.reference_no,
                'notes': exp.notes,
                'createdAt': exp.created_at.isoformat(),
            })
            breakdown[exp.expense_head] = breakdown.get(exp.expense_head, 0) + float(exp.amount)
            total_amount += float(exp.amount)

        return Response({
            'success': True,
            'data': data,
            'meta': {'total': len(data), 'totalAmount': total_amount, 'breakdown': breakdown},
        }, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        created_by_id = request.user.id
        try:
            expense = create_expense_entry(request.data, outlet_id, created_by_id)
        except ExpenseServiceError as e:
            return Response({'error': {'code': 'EXPENSE_ERROR', 'message': str(e)}}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error creating expense: {e}", exc_info=True)
            return Response({'error': {'code': 'INTERNAL_ERROR', 'message': str(e)}}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'success': True,
            'data': {
                'id': str(expense.id),
                'date': expense.date.isoformat(),
                'expenseHead': expense.expense_head,
                'customHead': expense.custom_head,
                'amount': float(expense.amount),
                'paymentMode': expense.payment_mode,
                'referenceNo': expense.reference_no,
                'notes': expense.notes,
                'createdAt': expense.created_at.isoformat(),
            }
        }, status=status.HTTP_201_CREATED)


class CustomerLedgerView(APIView):
    """GET /api/v1/customers/{id}/ledger/?from=&to="""
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            customer = Customer.objects.get(id=customer_id, outlet=outlet)
        except Customer.DoesNotExist:
            return Response({'detail': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = LedgerEntry.objects.filter(outlet=outlet, customer=customer, entity_type='customer')
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

        qs = qs.order_by('date', 'created_at')
        entries = list(qs)

        opening_balance = float(entries[0].running_balance - entries[0].credit + entries[0].debit) if entries else 0
        closing_balance = float(entries[-1].running_balance) if entries else 0

        data = [{
            'id': str(e.id),
            'date': e.date.isoformat(),
            'entryType': e.entry_type,
            'referenceNo': e.reference_no,
            'description': e.description,
            'debit': float(e.debit),
            'credit': float(e.credit),
            'balance': float(e.running_balance),
        } for e in entries]

        return Response({
            'success': True,
            'data': data,
            'meta': {'openingBalance': opening_balance, 'closingBalance': closing_balance, 'total': len(data)},
        }, status=status.HTTP_200_OK)


class UpdateCreditLimitView(APIView):
    """PATCH /api/v1/credit/{id}/limit/"""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk, *args, **kwargs):
        outlet_id = request.data.get('outletId') or request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            customer = Customer.objects.get(id=pk, outlet=outlet)
        except Customer.DoesNotExist:
            return Response({'detail': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        credit_limit = request.data.get('creditLimit')
        if credit_limit is None:
            return Response({'error': 'creditLimit is required'}, status=status.HTTP_400_BAD_REQUEST)

        customer.credit_limit = Decimal(str(credit_limit))
        customer.save(update_fields=['credit_limit'])

        return Response({
            'success': True,
            'data': {
                'id': str(customer.id),
                'creditLimit': float(customer.credit_limit),
                'outstandingBalance': float(customer.outstanding),
            }
        }, status=status.HTTP_200_OK)


class CreateSalesReturnView(APIView):
    """POST /api/v1/sales/return/"""
    permission_classes = [IsManagerOrAbove]

    def post(self, request, *args, **kwargs):
        outlet_id = request.data.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        created_by_id = request.user.id
        try:
            sales_return = create_sales_return(request.data, outlet_id, created_by_id)
        except ReturnServiceError as e:
            return Response({'error': {'code': 'RETURN_ERROR', 'message': str(e)}}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error creating sales return: {e}", exc_info=True)
            return Response({'error': {'code': 'INTERNAL_ERROR', 'message': str(e)}}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'success': True,
            'data': {
                'id': str(sales_return.id),
                'returnNo': sales_return.return_no,
                'totalAmount': float(sales_return.total_amount),
                'returnDate': sales_return.return_date.isoformat(),
            }
        }, status=status.HTTP_201_CREATED)


class SalesReturnListView(APIView):
    """GET /api/v1/sales/returns/"""
    permission_classes = [IsManagerOrAbove]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = SalesReturn.objects.filter(outlet=outlet)
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        customer_id = request.query_params.get('customerId')
        if from_str:
            try:
                qs = qs.filter(return_date__gte=datetime.fromisoformat(from_str).date())
            except ValueError:
                pass
        if to_str:
            try:
                qs = qs.filter(return_date__lte=datetime.fromisoformat(to_str).date())
            except ValueError:
                pass
        if customer_id:
            qs = qs.filter(original_sale__customer_id=customer_id)

        total_amount = 0
        data = []
        for r in qs.select_related('original_sale__customer').order_by('-return_date', '-created_at'):
            data.append({
                'id': str(r.id),
                'returnNo': r.return_no,
                'returnDate': r.return_date.isoformat(),
                'originalInvoiceNo': r.original_sale.invoice_no,
                'customerName': r.original_sale.customer.name if r.original_sale.customer else None,
                'totalAmount': float(r.total_amount),
                'refundMode': r.refund_mode,
                'reason': r.reason,
                'createdAt': r.created_at.isoformat(),
            })
            total_amount += float(r.total_amount)

        return Response({
            'success': True,
            'data': data,
            'meta': {'total': len(data), 'totalAmount': total_amount},
        }, status=status.HTTP_200_OK)


class SalesReturnDetailView(APIView):
    """GET /api/v1/sales/returns/{id}/"""
    permission_classes = [IsManagerOrAbove]

    def get(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            r = SalesReturn.objects.select_related(
                'original_sale__customer', 'outlet'
            ).prefetch_related('items').get(id=pk, outlet=outlet)
        except SalesReturn.DoesNotExist:
            return Response({'detail': 'Return not found'}, status=status.HTTP_404_NOT_FOUND)

        items = [{
            'productName': item.product_name,
            'batchNo': item.batch_no,
            'qtyReturned': item.qty_returned,
            'returnRate': float(item.return_rate),
            'totalAmount': float(item.total_amount),
        } for item in r.items.all()]

        data = {
            'id': str(r.id),
            'returnNo': r.return_no,
            'returnDate': r.return_date.isoformat(),
            'originalInvoiceNo': r.original_sale.invoice_no,
            'customerName': r.original_sale.customer.name if r.original_sale.customer else None,
            'totalAmount': float(r.total_amount),
            'refundMode': r.refund_mode,
            'reason': r.reason,
            'items': items,
            'createdAt': r.created_at.isoformat(),
        }

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)


class SalesReturnPrintView(APIView):
    """GET /api/v1/sales/returns/{id}/print/"""
    permission_classes = [IsManagerOrAbove]

    def get(self, request, pk, *args, **kwargs):
        outlet_id = request.query_params.get('outletId') or (
            request.user.outlet_id if hasattr(request.user, 'outlet_id') else None
        )
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            r = SalesReturn.objects.select_related(
                'original_sale__customer', 'outlet'
            ).prefetch_related('items').get(id=pk, outlet=outlet)
        except SalesReturn.DoesNotExist:
            return Response({'detail': 'Return not found'}, status=status.HTTP_404_NOT_FOUND)

        items = [{
            'productName': item.product_name,
            'batchNo': item.batch_no,
            'qtyReturned': item.qty_returned,
            'returnRate': float(item.return_rate),
            'totalAmount': float(item.total_amount),
        } for item in r.items.all()]

        data = {
            'returnNo': r.return_no,
            'returnDate': r.return_date.isoformat(),
            'originalInvoiceNo': r.original_sale.invoice_no,
            'customerName': r.original_sale.customer.name if r.original_sale.customer else 'Walk-in',
            'items': items,
            'totalAmount': float(r.total_amount),
            'refundMode': r.refund_mode,
            'reason': r.reason,
            'outletName': outlet.name,
            'outletGSTIN': outlet.gstin or '',
        }

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)


# ── Phase 2 Batch 2: Notifications ──────────────────────────────────────────

from apps.billing.models import NotificationLog


class SendReminderView(APIView):
    """POST /api/v1/credit/{id}/reminder/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        outlet_id = getattr(request.user, 'outlet_id', None)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            credit_account = CreditAccount.objects.get(id=pk, outlet=outlet)
        except CreditAccount.DoesNotExist:
            return Response({'detail': 'Credit account not found'}, status=status.HTTP_404_NOT_FOUND)

        channel = request.data.get('channel', 'whatsapp')
        message = request.data.get('message', '')
        if not message:
            message = (
                f"Dear {credit_account.customer.name}, you have an outstanding balance of "
                f"₹{credit_account.outstanding}. Please clear your dues. - MediFlow"
            )

        log = NotificationLog.objects.create(
            outlet=outlet,
            customer=credit_account.customer,
            channel=channel,
            message=message,
            status='pending',
        )

        # Stub: in production, Celery task would fire here
        # send_whatsapp_reminder.delay(log.id)
        log.status = 'pending'
        log.save(update_fields=['status'])

        return Response({
            'success': True,
            'data': {
                'notificationId': str(log.id),
                'channel': log.channel,
                'status': log.status,
                'message': log.message,
            }
        }, status=status.HTTP_200_OK)


class LowStockAlertView(APIView):
    """POST /api/v1/notifications/low-stock/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        from apps.inventory.models import Batch, MasterProduct
        outlet_id = getattr(request.user, 'outlet_id', None)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        # Find all active batches where qty_strips <= product.min_qty
        low_batches = (
            Batch.objects.filter(outlet=outlet, is_active=True)
            .select_related('product')
            .filter(qty_strips__lte=models.F('product__min_qty'))
        )

        alerts = []
        for batch in low_batches:
            alerts.append({
                'productId': str(batch.product.id),
                'productName': batch.product.name,
                'batchNo': batch.batch_no,
                'currentStock': batch.qty_strips,
                'minQty': batch.product.min_qty,
                'reorderQty': batch.product.reorder_qty,
            })

        return Response({
            'success': True,
            'data': alerts,
            'meta': {'total': len(alerts)},
        }, status=status.HTTP_200_OK)


# ── Marg ERP CSV Migration ───────────────────────────────────────────────────

import csv
import io
from django.db import transaction as db_transaction
from apps.inventory.models import MasterProduct, Batch


class MargMigrationView(APIView):
    """POST /api/v1/migrate/marg/ — bulk import CSV from Marg ERP"""
    permission_classes = [IsAuthenticated]

    @db_transaction.atomic
    def post(self, request, *args, **kwargs):
        outlet_id = getattr(request.user, 'outlet_id', None)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        csv_file = request.FILES.get('file')
        if not csv_file:
            return Response({'detail': 'CSV file is required (field: file)'}, status=status.HTTP_400_BAD_REQUEST)

        decoded = csv_file.read().decode('utf-8-sig')
        reader = csv.DictReader(io.StringIO(decoded))

        imported, skipped, errors = 0, 0, []

        for row_num, row in enumerate(reader, start=2):
            try:
                product_name = row.get('ProductName', '').strip()
                hsn_code = row.get('HSNCode', '').strip() or f'MARG-{row_num}'
                batch_no = row.get('BatchNo', '').strip() or f'BATCH-{row_num}'
                expiry_str = row.get('ExpiryDate', '').strip()
                mrp = float(row.get('MRP', 0) or 0)
                purchase_rate = float(row.get('PurchaseRate', 0) or 0)
                sale_rate = float(row.get('SaleRate', 0) or purchase_rate)
                qty_strips = int(float(row.get('Qty', 0) or 0))
                pack_size = int(float(row.get('PackSize', 1) or 1))

                if not product_name:
                    skipped += 1
                    continue

                from datetime import datetime, date
                expiry_date = date.today()
                if expiry_str:
                    for fmt in ('%d/%m/%Y', '%m/%Y', '%Y-%m-%d', '%d-%m-%Y'):
                        try:
                            parsed = datetime.strptime(expiry_str, fmt)
                            expiry_date = parsed.date()
                            break
                        except ValueError:
                            continue

                product, _ = MasterProduct.objects.get_or_create(
                    hsn_code=hsn_code,
                    defaults={
                        'name': product_name,
                        'composition': '',
                        'manufacturer': row.get('Manufacturer', '').strip() or 'Unknown',
                        'category': row.get('Category', '').strip() or 'General',
                        'drug_type': 'allopathy',
                        'schedule_type': 'OTC',
                        'pack_size': pack_size,
                        'pack_unit': row.get('PackUnit', 'units').strip() or 'units',
                        'pack_type': 'strip',
                    }
                )

                Batch.objects.create(
                    outlet=outlet,
                    product=product,
                    batch_no=batch_no,
                    expiry_date=expiry_date,
                    mrp=mrp,
                    purchase_rate=purchase_rate,
                    sale_rate=sale_rate,
                    qty_strips=qty_strips,
                    is_opening_stock=True,
                )
                imported += 1

            except Exception as e:
                errors.append({'row': row_num, 'error': str(e)})
                if len(errors) >= 10:
                    raise Exception(f'Too many errors ({len(errors)}), aborting import')

        return Response({
            'success': True,
            'data': {
                'imported': imported,
                'skipped': skipped,
                'errors': errors,
            }
        }, status=status.HTTP_200_OK)


class SaleInvoiceSearchView(APIView):
    """GET /api/v1/sales/invoices/search/?outletId=xxx&q=INV-001"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.core.models import Outlet
        outlet_id = request.query_params.get('outletId')
        q = request.query_params.get('q', '').strip()
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=404)

        qs = SaleInvoice.objects.filter(outlet=outlet, is_return=False).select_related('customer').prefetch_related('items')
        if q:
            qs = qs.filter(
                Q(invoice_no__icontains=q) | Q(customer__name__icontains=q)
            )
        qs = qs.order_by('-invoice_date')[:20]

        results = []
        for inv in qs:
            items = []
            for item in inv.items.all():
                items.append({
                    'id': str(item.id),
                    'batchId': str(item.batch_id) if item.batch_id else '', # THE FIX
                    'productName': item.product_name,
                    'batchNo': item.batch_no,
                    'expiry': str(item.expiry_date),
                    # Send total quantities correctly
                    'qtyStrips': item.qty_strips,
                    'qtyLoose': item.qty_loose,
                    'packSize': item.pack_size,
                    # Fallback 'qty' for simple frontend tables (Total units)
                    'qty': (item.qty_strips * (item.pack_size or 1)) + item.qty_loose,
                    'rate': float(item.sale_rate),
                    'discPercent': float(item.discount_pct),
                    'gstRate': float(item.gst_rate),
                })
            results.append({
                'id': str(inv.id),
                'invoiceNo': inv.invoice_no,
                'date': str(inv.invoice_date.date()) if hasattr(inv.invoice_date, 'date') else str(inv.invoice_date),
                'customerName': inv.customer.name if inv.customer else 'Walk-in',
                'customerId': str(inv.customer.id) if inv.customer else None,
                'grandTotal': float(inv.grand_total),
                'items': items,
            })
        return Response({'data': results})
