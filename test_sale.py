import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from rest_framework.test import APIClient
from apps.accounts.models import Staff
from apps.core.models import Outlet

outlet = Outlet.objects.first()
staff = Staff.objects.first()
client = APIClient()
client.force_authenticate(user=staff.user)
response = client.get(f'/api/v1/sales/invoices/search/?outletId={outlet.id}&q=INV-2026-000054')
import json
print(json.dumps(response.data, indent=2))
