from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView
from apps.accounts.views import LoginView, StaffMeView, ChangePinView

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', TokenBlacklistView.as_view(), name='auth-logout'),
    path('refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('me/', StaffMeView.as_view(), name='staff-me'),
    path('me/pin/', ChangePinView.as_view(), name='change-pin'),
]
