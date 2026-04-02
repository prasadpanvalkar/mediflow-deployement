"""
Atomic services for Phase 2 Batch 1:
 - create_receipt_payment   (customer receipt with invoice allocation)
 - create_expense_entry     (operational expense + ledger)
 - create_sales_return      (stock reversal + optional credit-note ledger)
 - generate_return_number   (race-safe RTN-YYYY-XXXXXX generation)
"""
import logging
import re
from decimal import Decimal
from typing import Any, Dict

from django.db import transaction
from django.db.models import Sum
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.core.models import Outlet
from apps.accounts.models import Staff, Customer
from apps.billing.models import (
    SaleInvoice,
    SaleItem,
    LedgerEntry,
    ReceiptEntry,
    ReceiptAllocation,
    ExpenseEntry,
    SalesReturn,
    SalesReturnItem,
)
from apps.inventory.models import Batch

logger = logging.getLogger(__name__)


class ReceiptServiceError(Exception):
    pass


class ExpenseServiceError(Exception):
    pass


class ReturnServiceError(Exception):
    pass


def _last_ledger_balance(outlet, customer=None, distributor=None) -> Decimal:
    """Return the most-recent running_balance for a customer or distributor ledger."""
    qs = LedgerEntry.objects.filter(outlet=outlet)
    if customer:
        qs = qs.filter(customer=customer, entity_type='customer')
    elif distributor:
        qs = qs.filter(distributor=distributor, entity_type='distributor')
    entry = qs.order_by('-date', '-created_at').first()
    return entry.running_balance if entry else Decimal('0')


def generate_return_number(outlet) -> str:
    """
    Generate next RTN-YYYY-XXXXXX return number using SELECT FOR UPDATE.
    Must be called inside transaction.atomic().
    """
    current_year = timezone.now().year
    last_return = (
        SalesReturn.objects
        .filter(outlet=outlet)
        .select_for_update(skip_locked=False)
        .order_by('-return_date', '-created_at')
        .first()
    )
    if not last_return:
        seq = 1
    else:
        match = re.search(r'RTN-(\d{4})-(\d+)', last_return.return_no)
        if not match:
            seq = 1
        else:
            last_year = int(match.group(1))
            last_seq = int(match.group(2))
            seq = 1 if last_year != current_year else last_seq + 1
    return f"RTN-{current_year}-{seq:06d}"


@transaction.atomic
def create_receipt_payment(payload: Dict[str, Any], outlet_id: str, created_by_id: str) -> ReceiptEntry:
    """
    Atomically record a customer receipt with bill-by-bill allocation.

    Steps:
    1. Validate outlet, customer, staff
    2. Validate sum(allocations) == totalAmount
    3. Validate each allocation <= saleInvoice.amount_due
    4. Create ReceiptEntry
    5. For each allocation: create ReceiptAllocation, update SaleInvoice.amount_paid += x,
       SaleInvoice.amount_due -= x
    6. Update Customer.outstanding -= totalAmount
    7. Create LedgerEntry (credit)
    """
    try:
        outlet = Outlet.objects.get(id=outlet_id)
    except Outlet.DoesNotExist:
        raise ReceiptServiceError(f"Outlet {outlet_id} not found")

    customer_id = payload.get('customerId')
    try:
        customer = Customer.objects.get(id=customer_id, outlet=outlet)
    except Customer.DoesNotExist:
        raise ReceiptServiceError(f"Customer {customer_id} not found")

    try:
        created_by = Staff.objects.get(id=created_by_id, outlet=outlet)
    except Staff.DoesNotExist:
        raise ReceiptServiceError(f"Staff {created_by_id} not found")

    total_amount = Decimal(str(payload['totalAmount']))
    allocations = payload.get('allocations', [])
    payment_date = timezone.datetime.fromisoformat(payload['date']).date()

    if not allocations:
        raise ReceiptServiceError("Receipt must have at least one allocation")

    # Validate allocations
    alloc_sum = Decimal('0')
    invoices_to_update = {}
    for alloc in allocations:
        inv_id = alloc.get('saleInvoiceId')
        alloc_amount = Decimal(str(alloc.get('allocatedAmount')))
        alloc_sum += alloc_amount

        try:
            invoice = SaleInvoice.objects.get(id=inv_id, outlet=outlet, customer=customer)
        except SaleInvoice.DoesNotExist:
            raise ReceiptServiceError(f"Sale invoice {inv_id} not found for this customer")

        if alloc_amount > invoice.amount_due:
            raise ReceiptServiceError(
                f"Overpayment for invoice {invoice.invoice_no}: "
                f"allocating ₹{alloc_amount}, outstanding is ₹{invoice.amount_due}"
            )
        invoices_to_update[str(inv_id)] = (invoice, alloc_amount)

    if abs(float(alloc_sum) - float(total_amount)) > 0.01:
        raise ReceiptServiceError(
            f"Allocation sum (₹{alloc_sum}) must equal receipt amount (₹{total_amount})"
        )

    # Create ReceiptEntry
    receipt = ReceiptEntry.objects.create(
        outlet=outlet,
        customer=customer,
        date=payment_date,
        total_amount=total_amount,
        payment_mode=payload.get('paymentMode'),
        reference_no=payload.get('referenceNo'),
        notes=payload.get('notes'),
        created_by=created_by,
    )

    # Create allocations + update invoices
    alloc_records = []
    for inv_id, (invoice, alloc_amount) in invoices_to_update.items():
        alloc_records.append(ReceiptAllocation(
            receipt=receipt,
            invoice=invoice,
            allocated_amount=alloc_amount,
        ))
        invoice.amount_paid = invoice.amount_paid + alloc_amount
        invoice.amount_due = invoice.amount_due - alloc_amount
        invoice.save(update_fields=['amount_paid', 'amount_due'])

    ReceiptAllocation.objects.bulk_create(alloc_records)

    # Update customer outstanding
    customer.outstanding = customer.outstanding - total_amount
    if customer.outstanding < Decimal('0'):
        customer.outstanding = Decimal('0')
    customer.save(update_fields=['outstanding'])

    # Create LedgerEntry
    prev_balance = _last_ledger_balance(outlet, customer=customer)
    LedgerEntry.objects.create(
        outlet=outlet,
        entity_type='customer',
        customer=customer,
        date=payment_date,
        entry_type='receipt',
        reference_no=str(receipt.id)[:20],
        description=f"Receipt from {customer.name}",
        debit=Decimal('0'),
        credit=total_amount,
        running_balance=prev_balance - total_amount,
    )

    logger.info(f"Receipt {receipt.id} created for customer {customer.name}: ₹{total_amount}")
    return receipt


@transaction.atomic
def create_expense_entry(payload: Dict[str, Any], outlet_id: str, created_by_id: str) -> ExpenseEntry:
    """
    Atomically create an expense entry.
    If expense_head='other', customHead is required.
    """
    try:
        outlet = Outlet.objects.get(id=outlet_id)
    except Outlet.DoesNotExist:
        raise ExpenseServiceError(f"Outlet {outlet_id} not found")

    try:
        created_by = Staff.objects.get(id=created_by_id, outlet=outlet)
    except Staff.DoesNotExist:
        raise ExpenseServiceError(f"Staff {created_by_id} not found")

    expense_head = payload.get('expenseHead', '')
    custom_head = payload.get('customHead')

    if expense_head == 'other' and not custom_head:
        raise ExpenseServiceError("customHead is required when expenseHead is 'other'")

    expense_date = timezone.datetime.fromisoformat(payload['date']).date()
    amount = Decimal(str(payload['amount']))

    expense = ExpenseEntry.objects.create(
        outlet=outlet,
        date=expense_date,
        expense_head=expense_head,
        custom_head=custom_head,
        amount=amount,
        payment_mode=payload.get('paymentMode'),
        reference_no=payload.get('referenceNo'),
        notes=payload.get('notes'),
        created_by=created_by,
    )

    logger.info(f"Expense {expense.id} created: {expense_head} ₹{amount}")
    return expense


@transaction.atomic
def create_sales_return(payload: Dict[str, Any], outlet_id: str, created_by_id: str) -> SalesReturn:
    """
    Atomically create a sales return with stock reversal.

    Steps:
    1. Validate original sale exists and belongs to outlet
    2. Validate qty_returned <= original SaleItem.qty_strips for each item
    3. Generate return_no with SELECT FOR UPDATE
    4. Create SalesReturn + SalesReturnItems
    5. Reverse stock: batch.qty_strips += qty_returned
    6. Increment SaleItem.qty_returned for each returned line (C10)
    7. Reverse the double-entry journal atomically (C1)
    8. If refundMode='credit_note' → update customer.outstanding -= totalAmount
       + create LedgerEntry
    """
    try:
        outlet = Outlet.objects.get(id=outlet_id)
    except Outlet.DoesNotExist:
        raise ReturnServiceError(f"Outlet {outlet_id} not found")

    try:
        created_by = Staff.objects.get(id=created_by_id, outlet=outlet)
    except Staff.DoesNotExist:
        raise ReturnServiceError(f"Staff {created_by_id} not found")

    original_sale_id = payload.get('originalSaleId')
    try:
        original_sale = SaleInvoice.objects.get(id=original_sale_id, outlet=outlet)
    except SaleInvoice.DoesNotExist:
        raise ReturnServiceError(f"Sale invoice {original_sale_id} not found for this outlet")

    items_payload = payload.get('items', [])
    if not items_payload:
        raise ReturnServiceError("Return must have at least one item")

    return_date = timezone.datetime.fromisoformat(payload['returnDate']).date()
    refund_mode = payload.get('refundMode', 'cash')

    # Validate each item and collect data
    items_to_create = []
    total_amount = Decimal('0')

    for item_data in items_payload:
        sale_item_id = item_data.get('saleItemId')
        batch_id = item_data.get('batchId')
        qty_returned = int(item_data.get('qtyReturned', item_data.get('qty', 0)))
        return_rate = Decimal(str(item_data.get('returnRate', 0)))

        try:
            sale_item = SaleItem.objects.get(id=sale_item_id, invoice=original_sale)
        except SaleItem.DoesNotExist:
            raise ReturnServiceError(f"SaleItem {sale_item_id} not found on invoice {original_sale_id}")

        # C8: guard against over-returning across multiple return transactions
        already_returned = sale_item.qty_returned  # tracked by C10's field
        
        # Calculate total units (tablets/capsules) originally sold
        pack_size = sale_item.pack_size or 1
        original_total_units = (sale_item.qty_strips * pack_size) + sale_item.qty_loose
        
        if qty_returned + already_returned > original_total_units:
            raise ReturnServiceError(
                f"Cannot return {qty_returned} unit(s) of '{sale_item.product_name}'. "
                f"Original qty: {original_total_units}, already returned: {already_returned}."
            )

        try:
            batch = Batch.objects.get(id=batch_id, outlet=outlet)
        except Batch.DoesNotExist:
            raise ReturnServiceError(f"Batch {batch_id} not found")

        item_total = return_rate * (Decimal(str(qty_returned)) / Decimal(str(pack_size)))
        item_total = item_total.quantize(Decimal('0.01'))
        total_amount += item_total

        items_to_create.append({
            'sale_item': sale_item,
            'batch': batch,
            'product_name': sale_item.product_name,
            'batch_no': sale_item.batch_no,
            'qty_returned': qty_returned,
            'return_rate': return_rate,
            'total_amount': item_total,
        })

    # Generate return number (SELECT FOR UPDATE inside atomic)
    return_no = generate_return_number(outlet)

    # Create SalesReturn
    sales_return = SalesReturn.objects.create(
        outlet=outlet,
        original_sale=original_sale,
        return_no=return_no,
        return_date=return_date,
        reason=payload.get('reason', ''),
        total_amount=total_amount,
        refund_mode=refund_mode,
        created_by=created_by,
    )

    # C1: all mutations are inside the @transaction.atomic decorator —
    # any failure (including journal reversal) rolls back everything atomically.

    # Create items, reverse stock, and update per-item qty_returned (C10)
    return_items = []
    for item_data in items_to_create:
        return_items.append(SalesReturnItem(
            sales_return=sales_return,
            original_sale_item=item_data['sale_item'],
            batch=item_data['batch'],
            product_name=item_data['product_name'],
            batch_no=item_data['batch_no'],
            qty_returned=item_data['qty_returned'],
            return_rate=item_data['return_rate'],
            total_amount=item_data['total_amount'],
        ))
        # Reverse stock (The Strip Builder Logic!)
        batch = item_data['batch']
        
        # 1. We must get the pack size (how many tablets fit in a strip)
        # We use select_related or fetch it safely
        pack_size = batch.product.pack_size or 1
        
        # 2. Add the returned tablets directly to the loose tray first
        batch.qty_loose += item_data['qty_returned']
        
        # 3. MAGIC: If the loose tray has enough to make a full box, seal it up!
        while batch.qty_loose >= pack_size:
            batch.qty_strips += 1
            batch.qty_loose -= pack_size
            
        # Save BOTH fields to the database
        batch.save(update_fields=['qty_strips', 'qty_loose'])
        # C10: track how much of this line item has been returned
        sale_item = item_data['sale_item']
        sale_item.qty_returned += item_data['qty_returned']
        sale_item.save(update_fields=['qty_returned'])

    SalesReturnItem.objects.bulk_create(return_items)

    # Handle credit note
    if refund_mode == 'credit_note' and original_sale.customer:
        customer = original_sale.customer
        customer.outstanding = max(Decimal('0'), customer.outstanding - total_amount)
        customer.save(update_fields=['outstanding'])

        prev_balance = _last_ledger_balance(outlet, customer=customer)
        LedgerEntry.objects.create(
            outlet=outlet,
            entity_type='customer',
            customer=customer,
            date=return_date,
            entry_type='credit_note',
            reference_no=return_no,
            description=f"Sales return {return_no} - credit note",
            debit=Decimal('0'),
            credit=total_amount,
            running_balance=prev_balance - total_amount,
        )

    # C1: Reverse the double-entry journal for the original sale.
    # This runs inside the @transaction.atomic decorator, so any exception
    # here rolls back the SalesReturn, stock changes, and qty_returned updates.
    from apps.accounts.journal_service import reverse_journal
    reverse_journal('SALE', original_sale.id, str(outlet.id))

    logger.info(f"SalesReturn {return_no} created: ₹{total_amount}")
    return sales_return
