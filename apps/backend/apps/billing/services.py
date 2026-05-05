import logging
import re
from datetime import date
from typing import List, Dict, Any, Optional
from datetime import datetime
from decimal import Decimal, ROUND_FLOOR
from django.db import transaction

from apps.inventory.models import Batch, MasterProduct
from apps.core.models import Outlet
from apps.billing.models import SaleInvoice, SaleItem, ScheduleHRegister, CreditTransaction, CreditAccount, PaymentEntry, PaymentAllocation, LedgerEntry
from apps.accounts.models import Staff, Customer, Ledger, JournalEntry
from apps.accounts.services import LedgerService
from apps.accounts.journal_service import post_sale_invoice
from apps.billing.utils.pricing import validate_sale_price

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
from django.db import transaction

from apps.inventory.models import Batch, MasterProduct

class SaleServiceError(Exception):
    pass

def rebuild_customer_ledger(outlet_id: str, customer_id: str, from_date: date):
    """Recalculate running_balance for a customer from a specific date."""
    entries = LedgerEntry.objects.filter(
        outlet_id=outlet_id, 
        customer_id=customer_id, 
        date__gte=from_date
    ).order_by('date', 'created_at')
    
    prev = LedgerEntry.objects.filter(
        outlet_id=outlet_id, 
        customer_id=customer_id, 
        date__lt=from_date
    ).order_by('-date', '-created_at').first()
    
    running = prev.running_balance if prev else Decimal('0')
    
    for entry in entries:
        running = running + entry.debit - entry.credit
        LedgerEntry.objects.filter(pk=entry.pk).update(running_balance=running)

@transaction.atomic
def atomic_sale_update(sale_id: str, payload: Dict[str, Any], outlet_id: str, updated_by_id: str) -> SaleInvoice:
    try:
        # Step 1: Validate and get SaleInvoice
        outlet = Outlet.objects.get(id=outlet_id)
        try:
            sale_invoice = SaleInvoice.objects.select_for_update().get(id=sale_id, outlet=outlet)
        except SaleInvoice.DoesNotExist:
            raise SaleServiceError(f"Sale {sale_id} not found")
        
        # Determine Billed By
        try:
            billed_by = Staff.objects.get(id=updated_by_id)
        except Staff.DoesNotExist:
            billed_by = None
            
        items_data = payload.get('items', [])
        schedule_h_data = payload.get('scheduleHData')
        client_grand_total = Decimal(str(payload.get('grandTotal', 0)))
        extra_discount_pct = Decimal(str(payload.get('extraDiscountPct', 0)))

        # Enforce max discount
        if billed_by:
            staff_max_discount = billed_by.max_discount
            for item_data in items_data:
                item_disc = Decimal(str(item_data.get('discountPct', 0)))
                if item_disc > staff_max_discount:
                    raise SaleServiceError(f"Discount {item_disc}% exceeds your maximum allowed discount of {staff_max_discount}%")

        # Validate payments
        cash_paid_val = Decimal(str(payload.get('cashPaid', 0)))
        upi_paid_val = Decimal(str(payload.get('upiPaid', 0)))
        card_paid_val = Decimal(str(payload.get('cardPaid', 0)))
        credit_given_val = Decimal(str(payload.get('creditGiven', 0)))
        payment_sum = cash_paid_val + upi_paid_val + card_paid_val + credit_given_val
        if abs(payment_sum - client_grand_total) > Decimal('0.01'):
            raise SaleServiceError(f"Payment amounts ({payment_sum}) do not match grand total ({client_grand_total})")

        # Step 2: Validate Schedule H
        cart_items = [{'scheduleType': item.get('scheduleType', 'OTC')} for item in items_data]
        try:
            schedule_h_validate(cart_items, schedule_h_data)
        except Exception as e:
            raise SaleServiceError(str(e))

        # Step 3: Identify new Customer
        party_ledger_id = payload.get('partyLedgerId')
        customer_id = payload.get('customerId')
        new_customer = None
        if party_ledger_id:
            try:
                party_ledger = Ledger.objects.select_related('linked_customer').get(id=party_ledger_id, outlet=outlet)
                if party_ledger.linked_customer:
                    new_customer = party_ledger.linked_customer
            except Ledger.DoesNotExist:
                raise SaleServiceError(f"Ledger {party_ledger_id} not found")
        elif customer_id:
            try:
                new_customer = Customer.objects.get(id=customer_id, outlet=outlet)
            except Customer.DoesNotExist:
                raise SaleServiceError(f"Customer {customer_id} not found")

        # Step 4: Revert old items and restore Batch stock
        old_items = sale_invoice.items.all()
        for old_item in old_items:
            batch = old_item.batch
            batch.qty_strips += old_item.qty_strips
            batch.qty_loose += old_item.qty_loose
            if batch.product.pack_size:
                while batch.qty_loose >= batch.product.pack_size:
                    batch.qty_strips += 1
                    batch.qty_loose -= batch.product.pack_size
            batch.save(update_fields=['qty_strips', 'qty_loose'])
            old_item.delete()

        # Step 5: Revert old accounting
        old_customer = sale_invoice.customer
        if old_customer:
            old_customer.total_purchases -= sale_invoice.grand_total
            old_customer.save(update_fields=['total_purchases'])

        # Reverse CreditTransaction
        old_credit_txs = CreditTransaction.objects.filter(invoice=sale_invoice)
        for tx in old_credit_txs:
            account = tx.credit_account
            account.total_outstanding -= tx.amount
            if tx.type == 'debit':
                account.total_borrowed -= tx.amount
            account.save(update_fields=['total_outstanding', 'total_borrowed'])
            tx.delete()

        # Reverse JournalEntry
        old_jes = JournalEntry.objects.filter(outlet=outlet, source_type='SALE', source_id=sale_invoice.id)
        for old_je in old_jes:
            for line in old_je.lines.all():
                LedgerService.update_balance(line.ledger.id, debit=line.credit_amount, credit=line.debit_amount)
            old_je.delete()

        # Step 6: Create new items and deduct stock
        sale_items = []
        for item_data in items_data:
            batch_id = item_data.get('batchId')
            product_id = item_data.get('productId')
            qty_strips_needed = item_data.get('qtyStrips', 0)
            qty_loose_needed = item_data.get('qtyLoose', 0)

            product = MasterProduct.objects.get(id=product_id)
            if batch_id:
                batch = Batch.objects.get(id=batch_id, outlet=outlet)
                total_loose_needed = (qty_strips_needed * (product.pack_size or 1)) + qty_loose_needed
                total_loose_available = (batch.qty_strips * (product.pack_size or 1)) + batch.qty_loose
                if total_loose_available < total_loose_needed:
                    raise SaleServiceError(f"Insufficient stock in batch {batch.batch_no}")
                batch_allocations = [{'batch': batch, 'qty_to_deduct': qty_strips_needed, 'loose_to_deduct': qty_loose_needed}]
            else:
                try:
                    batch_allocations = fefo_batch_select(str(outlet.id), str(product.id), qty_strips_needed)
                except Exception as e:
                    raise SaleServiceError(str(e))
                
            for batch_alloc in batch_allocations:
                batch = batch_alloc['batch']
                qty_to_deduct = batch_alloc.get('qty_to_deduct', 0)
                loose_to_deduct = batch_alloc.get('loose_to_deduct', 0)
                batch.qty_strips -= qty_to_deduct
                batch.qty_loose -= loose_to_deduct
                while batch.qty_loose < 0:
                    batch.qty_strips -= 1
                    batch.qty_loose += (product.pack_size or 1)
                batch.save()

                proposed_rate = Decimal(str(item_data.get('rate', batch.sale_rate)))
                pricing_check = validate_sale_price(proposed_rate, batch, str(outlet.id))
                if pricing_check.get('block'):
                    raise SaleServiceError(pricing_check['message'])

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
                    rate=proposed_rate,
                    qty_strips=qty_to_deduct,
                    qty_loose=loose_to_deduct, # Fix: Use loose_to_deduct
                    sale_mode=item_data.get('saleMode', 'strip'),
                    discount_pct=Decimal(str(item_data.get('discountPct', 0))),
                    gst_rate=Decimal(str(item_data.get('gstRate', 0))),
                    taxable_amount=Decimal(str(item_data.get('taxableAmount', 0))),
                    gst_amount=Decimal(str(item_data.get('gstAmount', 0))),
                    total_amount=Decimal(str(item_data.get('totalAmount', 0))),
                )
                sale_items.append(sale_item)

                from apps.inventory.services import post_stock_ledger_entry
                deducted_qty = qty_to_deduct + (Decimal(str(loose_to_deduct)) / Decimal(str(product.pack_size or 1)) if loose_to_deduct else 0)
                post_stock_ledger_entry(
                    outlet         = sale_invoice.outlet,
                    product        = batch.product,
                    batch          = batch,
                    txn_type       = 'SALE_OUT',
                    txn_date       = invoice_date.date() if 'invoice_date' in locals() and hasattr(invoice_date, 'date') else sale_invoice.invoice_date.date() if hasattr(sale_invoice.invoice_date, 'date') else sale_invoice.invoice_date,
                    voucher_type   = 'Sale Invoice',
                    voucher_number = sale_invoice.invoice_no,
                    party_name     = new_customer.name if new_customer else 'Walk-in',
                    qty_in         = 0,
                    qty_out        = deducted_qty,
                    rate           = sale_item.rate,
                    source_object  = sale_item,
                )

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

        # Step 7: Update SaleInvoice
        if payload.get('invoiceDate'):
            invoice_date_str = payload['invoiceDate'].rstrip('Z').split('+')[0]
            invoice_date = datetime.fromisoformat(invoice_date_str)
        else:
            invoice_date = sale_invoice.invoice_date
        
        sale_invoice.customer = new_customer
        sale_invoice.invoice_date = invoice_date
        sale_invoice.subtotal = Decimal(str(payload.get('subtotal', 0)))
        sale_invoice.discount_amount = Decimal(str(payload.get('discountAmount', 0)))
        sale_invoice.extra_discount_pct = extra_discount_pct
        sale_invoice.payment_mode = payload.get('paymentMode', 'cash')
        sale_invoice.cash_paid = cash_paid_val
        sale_invoice.upi_paid = upi_paid_val
        sale_invoice.card_paid = card_paid_val
        sale_invoice.credit_given = credit_given_val
        sale_invoice.amount_paid = cash_paid_val + upi_paid_val + card_paid_val
        sale_invoice.amount_due = max(Decimal('0'), client_grand_total - sale_invoice.amount_paid)
        sale_invoice.grand_total = client_grand_total
        sale_invoice.billed_by = billed_by

        # Step 8: Re-derive GST
        discount_factor = Decimal('1') - extra_discount_pct / Decimal('100')
        server_taxable = Decimal('0')
        server_cgst = Decimal('0')
        server_sgst = Decimal('0')
        server_igst = Decimal('0')
        max_gst_rate = Decimal('0')

        for si in sale_items:
            pack_size = Decimal(str(si.pack_size)) if si.pack_size else Decimal('1')
            total_fractional_strips = Decimal(str(si.qty_strips)) + (Decimal(str(si.qty_loose)) / pack_size)
            raw_total = si.rate * total_fractional_strips
            discounted_total = (raw_total * discount_factor).quantize(Decimal('0.01'))
            gst_rate = si.gst_rate
            if gst_rate > 0:
                item_taxable = (discounted_total * Decimal('100') / (Decimal('100') + gst_rate)).quantize(Decimal('0.01'))
                item_gst = discounted_total - item_taxable
            else:
                item_taxable = discounted_total
                item_gst = Decimal('0')
            server_taxable += item_taxable
            item_cgst = (item_gst / 2).quantize(Decimal('0.01'), rounding=ROUND_FLOOR)
            item_sgst = item_gst - item_cgst
            server_cgst += item_cgst
            server_sgst += item_sgst
            if gst_rate > max_gst_rate:
                max_gst_rate = gst_rate

        raw_exact = server_taxable + server_cgst + server_sgst + server_igst
        server_round_off = client_grand_total - raw_exact

        sale_invoice.taxable_amount = server_taxable
        sale_invoice.cgst_amount = server_cgst
        sale_invoice.sgst_amount = server_sgst
        sale_invoice.igst_amount = server_igst
        sale_invoice.cgst = max_gst_rate / 2 if max_gst_rate > 0 else Decimal('0')
        sale_invoice.sgst = max_gst_rate / 2 if max_gst_rate > 0 else Decimal('0')
        sale_invoice.round_off = server_round_off
        sale_invoice.save()

        # Step 9: Credit Transactions
        if credit_given_val > 0 and new_customer:
            credit_account, _ = CreditAccount.objects.get_or_create(outlet=outlet, customer=new_customer)
            credit_account.total_outstanding += credit_given_val
            credit_account.total_borrowed += credit_given_val
            credit_account.last_transaction_date = datetime.now()
            credit_account.save()

            CreditTransaction.objects.create(
                credit_account=credit_account,
                customer=new_customer,
                invoice=sale_invoice,
                type='debit',
                amount=credit_given_val,
                description=f'Sale on {sale_invoice.invoice_no}',
                balance_after=credit_account.total_outstanding,
                recorded_by=billed_by,
                date=invoice_date.date(),
            )

        if new_customer:
            new_customer.total_purchases += sale_invoice.grand_total
            new_customer.save(update_fields=['total_purchases'])

            # Ledger entries
            invoice_d = invoice_date.date()
            
            # Sale Entry
            sale_entry = LedgerEntry.objects.filter(outlet=outlet, entity_type='customer', entry_type='sale', reference_no=sale_invoice.invoice_no).first()
            if sale_entry:
                LedgerEntry.objects.filter(pk=sale_entry.pk).update(
                    debit=sale_invoice.grand_total,
                    date=invoice_d,
                    customer=new_customer
                )
            else:
                last_ledger = LedgerEntry.objects.filter(outlet=outlet, customer=new_customer, date__lte=invoice_d).order_by('-date', '-created_at').first()
                running = (last_ledger.running_balance if last_ledger else Decimal('0')) + sale_invoice.grand_total
                LedgerEntry.objects.create(
                    outlet=outlet, entity_type='customer', customer=new_customer, date=invoice_d,
                    entry_type='sale', reference_no=sale_invoice.invoice_no, debit=sale_invoice.grand_total, credit=Decimal('0'), running_balance=running
                )
            
            # Receipt Entry
            total_paid = sale_invoice.amount_paid
            receipt_entry = LedgerEntry.objects.filter(outlet=outlet, entity_type='customer', entry_type='receipt', reference_no=sale_invoice.invoice_no).first()
            
            if total_paid > Decimal('0'):
                if receipt_entry:
                    LedgerEntry.objects.filter(pk=receipt_entry.pk).update(
                        credit=total_paid, date=invoice_d, customer=new_customer
                    )
                else:
                    # we will rebuild running balance anyway
                    LedgerEntry.objects.create(
                        outlet=outlet, entity_type='customer', customer=new_customer, date=invoice_d,
                        entry_type='receipt', reference_no=sale_invoice.invoice_no, debit=Decimal('0'), credit=total_paid, running_balance=Decimal('0')
                    )
            elif receipt_entry:
                # Need to delete the receipt entry. But since it's append-only, we can do `.all().delete()`
                LedgerEntry.objects.filter(pk=receipt_entry.pk).delete()

            rebuild_customer_ledger(str(outlet.id), str(new_customer.id), invoice_d)
            if old_customer and old_customer.id != new_customer.id:
                rebuild_customer_ledger(str(outlet.id), str(old_customer.id), min(invoice_d, old_customer.created_at.date()))

        # Post journal
        post_sale_invoice(sale_invoice)

        return sale_invoice

    except SaleServiceError:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise SaleServiceError(f"Unexpected error: {str(e)}")
