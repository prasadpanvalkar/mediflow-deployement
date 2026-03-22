from django.urls import path
from apps.accounts.voucher_views import (
    LedgerGroupListView,
    LedgerListView,
    LedgerDetailView,
    LedgerStatementView,
    LedgerSyncView,
    VoucherNextNoView,
    VoucherListView,
    VoucherDetailView,
    DebitNoteListView,
    CreditNoteListView,
)

urlpatterns = [
    # Ledger Groups
    path('ledger-groups/', LedgerGroupListView.as_view(), name='ledger-group-list'),

    # Ledgers
    path('ledgers/', LedgerListView.as_view(), name='ledger-list'),
    path('ledgers/sync/', LedgerSyncView.as_view(), name='ledger-sync'),
    path('ledgers/next-no/', VoucherNextNoView.as_view(), name='voucher-next-no'),
    path('ledgers/<uuid:ledger_id>/', LedgerDetailView.as_view(), name='ledger-detail'),
    path('ledgers/<uuid:ledger_id>/statement/', LedgerStatementView.as_view(), name='ledger-statement'),

    # Vouchers
    path('vouchers/', VoucherListView.as_view(), name='voucher-list'),
    path('vouchers/<uuid:voucher_id>/', VoucherDetailView.as_view(), name='voucher-detail'),

    # Debit Notes (Purchase Returns)
    path('debit-notes/', DebitNoteListView.as_view(), name='debit-note-list'),

    # Credit Notes (Sale Returns)
    path('credit-notes/', CreditNoteListView.as_view(), name='credit-note-list'),
]
