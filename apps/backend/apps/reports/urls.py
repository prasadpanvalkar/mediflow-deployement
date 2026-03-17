from django.urls import path
from apps.reports.views import (
    SalesDailyReportView, GSTR1ReportView,
    SalesSummaryReportView, GSTR2ReportView, GSTR3BReportView, InventoryValuationView,
    InventoryMovementReportView, ExpiryReportView, StaffPerformanceReportView,
    BalanceSheetView, GSTR2AReconciliationView,
)

urlpatterns = [
    path('sales/daily/', SalesDailyReportView.as_view(), name='sales-daily-report'),
    path('sales/summary/', SalesSummaryReportView.as_view(), name='sales-summary-report'),
    path('gst/gstr1/', GSTR1ReportView.as_view(), name='gst-gstr1-report'),
    path('gst/gstr2/', GSTR2ReportView.as_view(), name='gst-gstr2-report'),
    path('gst/gstr3b/', GSTR3BReportView.as_view(), name='gst-gstr3b-report'),
    path('inventory/valuation/', InventoryValuationView.as_view(), name='inventory-valuation'),
    path('inventory/movement/', InventoryMovementReportView.as_view(), name='inventory-movement'),
    path('expiry/', ExpiryReportView.as_view(), name='expiry-report'),
    path('staff/performance/', StaffPerformanceReportView.as_view(), name='staff-performance-report'),
    path('balance-sheet/', BalanceSheetView.as_view(), name='balance-sheet'),
    path('gstr2a/', GSTR2AReconciliationView.as_view(), name='gstr2a-reconciliation'),
]
