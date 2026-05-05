from django.contrib import admin
from .models import StockLedger

@admin.register(StockLedger)
class StockLedgerAdmin(admin.ModelAdmin):
    list_display = ['txn_date', 'txn_type', 'product', 'batch_number',
                    'qty_in', 'qty_out', 'running_qty', 'voucher_number', 'party_name']
    list_filter  = ['txn_type', 'outlet', 'txn_date']
    search_fields = ['product__name', 'batch_number', 'voucher_number', 'party_name']
    ordering     = ['-txn_date', '-created_at']