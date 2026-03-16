from django.urls import path
from apps.billing.views import (
    SaleCreateView, SaleListView,
    CustomerCreditPaymentView,
    CreditAccountListView, CreditAccountDetailView,
    DashboardDailyView
)

# Create a combined view that handles both GET and POST
class SalesView(SaleListView, SaleCreateView):
    def get(self, request, *args, **kwargs):
        return SaleListView.get(self, request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return SaleCreateView.post(self, request, *args, **kwargs)

urlpatterns = [
    path('sales/', SalesView.as_view(), name='sale-list-create'),
    path('credit/accounts/', CreditAccountListView.as_view(), name='credit-account-list'),
    path('credit/accounts/<uuid:account_id>/', CreditAccountDetailView.as_view(), name='credit-account-detail'),
    path('credit/payment/', CustomerCreditPaymentView.as_view(), name='credit-payment'),
    path('dashboard/daily/', DashboardDailyView.as_view(), name='dashboard-daily'),
]
