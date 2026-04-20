import logging
import re
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from apps.core.permissions import IsAdminStaff
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import status
from django.db.models import Q, Sum
from django.core.exceptions import ValidationError
from datetime import datetime
from datetime import date

from apps.accounts.models import Staff, Customer, Ledger
from apps.core.models import Outlet

logger = logging.getLogger(__name__)


class LoginView(APIView):
    """
    POST /api/v1/auth/login/

    Authenticate staff member with phone + PIN.
    Returns JWT access + refresh tokens + user details.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        """
        Login with phone and staff PIN.

        Request body:
        {
            "phone": "9876543210",
            "password": "1234"  # staff_pin
        }

        Response:
        {
            "access": "<jwt_access_token>",
            "refresh": "<jwt_refresh_token>",
            "user": {
                "id": "...",
                "name": "...",
                "phone": "...",
                "role": "...",
                "staffPin": "...",
                "outletId": "...",
                "outlet": {...},
                "maxDiscount": 0,
                ...
            }
        }
        """

        phone = request.data.get('phone')
        password = request.data.get('password')

        if not phone or not password:
            return Response(
                {'detail': 'Phone and password are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        logger.info(f"Login attempt for phone: {phone}")

        try:
            # Query staff by phone
            staff = Staff.objects.get(phone=phone)
        except Staff.DoesNotExist:
            logger.warning(f"Login failed: staff not found for phone {phone}")
            return Response(
                {'detail': 'Invalid phone or password'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Validate against staff.password (AbstractBaseUser field)
        if not staff.check_password(password):
            logger.warning(f"Login failed: invalid password for staff {staff.id}")
            return Response(
                {'detail': 'Invalid phone or password'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Validate staff is active
        if not staff.is_active:
            logger.warning(f"Login failed: staff {staff.id} is inactive")
            return Response(
                {'detail': 'Staff account is inactive'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        logger.info(f"Login successful for staff {staff.id} ({staff.name})")

        # Generate JWT tokens
        refresh = RefreshToken.for_user(staff)
        access = refresh.access_token

        # Serialize user data
        org = staff.outlet.organization
        user_data = {
            'id': str(staff.id),
            'name': staff.name,
            'phone': staff.phone,
            'role': staff.role,
            'outletId': str(staff.outlet.id),
            'organizationId': str(org.id) if org else None,
            'isSuperAdmin': staff.role == 'super_admin',
            'outlet': {
                'id': str(staff.outlet.id),
                'name': staff.outlet.name,
                'city': staff.outlet.city,
                'state': staff.outlet.state,
            },
            'avatarUrl': staff.avatar_url,
            'maxDiscount': float(staff.max_discount),
            'canEditRate': staff.can_edit_rate,
            'canViewPurchaseRates': staff.can_view_purchase_rates,
            'canCreatePurchases': staff.can_create_purchases,
            'canAccessReports': staff.can_access_reports,
        }

        response_data = {
            'access': str(access),
            'refresh': str(refresh),
            'user': user_data,
        }

        return Response(response_data, status=status.HTTP_200_OK)


class SwitchOutletView(APIView):
    """
    POST /api/v1/auth/switch-outlet/

    Switch the active outlet context for a Super Admin.
    Validates organization constraints and updates the default Session outlet.
    Returns a new set of JWT access + refresh tokens.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        staff = request.user
        new_outlet_id = request.data.get('outletId')

        if not new_outlet_id:
            return Response(
                {'detail': 'outletId is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if staff.role != 'super_admin':
            return Response(
                {'detail': 'Only Super Admins can switch global outlet contexts'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            # Must belong to the exact same organization as the staff's current default
            org_id = staff.outlet.organization_id
            new_outlet = Outlet.objects.get(id=new_outlet_id, organization_id=org_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': 'Requested outlet not found within your organization'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Update staff active outlet context and issue new token
        staff.outlet = new_outlet
        staff.save(update_fields=['outlet'])

        logger.info(f"Staff {staff.id} switched context to Outlet {new_outlet.name}")

        refresh = RefreshToken.for_user(staff)
        access = refresh.access_token

        org = staff.outlet.organization
        user_data = {
            'id': str(staff.id),
            'name': staff.name,
            'phone': staff.phone,
            'role': staff.role,
            'outletId': str(staff.outlet.id),
            'organizationId': str(org.id) if org else None,
            'isSuperAdmin': staff.role == 'super_admin',
            'outlet': {
                'id': str(staff.outlet.id),
                'name': staff.outlet.name,
                'city': staff.outlet.city,
                'state': staff.outlet.state,
            },
            'avatarUrl': staff.avatar_url,
            'maxDiscount': float(staff.max_discount),
            'canEditRate': staff.can_edit_rate,
            'canViewPurchaseRates': staff.can_view_purchase_rates,
            'canCreatePurchases': staff.can_create_purchases,
            'canAccessReports': staff.can_access_reports,
        }

        response_data = {
            'access': str(access),
            'refresh': str(refresh),
            'user': user_data,
        }

        return Response(response_data, status=status.HTTP_200_OK)


class StaffMeView(APIView):
    """
    GET /api/v1/auth/me/

    Get authenticated staff's own details.
    Returns the same user dict shape as LoginView.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """Get current authenticated staff details."""
        staff = request.user

        if not staff.is_active:
            return Response(
                {'detail': 'Staff account is inactive'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Serialize user data (same as LoginView)
        org = staff.outlet.organization
        user_data = {
            'id': str(staff.id),
            'name': staff.name,
            'phone': staff.phone,
            'role': staff.role,
            'outletId': str(staff.outlet.id),
            'organizationId': str(org.id) if org else None,
            'isSuperAdmin': staff.role == 'super_admin',
            'outlet': {
                'id': str(staff.outlet.id),
                'name': staff.outlet.name,
                'city': staff.outlet.city,
                'state': staff.outlet.state,
            },
            'avatarUrl': staff.avatar_url,
            'maxDiscount': float(staff.max_discount),
            'canEditRate': staff.can_edit_rate,
            'canViewPurchaseRates': staff.can_view_purchase_rates,
            'canCreatePurchases': staff.can_create_purchases,
            'canAccessReports': staff.can_access_reports,
        }

        return Response(user_data, status=status.HTTP_200_OK)


class CustomerSearchView(APIView):
    """
    GET /api/v1/customers/search/?q=name&outletId=xxx

    Search customers by name or phone.
    Returns list of customer profiles with credit details.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        Search for customers by query string.

        Query parameters:
        - q: Search query (minimum 2 characters) for name or phone
        - outletId: Outlet UUID to filter customers

        Returns:
        [
            {
                "id": "...",
                "name": "...",
                "phone": "...",
                "address": "...",
                "dob": "...",
                "gstin": "...",
                "fixedDiscount": 0,
                "creditLimit": 5000,
                "outstanding": 1200,
                "totalPurchases": 15000,
                "isChronic": false,
                "isActive": true,
                "createdAt": "2026-03-17T..."
            }
        ]
        """

        query = request.query_params.get('q', '').strip()
        outlet_id = request.query_params.get('outletId')

        # Validate query length
        if len(query) < 2:
            logger.debug(f"Search query too short: {len(query)} chars")
            return Response([], status=status.HTTP_200_OK)

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        logger.info(f"Searching customers for: {query} (outlet: {outlet.name})")

        # Search Customers by name or phone (case-insensitive)
        query_lower = query.lower()
        customers = Customer.objects.filter(
            outlet=outlet,
            is_active=True
        ).filter(
            Q(name__icontains=query_lower) | Q(phone__icontains=query_lower)
        ).distinct()

        logger.info(f"Found {customers.count()} customers matching: {query}")

        # Serialize customers
        results = []
        for customer in customers:
            result = {
                'id': str(customer.id),
                'name': customer.name,
                'phone': customer.phone,
                'address': customer.address,
                'state': customer.state or '',
                'dob': customer.dob.isoformat() if customer.dob else None,
                'gstin': customer.gstin,
                'fixedDiscount': float(customer.fixed_discount),
                'creditLimit': float(customer.credit_limit),
                'outstanding': float(customer.outstanding_balance),
                'totalPurchases': float(customer.total_purchases),
                'isChronic': customer.is_chronic,
                'isActive': customer.is_active,
                'createdAt': customer.created_at.isoformat(),
            }
            results.append(result)

        logger.info(f"Returning {len(results)} customers with credit details")
        return Response(results, status=status.HTTP_200_OK)


class CustomerDetailView(APIView):
    """
    GET /api/v1/customers/{id}/ - Get customer details
    PUT /api/v1/customers/{id}/ - Update customer
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id, *args, **kwargs):
        """Get customer details by ID."""
        outlet_id = request.query_params.get('outletId')

        if outlet_id:
            try:
                outlet = Outlet.objects.get(id=outlet_id)
            except Outlet.DoesNotExist:
                return Response(
                    {'detail': f'Outlet {outlet_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # Fall back to the outlet from the authenticated user's JWT
            outlet = getattr(request.user, 'outlet', None)
            if outlet is None:
                return Response(
                    {'detail': 'outletId is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        try:
            customer = Customer.objects.get(id=customer_id, outlet=outlet)
        except Customer.DoesNotExist:
            return Response(
                {'detail': f'Customer {customer_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        result = {
            'id': str(customer.id),
            'name': customer.name,
            'phone': customer.phone,
            'address': customer.address,
            'state': customer.state or '',
            'dob': customer.dob.isoformat() if customer.dob else None,
            'gstin': customer.gstin,
            'fixedDiscount': float(customer.fixed_discount),
            'creditLimit': float(customer.credit_limit),
            'outstanding': float(customer.outstanding_balance),
            'totalPurchases': float(customer.total_purchases),
            'isChronic': customer.is_chronic,
            'isActive': customer.is_active,
            'createdAt': customer.created_at.isoformat(),
        }

        return Response(result, status=status.HTTP_200_OK)

    def put(self, request, customer_id, *args, **kwargs):
        """Update customer details."""
        outlet_id = request.data.get('outletId')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            customer = Customer.objects.get(id=customer_id, outlet=outlet)
        except Customer.DoesNotExist:
            return Response(
                {'detail': f'Customer {customer_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Validate and apply fields
        if 'name' in request.data:
            name = (request.data['name'] or '').strip()
            if not name:
                return Response({'detail': 'name is required'}, status=status.HTTP_400_BAD_REQUEST)
            customer.name = name

        if 'phone' in request.data:
            phone = (request.data['phone'] or '').strip()
            if not re.match(r'^[6-9]\d{9}$', phone):
                return Response(
                    {'detail': 'phone must be a valid 10-digit Indian mobile number starting with 6-9'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            customer.phone = phone

        if 'gstin' in request.data:
            gstin = (request.data['gstin'] or '').strip().upper() or None
            if gstin and not re.match(r'^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', gstin):
                return Response({'detail': 'gstin format is invalid'}, status=status.HTTP_400_BAD_REQUEST)
            customer.gstin = gstin

        if 'creditLimit' in request.data:
            try:
                credit_limit = float(request.data['creditLimit'])
                if credit_limit < 0:
                    raise ValueError
                customer.credit_limit = credit_limit
            except (TypeError, ValueError):
                return Response({'detail': 'creditLimit must be a non-negative number'}, status=status.HTTP_400_BAD_REQUEST)

        if 'fixedDiscount' in request.data:
            try:
                fixed_discount = float(request.data['fixedDiscount'])
                if not (0 <= fixed_discount <= 100):
                    raise ValueError
                customer.fixed_discount = fixed_discount
            except (TypeError, ValueError):
                return Response({'detail': 'fixedDiscount must be between 0 and 100'}, status=status.HTTP_400_BAD_REQUEST)

        if 'address' in request.data:
            customer.address = request.data['address'] or None

        if 'dob' in request.data:
            customer.dob = request.data['dob'] or None

        if 'isChronic' in request.data:
            customer.is_chronic = bool(request.data['isChronic'])

        if 'state' in request.data:
            customer.state = (request.data['state'] or '').strip()[:100]

        customer.save()
        logger.info(f"Updated customer {customer_id}")

        # Keep linked Ledger in sync
        from apps.accounts.models import Ledger
        Ledger.objects.filter(linked_customer=customer).update(
            phone=customer.phone or '',
            gstin=customer.gstin or '',
        )

        result = {
            'id': str(customer.id),
            'name': customer.name,
            'phone': customer.phone,
            'address': customer.address,
            'state': customer.state or '',
            'dob': customer.dob.isoformat() if customer.dob else None,
            'gstin': customer.gstin,
            'fixedDiscount': float(customer.fixed_discount),
            'creditLimit': float(customer.credit_limit),
            'outstanding': float(customer.outstanding_balance),
            'totalPurchases': float(customer.total_purchases),
            'isChronic': customer.is_chronic,
            'isActive': customer.is_active,
            'createdAt': customer.created_at.isoformat(),
        }

        return Response(result, status=status.HTTP_200_OK)


class CustomerListView(APIView):
    """
    GET /api/v1/customers/ - List customers for outlet
    POST /api/v1/customers/ - Create new customer
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """List customers for outlet with pagination and optional search."""
        outlet_id = request.query_params.get('outletId')
        search_query = request.query_params.get('search', '').strip()
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('pageSize', 50))

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Query customers
        customers = Customer.objects.filter(outlet=outlet, is_active=True)

        # Apply search filter
        if search_query:
            query_lower = search_query.lower()
            customers = customers.filter(
                Q(name__icontains=query_lower) | Q(phone__icontains=query_lower)
            )

        # Apply isChronic filter
        is_chronic_param = request.query_params.get('isChronic', '').lower()
        if is_chronic_param == 'true':
            customers = customers.filter(is_chronic=True)
        elif is_chronic_param == 'false':
            customers = customers.filter(is_chronic=False)

        # Apply hasOutstanding filter (use 'outstanding' - the actual DB field)
        has_outstanding_param = request.query_params.get('hasOutstanding', '').lower()
        if has_outstanding_param == 'true':
            customers = customers.filter(outstanding__gt=0)
        elif has_outstanding_param == 'false':
            customers = customers.filter(outstanding__lte=0)

        # Apply pagination
        total_records = customers.count()
        start = (page - 1) * page_size
        end = start + page_size
        customers_page = list(customers[start:end])

        # OPTIMIZED: Bulk-prefetch Ledger balances for all page customers in ONE query.
        # Before: outstanding_balance @property fires a Ledger query per customer (N extra queries).
        # After:  1 extra query total, looked up via dict.
        customer_ids = [c.id for c in customers_page]
        ledger_balances = {
            str(l.linked_customer_id): float(l.current_balance)
            for l in Ledger.objects.filter(
                linked_customer_id__in=customer_ids,
                group__name='Sundry Debtors',
            ).only('linked_customer_id', 'current_balance')
        }

        # Serialize customers
        results = []
        for customer in customers_page:
            cid = str(customer.id)
            outstanding = ledger_balances.get(cid, float(customer.outstanding))
            result = {
                'id': cid,
                'name': customer.name,
                'phone': customer.phone,
                'address': customer.address,
                'state': customer.state or '',
                'dob': customer.dob.isoformat() if customer.dob else None,
                'gstin': customer.gstin,
                'fixedDiscount': float(customer.fixed_discount),
                'creditLimit': float(customer.credit_limit),
                'outstanding': outstanding,
                'totalPurchases': float(customer.total_purchases),
                'isChronic': customer.is_chronic,
                'isActive': customer.is_active,
                'createdAt': customer.created_at.isoformat(),
            }
            results.append(result)

        total_pages = (total_records + page_size - 1) // page_size

        response_data = {
            'data': results,
            'pagination': {
                'page': page,
                'pageSize': page_size,
                'totalPages': total_pages,
                'totalRecords': total_records,
            }
        }

        logger.info(f"Listed {len(results)} customers for outlet {outlet.name}")
        return Response(response_data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        """Create a new customer."""
        outlet_id = request.data.get('outletId')
        name = (request.data.get('name') or '').strip()
        phone = (request.data.get('phone') or '').strip()
        address = request.data.get('address') or None
        state = (request.data.get('state') or '').strip()[:100]
        dob = request.data.get('dob') or None
        gstin = (request.data.get('gstin') or '').strip().upper() or None
        is_chronic = bool(request.data.get('isChronic', False))
        fixed_discount = request.data.get('fixedDiscount', 0)
        credit_limit = request.data.get('creditLimit', 0)

        # Validate required fields
        if not name:
            return Response({'detail': 'name is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not phone:
            return Response({'detail': 'phone is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not re.match(r'^[6-9]\d{9}$', phone):
            return Response(
                {'detail': 'phone must be a valid 10-digit Indian mobile number starting with 6-9'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if gstin and not re.match(r'^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', gstin):
            return Response({'detail': 'gstin format is invalid'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            credit_limit = float(credit_limit)
            if credit_limit < 0:
                raise ValueError
        except (TypeError, ValueError):
            return Response({'detail': 'creditLimit must be a non-negative number'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            fixed_discount = float(fixed_discount)
            if not (0 <= fixed_discount <= 100):
                raise ValueError
        except (TypeError, ValueError):
            return Response({'detail': 'fixedDiscount must be between 0 and 100'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Create customer
        from django.db import IntegrityError
        try:
            customer = Customer.objects.create(
                outlet=outlet,
                name=name,
                phone=phone,
                address=address,
                state=state,
                dob=dob,
                gstin=gstin,
                is_chronic=is_chronic,
                fixed_discount=fixed_discount,
                credit_limit=credit_limit,
                is_active=True,
            )
        except IntegrityError:
            return Response(
                {'detail': 'A customer with this phone number already exists in your outlet.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Automatically create a Ledger for the new customer in the Sundry Debtors group
        from apps.accounts.models import Ledger, LedgerGroup
        debtor_group, _ = LedgerGroup.objects.get_or_create(
            outlet=outlet,
            name='Sundry Debtors',
            defaults={'nature': 'asset', 'is_system': True}
        )
        Ledger.objects.create(
            outlet=outlet,
            name=f"{customer.name} ({customer.phone})",
            group=debtor_group,
            linked_customer=customer,
            phone=customer.phone,
            gstin=customer.gstin or '',
            address=customer.address or '',
            is_system=True
        )

        logger.info(f"Created customer {customer.id} ({customer.name}) and Ledger for outlet {outlet.name}")

        result = {
            'id': str(customer.id),
            'name': customer.name,
            'phone': customer.phone,
            'address': customer.address,
            'state': customer.state or '',
            'dob': customer.dob.isoformat() if customer.dob else None,
            'gstin': customer.gstin,
            'fixedDiscount': float(customer.fixed_discount),
            'creditLimit': float(customer.credit_limit),
            'outstanding': float(customer.outstanding_balance),
            'totalPurchases': float(customer.total_purchases),
            'isChronic': customer.is_chronic,
            'isActive': customer.is_active,
            'createdAt': customer.created_at.isoformat(),
        }

        return Response(result, status=status.HTTP_201_CREATED)


class StaffLookupByPinView(APIView):
    """
    POST /api/v1/staff/lookup-by-pin/

    Look up a staff member by their PIN for kiosk check-in/out.
    No staffId required — just the PIN and outletId.

    Request body:
    {
        "pin": "1234",
        "outletId": "uuid"
    }

    Response: same shape as StaffPinVerifyView on success.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        pin = request.data.get('pin')
        outlet_id = request.data.get('outletId')

        if not pin:
            return Response(
                {'error': {'code': 'MISSING_PIN', 'message': 'PIN is required'}},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.contrib.auth.hashers import check_password
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        matched_staff = [s for s in Staff.objects.filter(outlet=outlet, is_active=True) if check_password(pin, s.staff_pin)]
        if not matched_staff:
            return Response(
                {'error': {'code': 'INVALID_PIN', 'message': 'Invalid PIN'}},
                status=status.HTTP_400_BAD_REQUEST
            )
        if len(matched_staff) > 1:
            return Response(
                {'error': {'code': 'AMBIGUOUS_PIN', 'message': 'PIN matches multiple staff members. Please contact admin.'}},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        staff = matched_staff[0]

        from apps.billing.models import SaleInvoice
        today = date.today()
        bills_today = SaleInvoice.objects.filter(
            billed_by=staff, invoice_date__date=today
        ).count()
        total_sales_today = SaleInvoice.objects.filter(
            billed_by=staff, invoice_date__date=today
        ).aggregate(total=Sum('grand_total'))['total'] or 0

        result = {
            'id': str(staff.id),
            'name': staff.name,
            'role': staff.role,
            'staffPin': staff.staff_pin,
            'maxDiscount': float(staff.max_discount),
            'canEditRate': staff.can_edit_rate,
            'canViewPurchaseRates': staff.can_view_purchase_rates,
            'billsToday': bills_today,
            'totalSalesToday': float(total_sales_today),
        }

        logger.info(f"PIN lookup successful for staff {staff.id} ({staff.name})")
        return Response(result, status=status.HTTP_200_OK)


class StaffListView(APIView):

    """
    GET /api/v1/staff/?outletId=xxx

    List all active staff members for an outlet.
    Used by attendance components to display staff roster.
    """

    permission_classes = [IsAdminStaff]

    def get(self, request, *args, **kwargs):
        outlet_id = request.query_params.get('outletId')

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        staff_members = Staff.objects.filter(outlet=outlet, is_active=True).order_by('name')

        results = [
            {
                'id': str(s.id),
                'name': s.name,
                'phone': s.phone,
                'role': s.role,
                'staffPin': s.staff_pin,
                'outletId': str(s.outlet.id),
                'avatarUrl': s.avatar_url,
                'maxDiscount': float(s.max_discount),
                'canEditRate': s.can_edit_rate,
                'canViewPurchaseRates': s.can_view_purchase_rates,
                'canCreatePurchases': s.can_create_purchases,
                'canAccessReports': s.can_access_reports,
                'isActive': s.is_active,
                'joiningDate': s.joining_date.isoformat() if s.joining_date else None,
                'lastLogin': s.last_login.isoformat() if s.last_login else None,
            }
            for s in staff_members
        ]

        logger.info(f"Listed {len(results)} staff for outlet {outlet.name}")
        return Response(results, status=status.HTTP_200_OK)


class StaffPinVerifyView(APIView):

    """
    POST /api/v1/staff/{id}/verify-pin/

    Verify staff PIN and return staff details with today's bill count and sales total.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, staff_id, *args, **kwargs):
        """
        Verify staff PIN.

        Request body:
        {
            "pin": "1234"
        }

        Response:
        {
            "id": "...",
            "name": "...",
            "role": "...",
            "staffPin": "...",
            "maxDiscount": 0,
            "canEditRate": false,
            "billsToday": 0,
            "totalSalesToday": 0
        }
        """

        outlet_id = request.query_params.get('outletId')
        pin = request.data.get('pin')

        if not pin:
            return Response(
                {'error': {'code': 'MISSING_PIN', 'message': 'PIN is required'}},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Fetch staff by id and outlet
        try:
            staff = Staff.objects.get(id=staff_id, outlet=outlet)
        except Staff.DoesNotExist:
            return Response(
                {'detail': f'Staff {staff_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        from django.contrib.auth.hashers import check_password
        # Verify PIN
        if not check_password(pin, staff.staff_pin):
            return Response(
                {'error': {'code': 'INVALID_PIN', 'message': 'Invalid PIN'}},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get today's bill count and total sales
        from apps.billing.models import SaleInvoice
        today = date.today()
        bills_today = SaleInvoice.objects.filter(
            billed_by=staff,
            invoice_date__date=today
        ).count()

        total_sales_today = SaleInvoice.objects.filter(
            billed_by=staff,
            invoice_date__date=today
        ).aggregate(total=Sum('grand_total'))['total'] or 0

        result = {
            'id': str(staff.id),
            'name': staff.name,
            'role': staff.role,
            'staffPin': staff.staff_pin,
            'maxDiscount': float(staff.max_discount),
            'canEditRate': staff.can_edit_rate,
            'canViewPurchaseRates': staff.can_view_purchase_rates,
            'billsToday': bills_today,
            'totalSalesToday': float(total_sales_today),
        }

        return Response(result, status=status.HTTP_200_OK)


class CustomerPurchaseHistoryView(APIView):
    """
    GET /api/v1/customers/{id}/purchase-history/

    Get customer's purchase history - list of recent invoices.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id, *args, **kwargs):
        """
        Get customer's purchase history.

        Query parameters:
        - outletId: Outlet UUID to filter invoices

        Returns:
        [
            {
                "invoiceId": "INV-...",
                "date": "2026-03-15",
                "total": 450.00,
                "items": 3,
                "billedBy": "Rajesh",
                "paymentMode": "cash"
            }
        ]
        """

        outlet_id = request.query_params.get('outletId')

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Verify customer exists in outlet
        try:
            customer = Customer.objects.get(id=customer_id, outlet=outlet)
        except Customer.DoesNotExist:
            return Response(
                {'detail': f'Customer {customer_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get purchase history (last 50 invoices)
        from apps.billing.models import SaleInvoice, SaleItem
        invoices = SaleInvoice.objects.filter(
            customer=customer,
            outlet=outlet
        ).select_related('billed_by').order_by('-invoice_date')[:50]

        # Build response
        results = []
        for invoice in invoices:
            item_count = SaleItem.objects.filter(sale_invoice=invoice).count()
            result = {
                'invoiceId': invoice.invoice_no,
                'date': invoice.invoice_date.date().isoformat(),
                'total': float(invoice.grand_total),
                'items': item_count,
                'billedBy': invoice.billed_by.name if invoice.billed_by else 'Unknown',
                'paymentMode': invoice.payment_mode,
            }
            results.append(result)

        logger.info(f"Returning {len(results)} invoices for customer {customer_id}")
        return Response(results, status=status.HTTP_200_OK)


# ─── Phase 2 Batch 2 Views ────────────────────────────────────────────────────

def _serialize_staff(s):
    return {
        'id': str(s.id),
        'name': s.name,
        'phone': s.phone,
        'role': s.role,
        'outletId': str(s.outlet_id),
        'avatarUrl': s.avatar_url,
        'maxDiscount': float(s.max_discount),
        'canEditRate': s.can_edit_rate,
        'canViewPurchaseRates': s.can_view_purchase_rates,
        'canCreatePurchases': s.can_create_purchases,
        'canAccessReports': s.can_access_reports,
        'isActive': s.is_active,
        'joiningDate': s.joining_date.isoformat() if s.joining_date else None,
        'lastLogin': s.last_login.isoformat() if s.last_login else None,
    }


class StaffCreateView(APIView):
    """POST /api/v1/staff/"""
    permission_classes = [IsAdminStaff]

    def post(self, request, *args, **kwargs):
        from django.contrib.auth.hashers import make_password
        caller = request.user
        if caller.role not in ('super_admin', 'admin'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        # Use outletId from request if provided (super admin creating staff in another outlet)
        request_outlet_id = request.data.get('outletId')
        if request_outlet_id and caller.role == 'super_admin':
            try:
                outlet = Outlet.objects.get(id=request_outlet_id, organization=caller.outlet.organization)
            except Outlet.DoesNotExist:
                return Response({'error': 'Outlet not found within your organization'}, status=status.HTTP_404_NOT_FOUND)
        else:
            outlet = caller.outlet
        valid_roles = ('super_admin', 'admin', 'manager', 'billing_staff', 'view_only')
        role = request.data.get('role', 'billing_staff')
        if role not in valid_roles:
            return Response({'error': f'Invalid role. Must be one of: {valid_roles}'}, status=status.HTTP_400_BAD_REQUEST)

        password = request.data.get('password', '')
        if not password:
            return Response({'error': 'password is required'}, status=status.HTTP_400_BAD_REQUEST)

        pin = request.data.get('pin', '')
        if not pin:
            return Response({'error': 'pin is required'}, status=status.HTTP_400_BAD_REQUEST)

        phone = request.data.get('phone', '')
        if Staff.objects.filter(phone=phone).exists():
            return Response({'error': 'A staff member with this phone number already exists'}, status=status.HTTP_400_BAD_REQUEST)

        staff = Staff.objects.create_user(
            phone=phone,
            password=password,          # app login password (create_user calls set_password internally)
            name=request.data.get('name', ''),
            role=role,
            outlet=outlet,
            email=request.data.get('email'),
            staff_pin=make_password(pin),  # billing counter PIN (stored separately)
            max_discount=request.data.get('maxDiscount', 0),
            can_edit_rate=request.data.get('canEditRate', False),
            can_view_purchase_rates=request.data.get('canViewPurchaseRates', False),
            can_create_purchases=request.data.get('canCreatePurchases', False),
            can_access_reports=request.data.get('canAccessReports', False),
            is_active=True,
        )
        return Response({'success': True, 'data': _serialize_staff(staff)}, status=status.HTTP_201_CREATED)


class StaffDetailView(APIView):
    """PATCH/DELETE /api/v1/staff/{pk}/"""
    permission_classes = [IsAdminStaff]

    def patch(self, request, pk, *args, **kwargs):
        from django.contrib.auth.hashers import make_password
        caller = request.user
        if caller.role not in ('super_admin', 'admin'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        try:
            if caller.role == 'super_admin':
                staff = Staff.objects.get(id=pk, outlet__organization=caller.outlet.organization)
            else:
                staff = Staff.objects.get(id=pk, outlet=caller.outlet)
        except Staff.DoesNotExist:
            return Response({'detail': 'Staff not found'}, status=status.HTTP_404_NOT_FOUND)

        updatable = ('name', 'email', 'role', 'max_discount', 'can_edit_rate',
                     'can_view_purchase_rates', 'can_create_purchases', 'can_access_reports', 'is_active')
        camel_map = {
            'maxDiscount': 'max_discount',
            'canEditRate': 'can_edit_rate',
            'canViewPurchaseRates': 'can_view_purchase_rates',
            'canCreatePurchases': 'can_create_purchases',
            'canAccessReports': 'can_access_reports',
            'isActive': 'is_active',
        }
        for camel, snake in camel_map.items():
            if camel in request.data:
                setattr(staff, snake, request.data[camel])
        for field in ('name', 'email', 'role'):
            if field in request.data:
                setattr(staff, field, request.data[field])

        if 'password' in request.data and request.data['password']:
            staff.set_password(str(request.data['password']))

        if 'pin' in request.data and request.data['pin']:
            staff.staff_pin = make_password(str(request.data['pin']))

        staff.save()
        return Response({'success': True, 'data': _serialize_staff(staff)}, status=status.HTTP_200_OK)

    def delete(self, request, pk, *args, **kwargs):
        caller = request.user
        if caller.role not in ('super_admin', 'admin'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        try:
            if caller.role == 'super_admin':
                staff = Staff.objects.get(id=pk, outlet__organization=caller.outlet.organization)
            else:
                staff = Staff.objects.get(id=pk, outlet=caller.outlet)
        except Staff.DoesNotExist:
            return Response({'detail': 'Staff not found'}, status=status.HTTP_404_NOT_FOUND)

        staff.is_active = False
        staff.save(update_fields=['is_active'])
        return Response({'success': True, 'data': {'id': str(staff.id), 'isActive': False}}, status=status.HTTP_200_OK)


class StaffPerformanceView(APIView):
    """GET /api/v1/staff/{pk}/performance/?from=&to="""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        from apps.billing.models import SaleInvoice, SaleItem
        from django.db.models import Sum, Count
        from django.db.models.functions import TruncDate
        outlet_id = request.query_params.get('outletId') or str(request.user.outlet_id)

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            staff = Staff.objects.get(id=pk, outlet=outlet)
        except Staff.DoesNotExist:
            return Response({'detail': 'Staff not found'}, status=status.HTTP_404_NOT_FOUND)

        from datetime import datetime
        qs = SaleInvoice.objects.filter(outlet=outlet, billed_by=staff, is_return=False)
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        if from_str:
            try:
                qs = qs.filter(invoice_date__date__gte=datetime.strptime(from_str, '%Y-%m-%d').date())
            except ValueError:
                pass
        if to_str:
            try:
                qs = qs.filter(invoice_date__date__lte=datetime.strptime(to_str, '%Y-%m-%d').date())
            except ValueError:
                pass

        agg = qs.aggregate(
            total_invoices=Count('id'),
            total_sales=Sum('grand_total'),
            total_discount=Sum('discount_amount'),
            total_cash=Sum('cash_paid'),
            total_upi=Sum('upi_paid'),
            total_card=Sum('card_paid'),
            total_credit=Sum('credit_given'),
        )
        total_invoices = agg['total_invoices'] or 0
        total_sales = float(agg['total_sales'] or 0)

        by_day = list(
            qs.annotate(day=TruncDate('invoice_date'))
            .values('day').annotate(invoiceCount=Count('id'), totalAmount=Sum('grand_total'))
            .order_by('day')
        )

        top_products = list(
            SaleItem.objects.filter(invoice__in=qs)
            .values('product_name').annotate(qty=Sum('qty_strips'), totalAmount=Sum('total_amount'))
            .order_by('-totalAmount')[:10]
        )

        return Response({
            'success': True,
            'data': {
                'staffId': str(staff.id),
                'staffName': staff.name,
                'role': staff.role,
                'totalInvoices': total_invoices,
                'totalSalesAmount': total_sales,
                'totalDiscountGiven': float(agg['total_discount'] or 0),
                'avgInvoiceValue': round(total_sales / total_invoices, 2) if total_invoices > 0 else 0,
                'topProducts': [{'productName': r['product_name'], 'qty': r['qty'], 'totalAmount': float(r['totalAmount'] or 0)} for r in top_products],
                'salesByDay': [{'date': r['day'].isoformat(), 'invoiceCount': r['invoiceCount'], 'totalAmount': float(r['totalAmount'] or 0)} for r in by_day],
                'salesByPaymentMode': {
                    'cash': float(agg['total_cash'] or 0),
                    'upi': float(agg['total_upi'] or 0),
                    'card': float(agg['total_card'] or 0),
                    'credit': float(agg['total_credit'] or 0),
                },
            }
        }, status=status.HTTP_200_OK)


class StaffLeaderboardView(APIView):
    """GET /api/v1/staff/leaderboard/?from=&to="""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from apps.billing.models import SaleInvoice
        from django.db.models import Sum, Count
        from datetime import datetime
        outlet_id = request.query_params.get('outletId') or str(request.user.outlet_id)

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        staff_members = Staff.objects.filter(outlet=outlet, is_active=True)

        entries = []
        for staff in staff_members:
            qs = SaleInvoice.objects.filter(outlet=outlet, billed_by=staff, is_return=False)
            if from_str:
                try:
                    qs = qs.filter(invoice_date__date__gte=datetime.strptime(from_str, '%Y-%m-%d').date())
                except ValueError:
                    pass
            if to_str:
                try:
                    qs = qs.filter(invoice_date__date__lte=datetime.strptime(to_str, '%Y-%m-%d').date())
                except ValueError:
                    pass
            agg = qs.aggregate(total_invoices=Count('id'), total_sales=Sum('grand_total'), total_discount=Sum('discount_amount'))
            total_invoices = agg['total_invoices'] or 0
            total_sales = float(agg['total_sales'] or 0)
            entries.append({
                'staffId': str(staff.id),
                'staffName': staff.name,
                'role': staff.role,
                'totalInvoices': total_invoices,
                'totalSalesAmount': total_sales,
                'avgInvoiceValue': round(total_sales / total_invoices, 2) if total_invoices > 0 else 0,
                'totalDiscountGiven': float(agg['total_discount'] or 0),
            })

        entries.sort(key=lambda x: x['totalSalesAmount'], reverse=True)
        data = []
        for index, staff_data in enumerate(entries):
            rank = index + 1
            staff_data['rank'] = rank
            if rank == 1:
                staff_data['badge'] = 'gold'
            elif rank == 2:
                staff_data['badge'] = 'silver'
            elif rank == 3:
                staff_data['badge'] = 'bronze'
            else:
                staff_data['badge'] = None
            data.append(staff_data)

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)


class ChronicMedicinesView(APIView):
    """GET /api/v1/customers/{customer_id}/chronic-medicines/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id, *args, **kwargs):
        from apps.accounts.models import RegularMedicine
        from apps.inventory.models import Batch
        from apps.billing.models import SaleInvoice, SaleItem
        from datetime import datetime, timedelta

        outlet_id = request.query_params.get('outletId') or str(request.user.outlet_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            customer = Customer.objects.get(id=customer_id, outlet=outlet)
        except Customer.DoesNotExist:
            return Response({'detail': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        medicines = RegularMedicine.objects.filter(customer=customer)
        freq_days = {'Daily': 1, 'Weekly': 7, 'Monthly': 30, 'daily': 1, 'weekly': 7, 'monthly': 30}

        data = []
        for med in medicines:
            # Current stock for this product
            batches = Batch.objects.filter(
                outlet=outlet, product__name__iexact=med.name, qty_strips__gt=0, is_active=True
            )
            current_stock = sum(b.qty_strips for b in batches)

            # Last purchase
            last_purchase = customer.last_refill_date

            # Next due date
            interval = freq_days.get(med.frequency, 30)
            next_due = (last_purchase + timedelta(days=interval)) if last_purchase else None

            data.append({
                'id': str(med.id),
                'productId': med.product_id,
                'productName': med.name,
                'genericName': '',
                'qty': med.qty,
                'frequency': med.frequency,
                'notes': med.notes,
                'currentStock': current_stock,
                'lastPurchaseDate': last_purchase.isoformat() if last_purchase else None,
                'nextDueDate': next_due.isoformat() if next_due else None,
            })

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)


class RefillAlertsView(APIView):
    """GET /api/v1/customers/refill-alerts/?days=7"""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from apps.accounts.models import RegularMedicine
        from datetime import datetime, timedelta, date

        outlet_id = request.query_params.get('outletId') or str(request.user.outlet_id)
        days = int(request.query_params.get('days', 7))

        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        from apps.billing.models import SaleItem
        today = date.today()
        cutoff = today + timedelta(days=days)
        FREQUENCY_DAYS = {
            'daily': 1,
            'weekly': 7,
            'monthly': 30,
        }

        def get_next_due_date(last_purchase_date, frequency):
            days_int = FREQUENCY_DAYS.get(frequency.lower(), 30)
            return last_purchase_date + timedelta(days=days_int)

        chronic_customers = Customer.objects.filter(outlet=outlet, is_chronic=True, is_active=True)
        data = []
        total_alerts = 0

        for customer in chronic_customers:
            medicines = RegularMedicine.objects.filter(customer=customer)
            due_medicines = []
            for med in medicines:
                # Find last SaleItem for this customer + product -> get its sale_invoice.invoice_date (wait, it says bill_date but it is invoice_date)
                last_sale = SaleItem.objects.filter(
                    sale_invoice__customer=customer, 
                    product_name=med.name
                ).order_by('-sale_invoice__invoice_date').first()
                
                if last_sale:
                    last_purchase = last_sale.sale_invoice.invoice_date.date()
                else:
                    last_purchase = customer.created_at.date()
                    
                next_due = get_next_due_date(last_purchase, med.frequency)
                
                if next_due <= cutoff:
                    days_until = (next_due - today).days
                    due_medicines.append({
                        'productName': med.name,
                        'qty': med.qty,
                        'frequency': med.frequency,
                        'lastPurchaseDate': last_purchase.isoformat(),
                        'nextDueDate': next_due.isoformat(),
                        'daysUntilDue': days_until,
                    })
                    total_alerts += 1

            if due_medicines:
                data.append({
                    'customerId': str(customer.id),
                    'customerName': customer.name,
                    'phone': customer.phone,
                    'medicines': due_medicines,
                })

        return Response({
            'success': True,
            'data': data,
            'meta': {'totalAlerts': total_alerts, 'daysFilter': days},
        }, status=status.HTTP_200_OK)


class DoctorListCreateView(APIView):
    """GET/POST /api/v1/doctors/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from apps.accounts.models import Doctor
        from django.db.models import Q
        outlet_id = request.query_params.get('outletId') or str(request.user.outlet_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = Doctor.objects.filter(outlet=outlet, is_active=True)
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(registration_no__icontains=search))

        data = [{
            'id': str(d.id),
            'name': d.name,
            'phone': d.phone,
            'registrationNo': d.registration_no,
            'regNo': d.registration_no,
            'degree': d.degree,
            'qualification': d.qualification,
            'specialty': d.specialty,
            'specialization': d.specialty,
            'hospitalName': d.hospital_name,
            'address': d.address,
        } for d in qs.order_by('name')]

        return Response({'success': True, 'data': data, 'meta': {'total': len(data)}}, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        from apps.accounts.models import Doctor
        outlet_id = request.data.get('outletId') or str(request.user.outlet_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)

        doctor = Doctor.objects.create(
            outlet=outlet,
            name=request.data.get('name', ''),
            phone=request.data.get('phone', ''),
            registration_no=request.data.get('registrationNo') or request.data.get('regNo', ''),
            degree=request.data.get('degree', ''),
            qualification=request.data.get('qualification', ''),
            specialty=request.data.get('specialty') or request.data.get('specialization', ''),
            hospital_name=request.data.get('hospitalName', ''),
            address=request.data.get('address', ''),
            is_active=True,
        )
        data = {
            'id': str(doctor.id),
            'name': doctor.name,
            'phone': doctor.phone,
            'registrationNo': doctor.registration_no,
            'regNo': doctor.registration_no,
            'degree': doctor.degree,
            'qualification': doctor.qualification,
            'specialty': doctor.specialty,
            'specialization': doctor.specialty,
            'hospitalName': doctor.hospital_name,
            'address': doctor.address,
        }
        return Response({'success': True, 'data': data}, status=status.HTTP_201_CREATED)


class DoctorDetailView(APIView):
    """GET/PUT/PATCH /api/v1/doctors/{pk}/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        from apps.accounts.models import Doctor
        outlet_id = request.query_params.get('outletId') or str(request.user.outlet_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            d = Doctor.objects.get(id=pk, outlet=outlet)
        except Doctor.DoesNotExist:
            return Response({'detail': 'Doctor not found'}, status=status.HTTP_404_NOT_FOUND)

        data = {
            'id': str(d.id),
            'name': d.name,
            'phone': d.phone,
            'registrationNo': d.registration_no,
            'regNo': d.registration_no,
            'degree': d.degree,
            'qualification': d.qualification,
            'specialty': d.specialty,
            'specialization': d.specialty,
            'hospitalName': d.hospital_name,
            'address': d.address,
        }
        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)

    def put(self, request, pk, *args, **kwargs):
        from apps.accounts.models import Doctor
        outlet_id = request.data.get('outletId') or str(request.user.outlet_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            d = Doctor.objects.get(id=pk, outlet=outlet)
        except Doctor.DoesNotExist:
            return Response({'detail': 'Doctor not found'}, status=status.HTTP_404_NOT_FOUND)

        d.name = request.data.get('name', d.name)
        d.phone = request.data.get('phone', d.phone)
        d.registration_no = request.data.get('registrationNo') or request.data.get('regNo', d.registration_no)
        d.degree = request.data.get('degree', d.degree)
        d.qualification = request.data.get('qualification', d.qualification)
        d.specialty = request.data.get('specialty') or request.data.get('specialization', d.specialty)
        d.hospital_name = request.data.get('hospitalName', d.hospital_name)
        d.address = request.data.get('address', d.address)
        d.save()

        data = {
            'id': str(d.id),
            'name': d.name,
            'phone': d.phone,
            'registrationNo': d.registration_no,
            'regNo': d.registration_no,
            'degree': d.degree,
            'qualification': d.qualification,
            'specialty': d.specialty,
            'specialization': d.specialty,
            'hospitalName': d.hospital_name,
            'address': d.address,
        }
        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)

    def patch(self, request, pk, *args, **kwargs):
        from apps.accounts.models import Doctor
        outlet_id = request.data.get('outletId') or str(request.user.outlet_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response({'detail': 'Outlet not found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            d = Doctor.objects.get(id=pk, outlet=outlet)
        except Doctor.DoesNotExist:
            return Response({'detail': 'Doctor not found'}, status=status.HTTP_404_NOT_FOUND)

        if 'name' in request.data: d.name = request.data['name']
        if 'specialization' in request.data: d.specialty = request.data['specialization']
        if 'phone' in request.data: d.phone = request.data['phone']
        if 'registrationNo' in request.data: d.registration_no = request.data['registrationNo']
        if 'qualification' in request.data: d.qualification = request.data['qualification']
        d.save()

        return Response({'success': True, 'data': {
            'id': str(d.id), 'name': d.name, 'specialization': d.specialty,
            'phone': d.phone, 'registrationNo': d.registration_no, 'qualification': d.qualification,
        }}, status=status.HTTP_200_OK)


class ChangePinView(APIView):
    """PATCH /api/v1/auth/me/pin/"""
    permission_classes = [IsAuthenticated]

    def patch(self, request, *args, **kwargs):
        from django.contrib.auth.hashers import make_password, check_password
        staff = request.user
        current_pin = request.data.get('currentPin', '')
        new_pin = str(request.data.get('newPin', ''))

        if not check_password(current_pin, staff.staff_pin):
            return Response({'error': 'Current PIN is incorrect'}, status=status.HTTP_400_BAD_REQUEST)

        if not new_pin.isdigit() or not (4 <= len(new_pin) <= 6):
            return Response({'error': 'New PIN must be 4-6 digits'}, status=status.HTTP_400_BAD_REQUEST)

        staff.staff_pin = new_pin
        staff.set_password(make_password(new_pin))
        staff.save(update_fields=['staff_pin', 'password'])

        return Response({'success': True, 'data': {'message': 'PIN updated successfully'}}, status=status.HTTP_200_OK)

class CustomerOutstandingInvoicesView(APIView):
    """
    GET /api/v1/customers/<uuid:pk>/outstanding/
    Returns all unpaid SaleInvoices for a customer.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        from apps.billing.models import SaleInvoice
        outlet = request.user.outlet
        try:
            customer = Customer.objects.get(id=pk, outlet=outlet)
        except Customer.DoesNotExist:
            return Response({'error': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        unpaid_invoices = SaleInvoice.objects.filter(
            outlet=outlet, 
            customer=customer, 
            amount_due__gt=0
        ).order_by('invoice_date')

        data = []
        for inv in unpaid_invoices:
            data.append({
                'id': str(inv.id),
                'invoiceNo': inv.invoice_no,
                'invoiceDate': inv.invoice_date.isoformat() if inv.invoice_date else None,
                'grandTotal': float(inv.grand_total),
                'outstanding': float(inv.amount_due),
            })
            
        return Response({'data': data}, status=status.HTTP_200_OK)
