from django.db import transaction
from django.contrib.contenttypes.models import ContentType
from decimal import Decimal
from .models import StockLedger, Batch


def post_stock_ledger_entry(
    outlet,
    product,
    batch,
    txn_type,          # 'PURCHASE_IN', 'SALE_OUT', etc.
    txn_date,
    voucher_type,
    voucher_number,
    party_name,
    qty_in,
    qty_out,
    rate,
    source_object=None,
):
    """
    Append-only. Call inside transaction.atomic() from purchase/sale services.
    Computes running_qty using select_for_update() to prevent race conditions.
    """
    qty_in  = Decimal(str(qty_in))
    qty_out = Decimal(str(qty_out))
    rate    = Decimal(str(rate))

    # Lock last row for this outlet+product+batch to get correct running balance
    last_row = (
        StockLedger.objects
        .filter(outlet=outlet, product=product, batch=batch)
        .select_for_update()
        .order_by('-txn_date', '-created_at')
        .first()
    )

    prior_qty   = last_row.running_qty   if last_row else Decimal('0')
    prior_value = last_row.running_value if last_row else Decimal('0')

    new_running_qty   = prior_qty   + qty_in  - qty_out
    new_running_value = prior_value + (qty_in * rate) - (qty_out * rate)

    # Prepare GenericFK fields
    content_type = None
    object_id    = None
    if source_object is not None:
        content_type = ContentType.objects.get_for_model(source_object)
        object_id    = source_object.pk

    batch_number = batch.batch_no if batch else ''
    expiry_date  = batch.expiry_date  if batch else None

    entry = StockLedger.objects.create(
        outlet         = outlet,
        product        = product,
        batch          = batch,
        txn_type       = txn_type,
        txn_date       = txn_date,
        voucher_type   = voucher_type,
        voucher_number = str(voucher_number),
        party_name     = str(party_name),
        content_type   = content_type,
        object_id      = object_id,
        batch_number   = batch_number,
        expiry_date    = expiry_date,
        qty_in         = qty_in,
        qty_out        = qty_out,
        rate           = rate,
        value_in       = qty_in  * rate,
        value_out      = qty_out * rate,
        running_qty    = new_running_qty,
        running_value  = new_running_value,
    )
    return entry
