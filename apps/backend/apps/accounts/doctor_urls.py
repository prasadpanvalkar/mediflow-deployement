from django.urls import path
from apps.accounts.views import DoctorListCreateView, DoctorDetailView

urlpatterns = [
    path('', DoctorListCreateView.as_view(), name='doctor-list-create'),
    path('<uuid:pk>/', DoctorDetailView.as_view(), name='doctor-detail'),
]
