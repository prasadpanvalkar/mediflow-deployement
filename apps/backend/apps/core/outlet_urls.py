from django.urls import path
from apps.core.views import OutletSettingsView

urlpatterns = [
    path('settings/', OutletSettingsView.as_view(), name='outlet-settings'),
]
