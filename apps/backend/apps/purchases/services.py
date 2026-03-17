import logging
from decimal import Decimal
from datetime import timedelta
from typing import Dict, List, Any
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.core.models import Outlet
from apps.accounts.models import Staff
from apps.inventory.models import MasterProduct, Batch
from apps.purchases.models import PurchaseInvoice, PurchaseItem, Distributor
from apps.billing.models import LedgerEntry, PaymentEntry, PaymentAllocation

logger = logging.getLogger(__name__)


class PurchaseServiceError(Exception):
    """Custom exception raised when purchase save validation fails."""
    pass


class OverpaymentError(Exception):
    """Raised when payment allocation attempts to overpay an invoice or payment total doesn't match."""
    pass


@transaction.atomic
def atomic_purchase_save(payload: Dict[str, Any], outlet_id: str, created_by_id: str) -> PurchaseInvoice:
    """
    Atomically save a purchase invoice with items, batch creation/merging, and ledger entry.

    All operations are wrapped in a single transaction — if any step fails, the entire
    transaction rolls back.

    Args:
        payload: Dictionary matching CreatePurchasePayload interface from TypeScript
        outlet_id: Outlet UUID
        created_by_id: Staff UUID who created this purchase

    Returns:
        Created PurchaseInvoice instance

    Raises:
        PurchaseServiceError: If validation fails (outlet, distributor, etc.)
        ValidationError: If batch or ledger validation fails
        Other DB exceptions if transaction fails
    """

    try:
        # ─── Step 1: Validate and get Outlet ───────────────────────────────────────
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            raise PurchaseServiceError(f"Outlet {outlet_id} not found")

        logger.info(f"Processing purchase for outlet {outlet.name}")

        # ─── Step 2: Validate and get Distributor ────────────────────────────────────
        distributor_id = payload.get('distributorId')
        try:
            distributor = Distributor.objects.get(id=distributor_id, outlet=outlet)
        except Distributor.DoesNotExist:
            raise PurchaseServiceError(f"Distributor {distributor_id} not found for outlet {outlet_id}")

        logger.info(f"Distributor: {distributor.name}")

        # ─── Step 3: Get or create Staff (created_by) ──────────────────────────────────
        try:
            created_by = Staff.objects.get(id=created_by_id, outlet=outlet)
        except Staff.DoesNotExist:
            raise PurchaseServiceError(f"Staff {created_by_id} not found for outlet {outlet_id}")

        # ─── Step 4: Create PurchaseInvoice ────────────────────────────────────────────
        invoice_date_str = payload['invoiceDate'].replace('Z', '+00:00')
        invoice_date = timezone.datetime.fromisoformat(invoice_date_str)
        if not isinstance(invoice_date, timezone.datetime):
            invoice_date = timezone.make_aware(invoice_date)

        purchase_type = payload.get('purchaseType', 'credit')  # Default to credit

        # Compute due_date if not provided and purchase_type is credit
        due_date = None
        if payload.get('dueDate'):
            due_date = timezone.datetime.fromisoformat(payload['dueDate']).date()
        elif purchase_type == 'credit':
            due_date = invoice_date.date() + timedelta(days=distributor.credit_days)

        grand_total = Decimal(str(payload['grandTotal']))

        purchase_invoice = PurchaseInvoice.objects.create(
            outlet=outlet,
            distributor=distributor,
            invoice_no=payload['invoiceNo'],
            invoice_date=invoice_date.date(),
            due_date=due_date,
            purchase_type=purchase_type,
            purchase_order_ref=payload.get('purchaseOrderRef'),
            godown=payload.get('godown', 'main'),
            subtotal=Decimal(str(payload['subtotal'])),
            discount_amount=Decimal(str(payload['discountAmount'])),
            taxable_amount=Decimal(str(payload['taxableAmount'])),
            gst_amount=Decimal(str(payload['gstAmount'])),
            cess_amount=Decimal(str(payload['cessAmount'])),
            freight=Decimal(str(payload.get('freight', 0))),
            round_off=Decimal(str(payload.get('roundOff', 0))),
            grand_total=grand_total,
            amount_paid=Decimal('0'),
            outstanding=grand_total,
            notes=payload.get('notes'),
            created_by=created_by,
        )

        logger.info(f"Created PurchaseInvoice {purchase_invoice.invoice_no} with ID {purchase_invoice.id}")

        # ─── Step 5: Process items and batch creation/merging ───────────────────────────
        # Cache for tracking batches created/merged in this transaction
        batch_cache: Dict[tuple, Batch] = {}
        purchase_items = []

        items_payload = payload.get('items', [])
        if not items_payload:
            raise PurchaseServiceError("Purchase must have at least one item")

        for idx, item_payload in enumerate(items_payload):
            # Get or fallback MasterProduct
            master_product = None
            if item_payload.get('masterProductId'):
                try:
                    master_product = MasterProduct.objects.get(id=item_payload['masterProductId'])
                except MasterProduct.DoesNotExist:
                    logger.warning(f"MasterProduct {item_payload['masterProductId']} not found, creating custom product")

            # Batch lookup key: (batch_no, expiry_date)
            batch_no = item_payload['batchNo']
            raw_expiry = item_payload['expiryDate']
            try:
                expiry_date = timezone.datetime.fromisoformat(raw_expiry.replace('Z', '+00:00')).date()
            except (ValueError, TypeError):
                import re as _re
                m = _re.match(r'^(\d{1,2})[\/\-](\d{2,4})$', raw_expiry)
                if m:
                    month = int(m.group(1))
                    year_raw = m.group(2)
                    year = int(year_raw) + 2000 if len(year_raw) == 2 else int(year_raw)
                    if not (1 <= month <= 12):
                        raise PurchaseServiceError(
                            f"Item {idx + 1}: invalid expiry month {month} in '{raw_expiry}'"
                        )
                    from datetime import date as _date
                    expiry_date = _date(year, month, 1)
                else:
                    raise PurchaseServiceError(
                        f"Item {idx + 1}: unrecognised expiry date format '{raw_expiry}'. "
                        f"Use YYYY-MM-DD or MM/YY."
                    )
            batch_key = (batch_no, expiry_date)

            # Check if batch already exists in this transaction (batch_cache)
            if batch_key in batch_cache:
                batch = batch_cache[batch_key]
                # Merge: add qty_strips to existing batch
                batch.qty_strips += int(item_payload['actualQty'])
                batch.save(update_fields=['qty_strips'])
                logger.info(f"Merged batch {batch_no} (merged qty_strips to {batch.qty_strips})")
            else:
                # Check if batch exists in inventory for this outlet
                try:
                    batch = Batch.objects.get(
                        outlet=outlet,
                        batch_no=batch_no,
                        expiry_date=expiry_date,
                        product=master_product
                    )
                    # Merge: add to existing batch
                    batch.qty_strips += int(item_payload['actualQty'])
                    batch.save(update_fields=['qty_strips'])
                    logger.info(f"Merged existing batch {batch_no} (qty_strips now {batch.qty_strips})")
                except Batch.DoesNotExist:
                    # Create new batch
                    batch = Batch.objects.create(
                        outlet=outlet,
                        product=master_product,
                        batch_no=batch_no,
                        expiry_date=expiry_date,
                        mrp=Decimal(str(item_payload['mrp'])),
                        purchase_rate=Decimal(str(item_payload['purchaseRate'])),
                        sale_rate=Decimal(str(item_payload['saleRate'])),
                        qty_strips=int(item_payload['actualQty']),
                        qty_loose=0,
                        rack_location='',
                    )
                    logger.info(f"Created new batch {batch_no} with qty_strips={batch.qty_strips}")

                # Cache the batch for potential merging in this transaction
                batch_cache[batch_key] = batch

            # Create PurchaseItem (denormalized snapshot)
            purchase_item = PurchaseItem(
                invoice=purchase_invoice,
                batch=batch,
                master_product=master_product,
                custom_product_name=item_payload.get('customProductName'),
                is_custom_product=item_payload.get('isCustomProduct', False),
                hsn_code=item_payload.get('hsnCode'),
                batch_no=batch_no,
                expiry_date=expiry_date,
                pkg=int(item_payload['pkg']),
                qty=int(item_payload['qty']),
                actual_qty=int(item_payload['actualQty']),
                free_qty=int(item_payload.get('freeQty', 0)),
                purchase_rate=Decimal(str(item_payload['purchaseRate'])),
                discount_pct=Decimal(str(item_payload.get('discountPct', 0))),
                cash_discount_pct=Decimal(str(item_payload.get('cashDiscountPct', 0))),
                gst_rate=Decimal(str(item_payload.get('gstRate', 0))),
                cess=Decimal(str(item_payload.get('cess', 0))),
                mrp=Decimal(str(item_payload['mrp'])),
                ptr=Decimal(str(item_payload['ptr'])),
                pts=Decimal(str(item_payload['pts'])),
                sale_rate=Decimal(str(item_payload['saleRate'])),
                taxable_amount=Decimal(str(item_payload['taxableAmount'])),
                gst_amount=Decimal(str(item_payload['gstAmount'])),
                cess_amount=Decimal(str(item_payload.get('cessAmount', 0))),
                total_amount=Decimal(str(item_payload['totalAmount'])),
            )
            purchase_items.append(purchase_item)

        # Bulk create all PurchaseItems
        PurchaseItem.objects.bulk_create(purchase_items)
        logger.info(f"Created {len(purchase_items)} PurchaseItems")

        # ─── Step 6: Create LedgerEntry (append-only) ──────────────────────────────────
        # Query the last ledger entry for this distributor to calculate running balance
        last_ledger = LedgerEntry.objects.filter(
            outlet=outlet,
            distributor=distributor,
        ).order_by('-date', '-created_at').first()

        if last_ledger:
            running_balance = last_ledger.running_balance + grand_total
        else:
            # First entry for this distributor
            running_balance = grand_total

        ledger_entry = LedgerEntry.objects.create(
            outlet=outlet,
            entity_type='distributor',
            distributor=distributor,
            date=invoice_date.date(),
            entry_type='purchase',
            reference_no=purchase_invoice.invoice_no,
            description=f"Purchase from {distributor.name}",
            debit=grand_total,
            credit=Decimal('0'),
            running_balance=running_balance,
        )
        logger.info(f"Created LedgerEntry with running_balance={running_balance}")

        logger.info(f"Purchase {purchase_invoice.invoice_no} completed successfully")
        return purchase_invoice

    except PurchaseServiceError:
        # Re-raise our custom exceptions as-is
        raise
    except ValidationError as e:
        # Database/model validation errors
        logger.error(f"Validation error during purchase save: {e}")
        raise PurchaseServiceError(f"Validation error: {str(e)}")
    except Exception as e:
        # Unexpected errors
        logger.error(f"Unexpected error during purchase save: {e}", exc_info=True)
        raise PurchaseServiceError(f"Unexpected error: {str(e)}")


@transaction.atomic
def bill_by_bill_payment_allocate(payload: Dict[str, Any], outlet_id: str, created_by_id: str) -> PaymentEntry:
    """
    Atomically allocate a payment to specific purchase invoices (bill-by-bill, Marg-style).

    Validates that payment total matches sum of allocations, updates invoice outstanding/amount_paid,
    creates denormalized PaymentAllocation records, and creates a ledger credit entry.
    All operations are wrapped in transaction.atomic() — any failure rolls back entire transaction.

    Args:
        payload: Dict with keys:
            - distributorId: Distributor UUID
            - date: Payment date (ISO format string)
            - totalAmount: Total payment amount (Decimal or number)
            - paymentMode: Payment mode (cash/upi/card/cheque/bank_transfer)
            - allocations: List of {purchaseInvoiceId, allocatedAmount}
            - referenceNo: Optional (UTR/check/txn ID)
            - notes: Optional
        outlet_id: Outlet UUID
        created_by_id: Staff UUID who recorded payment

    Returns:
        Created PaymentEntry instance

    Raises:
        OverpaymentError: If allocations don't sum to totalAmount or invoice would be overpaid
        ValidationError: If validation fails
        Outlet.DoesNotExist: If outlet not found
        Distributor.DoesNotExist: If distributor not found
    """

    try:
        # ─── Step 1: Validate Outlet and Distributor ────────────────────────────────────
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            raise

        distributor_id = payload.get('distributorId')
        try:
            distributor = Distributor.objects.get(id=distributor_id, outlet=outlet)
        except Distributor.DoesNotExist:
            raise

        try:
            created_by = Staff.objects.get(id=created_by_id, outlet=outlet)
        except Staff.DoesNotExist:
            raise

        logger.info(
            f"Processing payment to {distributor.name} at outlet {outlet.name}: "
            f"₹{payload['totalAmount']}"
        )

        # ─── Step 2: Parse Payment Details ────────────────────────────────────────────────
        payment_date = timezone.datetime.fromisoformat(payload['date']).date()
        total_amount = Decimal(str(payload['totalAmount']))
        allocations = payload.get('allocations', [])

        if not allocations:
            raise OverpaymentError("Payment must have at least one allocation")

        # ─── Step 3: Validate Allocation Sum ──────────────────────────────────────────────
        allocation_sum = Decimal('0')
        invoices_to_update = {}  # Key: invoice_id, Value: (invoice, allocated_amount)

        for alloc in allocations:
            invoice_id = alloc.get('purchaseInvoiceId')
            allocated_amount = Decimal(str(alloc.get('allocatedAmount')))
            allocation_sum += allocated_amount

            # Fetch invoice and validate
            try:
                invoice = PurchaseInvoice.objects.get(id=invoice_id, outlet=outlet)
            except PurchaseInvoice.DoesNotExist:
                raise OverpaymentError(f"Invoice {invoice_id} not found for outlet")

            # Check for overpayment on this invoice
            if allocated_amount > invoice.outstanding:
                raise OverpaymentError(
                    f"Overpayment for invoice {invoice.invoice_no}: "
                    f"trying to allocate ₹{allocated_amount}, outstanding is ₹{invoice.outstanding}"
                )

            invoices_to_update[invoice_id] = (invoice, allocated_amount)

        # Validate total allocation matches payment amount
        if abs(float(allocation_sum) - float(total_amount)) > 0.01:
            raise OverpaymentError(
                f"Allocation sum (₹{allocation_sum}) must equal payment amount (₹{total_amount})"
            )

        logger.info(f"Validation passed: ₹{allocation_sum} allocated across {len(invoices_to_update)} invoices")

        # ─── Step 4: Create PaymentEntry ──────────────────────────────────────────────────
        payment_entry = PaymentEntry.objects.create(
            outlet=outlet,
            distributor=distributor,
            date=payment_date,
            total_amount=total_amount,
            payment_mode=payload.get('paymentMode'),
            reference_no=payload.get('referenceNo'),
            notes=payload.get('notes'),
            created_by=created_by,
        )

        logger.info(f"Created PaymentEntry {payment_entry.id}")

        # ─── Step 5: Update Invoices and Create PaymentAllocation Records ─────────────────
        payment_allocations = []

        for invoice_id, (invoice, allocated_amount) in invoices_to_update.items():
            # Snapshot invoice state BEFORE payment
            allocation_record = PaymentAllocation(
                payment=payment_entry,
                invoice=invoice,
                invoice_no=invoice.invoice_no,
                invoice_date=invoice.invoice_date,
                invoice_total=invoice.grand_total,
                current_outstanding=invoice.outstanding,
                allocated_amount=allocated_amount,
            )
            payment_allocations.append(allocation_record)

            # Update invoice outstanding and amount_paid
            invoice.outstanding = invoice.outstanding - allocated_amount
            invoice.amount_paid = invoice.amount_paid + allocated_amount
            invoice.save(update_fields=['outstanding', 'amount_paid'])

            logger.debug(
                f"Updated {invoice.invoice_no}: outstanding={invoice.outstanding}, "
                f"amount_paid={invoice.amount_paid}"
            )

        # Bulk create PaymentAllocation records
        PaymentAllocation.objects.bulk_create(payment_allocations)
        logger.info(f"Created {len(payment_allocations)} PaymentAllocation records")

        # ─── Step 6: Create LedgerEntry (Credit Entry) ────────────────────────────────────
        # Query the last ledger entry for this distributor to calculate running balance
        last_ledger = LedgerEntry.objects.filter(
            outlet=outlet,
            distributor=distributor,
        ).order_by('-date', '-created_at').first()

        if last_ledger:
            running_balance = last_ledger.running_balance - total_amount  # Credit reduces balance
        else:
            # First entry
            running_balance = -total_amount

        ledger_entry = LedgerEntry.objects.create(
            outlet=outlet,
            entity_type='distributor',
            distributor=distributor,
            date=payment_date,
            entry_type='payment',
            reference_no=str(payment_entry.id)[:20],
            description=f"Payment from distributor {distributor.name}",
            debit=Decimal('0'),
            credit=total_amount,
            running_balance=running_balance,
        )

        logger.info(f"Created LedgerEntry with running_balance={running_balance}")
        logger.info(f"Payment allocation completed successfully")

        return payment_entry

    except OverpaymentError as e:
        # Re-raise as-is
        logger.error(f"Overpayment error: {str(e)}", exc_info=True)
        raise
    except (Outlet.DoesNotExist, Distributor.DoesNotExist, Staff.DoesNotExist) as e:
        logger.error(f"Entity not found: {e}")
        raise
    except ValidationError as e:
        logger.error(f"Validation error during payment allocation: {e}")
        raise OverpaymentError(f"Validation error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during payment allocation: {e}", exc_info=True)
        raise OverpaymentError(f"Unexpected error: {str(e)}")
