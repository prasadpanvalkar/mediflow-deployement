from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied

# Role hierarchy (highest to lowest):
#   super_admin → admin → manager → billing_staff → view_only

ADMIN_ROLES = {'super_admin', 'admin'}
MANAGER_ROLES = {'super_admin', 'admin', 'manager'}
ALL_ROLES = {'super_admin', 'admin', 'manager', 'billing_staff', 'view_only'}
BILLING_ROLES = {'super_admin', 'admin', 'manager', 'billing_staff'}


def _get_requested_outlet_id(request):
    """
    Extract the outlet ID from the request.
    Checks query params first (GET requests), then request body (POST/PUT).
    """
    outlet_id = request.query_params.get('outletId')
    if not outlet_id and hasattr(request, 'data') and isinstance(request.data, dict):
        outlet_id = request.data.get('outletId')
    return outlet_id


def check_outlet_access(request):
    """
    Enforces outlet isolation:
    - super_admin can access any outlet.
    - All other roles can ONLY access their own outlet.
    Returns True if allowed, raises PermissionDenied if not.
    """
    if not request.user or not request.user.is_authenticated:
        return True  # Let the IsAuthenticated permission handle unauthenticated requests

    # super_admin bypasses outlet restriction
    if getattr(request.user, 'role', None) == 'super_admin':
        return True

    requested_outlet_id = _get_requested_outlet_id(request)

    # If no outletId is in request, let the view handle the missing param error
    if not requested_outlet_id:
        return True

    user_outlet_id = str(getattr(request.user, 'outlet_id', '') or '')
    if user_outlet_id and str(requested_outlet_id) != user_outlet_id:
        raise PermissionDenied(
            'You do not have access to this outlet. '
            'Staff can only access data from their own outlet.'
        )

    return True


def _is_admin(user):
    """Returns True if user is super_admin or admin — they bypass all flag checks."""
    return getattr(user, 'role', None) in ADMIN_ROLES


class IsAdminStaff(BasePermission):
    """
    Allows access only to super_admin and admin roles.
    Used for: staff CRUD, reports, outlet settings, ledger management.
    Also enforces outlet isolation.
    """

    message = 'You do not have permission to perform this action. Admin role required.'

    def has_permission(self, request, view):
        if not (
            request.user.is_authenticated
            and hasattr(request.user, 'role')
            and request.user.role in ADMIN_ROLES
        ):
            return False
        check_outlet_access(request)
        return True


class IsManagerOrAbove(BasePermission):
    """
    Allows access to super_admin, admin, and manager roles.
    Used for: purchases, sales returns, inventory adjustments.
    Also enforces outlet isolation.
    """

    message = 'You do not have permission to perform this action. Manager role or above required.'

    def has_permission(self, request, view):
        if not (
            request.user.is_authenticated
            and hasattr(request.user, 'role')
            and request.user.role in MANAGER_ROLES
        ):
            return False
        check_outlet_access(request)
        return True


class IsAuthenticated(BasePermission):
    """
    Standard authenticated access with outlet isolation.
    Used for: billing, inventory read, customer access.
    """

    message = 'Authentication required.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        check_outlet_access(request)
        return True


class IsBillingStaffOrAbove(BasePermission):
    """
    Allows all authenticated roles (billing_staff and above).
    Used for: creating sale invoices, viewing inventory, customer lookups.
    Also enforces outlet isolation.
    """

    message = 'Authentication required.'

    def has_permission(self, request, view):
        if not (
            request.user.is_authenticated
            and hasattr(request.user, 'role')
            and request.user.role in BILLING_ROLES
        ):
            return False
        check_outlet_access(request)
        return True


# ─── Granular Flag-Based Permissions ──────────────────────────────────────────
# These check BOTH the role AND the specific permission flag on the Staff model.
# super_admin and admin ALWAYS bypass the flag check (they have all permissions).

class CanAccessReports(BasePermission):
    """
    Allows access to reports if:
    - User is super_admin or admin (always allowed), OR
    - User has can_access_reports = True
    """
    message = 'You do not have permission to access reports. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_access_reports', False):
            return False
        check_outlet_access(request)
        return True


class CanViewPurchaseRates(BasePermission):
    """
    Allows viewing purchase/cost rates in the API response if:
    - User is super_admin or admin, OR
    - User has can_view_purchase_rates = True
    """
    message = 'You do not have permission to view purchase rates. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_view_purchase_rates', False):
            return False
        check_outlet_access(request)
        return True


class CanEditSalesInvoice(BasePermission):
    """
    Allows editing (PUT) of sale invoices if:
    - User is super_admin or admin, OR
    - User has can_edit_sales = True
    """
    message = 'You do not have permission to edit sales invoices. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_edit_sales', False):
            return False
        check_outlet_access(request)
        return True


class CanEditPurchaseInvoice(BasePermission):
    """
    Allows editing (PUT) of purchase invoices if:
    - User is super_admin or admin, OR
    - User has can_edit_purchases = True
    """
    message = 'You do not have permission to edit purchase invoices. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_edit_purchases', False):
            return False
        check_outlet_access(request)
        return True


class CanCreatePurchases(BasePermission):
    """
    Allows creating purchase invoices if:
    - User is super_admin or admin, OR
    - User has can_create_purchases = True
    """
    message = 'You do not have permission to create purchases. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            check_outlet_access(request)
            return True
        if not getattr(request.user, 'can_create_purchases', False):
            return False
        check_outlet_access(request)
        return True


class CanAccessPurchases(BasePermission):
    """
    Allows general access to purchase-related GET views (lists, distributors) if:
    - User is super_admin, admin, or manager, OR
    - User has ANY purchase permission (can_create_purchases, can_edit_purchases, can_view_purchase_rates)
    """
    message = 'You do not have permission to access purchases. Contact your admin to enable this.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if getattr(request.user, 'role', None) in MANAGER_ROLES:
            check_outlet_access(request)
            return True
        if getattr(request.user, 'can_create_purchases', False) or \
           getattr(request.user, 'can_edit_purchases', False) or \
           getattr(request.user, 'can_view_purchase_rates', False):
            check_outlet_access(request)
            return True
        return False
