import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.core.exceptions import ValidationError

from apps.accounts.models import LedgerGroup, Ledger, Voucher, DebitNote, CreditNote
from apps.accounts.services import LedgerService, VoucherService, DebitNoteService, CreditNoteService
from apps.accounts.voucher_serializers import (
    LedgerGroupSerializer, LedgerSerializer, VoucherSerializer,
    DebitNoteSerializer, CreditNoteSerializer,
)
from apps.core.models import Outlet

logger = logging.getLogger(__name__)


def get_outlet_id(request):
    return request.query_params.get('outletId') or request.data.get('outletId')


class LedgerGroupListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        outlet_id = get_outlet_id(request)
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        groups = LedgerGroup.objects.filter(outlet_id=outlet_id).select_related('parent')
        return Response({
            'data': LedgerGroupSerializer(groups, many=True).data,
            'meta': {'total': groups.count()},
        })

    def post(self, request):
        outlet_id = get_outlet_id(request)
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
            group = LedgerGroup.objects.create(
                outlet=outlet,
                name=request.data['name'],
                nature=request.data['nature'],
                parent_id=request.data.get('parentId'),
            )
            return Response(LedgerGroupSerializer(group).data, status=201)
        except Exception as e:
            return Response({'detail': str(e)}, status=400)


class LedgerListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        outlet_id = get_outlet_id(request)
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        qs = Ledger.objects.filter(outlet_id=outlet_id).select_related('group')
        ledger_type = request.query_params.get('type')
        if ledger_type == 'cash':
            qs = qs.filter(group__name='Cash in Hand')
        elif ledger_type == 'bank':
            qs = qs.filter(group__name='Bank Accounts')
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(name__icontains=search)
        voucher_type = request.query_params.get('voucherType', '').lower()
        if voucher_type == 'receipt':
            qs = qs.filter(group__nature__in=['asset', 'income'])
        elif voucher_type == 'payment':
            qs = qs.filter(group__nature__in=['liability', 'expense'])
        elif voucher_type == 'contra':
            qs = qs.filter(group__name__in=['Cash in Hand', 'Bank Accounts'])
        return Response({
            'data': LedgerSerializer(qs, many=True).data,
            'meta': {'total': qs.count()},
        })

    def post(self, request):
        outlet_id = get_outlet_id(request)
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
            ledger = Ledger.objects.create(
                outlet=outlet,
                name=request.data['name'],
                group_id=request.data['groupId'],
                opening_balance=request.data.get('openingBalance', 0),
                balance_type=request.data.get('balanceType', 'Dr'),
                phone=request.data.get('phone', ''),
                gstin=request.data.get('gstin', ''),
                address=request.data.get('address', ''),
            )
            return Response(LedgerSerializer(ledger).data, status=201)
        except Exception as e:
            return Response({'detail': str(e)}, status=400)


class LedgerDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, ledger_id):
        try:
            ledger = Ledger.objects.select_related('group').get(id=ledger_id)
            for field in ['name', 'phone', 'gstin', 'address']:
                if field in request.data:
                    setattr(ledger, field, request.data[field])
            if 'groupId' in request.data:
                ledger.group_id = request.data['groupId']
            ledger.save()
            return Response(LedgerSerializer(ledger).data)
        except Ledger.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)


class LedgerStatementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, ledger_id):
        try:
            ledger = Ledger.objects.select_related('group').get(id=ledger_id)
        except Ledger.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)

        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')

        lines_qs = ledger.voucherline_set.select_related('voucher').order_by('voucher__date', 'voucher__created_at')
        if from_date:
            lines_qs = lines_qs.filter(voucher__date__gte=from_date)
        if to_date:
            lines_qs = lines_qs.filter(voucher__date__lte=to_date)

        transactions = []
        running = float(ledger.opening_balance)
        for line in lines_qs:
            running += float(line.debit) - float(line.credit)
            transactions.append({
                'date': str(line.voucher.date),
                'voucherNo': line.voucher.voucher_no,
                'voucherType': line.voucher.voucher_type,
                'description': line.description or line.voucher.narration,
                'debit': float(line.debit),
                'credit': float(line.credit),
                'balance': round(running, 2),
            })

        return Response({
            'ledger': LedgerSerializer(ledger).data,
            'openingBalance': float(ledger.opening_balance),
            'closingBalance': round(running, 2),
            'transactions': transactions,
        })


class LedgerSyncView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        outlet_id = get_outlet_id(request)
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
            LedgerService.sync_customer_ledgers(outlet)
            LedgerService.sync_distributor_ledgers(outlet)
            return Response({'detail': 'Ledgers synced successfully.'})
        except Exception as e:
            return Response({'detail': str(e)}, status=400)


class VoucherNextNoView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        outlet_id = get_outlet_id(request)
        voucher_type = request.query_params.get('type', 'receipt')
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        no = VoucherService.generate_voucher_no(outlet_id, voucher_type)
        return Response({'voucherNo': no})


class VoucherListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        outlet_id = get_outlet_id(request)
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        qs = Voucher.objects.filter(outlet_id=outlet_id).prefetch_related('lines__ledger')
        voucher_type = request.query_params.get('type')
        if voucher_type:
            qs = qs.filter(voucher_type=voucher_type)
        qs = qs.order_by('-date', '-created_at')
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('pageSize', 20))
        total = qs.count()
        start = (page - 1) * page_size
        qs = qs[start:start + page_size]
        return Response({
            'data': VoucherSerializer(qs, many=True).data,
            'meta': {'total': total, 'page': page},
        })

    def post(self, request):
        outlet_id = get_outlet_id(request)
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        try:
            voucher = VoucherService.create_voucher(
                outlet_id=outlet_id,
                staff_id=request.user.id,
                data=request.data,
            )
            voucher.refresh_from_db()
            return Response(
                VoucherSerializer(Voucher.objects.prefetch_related('lines__ledger').get(id=voucher.id)).data,
                status=201
            )
        except ValidationError as e:
            return Response({'detail': str(e)}, status=400)
        except Exception as e:
            logger.exception('Error creating voucher')
            return Response({'detail': str(e)}, status=400)


class VoucherDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, voucher_id):
        try:
            voucher = Voucher.objects.prefetch_related('lines__ledger').get(id=voucher_id)
            return Response(VoucherSerializer(voucher).data)
        except Voucher.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)


class DebitNoteListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        outlet_id = get_outlet_id(request)
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        qs = DebitNote.objects.filter(outlet_id=outlet_id).select_related('distributor').prefetch_related('items')
        qs = qs.order_by('-date', '-created_at')
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('pageSize', 20))
        total = qs.count()
        start = (page - 1) * page_size
        qs = qs[start:start + page_size]
        return Response({
            'data': DebitNoteSerializer(qs, many=True).data,
            'meta': {'total': total, 'page': page},
        })

    def post(self, request):
        outlet_id = get_outlet_id(request)
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        try:
            note = DebitNoteService.create(
                outlet_id=outlet_id,
                staff_id=request.user.id,
                data=request.data,
            )
            note.refresh_from_db()
            return Response(
                DebitNoteSerializer(DebitNote.objects.select_related('distributor').prefetch_related('items').get(id=note.id)).data,
                status=201
            )
        except ValidationError as e:
            return Response({'detail': str(e)}, status=400)
        except Exception as e:
            logger.exception('Error creating debit note')
            return Response({'detail': str(e)}, status=400)


class CreditNoteListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        outlet_id = get_outlet_id(request)
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        qs = CreditNote.objects.filter(outlet_id=outlet_id).select_related('customer').prefetch_related('items')
        qs = qs.order_by('-date', '-created_at')
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('pageSize', 20))
        total = qs.count()
        start = (page - 1) * page_size
        qs = qs[start:start + page_size]
        return Response({
            'data': CreditNoteSerializer(qs, many=True).data,
            'meta': {'total': total, 'page': page},
        })

    def post(self, request):
        outlet_id = get_outlet_id(request)
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        try:
            note = CreditNoteService.create(
                outlet_id=outlet_id,
                staff_id=request.user.id,
                data=request.data,
            )
            note.refresh_from_db()
            return Response(
                CreditNoteSerializer(CreditNote.objects.select_related('customer').prefetch_related('items').get(id=note.id)).data,
                status=201
            )
        except ValidationError as e:
            return Response({'detail': str(e)}, status=400)
        except Exception as e:
            logger.exception('Error creating credit note')
            return Response({'detail': str(e)}, status=400)
