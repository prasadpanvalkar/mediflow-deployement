import logging
import re
from datetime import date
from typing import List, Dict, Any, Optional
from datetime import datetime
from django.db import transaction

from apps.inventory.models import Batch, MasterProduct
from apps.core.models import Outlet
from apps.billing.models import SaleInvoice

logger = logging.getLogger(__name__)


class InsufficientStockError(Exception):
    """Raised when insufficient stock is available for the requested quantity."""
    pass


class ScheduleHViolationError(Exception):
    """Raised when Schedule H drug is attempted to be sold without doctor/patient details."""
    pass


def fefo_batch_select(outlet_id: str, product_id: str, qty_strips_needed: int) -> List[Dict[str, Any]]:
    """
    Select batches for a sale using FEFO (First Expiry, First Out) principle.

    Queries all available batches for the product at the outlet, ordered by expiry date,
    and allocates the requested quantity across multiple batches if needed. Never deducts
    stock — only selects and plans the deduction.

    Args:
        outlet_id: Outlet UUID
        product_id: MasterProduct UUID
        qty_strips_needed: Number of strips/packs to select

    Returns:
        List of dicts: [{'batch': Batch, 'qty_to_deduct': int}, ...]
        Ordered by expiry date (oldest first)

    Raises:
        InsufficientStockError: If total available stock < qty_strips_needed
    """

    try:
        # Validate outlet exists
        outlet = Outlet.objects.get(id=outlet_id)
    except Outlet.DoesNotExist:
        raise InsufficientStockError(f"Outlet {outlet_id} not found")

    try:
        # Validate product exists
        product = MasterProduct.objects.get(id=product_id)
    except MasterProduct.DoesNotExist:
        raise InsufficientStockError(f"Product {product_id} not found")

    # H4: SELECT FOR UPDATE locks matched batch rows for the duration of the
    # enclosing transaction.atomic() in the billing view.  Any concurrent bill
    # targeting the same batches will block here until this transaction commits
    # or rolls back, preventing the double-deduct race condition.
    today = datetime.now().date()
    batches = list(
        Batch.objects.select_for_update().filter(
            outlet=outlet,
            product=product,
            qty_strips__gt=0,
            expiry_date__gt=today,
            is_active=True,
        ).order_by('expiry_date')
    )

    # Evaluate total_available AFTER the lock so we see the committed
    # post-deduction quantities from any transaction that beat us here.
    total_available = sum(batch.qty_strips for batch in batches)

    logger.info(
        f"FEFO selection for product {product.name} at outlet {outlet.name}: "
        f"need {qty_strips_needed} strips, found {len(batches)} locked batches "
        f"with {total_available} total available"
    )

    if total_available < qty_strips_needed:
        raise InsufficientStockError(
            f"Insufficient stock for {product.name} — another bill may have used "
            f"the last units. Please refresh and retry. "
            f"(Required: {qty_strips_needed}, Available: {total_available})"
        )

    # Auto-split across batches (FEFO allocation)
    allocation = []
    remaining_qty = qty_strips_needed

    for batch in batches:
        if remaining_qty <= 0:
            break

        # Deduct as much as possible from this batch
        qty_from_batch = min(remaining_qty, batch.qty_strips)

        allocation.append({
            'batch': batch,
            'qty_to_deduct': qty_from_batch,
        })

        remaining_qty -= qty_from_batch

        logger.debug(
            f"  Batch {batch.batch_no} (exp: {batch.expiry_date}): "
            f"deduct {qty_from_batch}/{batch.qty_strips} strips"
        )

    logger.info(
        f"FEFO selection complete: allocated {qty_strips_needed} strips "
        f"across {len(allocation)} batch(es)"
    )

    return allocation


def schedule_h_validate(cart_items: List[Dict[str, Any]], schedule_h_data: Optional[Dict[str, Any]] = None) -> None:
    """
    Validate that Schedule H/H1/X/Narcotic drugs have required doctor and patient details.

    This validation must be called BEFORE any stock deduction occurs. If any Schedule H
    drug is present in the cart without complete doctor/patient details, raises an exception.

    Args:
        cart_items: List of cart item dicts, each with 'scheduleType' field
        schedule_h_data: Dict with doctor/patient details (patientName, patientAge,
                        patientAddress, doctorName, doctorRegNo, prescriptionNo)

    Raises:
        ScheduleHViolationError: If Schedule H drug lacks required details
    """

    # Controlled schedule types that require doctor/patient details
    CONTROLLED_SCHEDULES = {'G', 'H', 'H1', 'X', 'C', 'Narcotic'}

    # Check if cart contains any Schedule H drugs
    has_schedule_h = any(
        item.get('scheduleType') in CONTROLLED_SCHEDULES
        for item in cart_items
    )

    if not has_schedule_h:
        logger.debug("No Schedule H drugs in cart - validation passed")
        return

    # Schedule H drugs present - verify doctor/patient details exist
    if not schedule_h_data:
        raise ScheduleHViolationError(
            "Schedule H/H1/X/Narcotic drugs require doctor and patient details"
        )

    # Verify required fields are present and non-empty
    # prescriptionNo is optional — some pharmacies don't track it
    required_fields = ['patientName', 'patientAddress', 'doctorName', 'doctorRegNo']
    missing_fields = [f for f in required_fields if not (schedule_h_data.get(f) or '').strip()]

    # patientAge must be a positive number (0 is invalid)
    patient_age = schedule_h_data.get('patientAge')
    try:
        if not patient_age or int(patient_age) < 1:
            missing_fields.append('patientAge')
    except (TypeError, ValueError):
        missing_fields.append('patientAge')

    if missing_fields:
        raise ScheduleHViolationError(
            f"Incomplete Schedule H details. Missing: {', '.join(missing_fields)}"
        )

    logger.info(
        f"Schedule H validation passed for {len([i for i in cart_items if i.get('scheduleType') in CONTROLLED_SCHEDULES])} "
        f"controlled drug item(s) with complete doctor/patient details"
    )


def generate_invoice_number(outlet_id: str) -> str:
    """
    Generate the next sequential invoice number for an outlet with race-condition safety.

    Uses SELECT FOR UPDATE to atomically lock the last SaleInvoice row, ensuring
    concurrent multi-terminal billing doesn't create duplicate invoice numbers.
    Must be called inside transaction.atomic() block.

    Format: INV-YYYY-XXXXXX (e.g., INV-2026-000001, INV-2026-000002)

    Args:
        outlet_id: Outlet UUID

    Returns:
        Next sequential invoice number string

    Raises:
        Outlet.DoesNotExist: If outlet not found
    """

    try:
        outlet = Outlet.objects.get(id=outlet_id)
    except Outlet.DoesNotExist:
        raise

    logger.info(f"Generating invoice number for outlet {outlet.name}")

    # Get current year
    current_year = datetime.now().year

    # Query last invoice for this outlet with SELECT FOR UPDATE (row-level lock)
    # This ensures concurrent transactions wait for each other to avoid duplicate sequences
    last_invoice = (
        SaleInvoice.objects
        .filter(outlet=outlet)
        .select_for_update(skip_locked=False)  # Block until lock acquired
        .order_by('-invoice_date', '-created_at')
        .first()
    )

    if not last_invoice:
        # First invoice for this outlet this year
        sequence_num = 1
        logger.debug(f"No previous invoices for outlet {outlet.name} - starting at sequence 1")
    else:
        # Extract sequence number from last invoice_no (e.g., "INV-2026-000123" → 123)
        match = re.search(r'INV-(\d{4})-(\d+)', last_invoice.invoice_no)

        if not match:
            # Fallback if format doesn't match
            logger.warning(f"Last invoice {last_invoice.invoice_no} doesn't match expected format, resetting sequence")
            sequence_num = 1
        else:
            last_year = int(match.group(1))
            last_sequence = int(match.group(2))

            if last_year != current_year:
                # New year - reset sequence
                sequence_num = 1
                logger.debug(f"New year ({last_year} → {current_year}) - resetting sequence to 1")
            else:
                # Same year - increment sequence
                sequence_num = last_sequence + 1
                logger.debug(f"Incrementing sequence from {last_sequence} to {sequence_num}")

    # Format: INV-YYYY-XXXXXX (6-digit zero-padded sequence)
    invoice_number = f"INV-{current_year}-{sequence_num:06d}"

    logger.info(f"Generated invoice number: {invoice_number}")

    return invoice_number
