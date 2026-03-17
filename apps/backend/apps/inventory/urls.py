from django.urls import path
from apps.inventory.views import (
    ProductSearchView, InventoryListView, InventoryAlertsView, InventoryAdjustView,
    ProductListView, ProductDetailView, ProductBatchesView, InventoryExportCSVView
)

urlpatterns = [
    path('products/', ProductListView.as_view(), name='product-list'),
    path('products/search/', ProductSearchView.as_view(), name='product-search'),
    path('products/<uuid:pk>/', ProductDetailView.as_view(), name='product-detail'),
    path('products/<uuid:pk>/batches/', ProductBatchesView.as_view(), name='product-batches'),
    path('inventory/', InventoryListView.as_view(), name='inventory-list'),
    path('inventory/alerts/', InventoryAlertsView.as_view(), name='inventory-alerts'),
    path('inventory/adjust/', InventoryAdjustView.as_view(), name='inventory-adjust'),
    path('inventory/export/csv/', InventoryExportCSVView.as_view(), name='inventory-export-csv'),
]
