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
                'sourceType': 'VOUCHER',
                'sourceId': str(line.voucher.id),
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
                'sourceType': je.source_type,
                'sourceId': str(je.source_id) if je.source_id else '',
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
                'sourceType': row['sourceType'],
                'sourceId': row['sourceId'],
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
    GET /api/v1/accounts/trial-balance/?outlet_id=xxx&from_date=yyyy-mm-dd&to_date=yyyy-mm-dd

    Returns all ledgers grouped by their LedgerGroup.
    Calculates Opening Balance (before from_date), Period Totals (from_date to to_date), 
    and Closing Balance.
    """
    permission_classes = [IsAdminStaff]

    def get(self, request):
        from decimal import Decimal
        from django.db.models import Sum
        from datetime import datetime, date
        from apps.accounts.models import JournalLine

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

        from_date_str = request.query_params.get('from_date', '')
        to_date_str = request.query_params.get('to_date', '')

        # Defaults if not fully provided
        today = date.today()
        # Default starting of financial year: April 1st
        if today.month < 4:
            fin_year_start = date(today.year - 1, 4, 1)
        else:
            fin_year_start = date(today.year, 4, 1)

        from_date = fin_year_start
        to_date = today

        if from_date_str:
            try:
                from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
            except ValueError:
                pass
        if to_date_str:
            try:
                to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
            except ValueError:
                pass

        groups = LedgerGroup.objects.filter(outlet=outlet).prefetch_related('ledger_set').order_by('name')

        # Aggregate JournalLines < from_date for opening
        opening_agg = JournalLine.objects.filter(
            ledger__outlet=outlet,
            journal_entry__date__lt=from_date
        ).values('ledger_id').annotate(
            tot_debit=Sum('debit_amount'),
            tot_credit=Sum('credit_amount')
        )
        
        # Aggregate JournalLines between from_date and to_date for period totals
        period_agg = JournalLine.objects.filter(
            ledger__outlet=outlet,
            journal_entry__date__gte=from_date,
            journal_entry__date__lte=to_date
        ).values('ledger_id').annotate(
            tot_debit=Sum('debit_amount'),
            tot_credit=Sum('credit_amount')
        )

        op_map = {item['ledger_id']: item for item in opening_agg}
        per_map = {item['ledger_id']: item for item in period_agg}

        groups_data = []
        grand_total_closing_debit = Decimal('0')
        grand_total_closing_credit = Decimal('0')

        for group in groups:
            group_ledgers = []
            for ledger in group.ledger_set.all():
                # 1. Base Opening Balance (from ledger creation)
                base_opening = ledger.opening_balance or Decimal('0')
                if ledger.balance_type == 'Cr':
                    base_op_dr = Decimal('0')
                    base_op_cr = base_opening
                else:
                    base_op_dr = base_opening
                    base_op_cr = Decimal('0')

                # 2. Accumulated before from_date
                op_data = op_map.get(ledger.id, {})
                acc_op_dr = op_data.get('tot_debit') or Decimal('0')
                acc_op_cr = op_data.get('tot_credit') or Decimal('0')

                total_op_dr = base_op_dr + acc_op_dr
                total_op_cr = base_op_cr + acc_op_cr

                # Net Opening Balance
                opening_debit = Decimal('0')
                opening_credit = Decimal('0')
                if total_op_dr > total_op_cr:
                    opening_debit = total_op_dr - total_op_cr
                else:
                    opening_credit = total_op_cr - total_op_dr

                # 3. Period Totals
                per_data = per_map.get(ledger.id, {})
                period_debit = per_data.get('tot_debit') or Decimal('0')
                period_credit = per_data.get('tot_credit') or Decimal('0')

                # 4. Closing Balance
                net_balance = (opening_debit - opening_credit) + (period_debit - period_credit)
                
                closing_debit = Decimal('0')
                closing_credit = Decimal('0')
                if net_balance > 0:
                    closing_debit = net_balance
                elif net_balance < 0:
                    closing_credit = abs(net_balance)

                grand_total_closing_debit += closing_debit
                grand_total_closing_credit += closing_credit

                group_ledgers.append({
                    'id': str(ledger.id),
                    'name': ledger.name,
                    'opening_debit': float(opening_debit),
                    'opening_credit': float(opening_credit),
                    'period_debit': float(period_debit),
                    'period_credit': float(period_credit),
                    'closing_debit': float(closing_debit),
                    'closing_credit': float(closing_credit)
                })

            if group_ledgers:
                groups_data.append({
                    'id': str(group.id),
                    'group': group.name,
                    'ledgers': group_ledgers,
                })

        return Response({
            'groups': groups_data,
            'total_closing_debit': float(grand_total_closing_debit),
            'total_closing_credit': float(grand_total_closing_credit),
            'balanced': abs(grand_total_closing_debit - grand_total_closing_credit) < Decimal('0.01'),
            'from_date': str(from_date),
            'to_date': str(to_date)
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
            name__in=['GST Payable CGST', 'GST Payable SGST', 'GST Payable IGST']
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


class BalanceSheetView(APIView):
    """
    GET /api/v1/balance-sheet/?outlet_id=X&as_on_date=YYYY-MM-DD&stock_valuation=purchase_rate

    Returns Balance Sheet in two-sided format (Marg ERP style):
      LEFT  — Liabilities & Capital
      RIGHT — Assets (including Stock in Hand from inventory)

    Net Profit is always calculated for the FULL FINANCIAL YEAR up to as_on_date.
    Duties & Taxes (GST Input) is placed on Assets side.
    GST Payable goes on Liabilities side.
    """
    permission_classes = [IsAdminStaff]

    def get(self, request):
        from decimal import Decimal
        from django.db.models import Sum
        from datetime import date, datetime
        from apps.accounts.models import JournalLine
        from apps.inventory.models import Batch

        outlet_id = request.query_params.get('outlet_id')
        if not outlet_id:
            return Response({'detail': 'outlet_id required'}, status=400)

        if str(request.user.outlet_id) != str(outlet_id) and request.user.role != 'super_admin':
            return Response({'detail': 'Access denied for this outlet.'}, status=403)

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=404)

        # ── Date setup ───────────────────────────────────────────────────────
        today = date.today()
        as_on_date_str = request.query_params.get('as_on_date', '')
        if as_on_date_str:
            try:
                as_on_date = datetime.strptime(as_on_date_str, '%Y-%m-%d').date()
            except ValueError:
                as_on_date = today
        else:
            as_on_date = today

        # Financial year start (April 1) for this as_on_date
        if as_on_date.month < 4:
            fy_start = date(as_on_date.year - 1, 4, 1)
        else:
            fy_start = date(as_on_date.year, 4, 1)

        stock_valuation = request.query_params.get('stock_valuation', 'purchase_rate')
        stock_scope = request.query_params.get('stock_scope', 'all_days')  # all_days | no_stock
        show_opening = request.query_params.get('show_opening', 'false').lower() == 'true'

        # ── Aggregate JournalLines up to as_on_date ─────────────────────────
        # Opening balances: all journal lines BEFORE the FY start
        opening_agg = JournalLine.objects.filter(
            ledger__outlet=outlet,
            journal_entry__date__lt=fy_start
        ).values('ledger_id').annotate(
            tot_debit=Sum('debit_amount'),
            tot_credit=Sum('credit_amount')
        )

        # Period lines: FY start up to as_on_date
        period_agg = JournalLine.objects.filter(
            ledger__outlet=outlet,
            journal_entry__date__gte=fy_start,
            journal_entry__date__lte=as_on_date
        ).values('ledger_id').annotate(
            tot_debit=Sum('debit_amount'),
            tot_credit=Sum('credit_amount')
        )

        op_map = {item['ledger_id']: item for item in opening_agg}
        per_map = {item['ledger_id']: item for item in period_agg}

        # ── Helper: compute closing balance for a ledger ─────────────────────
        def ledger_closing(ledger):
            base_opening = ledger.opening_balance or Decimal('0')
            if ledger.balance_type == 'Cr':
                base_op_dr, base_op_cr = Decimal('0'), base_opening
            else:
                base_op_dr, base_op_cr = base_opening, Decimal('0')

            op_data = op_map.get(ledger.id, {})
            acc_op_dr = op_data.get('tot_debit') or Decimal('0')
            acc_op_cr = op_data.get('tot_credit') or Decimal('0')

            total_op_dr = base_op_dr + acc_op_dr
            total_op_cr = base_op_cr + acc_op_cr

            if total_op_dr > total_op_cr:
                opening_debit = total_op_dr - total_op_cr
                opening_credit = Decimal('0')
            else:
                opening_debit = Decimal('0')
                opening_credit = total_op_cr - total_op_dr

            per_data = per_map.get(ledger.id, {})
            period_debit = per_data.get('tot_debit') or Decimal('0')
            period_credit = per_data.get('tot_credit') or Decimal('0')

            net = (opening_debit - opening_credit) + (period_debit - period_credit)
            if net > 0:
                return float(opening_debit), float(opening_credit), float(net), 0.0
            else:
                return float(opening_debit), float(opening_credit), 0.0, float(abs(net))

        # ── Group classification maps ────────────────────────────────────────
        LIABILITIES_CAPITAL = {'Capital Account'}
        LIABILITIES_LOANS = {'Loans (Liability)', 'Bank OD', 'Branch / Division', 'Suspense Account'}
        LIABILITIES_CURRENT = {'Sundry Creditors', 'Current Liabilities'}

        ASSETS_FIXED = {'Fixed Assets'}
        ASSETS_INVESTMENTS = {'Investments'}
        ASSETS_CURRENT = {
            'Cash in Hand', 'Bank Accounts', 'Sundry Debtors',
            'Current Assets', 'Duties & Taxes',  # GST Input (fallback ledgers) = asset (Govt owes us)
            'Tax-CGST', 'Tax-SGST', 'Tax-IGST',  # Rate-specific GST Input sub-groups = asset
            'Stock in Hand',
        }
        # Sales Account / income / expense groups → used for Net Profit only
        INCOME_GROUPS = {'Sales Account', 'Direct Incomes', 'Indirect Incomes'}
        EXPENSE_GROUPS = {'Purchase Account', 'Direct Expenses', 'Indirect Expenses'}

        # ── Build group data ─────────────────────────────────────────────────
        all_groups = LedgerGroup.objects.filter(outlet=outlet).prefetch_related('ledger_set')

        def build_group_data(group):
            ledger_rows = []
            group_dr_total = Decimal('0')
            group_cr_total = Decimal('0')
            for ledger in group.ledger_set.all():
                op_dr, op_cr, cl_dr, cl_cr = ledger_closing(ledger)
                # Skip zero-balance ledgers from data (frontend can filter)
                ledger_rows.append({
                    'id': str(ledger.id),
                    'name': ledger.name,
                    'opening_balance': float(op_dr if op_dr > 0 else op_cr),
                    'opening_is_debit': op_dr > 0,
                    'closing_debit': cl_dr,
                    'closing_credit': cl_cr,
                    'closing_balance': float(cl_dr if cl_dr > 0 else cl_cr),
                    'is_debit_balance': cl_dr > 0,
                    'balance_type': 'Dr' if cl_dr > 0 else 'Cr',
                })
                group_dr_total += Decimal(str(cl_dr))
                group_cr_total += Decimal(str(cl_cr))

            net_group = group_dr_total - group_cr_total
            return {
                'id': str(group.id),
                'name': group.name,
                'closing_debit': float(group_dr_total),
                'closing_credit': float(group_cr_total),
                'closing_balance': float(abs(net_group)),
                'is_debit_balance': net_group >= 0,
                'ledgers': ledger_rows,
            }

        # ── Categorize groups into Balance Sheet buckets ─────────────────────
        capital_groups = []
        loans_groups = []
        current_liab_groups = []
        fixed_asset_groups = []
        investment_groups = []
        current_asset_groups = []
        # Income/expense groups for net profit calc only
        income_groups = []
        expense_groups = []

        for group in all_groups:
            gdata = build_group_data(group)
            name = group.name

            if name in LIABILITIES_CAPITAL:
                capital_groups.append(gdata)
            elif name in LIABILITIES_LOANS:
                loans_groups.append(gdata)
            elif name in LIABILITIES_CURRENT:
                current_liab_groups.append(gdata)
            elif name in ASSETS_FIXED:
                fixed_asset_groups.append(gdata)
            elif name in ASSETS_INVESTMENTS:
                investment_groups.append(gdata)
            elif name in ASSETS_CURRENT:
                current_asset_groups.append(gdata)
            elif name in INCOME_GROUPS:
                income_groups.append(gdata)
            elif name in EXPENSE_GROUPS:
                expense_groups.append(gdata)
            # else: ignore groups not relevant to balance sheet

        # ── Net Profit (FY start → as_on_date) ─────────────────────────────
        # Get all income and expense ledger IDs
        income_group_names = list(INCOME_GROUPS)
        expense_group_names = list(EXPENSE_GROUPS)

        income_ledger_ids = Ledger.objects.filter(
            outlet=outlet, group__name__in=income_group_names
        ).values_list('id', flat=True)
        expense_ledger_ids = Ledger.objects.filter(
            outlet=outlet, group__name__in=expense_group_names
        ).values_list('id', flat=True)

        # Sum credits on income ledgers (FY start → as_on_date)
        income_agg = JournalLine.objects.filter(
            ledger__in=income_ledger_ids,
            journal_entry__date__gte=fy_start,
            journal_entry__date__lte=as_on_date
        ).aggregate(
            total_cr=Sum('credit_amount'),
            total_dr=Sum('debit_amount')
        )
        # Also include anything before FY start (opening income balance)
        income_agg_pre = JournalLine.objects.filter(
            ledger__in=income_ledger_ids,
            journal_entry__date__lt=fy_start
        ).aggregate(
            total_cr=Sum('credit_amount'),
            total_dr=Sum('debit_amount')
        )

        income_total = float(
            (income_agg['total_cr'] or Decimal('0'))
            - (income_agg['total_dr'] or Decimal('0'))
        )
        # Add opening income balances (income ledger base opening balances)
        for ledger in Ledger.objects.filter(outlet=outlet, group__name__in=income_group_names):
            base = ledger.opening_balance or Decimal('0')
            if ledger.balance_type == 'Cr':
                income_total += float(base)
            else:
                income_total -= float(base)

        # Sum debits on expense ledgers
        expense_agg = JournalLine.objects.filter(
            ledger__in=expense_ledger_ids,
            journal_entry__date__gte=fy_start,
            journal_entry__date__lte=as_on_date
        ).aggregate(
            total_cr=Sum('credit_amount'),
            total_dr=Sum('debit_amount')
        )

        expense_total = float(
            (expense_agg['total_dr'] or Decimal('0'))
            - (expense_agg['total_cr'] or Decimal('0'))
        )
        # Add opening expense balances
        for ledger in Ledger.objects.filter(outlet=outlet, group__name__in=expense_group_names):
            base = ledger.opening_balance or Decimal('0')
            if ledger.balance_type == 'Dr':
                expense_total += float(base)
            else:
                expense_total -= float(base)

        net_profit = income_total - expense_total  # positive = profit, negative = loss

        # ── Stock in Hand (from inventory, read-only) ────────────────────────
        stock_value = Decimal('0')
        if stock_scope != 'no_stock':
            batches = Batch.objects.filter(outlet=outlet, is_active=True, qty_strips__gt=0)
            for batch in batches:
                qty = Decimal(str(batch.qty_strips))
                if stock_valuation == 'mrp_rate':
                    rate = batch.mrp
                elif stock_valuation == 'sale_rate':
                    rate = batch.sale_rate
                elif stock_valuation == 'cost_ext':
                    rate = batch.purchase_rate * Decimal('1.05')  # purchase + 5%
                else:  # purchase_rate (default)
                    rate = batch.purchase_rate
                stock_value += qty * rate

        # ── Closing Stock adjusts Net Profit (Marg ERP Trading Account logic) ─
        stock_total = float(stock_value)  # 0 when stock_scope == 'no_stock'
        net_profit_adjusted = net_profit + stock_total  # closing stock offsets purchases in P&L
        is_profit = net_profit_adjusted >= 0

        # ── Compute section totals ───────────────────────────────────────────
        def sum_groups_cr(groups):
            """Sum credit (liability) closing balances of a list of groups."""
            return sum(g['closing_credit'] for g in groups)

        def sum_groups_dr(groups):
            """Sum debit (asset) closing balances of a list of groups."""
            return sum(g['closing_debit'] for g in groups)

        def group_net(groups):
            """Net closing balance (sum of all ledger credit - debit) for liability groups."""
            total = 0.0
            for g in groups:
                total += g['closing_credit'] - g['closing_debit']
            return total

        def group_net_asset(groups):
            """Net closing balance (debit - credit) for asset groups."""
            total = 0.0
            for g in groups:
                total += g['closing_debit'] - g['closing_credit']
            return total

        capital_total = group_net(capital_groups) + net_profit_adjusted
        loans_total = group_net(loans_groups)
        current_liab_total = group_net(current_liab_groups)
        total_liabilities = capital_total + loans_total + current_liab_total

        fixed_assets_total = group_net_asset(fixed_asset_groups)
        investments_total = group_net_asset(investment_groups)
        current_assets_total = group_net_asset(current_asset_groups)
        # stock_total already computed and adjusted into net_profit_adjusted above
        total_assets = fixed_assets_total + investments_total + current_assets_total + stock_total

        difference = abs(total_assets - total_liabilities)
        is_tallied = difference < 0.02  # allow for rounding

        # ── Build response ───────────────────────────────────────────────────
        return Response({
            'as_on_date': str(as_on_date),
            'fy_start': str(fy_start),
            'liabilities': {
                'capital': {
                    'groups': capital_groups,
                    'net_profit': round(net_profit_adjusted, 2),
                    'net_profit_raw': round(net_profit, 2),    # before closing stock adjustment
                    'is_profit': is_profit,
                    'total': round(capital_total, 2),
                },
                'loans': {
                    'groups': loans_groups,
                    'total': round(loans_total, 2),
                },
                'current_liabilities': {
                    'groups': current_liab_groups,
                    'total': round(current_liab_total, 2),
                },
                'total_liabilities': round(total_liabilities, 2),
            },
            'assets': {
                'fixed_assets': {
                    'groups': fixed_asset_groups,
                    'total': round(fixed_assets_total, 2),
                },
                'investments': {
                    'groups': investment_groups,
                    'total': round(investments_total, 2),
                },
                'current_assets': {
                    'groups': current_asset_groups,
                    'total': round(current_assets_total, 2),
                },
                'stock_in_hand': {
                    'valuation_method': stock_valuation,
                    'value': round(stock_total, 2),
                },
                'total_assets': round(total_assets, 2),
            },
            'is_tallied': is_tallied,
            'difference': round(difference, 2),
        })


class ProfitLossView(APIView):
    """
    GET /api/v1/profit-loss/?outlet_id=X&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
                             &stock_scope=all_days&stock_valuation=purchase_rate

    Returns a full Marg-ERP-style Trading + P&L Account in two-sided format:
      LEFT  — Dr side  (Expenses, Opening Stock, Purchases)
      RIGHT — Cr side  (Sales, Closing Stock, Income)

    Net Profit here MUST match the Net Profit shown in Balance Sheet Capital.
    """
    permission_classes = [IsAdminStaff]

    def get(self, request):
        from decimal import Decimal
        from django.db.models import Sum
        from datetime import date, datetime
        from apps.accounts.models import JournalLine
        from apps.inventory.models import Batch

        outlet_id = request.query_params.get('outlet_id')
        if not outlet_id:
            return Response({'detail': 'outlet_id required'}, status=400)

        if str(request.user.outlet_id) != str(outlet_id) and request.user.role != 'super_admin':
            return Response({'detail': 'Access denied for this outlet.'}, status=403)

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=404)

        # ── Date setup ────────────────────────────────────────────────────────
        today = date.today()

        def parse_date(s):
            try:
                return datetime.strptime(s, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                return None

        # FY start (April 1 of current financial year)
        fy_start = date(today.year, 4, 1) if today.month >= 4 else date(today.year - 1, 4, 1)

        from_date = parse_date(request.query_params.get('from_date', '')) or fy_start
        to_date   = parse_date(request.query_params.get('to_date', ''))   or today

        stock_valuation = request.query_params.get('stock_valuation', 'purchase_rate')
        stock_scope     = request.query_params.get('stock_scope', 'all_days')

        # ── Helper — aggregate JournalLines for a set of ledger IDs in period ─
        def period_agg(ledger_ids):
            return JournalLine.objects.filter(
                ledger_id__in=ledger_ids,
                journal_entry__date__gte=from_date,
                journal_entry__date__lte=to_date,
            ).aggregate(
                total_dr=Sum('debit_amount'),
                total_cr=Sum('credit_amount'),
            )

        # ── Helper — build per-ledger breakdown for a group ─────────────────
        def ledger_rows_for_group(group_name, side='dr'):
            """Returns list of {id, name, value} for the group in the period."""
            rows = []
            try:
                grp = LedgerGroup.objects.get(outlet=outlet, name=group_name)
            except LedgerGroup.DoesNotExist:
                return rows

            for ledger in grp.ledger_set.all():
                agg = period_agg([ledger.id])
                dr = float(agg['total_dr'] or 0)
                cr = float(agg['total_cr'] or 0)
                value = dr - cr if side == 'dr' else cr - dr
                rows.append({
                    'id': str(ledger.id),
                    'name': ledger.name,
                    'value': round(value, 2),
                })
            return rows

        # ── Helper — total for a named group ──────────────────────────────────
        def group_total(group_name, side='dr'):
            try:
                grp = LedgerGroup.objects.get(outlet=outlet, name=group_name)
            except LedgerGroup.DoesNotExist:
                return Decimal('0')

            ledger_ids = list(grp.ledger_set.values_list('id', flat=True))
            if not ledger_ids:
                return Decimal('0')
            agg = period_agg(ledger_ids)
            dr = agg['total_dr'] or Decimal('0')
            cr = agg['total_cr'] or Decimal('0')
            return (dr - cr) if side == 'dr' else (cr - dr)

        # ── Helper — build expense/income group breakdown ─────────────────────
        def build_group_block(group_names, side='dr'):
            """Build list of {name, value, ledgers} for a list of group names."""
            blocks = []
            total = Decimal('0')
            for gname in group_names:
                ledgers = ledger_rows_for_group(gname, side)
                val = sum(Decimal(str(l['value'])) for l in ledgers)
                total += val
                blocks.append({
                    'name': gname,
                    'value': round(float(val), 2),
                    'ledgers': ledgers,
                })
            return blocks, float(total)

        # ── SALES ──────────────────────────────────────────────────────────────
        sales_ledgers = ledger_rows_for_group('Sales Account', 'cr')
        # Net credits (income) from Sales Account
        total_sales = sum(Decimal(str(l['value'])) for l in sales_ledgers)

        # ── SALES RETURN (credit notes reduce sales) ───────────────────────────
        sales_return_ledgers = ledger_rows_for_group('Sales Account', 'dr')  # debits to Sales = returns
        # More robust: look for ledgers named "Sales Return" in any group
        total_sales_return = Decimal('0')
        sr_rows = []
        try:
            # Try to find a dedicated Sales Return ledger
            from apps.accounts.models import Ledger as LedgerModel
            for l in LedgerModel.objects.filter(outlet=outlet, name__icontains='sales return'):
                agg = period_agg([l.id])
                dr = float(agg['total_dr'] or 0)
                cr = float(agg['total_cr'] or 0)
                val = dr - cr  # Dr on sales return ledger = reducing sales
                if abs(val) > 0.001:
                    total_sales_return += Decimal(str(abs(val)))
                    sr_rows.append({'id': str(l.id), 'name': l.name, 'value': round(abs(val), 2)})
        except Exception:
            pass

        # ── PURCHASES ─────────────────────────────────────────────────────────
        purchase_ledgers = ledger_rows_for_group('Purchase Account', 'dr')
        total_purchases = sum(Decimal(str(l['value'])) for l in purchase_ledgers)

        # ── DIRECT EXPENSES (true cost expenses only — no GST/tax groups) ──────────
        # Duties & Taxes is a Balance Sheet item (GST Input = asset), NOT a P&L expense.
        DIRECT_EXP_GROUPS = ['Direct Expenses']
        direct_exp_blocks, total_direct_exp = build_group_block(DIRECT_EXP_GROUPS, 'dr')

        # ── INDIRECT EXPENSES ─────────────────────────────────────────────────
        INDIRECT_EXP_GROUPS = ['Indirect Expenses']
        indirect_exp_blocks, total_indirect_exp = build_group_block(INDIRECT_EXP_GROUPS, 'dr')

        # ── DIRECT INCOME ─────────────────────────────────────────────────────
        DIRECT_INC_GROUPS = ['Direct Incomes']
        direct_inc_blocks, total_direct_inc = build_group_block(DIRECT_INC_GROUPS, 'cr')

        # ── INDIRECT INCOME ───────────────────────────────────────────────────
        INDIRECT_INC_GROUPS = ['Indirect Incomes']
        indirect_inc_blocks, total_indirect_inc = build_group_block(INDIRECT_INC_GROUPS, 'cr')

        # ── OPENING STOCK ─────────────────────────────────────────────────────
        # Approximation: opening_stock = 0 (current Batch model has no historical qty).
        # This is consistent with Marg ERP when no opening entry exists.
        opening_stock = Decimal('0')

        # ── CLOSING STOCK ─────────────────────────────────────────────────────
        closing_stock = Decimal('0')
        if stock_scope != 'no_stock':
            batches = Batch.objects.filter(outlet=outlet, is_active=True, qty_strips__gt=0)
            for batch in batches:
                qty = Decimal(str(batch.qty_strips))
                if stock_valuation == 'mrp_rate':
                    rate = batch.mrp
                elif stock_valuation == 'sale_rate':
                    rate = batch.sale_rate
                elif stock_valuation == 'cost_ext':
                    rate = batch.purchase_rate * Decimal('1.05')
                else:
                    rate = batch.purchase_rate
                closing_stock += qty * rate

        # ── GROSS PROFIT / LOSS ───────────────────────────────────────────────
        # Cr side: Sales + Closing Stock
        # Dr side: Opening Stock + Purchases + Direct Expenses
        trading_cr = total_sales - total_sales_return + closing_stock
        trading_dr = opening_stock + total_purchases + Decimal(str(total_direct_exp))

        gross_profit_raw = float(trading_cr - trading_dr)
        is_gross_profit = gross_profit_raw >= 0
        gross_profit = abs(gross_profit_raw)

        # Trading total (both sides must balance)
        trading_total = float(max(trading_cr, trading_dr))

        # ── NET PROFIT / LOSS ─────────────────────────────────────────────────
        # Gross Profit b/f + Direct Income + Indirect Income − Indirect Expenses
        net_profit_raw = gross_profit_raw + total_direct_inc + total_indirect_inc - float(total_indirect_exp)
        is_net_profit = net_profit_raw >= 0
        net_profit = abs(net_profit_raw)

        # P&L total (both sides balance)
        pl_cr = (gross_profit if is_gross_profit else 0) + total_direct_inc + total_indirect_inc + (0 if is_net_profit else net_profit)
        pl_dr = (gross_profit if not is_gross_profit else 0) + float(total_indirect_exp) + (net_profit if is_net_profit else 0)
        pl_total = float(max(pl_cr, pl_dr))

        # Grand total
        grand_total = trading_total + pl_total

        return Response({
            'from_date': str(from_date),
            'to_date': str(to_date),
            'fy_start': str(fy_start),
            'trading_account': {
                'dr': {
                    'opening_stock': {
                        'value': round(float(opening_stock), 2),
                        'label': 'Opening Stock (approx.)',
                    },
                    'purchases': {
                        'value': round(float(total_purchases), 2),
                        'ledgers': purchase_ledgers,
                    },
                    'direct_expenses': {
                        'value': round(total_direct_exp, 2),
                        'groups': direct_exp_blocks,
                    },
                    'gross_profit': round(gross_profit, 2) if is_gross_profit else 0,
                },
                'cr': {
                    'sales': {
                        'value': round(float(total_sales), 2),
                        'ledgers': sales_ledgers,
                    },
                    'sales_return': {
                        'value': round(float(total_sales_return), 2),
                        'ledgers': sr_rows,
                    },
                    'closing_stock': {
                        'value': round(float(closing_stock), 2),
                        'valuation_method': stock_valuation,
                    },
                    'gross_loss': round(gross_profit, 2) if not is_gross_profit else 0,
                },
                'trading_total_dr': round(trading_total, 2),
                'trading_total_cr': round(trading_total, 2),
            },
            'pl_account': {
                'dr': {
                    'indirect_expenses': {
                        'value': round(total_indirect_exp, 2),
                        'groups': indirect_exp_blocks,
                    },
                    'gross_loss_bf': round(gross_profit, 2) if not is_gross_profit else 0,
                    'net_profit': round(net_profit, 2) if is_net_profit else 0,
                },
                'cr': {
                    'gross_profit_bf': round(gross_profit, 2) if is_gross_profit else 0,
                    'direct_income': {
                        'value': round(total_direct_inc, 2),
                        'groups': direct_inc_blocks,
                    },
                    'indirect_income': {
                        'value': round(total_indirect_inc, 2),
                        'groups': indirect_inc_blocks,
                    },
                    'net_loss': round(net_profit, 2) if not is_net_profit else 0,
                },
                'pl_total_dr': round(pl_total, 2),
                'pl_total_cr': round(pl_total, 2),
            },
            'summary': {
                'gross_profit': round(gross_profit_raw, 2),
                'net_profit': round(net_profit_raw, 2),
                'gross_profit_pct': round((gross_profit_raw / float(total_sales) * 100) if total_sales else 0, 2),
                'net_profit_pct': round((net_profit_raw / float(total_sales) * 100) if total_sales else 0, 2),
                'total_sales': round(float(total_sales), 2),
                'total_purchases': round(float(total_purchases), 2),
                'closing_stock': round(float(closing_stock), 2),
                'is_gross_profit': is_gross_profit,
                'is_net_profit': is_net_profit,
            },
            'grand_total': round(grand_total, 2),
        })
