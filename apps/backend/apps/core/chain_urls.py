from django.urls import path
from apps.core.chain_views import OrganizationListView, OrganizationDetailView, ChainDashboardView

urlpatterns = [
    path('', OrganizationListView.as_view(), name='organization-list'),
    path('dashboard/', ChainDashboardView.as_view(), name='chain-dashboard'),
    path('<uuid:pk>/', OrganizationDetailView.as_view(), name='organization-detail'),
]
