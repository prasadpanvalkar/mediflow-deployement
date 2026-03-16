from django.urls import path
from apps.billing.views import SaleCreateView, SaleListView

# Create a combined view that handles both GET and POST
class SalesView(SaleListView, SaleCreateView):
    def get(self, request, *args, **kwargs):
        return SaleListView.get(self, request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return SaleCreateView.post(self, request, *args, **kwargs)

urlpatterns = [
    path('sales/', SalesView.as_view(), name='sale-list-create'),
]
