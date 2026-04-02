'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { Sidebar } from '@/components/shared/Sidebar';
import { Header } from '@/components/shared/Header';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/apiClient';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { cn } from '@/lib/utils';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { isSidebarCollapsed, toggleSidebar } = useSettingsStore();
    const { isAuthenticated, _hasHydrated } = useAuthStore();
    const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
    const router = useRouter();

    useEffect(() => {
        console.log("DashboardLayout mounted. _hasHydrated:", _hasHydrated, "isAuthenticated:", isAuthenticated);
        if (_hasHydrated && !isAuthenticated) {
            console.log("Redirecting to login because hydrated but not authenticated");
            router.push('/login');
        } else if (_hasHydrated && isAuthenticated) {
            // Background sync session to ensure permissions are up to date
            authApi.me().then(data => {
                if (data?.user) {
                    useAuthStore.getState().setUser(data.user);
                }
            }).catch(console.error);
        }
    }, [_hasHydrated, isAuthenticated, router]);

    useKeyboardShortcuts({
        'b': () => router.push('/dashboard/billing'),
        'Ctrl+s': () => { console.log('Save triggered') },
        'Escape': () => { console.log('Escape triggered') },
    });

    if (!_hasHydrated || !isAuthenticated) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="min-h-[100dvh] bg-slate-50 relative">
            <OfflineBanner />

            {/* Desktop Sidebar */}
            <div className="hidden lg:block">
                <div className="fixed top-0 left-0 h-full z-30">
                    <Sidebar
                        isCollapsed={isSidebarCollapsed}
                        onToggle={toggleSidebar}
                    />
                </div>
            </div>

            {/* Mobile Sidebar (Sheet) */}
            <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
                <SheetContent side="left" className="p-0 w-64 border-none">
                    <Sidebar
                        isCollapsed={false}
                        onToggle={() => setIsMobileSheetOpen(false)}
                        isMobile={true}
                    />
                </SheetContent>
            </Sheet>

            {/* Main content area */}
            <div className={cn(
                "transition-all duration-200 flex flex-col min-h-[100dvh]",
                "lg:ml-64",
                isSidebarCollapsed && "lg:ml-16"
            )}>
                <Header
                    onMobileMenuToggle={() => setIsMobileSheetOpen(true)}
                    isSidebarCollapsed={isSidebarCollapsed}
                />
                <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
                    {children}
                </main>
            </div>
        </div>
    );
}
