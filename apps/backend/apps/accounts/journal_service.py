"""
Journal Service: Auto-posts double-entry accounting journal entries
for sales, purchases, vouchers, and credit payment collections.

All functions use transaction.atomic() for all-or-nothing consistency.
"""

import logging
from decimal import Decimal

from django.db import transaction

from apps.accounts.models import JournalEntry, JournalLine, Ledger
from apps.accounts.services import LedgerService

logger = logging.getLogger(__name__)


def _get_ledger(outlet, name):
    """
    Fetch a system ledger by name within an outlet.
    Raises Ledger.DoesNotExist with a clear message if not found.
    """
    try:
        return Ledger.objects.select_for_update().get(outlet=outlet, name=name)
    except Ledger.DoesNotExist:
        raise Ledger.DoesNotExist(
            f"Ledger '{name}' not found for outlet '{outlet.name}' ({outlet.id}). "
            f"Run: python manage.py seed_ledgers"
        )


def _get_customer_ledger(outlet, customer):
    """Fetch the Sundry Debtors ledger for a customer (via linked_customer FK)."""
    if not customer:
        return None
    return Ledger.objects.select_for_update().filter(
        outlet=outlet, linked_customer=customer
    ).first()


def _get_distributor_ledger(outlet, distributor):
    """Fetch the Sundry Creditors ledger for a distributor (via linked_distributor FK)."""
    if not distributor:
        return None
    return Ledger.objects.select_for_update().filter(
        outlet=outlet, linked_distributor=distributor
    ).first()


def _guard_double_posting(outlet, source_type, source_id):
    """
    Check if JournalEntry already exists for this transaction.
    Returns True if entry exists (prevent double-posting), False if safe to post.
    """
    return JournalEntry.objects.filter(
        outlet=outlet, source_type=source_type, source_id=source_id
    ).exists()


def _create_lines_and_update_balances(je, lines):
    """Create JournalLines and update ledger current_balance for each line."""
    for line_type, ledger, amount in lines:
        if line_type == 'debit':
            JournalLine.objects.create(
                journal_entry=je,
                ledger=ledger,
                debit_amount=amount,
                credit_amount=Decimal('0')
            )
            LedgerService.update_balance(ledger.id, amount, Decimal('0'))
        else:  # credit
            JournalLine.objects.create(
                journal_entry=je,
                ledger=ledger,
                debit_amount=Decimal('0'),
                credit_amount=amount
            )
            LedgerService.update_balance(ledger.id, Decimal('0'), amount)


@transaction.atomic
def post_sale_invoice(sale_invoice):
    """
    Post a sale invoice to the general ledger.
    Uses individual payment fields (cash_paid, upi_paid, card_paid, credit_given)
    to support any split-payment combination.

    GST amounts are read DIRECTLY from the invoice — never recalculated.
    IGST is posted for interstate sales; CGST+SGST for intrastate.

    Discount treatment: taxable_amount is already post-discount (net-of-discount
    approach). No separate Sales Discount Account entry is made, which is the
    standard practice for Indian retail pharmacy accounting.

    Journal entry (intrastate, split-payment example):
      Dr. Cash                      invoice.cash_paid         [if > 0]
      Dr. UPI Collections           invoice.upi_paid          [if > 0]
      Dr. Card/POS Settlement       invoice.card_paid         [if > 0]
      Dr. Customer Ledger           invoice.credit_given      [if > 0]
      Cr. Sales Account             invoice.taxable_amount
      Cr. GST Payable CGST          invoice.cgst_amount       [intrastate]
      Cr. GST Payable SGST          invoice.sgst_amount       [intrastate]
      -- OR (interstate) --
      Cr. GST Payable IGST          invoice.igst_amount
    """
    try:
        outlet = sale_invoice.outlet

        # Guard against double-posting
        if _guard_double_posting(outlet, 'SALE', sale_invoice.id):
            logger.info(f"Sale {sale_invoice.id} already journaled, skipping")
            return

        # Read all amounts directly from the invoice — never recalculate
        taxable_amount = sale_invoice.taxable_amount or Decimal('0')
        cgst_amount = sale_invoice.cgst_amount or Decimal('0')
        sgst_amount = sale_invoice.sgst_amount or Decimal('0')
        igst_amount = sale_invoice.igst_amount or Decimal('0')
        grand_total = sale_invoice.grand_total or Decimal('0')
        cash_paid = sale_invoice.cash_paid or Decimal('0')
        upi_paid = sale_invoice.upi_paid or Decimal('0')
        card_paid = sale_invoice.card_paid or Decimal('0')
        credit_given = sale_invoice.credit_given or Decimal('0')
        round_off = sale_invoice.round_off or Decimal('0')

        lines = []

        # ── DEBIT side: one entry per payment method used ──
        if cash_paid > 0:
            cash_ledger = _get_ledger(outlet, 'Cash')
            lines.append(('debit', cash_ledger, cash_paid))

        if upi_paid > 0:
            upi_ledger = _get_ledger(outlet, 'UPI Collections')
            lines.append(('debit', upi_ledger, upi_paid))

        if card_paid > 0:
            card_ledger = _get_ledger(outlet, 'Card/POS Settlement')
            lines.append(('debit', card_ledger, card_paid))

        if credit_given > 0:
            customer_ledger = _get_customer_ledger(outlet, sale_invoice.customer)
            if customer_ledger:
                lines.append(('debit', customer_ledger, credit_given))
            else:
                raise ValueError(
                    f"Sale {sale_invoice.id}: credit_given={credit_given} but no customer "
                    f"ledger found for customer {sale_invoice.customer_id}. "
                    f"Run sync_customer_ledgers first."
                )

        # ── CREDIT side: Sales Account + GST ──
        sales_ledger = _get_ledger(outlet, 'Sales Account')
        lines.append(('credit', sales_ledger, taxable_amount))

        if igst_amount > 0:
            # Interstate sale — post to IGST ledger only (not CGST + SGST)
            igst_ledger = _get_ledger(outlet, 'GST Payable IGST')
            lines.append(('credit', igst_ledger, igst_amount))
        elif cgst_amount > 0 or sgst_amount > 0:
            # Intrastate sale — post CGST and SGST separately
            if cgst_amount > 0:
                cgst_ledger = _get_ledger(outlet, 'GST Payable CGST')
                lines.append(('credit', cgst_ledger, cgst_amount))
            if sgst_amount > 0:
                sgst_ledger = _get_ledger(outlet, 'GST Payable SGST')
                lines.append(('credit', sgst_ledger, sgst_amount))
        # else: 0% GST medicine — no GST posting needed

        # ── Handle round_off for double-entry balance ──
        # grand_total = taxable + gst + round_off
        # Debit side = grand_total (what customer pays)
        # Credit side = taxable + gst (= grand_total - round_off)
        # Gap = round_off must be posted to Round Off account to balance the entry.
        if round_off > 0:
            # Invoice rounded UP: customer paid more than exact → shop gains → Cr Round Off
            round_off_ledger = _get_ledger(outlet, 'Round Off')
            lines.append(('credit', round_off_ledger, round_off))
        elif round_off < 0:
            # Invoice rounded DOWN: customer paid less than exact → shop absorbs → Dr Round Off
            round_off_ledger = _get_ledger(outlet, 'Round Off')
            lines.append(('debit', round_off_ledger, abs(round_off)))

        # ── Verify double-entry balance (strict — all amounts must balance) ──
        total_debit = sum(amt for t, _, amt in lines if t == 'debit')
        total_credit = sum(amt for t, _, amt in lines if t == 'credit')
        if abs(total_debit - total_credit) > Decimal('0.01'):
            raise ValueError(
                f"Sale {sale_invoice.id}: double-entry imbalance — "
                f"Dr ₹{total_debit} vs Cr ₹{total_credit} "
                f"(round_off={round_off}, taxable={taxable_amount}, "
                f"cgst={cgst_amount}, sgst={sgst_amount}, igst={igst_amount}, "
                f"grand_total={grand_total}). "
                f"Check that invoice amounts sum to grand_total correctly."
            )

        # ── Create JournalEntry ──
        invoice_date = sale_invoice.invoice_date
        entry_date = invoice_date.date() if hasattr(invoice_date, 'date') else invoice_date
        narration = f"Sale Invoice {sale_invoice.invoice_no} on {entry_date}"
        je = JournalEntry.objects.create(
            outlet=outlet,
            source_type='SALE',
            source_id=sale_invoice.id,
            date=entry_date,
            narration=narration
        )

        _create_lines_and_update_balances(je, lines)

        logger.info(
            f"Posted journal {je.id} for SALE {sale_invoice.id} "
            f"outlet {outlet.id} grand_total={grand_total}"
        )

    except Ledger.DoesNotExist as e:
        logger.error(f"Ledger not found for sale {sale_invoice.id}: {e}")
        raise
    except Exception as e:
        logger.error(f"Failed to post journal for sale {sale_invoice.id}: {e}")
        raise


@transaction.atomic
def post_purchase_invoice(purchase_invoice, distributor_ledger=None):
    """
    Post a purchase invoice to the general ledger (Step 1 — Invoice Posting).

    Always credits the Distributor Ledger regardless of purchase_type, establishing
    vendor billing volume and enabling GST reconciliation. For cash purchases a
    second journal (Step 2 — Payment Posting) is posted by atomic_purchase_save()
    immediately after, which debits Distributor and credits Cash to settle the
    liability created here.

    Journal entry (both cash and credit purchases, intrastate):
      Dr. Purchase Account                 taxable_amount
      Dr. GST Input (CGST)                 gst_amount / 2
      Dr. GST Input (SGST)                 gst_amount / 2
      Dr/Cr Round Off                      abs(round_off)   [if non-zero]
      Cr. Distributor Ledger               grand_total

    Args:
        purchase_invoice: The PurchaseInvoice to post.
        distributor_ledger: Optional Ledger object for the creditor. When provided
            (partyLedgerId flow), it is used directly. When None, the ledger is
            looked up via the distributor FK (legacy flow). A missing ledger is a
            hard error — the caller's transaction rolls back.
    """
    try:
        outlet = purchase_invoice.outlet

        # Guard against double-posting
        if _guard_double_posting(outlet, 'PURCHASE', purchase_invoice.id):
            logger.info(f"Purchase {purchase_invoice.id} already journaled, skipping")
            return

        lines = []
        grand_total = purchase_invoice.grand_total
        taxable_amount = purchase_invoice.taxable_amount
        gst_amount = purchase_invoice.gst_amount or Decimal('0')

        # Dr Purchase Account
        purchase_ledger = _get_ledger(outlet, 'Purchase Account')
        lines.append(('debit', purchase_ledger, taxable_amount))

        # Dr GST Input (CGST) and (SGST) — split gst_amount equally
        if gst_amount > 0:
            cgst_input = (gst_amount / 2).quantize(Decimal('0.01'))
            # Use subtraction to avoid rounding errors: sgst = total - cgst
            sgst_input = gst_amount - cgst_input

            cgst_ledger = _get_ledger(outlet, 'GST Input (CGST)')
            lines.append(('debit', cgst_ledger, cgst_input))

            sgst_ledger = _get_ledger(outlet, 'GST Input (SGST)')
            lines.append(('debit', sgst_ledger, sgst_input))

        # Round Off — bridges the gap between (taxable + gst) and grand_total
        # grand_total = taxable + gst + round_off, so the gap on the debit side
        # equals abs(round_off) and must be closed here.
        round_off = purchase_invoice.round_off or Decimal('0')
        if round_off > 0:
            # grand_total > taxable+gst → credit side exceeds debit → Dr Round Off
            round_off_ledger = _get_ledger(outlet, 'Round Off')
            lines.append(('debit', round_off_ledger, round_off))
        elif round_off < 0:
            # grand_total < taxable+gst → debit side exceeds credit → Cr Round Off
            round_off_ledger = _get_ledger(outlet, 'Round Off')
            lines.append(('credit', round_off_ledger, abs(round_off)))

        # Cr Distributor Ledger — always, for both cash and credit purchases
        if distributor_ledger is None:
            distributor_ledger = _get_distributor_ledger(outlet, purchase_invoice.distributor)

        if distributor_ledger is None:
            raise ValueError(
                f"Purchase {purchase_invoice.id}: no Sundry Creditors ledger found for "
                f"distributor '{purchase_invoice.distributor}'. "
                f"Pass the party_ledger explicitly from atomic_purchase_save(), or run "
                f"sync_distributor_ledgers to link existing distributors."
            )

        # Ledger Adjustment — balances the gap between (taxable+gst+round_off) and grand_total
        ledger_adj = purchase_invoice.ledger_adjustment or Decimal('0')
        if ledger_adj != Decimal('0'):
            ledger_adj_account = _get_ledger(outlet, 'Ledger Adjustment')
            if ledger_adj < Decimal('0'):
                # User added credit (e.g. +₹200 stored as -200) → reduces payable
                # Dr. Ledger Adjustment (adds to debit side to balance)
                lines.append(('debit', ledger_adj_account, abs(ledger_adj)))
            else:
                # User subtracted from invoice (e.g. -₹200 stored as +200) → increases payable
                # Cr. Ledger Adjustment (adds to credit side to balance)
                lines.append(('credit', ledger_adj_account, ledger_adj))

        lines.append(('credit', distributor_ledger, grand_total))

        # Verify double-entry balance before writing anything
        total_debit = sum(amt for t, _, amt in lines if t == 'debit')
        total_credit = sum(amt for t, _, amt in lines if t == 'credit')
        if abs(total_debit - total_credit) > Decimal('0.01'):
            raise ValueError(
                f"Purchase {purchase_invoice.id}: double-entry imbalance — "
                f"Dr ₹{total_debit} vs Cr ₹{total_credit} "
                f"(taxable={taxable_amount}, gst={gst_amount}, round_off={round_off}, "
                f"ledger_adjustment={ledger_adj}, grand_total={grand_total}). "
                f"Check that invoice amounts sum correctly."
            )

        # Create JournalEntry
        invoice_date = purchase_invoice.invoice_date
        entry_date = invoice_date.date() if hasattr(invoice_date, 'date') else invoice_date
        narration = f"Purchase Invoice {purchase_invoice.invoice_no} on {entry_date}"
        je = JournalEntry.objects.create(
            outlet=outlet,
            source_type='PURCHASE',
            source_id=purchase_invoice.id,
            date=entry_date,
            narration=narration
        )

        _create_lines_and_update_balances(je, lines)

        logger.info(
            f"Posted journal {je.id} for PURCHASE {purchase_invoice.id} "
            f"outlet {outlet.id} grand_total={grand_total}"
        )

    except Ledger.DoesNotExist as e:
        logger.error(f"Ledger not found for purchase {purchase_invoice.id}: {e}")
        raise
    except Exception as e:
        logger.error(f"Failed to post journal for purchase {purchase_invoice.id}: {e}")
        raise


@transaction.atomic
def post_voucher(voucher):
    """
    Create a journal entry for an existing voucher (audit trail only).

    Note: Ledger balance updates are already done by VoucherService.create_voucher()
    via LedgerService.update_balance(). This function only creates the JournalEntry
    and JournalLine records for audit purposes, without double-updating balances.
    """
    try:
        outlet = voucher.outlet

        # Guard against double-posting
        if _guard_double_posting(outlet, 'VOUCHER', voucher.id):
            logger.info(f"Voucher {voucher.id} already journaled, skipping")
            return

        # Create JournalEntry
        je = JournalEntry.objects.create(
            outlet=outlet,
            source_type='VOUCHER',
            source_id=voucher.id,
            date=voucher.date,
            narration=voucher.narration or f"Voucher {voucher.voucher_no}"
        )

        # Create JournalLines mirroring VoucherLines
        # Balance already updated by VoucherService — do NOT call update_balance here
        for vline in voucher.lines.all():
            JournalLine.objects.create(
                journal_entry=je,
                ledger=vline.ledger,
                debit_amount=vline.debit,
                credit_amount=vline.credit
            )

        logger.info(
            f"Posted journal {je.id} for VOUCHER {voucher.id} outlet {outlet.id}"
        )

    except Exception as e:
        logger.error(f"Failed to post journal for voucher {voucher.id}: {e}")
        raise


@transaction.atomic
def post_credit_payment(outlet, customer, amount, payment_mode, source_id, narration):
    """
    Post a credit payment collection to the general ledger.
    Called when a customer pays back their outstanding Udhari/credit balance.

    Journal entry:
      Dr. Cash / UPI Collections / Card/POS Settlement    amount
      Cr. Customer Ledger (Sundry Debtors)                amount
    """
    try:
        # Guard against double-posting
        if _guard_double_posting(outlet, 'CREDIT_PAYMENT', source_id):
            logger.info(f"CREDIT_PAYMENT {source_id} already journaled, skipping")
            return

        lines = []
        mode = (payment_mode or 'cash').lower()

        # ── DEBIT side: which collection ledger received the money ──
        if mode in ('upi', 'upi_transfer', 'phonepe', 'gpay', 'paytm', 'neft', 'imps'):
            collection_ledger = _get_ledger(outlet, 'UPI Collections')
        elif mode in ('card', 'pos', 'swipe', 'credit_card', 'debit_card'):
            collection_ledger = _get_ledger(outlet, 'Card/POS Settlement')
        else:
            # Default: cash
            collection_ledger = _get_ledger(outlet, 'Cash')

        lines.append(('debit', collection_ledger, amount))

        # ── CREDIT side: Customer Ledger (Sundry Debtors) ──
        customer_ledger = _get_customer_ledger(outlet, customer)
        if not customer_ledger:
            raise ValueError(
                f"CREDIT_PAYMENT {source_id}: no customer ledger found for "
                f"customer {customer.id} ({customer.name}). "
                f"Run sync_customer_ledgers first."
            )
        lines.append(('credit', customer_ledger, amount))

        # ── Create JournalEntry ──
        from datetime import datetime
        je = JournalEntry.objects.create(
            outlet=outlet,
            source_type='CREDIT_PAYMENT',
            source_id=source_id,
            date=datetime.now().date(),
            narration=narration
        )

        _create_lines_and_update_balances(je, lines)

        logger.info(
            f"Posted journal {je.id} for CREDIT_PAYMENT {source_id} "
            f"outlet {outlet.id} amount={amount}"
        )

    except Ledger.DoesNotExist as e:
        logger.error(f"Ledger not found for credit payment {source_id}: {e}")
        raise
    except Exception as e:
        logger.error(f"Failed to post journal for credit payment {source_id}: {e}")
        raise


@transaction.atomic
def reverse_journal(source_type, source_id, outlet_id, narration_prefix='REVERSAL OF'):
    """
    Reverse (contra-post) a previous journal entry.
    Called when a Credit Note (sale return) or Debit Note (purchase return) is created.

    This function:
      1. Finds the original JournalEntry
      2. For each JournalLine: flips debit/credit and reverses the ledger balance
      3. Creates a new JournalEntry with source_type='RETURN'

    The original entry is NEVER deleted — it remains for the audit trail.
    """
    try:
        from datetime import datetime

        # Find original journal
        original_je = JournalEntry.objects.get(
            outlet_id=outlet_id,
            source_type=source_type,
            source_id=source_id
        )

        # Create reversal JournalEntry
        reversal_je = JournalEntry.objects.create(
            outlet_id=outlet_id,
            source_type='RETURN',
            source_id=source_id,
            date=datetime.now().date(),
            narration=f"{narration_prefix} {original_je.narration}"
        )

        # For each original JournalLine, create a flipped reversal line
        for original_line in original_je.lines.all():
            # Create reversal line with debit/credit flipped
            JournalLine.objects.create(
                journal_entry=reversal_je,
                ledger=original_line.ledger,
                debit_amount=original_line.credit_amount,  # flip
                credit_amount=original_line.debit_amount   # flip
            )

            # Reverse the ledger balance:
            # If original was debit (increased asset balance), credit to reverse it
            # If original was credit (increased liability balance), debit to reverse it
            LedgerService.update_balance(
                original_line.ledger.id,
                original_line.credit_amount,   # debit with the original credit amount
                original_line.debit_amount     # credit with the original debit amount
            )

        logger.info(
            f"Posted reversal journal {reversal_je.id} for {source_type} {source_id} "
            f"outlet {outlet_id}"
        )

    except JournalEntry.DoesNotExist:
        logger.warning(f"No journal entry found for {source_type} {source_id}, skipping reversal")
    except Exception as e:
        logger.error(f"Failed to reverse journal for {source_type} {source_id}: {e}")
        raise


@transaction.atomic
def post_debit_note(debit_note, party_ledger=None):
    """
    Post a Purchase Return (Debit Note) to the general ledger.
    
    Journal entry:
      Dr. Distributor Ledger (Sundry Creditors)     debit_note.total_amount
      Cr. Purchase Returns Account                  debit_note.subtotal
      Cr. GST Input (CGST)                          debit_note.gst_amount / 2
      Cr. GST Input (SGST)                          debit_note.gst_amount / 2
    """
    try:
        outlet = debit_note.outlet

        # Guard against double-posting
        if _guard_double_posting(outlet, 'RETURN', debit_note.id):
            logger.info(f"Debit Note {debit_note.id} already journaled, skipping")
            return

        lines = []

        # Safely convert all money fields to strict Decimals
        total_amount = Decimal(str(debit_note.total_amount or '0'))
        subtotal = Decimal(str(debit_note.subtotal or '0'))
        gst_amount = Decimal(str(debit_note.gst_amount or '0'))

        # 1. Debit the Distributor (Reduces the liability we owe them)
        if party_ledger is None:
            party_ledger = _get_distributor_ledger(outlet, debit_note.distributor)
            
        if party_ledger is None:
            raise ValueError(f"No Sundry Creditors ledger found for distributor '{debit_note.distributor}'.")
            
        lines.append(('debit', party_ledger, total_amount))

        # 2. Credit the Purchase Returns Account (Reversing the expense)
        try:
            return_ledger = _get_ledger(outlet, 'Purchase Returns')
        except Ledger.DoesNotExist:
            # Fallback to general Purchase Account if a specific Returns account isn't seeded
            return_ledger = _get_ledger(outlet, 'Purchase Account')
            
        lines.append(('credit', return_ledger, subtotal))

        # 3. Credit the GST (Reversing the GST Input originally claimed)
        if gst_amount > 0:
            cgst_ledger = _get_ledger(outlet, 'GST Input (CGST)')
            sgst_ledger = _get_ledger(outlet, 'GST Input (SGST)')
            
            # Now this math is completely safe!
            cgst_credit = (gst_amount / Decimal('2')).quantize(Decimal('0.01'))
            sgst_credit = gst_amount - cgst_credit
            
            lines.append(('credit', cgst_ledger, cgst_credit))
            lines.append(('credit', sgst_ledger, sgst_credit))

        # Verify double-entry balance
        total_debit = sum(amt for t, _, amt in lines if t == 'debit')
        total_credit = sum(amt for t, _, amt in lines if t == 'credit')
        if abs(total_debit - total_credit) > Decimal('0.01'):
            raise ValueError(
                f"Debit Note {debit_note.id}: double-entry imbalance — "
                f"Dr ₹{total_debit} vs Cr ₹{total_credit} "
                f"(subtotal={subtotal}, gst={gst_amount}, total={total_amount})."
            )

        # Create JournalEntry
        je = JournalEntry.objects.create(
            outlet=outlet,
            source_type='RETURN',
            source_id=debit_note.id,
            date=debit_note.date,
            narration=f"Purchase Return / Debit Note {debit_note.debit_note_no or ''}"
        )

        _create_lines_and_update_balances(je, lines)

        logger.info(f"Posted journal {je.id} for DEBIT NOTE {debit_note.id}")

    except Exception as e:
        logger.error(f"Failed to post journal for debit note {debit_note.id}: {e}")
        raise