import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.core.permissions import IsAdminStaff, IsManagerOrAbove
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
    permission_classes = [IsManagerOrAbove]

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
    permission_classes = [IsManagerOrAbove]

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
        group_name = request.query_params.get('group', '').strip()
        if group_name:
            qs = qs.filter(group__name__iexact=group_name)
        search = request.query_params.get('search', '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(Q(name__icontains=search) | Q(phone__icontains=search))
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
            d = request.data
            ledger = Ledger.objects.create(
                outlet=outlet,
                name=d['name'],
                group_id=d['groupId'],
                opening_balance=d.get('openingBalance', 0),
                balance_type=d.get('balanceType', 'Dr'),
                phone=d.get('phone', ''),
                gstin=d.get('gstin', ''),
                address=d.get('address', ''),
                # Contact
                station=d.get('station', ''),
                mail_to=d.get('mailTo', ''),
                contact_person=d.get('contactPerson', ''),
                designation=d.get('designation', ''),
                phone_office=d.get('phoneOffice', ''),
                phone_residence=d.get('phoneResidence', ''),
                fax_no=d.get('faxNo', ''),
                website=d.get('website', ''),
                email=d.get('email', ''),
                pincode=d.get('pincode', ''),
                # Compliance
                freeze_upto=d.get('freezeUpto') or None,
                dl_no=d.get('dlNo', ''),
                dl_expiry=d.get('dlExpiry') or None,
                vat_no=d.get('vatNo', ''),
                vat_expiry=d.get('vatExpiry') or None,
                st_no=d.get('stNo', ''),
                st_expiry=d.get('stExpiry') or None,
                food_licence_no=d.get('foodLicenceNo', ''),
                food_licence_expiry=d.get('foodLicenceExpiry') or None,
                extra_heading_no=d.get('extraHeadingNo', ''),
                extra_heading_expiry=d.get('extraHeadingExpiry') or None,
                pan_no=d.get('panNo', ''),
                it_pan_no=d.get('itPanNo', ''),
                # GST / Tax
                gst_heading=d.get('gstHeading', 'local'),
                bill_export=d.get('billExport', 'gstn'),
                ledger_type=d.get('ledgerType', 'registered'),
                # Settings
                balancing_method=d.get('balancingMethod', 'bill_by_bill'),
                ledger_category=d.get('ledgerCategory', 'OTHERS'),
                state=d.get('state', ''),
                country=d.get('country', 'India'),
                color=d.get('color', 'normal'),
                is_hidden=d.get('isHidden', False),
                retailio_id=d.get('retailioId', ''),
            )
            return Response(LedgerSerializer(ledger).data, status=201)
        except Exception as e:
            return Response({'detail': str(e)}, status=400)


class LedgerDetailView(APIView):
    permission_classes = [IsAdminStaff]

    def put(self, request, ledger_id):
        try:
            ledger = Ledger.objects.select_related('group').get(id=ledger_id)
            # H7: Enforce outlet ownership — staff can only edit ledgers in their outlet
            if ledger.outlet_id != request.user.outlet_id:
                return Response({'detail': 'You do not have permission to edit this ledger.'}, status=403)
            d = request.data
            FIELD_MAP = {
                'name': 'name', 'phone': 'phone', 'gstin': 'gstin', 'address': 'address',
                'station': 'station', 'mailTo': 'mail_to', 'contactPerson': 'contact_person',
                'designation': 'designation', 'phoneOffice': 'phone_office',
                'phoneResidence': 'phone_residence', 'faxNo': 'fax_no',
                'website': 'website', 'email': 'email', 'pincode': 'pincode',
                'freezeUpto': 'freeze_upto', 'dlNo': 'dl_no', 'dlExpiry': 'dl_expiry',
                'vatNo': 'vat_no', 'vatExpiry': 'vat_expiry', 'stNo': 'st_no',
                'stExpiry': 'st_expiry', 'foodLicenceNo': 'food_licence_no',
                'foodLicenceExpiry': 'food_licence_expiry', 'extraHeadingNo': 'extra_heading_no',
                'extraHeadingExpiry': 'extra_heading_expiry', 'panNo': 'pan_no',
                'itPanNo': 'it_pan_no', 'gstHeading': 'gst_heading', 'billExport': 'bill_export',
                'ledgerType': 'ledger_type', 'balancingMethod': 'balancing_method',
                'ledgerCategory': 'ledger_category', 'state': 'state', 'country': 'country',
                'color': 'color', 'isHidden': 'is_hidden', 'retailioId': 'retailio_id',
            }
            for api_key, model_field in FIELD_MAP.items():
                if api_key in d:
                    val = d[api_key]
                    # Treat empty string as None for date fields
                    if model_field.endswith(('_upto', '_expiry')) and val == '':
                        val = None
                    setattr(ledger, model_field, val)
            if 'groupId' in d:
                ledger.group_id = d['groupId']
            ledger.save()
            return Response(LedgerSerializer(ledger).data)
        except Ledger.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)


class LedgerStatementView(APIView):
    permission_classes = [IsManagerOrAbove]

    def get(self, request, ledger_id):
        try:
            ledger = Ledger.objects.select_related('group').get(id=ledger_id)
        except Ledger.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)

        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')

        from apps.accounts.models import JournalLine

        # --- VoucherLines (manual voucher entries) ---
        voucher_lines_qs = ledger.voucherline_set.select_related('voucher').order_by('voucher__date', 'voucher__created_at')
        if from_date:
            voucher_lines_qs = voucher_lines_qs.filter(voucher__date__gte=from_date)
        if to_date:
            voucher_lines_qs = voucher_lines_qs.filter(voucher__date__lte=to_date)

        # --- JournalLines (auto-posted from purchases, sales, etc.) ---
        SOURCE_TYPE_TO_VOUCHER = {
            'PURCHASE': 'purchase',
            'SALE': 'sale',
            'RETURN': 'journal',
            'CREDIT_PAYMENT': 'receipt',
        }
        
        # FIX: We add .exclude(journal_entry__source_type='VOUCHER') 
        # to stop it from double-counting the manual vouchers we already grabbed above!
        journal_lines_qs = JournalLine.objects.filter(
            ledger=ledger
        ).exclude(
            journal_entry__source_type='VOUCHER'
        ).select_related('journal_entry').order_by('journal_entry__date', 'journal_entry__created_at')
        if from_date:
            journal_lines_qs = journal_lines_qs.filter(journal_entry__date__gte=from_date)
        if to_date:
            journal_lines_qs = journal_lines_qs.filter(journal_entry__date__lte=to_date)

        # Build unified list, tagged with sort key (date, created_at)
        raw = []
        for line in voucher_lines_qs:
            raw.append({
                '_date': line.voucher.date,
                '_created_at': line.voucher.created_at,
                'date': str(line.voucher.date),
                'voucherNo': line.voucher.voucher_no,
                'voucherType': line.voucher.voucher_type,
                'description': line.description or line.voucher.narration,
                'debit': float(line.debit),
                'credit': float(line.credit),
            })
        for line in journal_lines_qs:
            je = line.journal_entry
            raw.append({
                '_date': je.date,
                '_created_at': je.created_at,
                'date': str(je.date),
                'voucherNo': '',
                'voucherType': SOURCE_TYPE_TO_VOUCHER.get(je.source_type, 'journal'),
                'description': je.narration,
                'debit': float(line.debit_amount),
                'credit': float(line.credit_amount),
            })

        raw.sort(key=lambda r: (r['_date'], r['_created_at']))

        transactions = []
        running = float(ledger.opening_balance)
        for row in raw:
            running += row['debit'] - row['credit']
            transactions.append({
                'date': row['date'],
                'voucherNo': row['voucherNo'],
                'voucherType': row['voucherType'],
                'description': row['description'],
                'debit': row['debit'],
                'credit': row['credit'],
                'balance': round(running, 2),
            })

        return Response({
            'ledger': LedgerSerializer(ledger).data,
            'openingBalance': float(ledger.opening_balance),
            'closingBalance': round(running, 2),
            'transactions': transactions,
        })


class LedgerSyncView(APIView):
    permission_classes = [IsManagerOrAbove]

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
    permission_classes = [IsManagerOrAbove]

    def get(self, request):
        outlet_id = get_outlet_id(request)
        voucher_type = request.query_params.get('type', 'receipt')
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        no = VoucherService.generate_voucher_no(outlet_id, voucher_type)
        return Response({'voucherNo': no})


class VoucherListView(APIView):
    permission_classes = [IsManagerOrAbove]

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
    permission_classes = [IsManagerOrAbove]

    def get(self, request, voucher_id):
        try:
            voucher = Voucher.objects.prefetch_related('lines__ledger').get(id=voucher_id)
            return Response(VoucherSerializer(voucher).data)
        except Voucher.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)


class DebitNoteListView(APIView):
    permission_classes = [IsManagerOrAbove]

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
    permission_classes = [IsManagerOrAbove]

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


class LedgerOutstandingView(APIView):
    permission_classes = [IsManagerOrAbove]

    def get(self, request, ledger_id):
        try:
            ledger = Ledger.objects.select_related('group').get(id=ledger_id)
        except Ledger.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        balance = float(ledger.current_balance)
        balance_type = ledger.balance_type
        return Response({'outstanding': balance, 'balanceType': balance_type})


class LedgerPendingBillsView(APIView):
    permission_classes = [IsManagerOrAbove]

    def get(self, request, ledger_id):
        outlet_id = get_outlet_id(request)
        if not outlet_id:
            return Response({'detail': 'outletId required'}, status=400)
        bills = VoucherService.get_pending_bills(outlet_id, ledger_id)
        return Response({'data': bills, 'meta': {'total': len(bills)}})


class TrialBalanceView(APIView):
    """
    GET /api/v1/accounts/trial-balance/?outlet_id=xxx

    Returns all ledgers grouped by account group with their balances.
    Total debits should equal total credits for double-entry verification.

    Access: super_admin, admin only.
    """
    permission_classes = [IsAdminStaff]

    def get(self, request):
        outlet_id = request.query_params.get('outlet_id')
        if not outlet_id:
            return Response({'detail': 'outlet_id required'}, status=400)

        # Ensure user can only access their own outlet
        if str(request.user.outlet_id) != str(outlet_id) and request.user.role != 'super_admin':
            return Response({'detail': 'Access denied for this outlet.'}, status=403)

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=404)

        # Get all ledgers grouped by group
        groups = LedgerGroup.objects.filter(
            outlet=outlet
        ).prefetch_related('ledger_set').order_by('name')

        groups_data = []
        total_debit = 0
        total_credit = 0

        for group in groups:
            group_ledgers = []
            for ledger in group.ledger_set.all():
                balance = float(ledger.current_balance)
                # Determine if balance is debit or credit based on group nature and balance_type
                nature = group.nature
                balance_type = ledger.balance_type

                if nature in ('asset', 'expense'):
                    # For assets/expenses: Dr balance is debit, Cr balance is credit
                    if balance_type == 'Dr':
                        debit = max(balance, 0)
                        credit = max(-balance, 0)
                    else:
                        debit = max(-balance, 0)
                        credit = max(balance, 0)
                else:
                    # For liabilities/income: Cr balance is credit, Dr balance is debit
                    if balance_type == 'Cr':
                        debit = max(-balance, 0)
                        credit = max(balance, 0)
                    else:
                        debit = max(balance, 0)
                        credit = max(-balance, 0)

                total_debit += debit
                total_credit += credit

                group_ledgers.append({
                    'name': ledger.name,
                    'debit': debit,
                    'credit': credit,
                    'balance': balance,
                })

            if group_ledgers:
                groups_data.append({
                    'group': group.name,
                    'ledgers': group_ledgers,
                })

        return Response({
            'groups': groups_data,
            'total_debit': total_debit,
            'total_credit': total_credit,
            'balanced': abs(total_debit - total_credit) < 0.01,
        })


class GSTSummaryView(APIView):
    """
    GET /api/v1/accounts/gst-summary/?outlet_id=xxx&month=2026-03

    Returns GST summary for a specific month:
    - gst_output: Total GST collected from customers
    - gst_input: Total GST paid to distributors
    - gst_payable: (gst_output - gst_input)

    Access: super_admin, admin only.
    """
    permission_classes = [IsAdminStaff]

    def get(self, request):
        from datetime import datetime
        from django.db.models import Sum, Q
        from apps.accounts.models import JournalLine

        outlet_id = request.query_params.get('outlet_id')
        month_str = request.query_params.get('month', '')  # Format: YYYY-MM

        if not outlet_id:
            return Response({'detail': 'outlet_id required'}, status=400)

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=404)

        # Parse month
        gst_output = 0
        gst_input = 0

        if month_str:
            try:
                # Parse YYYY-MM format
                year_month = month_str.split('-')
                year = int(year_month[0])
                month = int(year_month[1])
                from datetime import date
                from dateutil.relativedelta import relativedelta
                start_date = date(year, month, 1)
                end_date = start_date + relativedelta(months=1) - relativedelta(days=1)
            except (ValueError, IndexError):
                return Response({'detail': 'Invalid month format. Use YYYY-MM'}, status=400)
        else:
            # No month filter - aggregate all
            start_date = None
            end_date = None

        # Query GST ledgers and their journal lines (includes IGST for interstate)
        gst_output_ledgers = Ledger.objects.filter(
            outlet=outlet,
            name__in=['GST Output (CGST)', 'GST Output (SGST)', 'GST Output (IGST)']
        )
        gst_input_ledgers = Ledger.objects.filter(
            outlet=outlet,
            name__in=['GST Input (CGST)', 'GST Input (SGST)', 'GST Input (IGST)']
        )

        # Sum up GST Output (credits to ledger = amounts collected)
        query = JournalLine.objects.filter(ledger__in=gst_output_ledgers)
        if start_date and end_date:
            query = query.filter(
                journal_entry__date__gte=start_date,
                journal_entry__date__lte=end_date
            )
        gst_output = float(
            query.aggregate(total=Sum('credit_amount'))['total'] or 0
        )

        # Sum up GST Input (debits to ledger = amounts paid)
        query = JournalLine.objects.filter(ledger__in=gst_input_ledgers)
        if start_date and end_date:
            query = query.filter(
                journal_entry__date__gte=start_date,
                journal_entry__date__lte=end_date
            )
        gst_input = float(
            query.aggregate(total=Sum('debit_amount'))['total'] or 0
        )

        gst_payable = gst_output - gst_input

        return Response({
            'month': month_str or 'All',
            'gst_output': gst_output,
            'gst_input': gst_input,
            'gst_payable': gst_payable,
        })
