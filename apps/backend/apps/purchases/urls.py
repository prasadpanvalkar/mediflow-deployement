from django.urls import path
from apps.purchases.views import (
    DistributorListView,
    DistributorDetailView,
    DistributorLedgerView,
    PurchaseCreateView,
    PurchaseListView,
    DistributorPaymentView,
    PurchaseDetailView,
    PaymentListView,
    DistributorOutstandingView,
)


# Create a combined view that handles both GET and POST on root purchases/ endpoint
class PurchasesView(PurchaseListView, PurchaseCreateView):
    def get(self, request, *args, **kwargs):
        return PurchaseListView.get(self, request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return PurchaseCreateView.post(self, request, *args, **kwargs)


# Combined GET + POST on payments endpoint
class PaymentListCreateView(PaymentListView, DistributorPaymentView):
    def get(self, request, *args, **kwargs):
        return PaymentListView.get(self, request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return DistributorPaymentView.post(self, request, *args, **kwargs)


urlpatterns = [
    path('', PurchasesView.as_view(), name='purchase-list-create'),
    path('payments/', PaymentListCreateView.as_view(), name='distributor-payment'),
    path('distributors/<uuid:pk>/outstanding/', DistributorOutstandingView.as_view(), name='distributor-outstanding'),
    path('distributors/', DistributorListView.as_view(), name='distributor-list'),
    path('distributors/<uuid:distributor_id>/', DistributorDetailView.as_view(), name='distributor-detail'),
    path('distributors/<uuid:distributor_id>/ledger/', DistributorLedgerView.as_view(), name='distributor-ledger'),
    path('<uuid:purchase_id>/', PurchaseDetailView.as_view(), name='purchase-detail'),
]
