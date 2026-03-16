import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import status
from django.db.models import Q
from django.core.exceptions import ValidationError

from apps.accounts.models import Staff, Customer
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
        staff_pin = request.data.get('password')  # password field contains the PIN

        if not phone or not staff_pin:
            return Response(
                {'detail': 'Phone and password (PIN) are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        logger.info(f"Login attempt for phone: {phone}")

        try:
            # Query staff by phone
            staff = Staff.objects.get(phone=phone)
        except Staff.DoesNotExist:
            logger.warning(f"Login failed: staff not found for phone {phone}")
            return Response(
                {'detail': 'Invalid phone or PIN'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Validate PIN (direct string comparison, no hashing)
        if staff.staff_pin != staff_pin:
            logger.warning(f"Login failed: invalid PIN for staff {staff.id}")
            return Response(
                {'detail': 'Invalid phone or PIN'},
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
        user_data = {
            'id': str(staff.id),
            'name': staff.name,
            'phone': staff.phone,
            'role': staff.role,
            'staffPin': staff.staff_pin,
            'outletId': str(staff.outlet.id),
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
                'dob': customer.dob.isoformat() if customer.dob else None,
                'gstin': customer.gstin,
                'fixedDiscount': float(customer.fixed_discount),
                'creditLimit': float(customer.credit_limit),
                'outstanding': float(customer.outstanding),
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

        result = {
            'id': str(customer.id),
            'name': customer.name,
            'phone': customer.phone,
            'address': customer.address,
            'dob': customer.dob.isoformat() if customer.dob else None,
            'gstin': customer.gstin,
            'fixedDiscount': float(customer.fixed_discount),
            'creditLimit': float(customer.credit_limit),
            'outstanding': float(customer.outstanding),
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

        # Update allowed fields
        allowed_fields = ['name', 'phone', 'address', 'dob', 'gstin', 'fixed_discount', 'credit_limit', 'is_chronic']
        for field in allowed_fields:
            camel_field = {
                'fixed_discount': 'fixedDiscount',
                'credit_limit': 'creditLimit',
                'is_chronic': 'isChronic'
            }.get(field, field)

            if camel_field in request.data:
                setattr(customer, field, request.data[camel_field])

        customer.save()
        logger.info(f"Updated customer {customer_id}")

        result = {
            'id': str(customer.id),
            'name': customer.name,
            'phone': customer.phone,
            'address': customer.address,
            'dob': customer.dob.isoformat() if customer.dob else None,
            'gstin': customer.gstin,
            'fixedDiscount': float(customer.fixed_discount),
            'creditLimit': float(customer.credit_limit),
            'outstanding': float(customer.outstanding),
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

        # Apply pagination
        total_records = customers.count()
        start = (page - 1) * page_size
        end = start + page_size
        customers_page = customers[start:end]

        # Serialize customers
        results = []
        for customer in customers_page:
            result = {
                'id': str(customer.id),
                'name': customer.name,
                'phone': customer.phone,
                'address': customer.address,
                'dob': customer.dob.isoformat() if customer.dob else None,
                'gstin': customer.gstin,
                'fixedDiscount': float(customer.fixed_discount),
                'creditLimit': float(customer.credit_limit),
                'outstanding': float(customer.outstanding),
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
        name = request.data.get('name')
        phone = request.data.get('phone')
        address = request.data.get('address')
        dob = request.data.get('dob')

        # Validate outlet
        try:
            outlet = Outlet.objects.get(id=outlet_id)
        except Outlet.DoesNotExist:
            return Response(
                {'detail': f'Outlet {outlet_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Create customer
        customer = Customer.objects.create(
            outlet=outlet,
            name=name,
            phone=phone,
            address=address,
            dob=dob if dob else None,
            is_active=True,
        )

        logger.info(f"Created customer {customer.id} ({customer.name}) for outlet {outlet.name}")

        result = {
            'id': str(customer.id),
            'name': customer.name,
            'phone': customer.phone,
            'address': customer.address,
            'dob': customer.dob.isoformat() if customer.dob else None,
            'gstin': customer.gstin,
            'fixedDiscount': float(customer.fixed_discount),
            'creditLimit': float(customer.credit_limit),
            'outstanding': float(customer.outstanding),
            'totalPurchases': float(customer.total_purchases),
            'isChronic': customer.is_chronic,
            'isActive': customer.is_active,
            'createdAt': customer.created_at.isoformat(),
        }

        return Response(result, status=status.HTTP_201_CREATED)
