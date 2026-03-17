'use client';

import { Menu, Bell, WifiOff } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Breadcrumb } from './Breadcrumb';
import { PermissionGate } from './PermissionGate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { authApi } from '@/lib/apiClient';
import { useEffect, useState } from 'react';

interface HeaderProps {
    onMobileMenuToggle: () => void;
    isSidebarCollapsed: boolean;
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
    const title = usePageTitle();
    const { selectedOutletId, setOutletId } = useSettingsStore();
    const { user, logout } = useAuthStore();
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        if (typeof navigator !== 'undefined') {
            setIsOnline(navigator.onLine);
        }
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleLogoutAction = async () => {
        const { handleLogout } = await import('@/lib/auth');
        await handleLogout();
    };

    const getInitials = (name?: string) => name ? name.substring(0, 2).toUpperCase() : 'U';

    return (
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between">

            {/* Left side */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onMobileMenuToggle}
                    className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-md"
                    aria-label="Open menu"
                >
                    <Menu className="w-5 h-5" />
                </button>

                <div className="hidden lg:block">
                    <h1 className="text-lg font-semibold text-slate-900 leading-tight">
                        {title}
                    </h1>
                    <Breadcrumb />
                </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 sm:gap-3">

                {!isOnline && (
                    <div className="animate-in fade-in bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full flex gap-1 items-center font-medium">
                        <WifiOff className="w-3 h-3" />
                        <span className="hidden sm:inline">Offline</span>
                    </div>
                )}

                <PermissionGate permission="view_all_outlets">
                    <div className="hidden sm:block">
                        <Select value={selectedOutletId || user?.outlet?.id || ''} onValueChange={setOutletId}>
                            <SelectTrigger className="w-full max-w-[180px] h-9 text-sm bg-slate-50 border-slate-200 focus:ring-primary focus:ring-offset-1">
                                <SelectValue placeholder="Select Outlet" />
                            </SelectTrigger>
                            <SelectContent>
                                {user?.outlet && (
                                    <SelectItem value={user.outlet.id}>
                                        {user.outlet.name}
                                    </SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </PermissionGate>

                <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors relative" aria-label="Notifications">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                </button>

                {/* User avatar on mobile */}
                <div className="lg:hidden ml-1">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="rounded-full outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                                <Avatar className="w-8 h-8">
                                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                        {getInitials(user?.name)}
                                    </AvatarFallback>
                                </Avatar>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <div className="px-2 py-1.5">
                                <p className="text-sm font-medium">{user?.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{user?.outlet?.name}</p>
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>Profile</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleLogoutAction} className="text-red-600 focus:bg-red-50 focus:text-red-700 cursor-pointer">
                                Logout
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

            </div>
        </header>
    );
}
