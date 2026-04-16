'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePermissions, type Permission } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/apiClient';
import { StaffRole } from '@/types';
import { RoleBadge } from './RoleBadge';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
    LayoutDashboard, Receipt, Package, ShoppingCart, Users,
    CreditCard, UserCog, CalendarCheck, BarChart3, Settings,
    Pill, ChevronLeft, ChevronRight, MoreVertical, Wallet, Building2,
    BookOpen, ArrowUpLeft, ArrowDownLeft, List, Scale, PieChart, FileSearch,
    ClipboardList, TrendingUp,
} from 'lucide-react';

type SubNavItem = {
    label: string;
    href: string;
    icon: any;
};

type NavItem = {
    label: string;
    href: string;
    icon: any;
    permission: Permission | null;
    shortcut?: string;
    badge?: string;
    subItems?: SubNavItem[];
};

const NAV_ITEMS: NavItem[] = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        permission: null,
    },
    {
        label: 'Billing',
        href: '/dashboard/billing',
        icon: Receipt,
        permission: 'create_bills' as Permission,
        shortcut: 'B',
    },
    {
        label: 'Sales',
        href: '/dashboard/sales',
        icon: ClipboardList,
        permission: 'create_bills' as Permission,
    },
    {
        label: 'Inventory',
        href: '/dashboard/inventory',
        icon: Package,
        permission: 'view_outlet' as Permission,
    },
    {
        label: 'Purchases',
        href: '/dashboard/purchases',
        icon: ShoppingCart,
        permission: 'create_purchases' as Permission,
    },
    {
        label: 'Customers',
        href: '/dashboard/customers',
        icon: Users,
        permission: 'view_outlet' as Permission,
    },
    {
        label: 'Credit / Udhari',
        href: '/dashboard/credit',
        icon: CreditCard,
        permission: 'view_outlet' as Permission,
        badge: 'overdueCreditCount',
    },
    {
        label: 'Staff',
        href: '/dashboard/staff',
        icon: UserCog,
        permission: 'manage_staff' as Permission,
    },
    // Attendance — Phase 2, hidden from nav
    // {
    //     label: 'Attendance',
    //     href: '/dashboard/attendance',
    //     icon: CalendarCheck,
    //     permission: 'view_outlet' as Permission,
    // },
    {
        label: 'Accounts',
        href: '/dashboard/accounts',
        icon: Wallet,
        permission: 'create_purchases' as Permission,
        subItems: [
            { label: 'Voucher Entry', href: '/dashboard/accounts/voucher-entry', icon: BookOpen },
            { label: 'Purchase Returns', href: '/dashboard/accounts/purchase-returns', icon: ArrowUpLeft },
            { label: 'Sale Returns', href: '/dashboard/accounts/sale-returns', icon: ArrowDownLeft },
            { label: 'Ledgers', href: '/dashboard/accounts/ledgers', icon: List },
        ],
    },
    {
        label: 'Reports',
        href: '/dashboard/reports',
        icon: BarChart3,
        permission: 'view_reports' as Permission,
        subItems: [
            { label: 'Trial Balance', href: '/dashboard/reports/trial-balance', icon: Scale },
            { label: 'Balance Sheet', href: '/dashboard/reports/balance-sheet', icon: PieChart },
            { label: 'Profit & Loss', href: '/dashboard/reports/profit-loss', icon: TrendingUp },
            { label: 'GSTR-2A Recon', href: '/dashboard/reports/gstr2a', icon: FileSearch },
        ],
    },
    {
        label: 'Settings',
        href: '/dashboard/settings',
        icon: Settings,
        permission: 'manage_settings' as Permission,
    },
] as const;

interface SidebarProps {
    isCollapsed: boolean;
    onToggle: () => void;
    isMobile?: boolean; // If used within Sheet, might close on click
}

export function Sidebar({ isCollapsed, onToggle, isMobile = false }: SidebarProps) {
    const pathname = usePathname();
    const { hasPermission } = usePermissions();
    const { user, logout } = useAuthStore();

    const handleLogoutAction = async () => {
        const { handleLogout } = await import('@/lib/auth');
        await handleLogout();
    };

    const getInitials = (name?: string) => {
        if (!name) return 'U';
        return name.substring(0, 2).toUpperCase();
    };

    return (
        <div
            className={cn(
                'flex flex-col h-full bg-white border-r border-slate-200 transition-width duration-200 ease-in-out',
                isCollapsed ? 'w-16' : 'w-64'
            )}
        >
            {/* Top section: Logo */}
            <div className="h-16 flex items-center justify-center border-b border-slate-200 px-4 relative">
                <Pill className={cn('text-primary transition-all', isCollapsed ? 'w-6 h-6' : 'w-7 h-7 shrink-0')} />
                {!isCollapsed && <span className="font-bold text-xl text-slate-900 ml-2 truncate w-full">MediFlow</span>}

                {/* Desktop Collapse Toggle */}
                {!isMobile && (
                    <button
                        onClick={onToggle}
                        className="absolute -right-3 top-20 bg-white border border-slate-200 rounded-full w-6 h-6 flex items-center justify-center shadow-sm cursor-pointer hover:bg-slate-50 z-40"
                        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronLeft className="w-4 h-4 text-slate-500" />}
                    </button>
                )}
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
                <TooltipProvider delayDuration={isCollapsed ? 100 : 1000}>
                    {/* Super Admin: Chain Dashboard */}
                    {user?.role === 'super_admin' && (() => {
                        const href = '/dashboard/chain';
                        const isActive = pathname === href || pathname.startsWith(href);
                        const content = (
                            <Link
                                href={href}
                                onClick={isMobile ? onToggle : undefined}
                                className={cn(
                                    'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                                    isCollapsed ? 'justify-center py-3' : 'px-3 py-2.5',
                                    isActive
                                        ? 'bg-primary text-white'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                )}
                            >
                                <Building2 className="w-5 h-5 shrink-0" />
                                {!isCollapsed && <span className="flex-1 truncate">Chain Dashboard</span>}
                            </Link>
                        );
                        if (isCollapsed && !isMobile) {
                            return (
                                <Tooltip key="chain">
                                    <TooltipTrigger asChild>{content}</TooltipTrigger>
                                    <TooltipContent side="right"><p>Chain Dashboard</p></TooltipContent>
                                </Tooltip>
                            );
                        }
                        return <div key="chain">{content}</div>;
                    })()}

                    {NAV_ITEMS.map((item) => {
                        if (item.permission && !hasPermission(item.permission)) return null;

                        const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                        const Icon = item.icon;

                        const content = (
                            <Link
                                href={item.href}
                                onClick={isMobile ? onToggle : undefined} // Close sheet on click for mobile
                                className={cn(
                                    'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                                    isCollapsed ? 'justify-center py-3' : 'px-3 py-2.5',
                                    isActive
                                        ? 'bg-primary text-white'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                )}
                            >
                                <Icon className={cn('w-5 h-5 shrink-0')} />
                                {!isCollapsed && (
                                    <>
                                        <span className="flex-1 truncate">{item.label}</span>
                                        {isActive && item.shortcut && (
                                            <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded text-white font-mono">
                                                {item.shortcut}
                                            </span>
                                        )}
                                        {item.badge === 'overdueCreditCount' && ( // Placeholder logic for now
                                            <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                                2
                                            </span>
                                        )}
                                    </>
                                )}
                            </Link>
                        );

                        const subItems = item.subItems && isActive && !isCollapsed ? (
                            <div className="mt-1 ml-4 space-y-0.5 border-l border-slate-200 pl-3">
                                {item.subItems.map((sub) => {
                                    const subActive = pathname === sub.href || pathname.startsWith(sub.href + '/');
                                    const SubIcon = sub.icon;
                                    return (
                                        <Link
                                            key={sub.href}
                                            href={sub.href}
                                            onClick={isMobile ? onToggle : undefined}
                                            className={cn(
                                                'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                                                subActive
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                            )}
                                        >
                                            <SubIcon className="w-3.5 h-3.5 shrink-0" />
                                            <span className="truncate">{sub.label}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        ) : null;

                        if (isCollapsed && !isMobile) {
                            return (
                                <Tooltip key={item.label}>
                                    <TooltipTrigger asChild>{content}</TooltipTrigger>
                                    <TooltipContent side="right">
                                        <p>{item.label}</p>
                                    </TooltipContent>
                                </Tooltip>
                            );
                        }

                        return (
                            <div key={item.label}>
                                {content}
                                {subItems}
                            </div>
                        );
                    })}
                </TooltipProvider>
            </div>

            {/* Bottom section: User card */}
            <div className="border-t border-slate-200 p-3">
                {isCollapsed && !isMobile ? (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex justify-center cursor-pointer">
                                    <Avatar className="w-8 h-8">
                                        <AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
                                    </Avatar>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                <p>{user?.name}</p>
                                <p className="text-xs text-muted-foreground">{user?.role}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    <div className="flex items-center gap-3 w-full">
                        <Avatar className="w-8 h-8 shrink-0">
                            <AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 pr-1">
                            <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
                            {user?.role && <RoleBadge role={user.role as StaffRole} size="sm" />}
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="shrink-0 p-1 rounded hover:bg-slate-100 text-slate-500">
                                    <MoreVertical className="w-4 h-4" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem>Profile</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleLogoutAction} className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer">
                                    Logout
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                    </div>
                )}
            </div>
        </div>
    );
}
