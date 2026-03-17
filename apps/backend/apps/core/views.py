from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from apps.core.models import Outlet, OutletSettings


class OutletSettingsView(APIView):
    """GET/PATCH /api/v1/outlet/settings/"""
    permission_classes = [IsAuthenticated]

    def _serialize(self, settings):
        def fmt_time(t, default):
            if not t:
                return default
            if hasattr(t, 'strftime'):
                return t.strftime('%H:%M')
            return str(t)[:5]
        return {
            'openingTime': fmt_time(settings.opening_time, '09:00'),
            'closingTime': fmt_time(settings.closing_time, '21:00'),
            'gracePeriodMinutes': settings.grace_period_minutes,
            'defaultCreditDays': settings.default_credit_days,
            'invoicePrefix': settings.invoice_prefix,
            'gstRegistered': settings.gst_registered,
            'printLogo': settings.print_logo,
            'thermalPrint': settings.thermal_print,
            'printerWidth': settings.printer_width,
            'lowStockAlertDays': settings.low_stock_alert_days,
            'expiryAlertDays': settings.expiry_alert_days,
            'enableWhatsapp': settings.enable_whatsapp,
            'whatsappApiKey': settings.whatsapp_api_key,
            'currencySymbol': settings.currency_symbol,
            'updatedAt': settings.updated_at.isoformat(),
        }

    def get(self, request, *args, **kwargs):
        outlet_id = getattr(request.user, 'outlet_id', None)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        settings, _ = OutletSettings.objects.get_or_create(outlet=outlet)
        return Response({'success': True, 'data': self._serialize(settings)}, status=status.HTTP_200_OK)

    def patch(self, request, *args, **kwargs):
        outlet_id = getattr(request.user, 'outlet_id', None)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        settings, _ = OutletSettings.objects.get_or_create(outlet=outlet)

        field_map = {
            'openingTime': 'opening_time',
            'closingTime': 'closing_time',
            'gracePeriodMinutes': 'grace_period_minutes',
            'defaultCreditDays': 'default_credit_days',
            'invoicePrefix': 'invoice_prefix',
            'gstRegistered': 'gst_registered',
            'printLogo': 'print_logo',
            'thermalPrint': 'thermal_print',
            'printerWidth': 'printer_width',
            'lowStockAlertDays': 'low_stock_alert_days',
            'expiryAlertDays': 'expiry_alert_days',
            'enableWhatsapp': 'enable_whatsapp',
            'whatsappApiKey': 'whatsapp_api_key',
            'currencySymbol': 'currency_symbol',
        }

        updated_fields = []
        for frontend_key, model_field in field_map.items():
            if frontend_key in request.data:
                setattr(settings, model_field, request.data[frontend_key])
                updated_fields.append(model_field)

        if updated_fields:
            settings.save(update_fields=updated_fields)

        return Response({'success': True, 'data': self._serialize(settings)}, status=status.HTTP_200_OK)
