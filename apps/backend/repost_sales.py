import os
import django

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from django.db import transaction
from apps.billing.models import SaleInvoice
from apps.accounts.models import JournalEntry
from apps.accounts.journal_service import post_sale_invoice
import traceback

def repost_all_sale_invoices():
    sales = SaleInvoice.objects.all()
    total_sales = sales.count()
    print(f"Found {total_sales} sale invoices.")
    
    success_count = 0
    error_count = 0
    
    try:
        with transaction.atomic():
            for sale in sales:
                try:
                    # Delete existing journal entries for this sale
                    JournalEntry.objects.filter(source_id=sale.id, source_type='SALE').delete()
                    
                    # Re-post the sale invoice
                    post_sale_invoice(sale)
                    success_count += 1
                except Exception as e:
                    print(f"Error posting sale {sale.id} ({sale.invoice_no}): {str(e)}")
                    traceback.print_exc()
                    error_count += 1
                    # Re-raise to trigger rollback if there's any error
                    raise e
                    
            print(f"\nCompleted! Successfully re-posted {success_count} sales within atomic transaction.")
    except Exception as e:
        print(f"\nTransaction rolled back due to error: {str(e)}")
        print(f"Successfully processed {success_count} before failure. Total failures: {error_count}")

repost_all_sale_invoices()
