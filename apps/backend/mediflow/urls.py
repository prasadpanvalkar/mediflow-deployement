from django.urls import path, include
from django.http import JsonResponse

def health_check(request):
    return JsonResponse({"status": "ok"})

urlpatterns = [
    path("api/v1/health/", health_check),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.inventory.urls")),
    path("api/v1/purchases/", include("apps.purchases.urls")),
    path("api/v1/", include("apps.billing.urls")),
]
