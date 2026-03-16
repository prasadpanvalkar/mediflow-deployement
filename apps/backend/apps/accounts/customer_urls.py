from django.urls import path
from apps.accounts.views import CustomerListView, CustomerSearchView, CustomerDetailView

urlpatterns = [
    path('', CustomerListView.as_view(), name='customer-list'),
    path('search/', CustomerSearchView.as_view(), name='customer-search'),
    path('<uuid:customer_id>/', CustomerDetailView.as_view(), name='customer-detail'),
]
