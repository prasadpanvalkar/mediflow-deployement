from django.urls import path, include
from django.http import JsonResponse
from apps.billing.views import LowStockAlertView, MargMigrationView


def health_check(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("api/v1/health/", health_check),
    path("api/v1/auth/", include("apps.accounts.auth_urls")),
    path("api/v1/customers/", include("apps.accounts.customer_urls")),
    path("api/v1/staff/", include("apps.accounts.staff_urls")),
    path("api/v1/doctors/", include("apps.accounts.doctor_urls")),
    path("api/v1/", include("apps.inventory.urls")),
    path("api/v1/purchases/", include("apps.purchases.urls")),
    path("api/v1/", include("apps.billing.urls")),
    path("api/v1/", include("apps.billing.accounts_urls")),
    path("api/v1/attendance/", include("apps.attendance.urls")),
    path("api/v1/reports/", include("apps.reports.urls")),
    path("api/v1/outlet/", include("apps.core.outlet_urls")),
    path("api/v1/organizations/", include("apps.core.chain_urls")),
    path("api/v1/notifications/low-stock/", LowStockAlertView.as_view(), name='low-stock-alert'),
    path("api/v1/migrate/marg/", MargMigrationView.as_view(), name='marg-migration'),
]
