from django.urls import path
from apps.attendance.views import (
    AttendanceCheckInView,
    AttendanceCheckOutView,
    AttendanceTodayView,
    AttendanceMonthlyView,
    AttendanceSummaryView,
    AttendanceManualView,
)

urlpatterns = [
    path('check-in/', AttendanceCheckInView.as_view(), name='attendance-check-in'),
    path('check-out/', AttendanceCheckOutView.as_view(), name='attendance-check-out'),
    path('today/', AttendanceTodayView.as_view(), name='attendance-today'),
    path('summary/', AttendanceSummaryView.as_view(), name='attendance-summary'),
    path('manual/', AttendanceManualView.as_view(), name='attendance-manual'),
    path('', AttendanceMonthlyView.as_view(), name='attendance-list'),
]
