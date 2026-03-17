import logging
from datetime import date
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.db.models import Sum, Count, Q
from django.shortcuts import get_object_or_404

from apps.core.models import Organization, Outlet
from apps.billing.models import SaleInvoice
from apps.purchases.models import PurchaseInvoice
from apps.accounts.models import Customer

logger = logging.getLogger(__name__)


class OrganizationListView(APIView):
    """GET /api/v1/organizations/ — list all organizations (super_admin only)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'super_admin':
            return Response({'success': False, 'error': 'Super admin only'}, status=status.HTTP_403_FORBIDDEN)

        orgs = Organization.objects.filter(is_active=True).values(
            'id', 'name', 'slug', 'plan', 'master_gstin', 'phone', 'email', 'created_at'
        )
        data = [
            {
                'id': str(o['id']),
                'name': o['name'],
                'slug': o['slug'],
                'plan': o['plan'],
                'masterGstin': o['master_gstin'],
                'phone': o['phone'],
                'email': o['email'],
                'createdAt': o['created_at'].isoformat() if o['created_at'] else None,
                'outletCount': Outlet.objects.filter(organization_id=o['id'], is_active=True).count(),
            }
            for o in orgs
        ]
        return Response({'success': True, 'data': data})


class OrganizationDetailView(APIView):
    """GET /api/v1/organizations/<pk>/ — get single organization with outlets."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if request.user.role != 'super_admin':
            return Response({'success': False, 'error': 'Super admin only'}, status=status.HTTP_403_FORBIDDEN)

        org = get_object_or_404(Organization, id=pk, is_active=True)
        outlets = Outlet.objects.filter(organization=org, is_active=True).values(
            'id', 'name', 'city', 'state', 'gstin', 'phone'
        )
        return Response({
            'success': True,
            'data': {
                'id': str(org.id),
                'name': org.name,
                'slug': org.slug,
                'plan': org.plan,
                'masterGstin': org.master_gstin,
                'phone': org.phone,
                'email': org.email,
                'outlets': [
                    {
                        'id': str(o['id']),
                        'name': o['name'],
                        'city': o['city'],
                        'state': o['state'],
                        'gstin': o['gstin'],
                        'phone': o['phone'],
                    }
                    for o in outlets
                ],
            }
        })


class ChainDashboardView(APIView):
    """
    GET /api/v1/organizations/dashboard/?orgId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD

    Chain-wide aggregated KPIs for a super_admin across ALL outlets in the org.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'super_admin':
            return Response({'success': False, 'error': 'Super admin only'}, status=status.HTTP_403_FORBIDDEN)

        org_id = request.GET.get('orgId')
        if not org_id:
            return Response({'success': False, 'error': 'orgId is required'}, status=status.HTTP_400_BAD_REQUEST)

        from_date = request.GET.get('from', str(date.today().replace(day=1)))
        to_date = request.GET.get('to', str(date.today()))

        try:
            org = Organization.objects.get(id=org_id, is_active=True)
        except Organization.DoesNotExist:
            return Response({'success': False, 'error': 'Organization not found'}, status=status.HTTP_404_NOT_FOUND)

        outlet_ids = list(Outlet.objects.filter(organization=org, is_active=True).values_list('id', flat=True))

        # ── Total sales across all outlets ──────────────────────────────────────
        sales_agg = SaleInvoice.objects.filter(
            outlet_id__in=outlet_ids,
            invoice_date__date__gte=from_date,
            invoice_date__date__lte=to_date,
            is_return=False,
        ).aggregate(
            total=Sum('grand_total'),
            invoices=Count('id'),
        )

        # ── Today's sales ────────────────────────────────────────────────────────
        today_agg = SaleInvoice.objects.filter(
            outlet_id__in=outlet_ids,
            invoice_date__date=date.today(),
            is_return=False,
        ).aggregate(total=Sum('grand_total'), invoices=Count('id'))

        # ── Total purchases across all outlets ───────────────────────────────────
        purchases_agg = PurchaseInvoice.objects.filter(
            outlet_id__in=outlet_ids,
            invoice_date__gte=from_date,
            invoice_date__lte=to_date,
        ).aggregate(total=Sum('grand_total'), invoices=Count('id'))

        # ── Total outstanding (distributor payables) ─────────────────────────────
        payables_agg = PurchaseInvoice.objects.filter(
            outlet_id__in=outlet_ids,
            outstanding__gt=0,
        ).aggregate(total=Sum('outstanding'))

        # ── Customer receivables ─────────────────────────────────────────────────
        receivables_agg = Customer.objects.filter(
            outlet_id__in=outlet_ids,
            outstanding__gt=0,
        ).aggregate(total=Sum('outstanding'))

        # ── Per-outlet breakdown ─────────────────────────────────────────────────
        outlets = Outlet.objects.filter(id__in=outlet_ids)
        outlet_data = []
        for outlet in outlets:
            o_sales = SaleInvoice.objects.filter(
                outlet=outlet,
                invoice_date__date__gte=from_date,
                invoice_date__date__lte=to_date,
                is_return=False,
            ).aggregate(total=Sum('grand_total'), invoices=Count('id'))

            o_today = SaleInvoice.objects.filter(
                outlet=outlet,
                invoice_date__date=date.today(),
                is_return=False,
            ).aggregate(total=Sum('grand_total'))

            outlet_data.append({
                'id': str(outlet.id),
                'name': outlet.name,
                'city': outlet.city,
                'state': outlet.state,
                'periodSales': float(o_sales['total'] or 0),
                'periodInvoices': o_sales['invoices'] or 0,
                'todaySales': float(o_today['total'] or 0),
            })

        return Response({
            'success': True,
            'data': {
                'organization': {'id': str(org.id), 'name': org.name},
                'period': {'from': from_date, 'to': to_date},
                'totalSales': {
                    'total': float(sales_agg['total'] or 0),
                    'invoices': sales_agg['invoices'] or 0,
                },
                'todaySales': {
                    'total': float(today_agg['total'] or 0),
                    'invoices': today_agg['invoices'] or 0,
                },
                'totalPurchases': {
                    'total': float(purchases_agg['total'] or 0),
                    'invoices': purchases_agg['invoices'] or 0,
                },
                'totalPayables': float(payables_agg['total'] or 0),
                'totalReceivables': float(receivables_agg['total'] or 0),
                'outlets': outlet_data,
            }
        })
