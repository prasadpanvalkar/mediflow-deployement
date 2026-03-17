from django.urls import path
from apps.billing.views import (
    DistributorOutstandingSummaryView,
    CustomerOutstandingSummaryView,
    ExpenseListCreateView,
)

urlpatterns = [
    path('outstanding/distributors/', DistributorOutstandingSummaryView.as_view(), name='outstanding-distributors'),
    path('outstanding/customers/', CustomerOutstandingSummaryView.as_view(), name='outstanding-customers'),
    path('expenses/', ExpenseListCreateView.as_view(), name='expense-list-create'),
]
