import { useAuthStore } from '@/store/authStore';
import { StaffRole } from '@/types';

export type Permission =
    | 'view_outlet'
    | 'manage_staff'
    | 'create_bills'
    | 'create_purchases'
    | 'view_reports'
    | 'export_reports'
    | 'manage_settings'
    | 'override_credit'
    | 'view_purchase_rates'
    | 'view_all_outlets'
    | 'manage_outlets'
    | 'manage_products';

const ROLE_PERMISSIONS: Record<StaffRole, Permission[] | ['*']> = {
    super_admin: ['*'],
    admin: [
        'view_outlet', 'manage_staff', 'create_bills',
        'create_purchases', 'view_reports', 'export_reports',
        'manage_settings', 'override_credit', 'view_purchase_rates',
        'manage_outlets', 'manage_products'
    ],
    manager: [
        'view_outlet', 'create_bills', 'create_purchases',
        'view_reports', 'export_reports', 'override_credit', 'manage_products'
    ],
    billing_staff: [
        'view_outlet', 'create_bills'
    ],
    view_only: [
        'view_outlet', 'view_reports'
    ],
};

export function usePermissions() {
    const { user } = useAuthStore();

    const hasPermission = (permission: Permission): boolean => {
        if (!user) return false;
        const perms = ROLE_PERMISSIONS[user.role as StaffRole];
        if (perms[0] === '*') return true;
        return (perms as Permission[]).includes(permission);
    };

    const hasAnyPermission = (...permissions: Permission[]): boolean =>
        permissions.some(hasPermission);

    const hasAllPermissions = (...permissions: Permission[]): boolean =>
        permissions.every(hasPermission);

    return { hasPermission, hasAnyPermission, hasAllPermissions, role: user?.role };
}
