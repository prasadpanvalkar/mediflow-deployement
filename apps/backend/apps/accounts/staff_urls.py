from django.urls import path
from apps.accounts.views import (
    StaffPinVerifyView, StaffListView, StaffLookupByPinView,
    StaffCreateView, StaffDetailView, StaffPerformanceView, StaffLeaderboardView,
)

urlpatterns = [
    path('', StaffListView.as_view(), name='staff-list'),
    path('create/', StaffCreateView.as_view(), name='staff-create'),
    path('leaderboard/', StaffLeaderboardView.as_view(), name='staff-leaderboard'),
    path('lookup-by-pin/', StaffLookupByPinView.as_view(), name='staff-lookup-by-pin'),
    path('<uuid:pk>/', StaffDetailView.as_view(), name='staff-detail'),
    path('<uuid:pk>/performance/', StaffPerformanceView.as_view(), name='staff-performance'),
    path('<uuid:staff_id>/verify-pin/', StaffPinVerifyView.as_view(), name='staff-verify-pin'),
]
