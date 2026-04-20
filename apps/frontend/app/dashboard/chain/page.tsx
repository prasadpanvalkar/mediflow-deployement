'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import { Building2, TrendingUp, ShoppingCart, CreditCard, ArrowDownCircle, RefreshCw, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { chainApi, authApi } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore, rehydrateSettingsForOutlet } from '@/store/settingsStore';
import { useBillingStore } from '@/store/billingStore';
import { ChainDashboard, ChainOutletRow } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AddOutletModal } from '@/components/chain/AddOutletModal';

const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function KPICard({
    title, value, sub, icon: Icon, color,
}: {
    title: string; value: string; sub?: string; icon: any; color: string;
}) {
    return (
        <Card>
            <CardContent className="flex items-center gap-4 p-5">
                <div className={cn('rounded-xl p-3', color)}>
                    <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                    <p className="text-xs font-medium text-slate-500">{title}</p>
                    <p className="text-xl font-bold text-slate-900">{value}</p>
                    {sub && <p className="text-xs text-slate-400">{sub}</p>}
                </div>
            </CardContent>
        </Card>
    );
}

export default function ChainDashboardPage() {
    const user = useAuthStore((s) => s.user);
    const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));

    const orgId = user?.organizationId;

    const { data, isLoading, isError, refetch } = useQuery<ChainDashboard>({
        queryKey: ['chain-dashboard', orgId, from, to],
        queryFn: () => chainApi.getChainDashboard(orgId!, from, to),
        enabled: !!orgId && user?.role === 'super_admin',
        staleTime: 1000 * 60 * 2,
    });

    const switchMutation = useMutation({
        mutationFn: (targetOutletId: string) => authApi.switchOutlet(targetOutletId),
        onSuccess: (data) => {
            // 1. Update auth store with new user and outlet
            useAuthStore.setState({ user: data.user, isAuthenticated: true });
            useAuthStore.getState().setOutlet(data.user.outlet);

            // 2. Update selectedOutletId so useOutletId() picks up the new outlet from auth store
            useSettingsStore.getState().setOutletId(data.user.outletId);

            // 2b. Re-key the settings store to the new outlet's localStorage bucket
            rehydrateSettingsForOutlet(data.user.outletId);

            // 3. Reset billing store to prevent cross-outlet cart leakage
            useBillingStore.getState().resetBilling();

            // 4. Save new JWT token
            document.cookie = `access_token=${data.access}; path=/;`;

            // 5. Hard refresh to clear react-query cache and remount layout with new outlet scope
            window.location.href = '/dashboard';
        },
        onError: (err: any) => {
            alert(err?.detail || 'Failed to switch outlet');
        }
    });

    if (user?.role !== 'super_admin') {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="text-center">
                    <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
                    <p className="font-medium text-slate-700">Super Admin access required</p>
                    <p className="text-sm text-slate-400">Only super admins can view the Chain Dashboard.</p>
                </div>
            </div>
        );
    }

    if (!orgId) {
        return (
            <div className="flex h-64 items-center justify-center">
                <p className="text-slate-400">No organization linked to your account.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Building2 className="h-6 w-6 text-primary" />
                        Chain Dashboard
                    </h1>
                    {data && (
                        <p className="text-sm text-slate-500 mt-0.5">{data.organization.name}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                        <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
                        Refresh
                    </Button>
                    <AddOutletModal orgId={orgId} />
                </div>
            </div>

            {/* Date range */}
            <div className="flex items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-500">From</Label>
                    <Input type="date" className="h-9 w-40 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-500">To</Label>
                    <Input type="date" className="h-9 w-40 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <Badge variant="outline" className="mb-0.5 text-xs">
                    {data ? `${data.outlets.length} outlets` : '—'}
                </Badge>
            </div>

            {isError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    Failed to load chain data. Check that your account has super_admin access.
                </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KPICard
                    title="Period Sales"
                    value={fmt(data?.totalSales.total ?? 0)}
                    sub={`${data?.totalSales.invoices ?? 0} invoices`}
                    icon={TrendingUp}
                    color="bg-green-500"
                />
                <KPICard
                    title="Today's Sales"
                    value={fmt(data?.todaySales.total ?? 0)}
                    sub={`${data?.todaySales.invoices ?? 0} invoices today`}
                    icon={TrendingUp}
                    color="bg-blue-500"
                />
                <KPICard
                    title="Period Purchases"
                    value={fmt(data?.totalPurchases.total ?? 0)}
                    sub={`${data?.totalPurchases.invoices ?? 0} GRNs`}
                    icon={ShoppingCart}
                    color="bg-violet-500"
                />
                <KPICard
                    title="Distributor Payables"
                    value={fmt(data?.totalPayables ?? 0)}
                    sub="Outstanding across chain"
                    icon={ArrowDownCircle}
                    color="bg-red-500"
                />
            </div>

            {/* Outlet breakdown table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                    <Building2 className="h-4 w-4 text-slate-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Outlet Breakdown
                    </h3>
                </div>

                {isLoading ? (
                    <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                        Loading...
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-slate-100 bg-slate-50/50">
                                <tr>
                                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Outlet</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Location</th>
                                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Today</th>
                                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Period Sales</th>
                                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Period Invoices</th>
                                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Share</th>
                                    <th className="px-5 py-3 text-center text-xs font-medium text-slate-500">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {(data?.outlets ?? []).map((outlet: ChainOutletRow) => {
                                    const sharePct = data && data.totalSales.total > 0
                                        ? (outlet.periodSales / data.totalSales.total) * 100
                                        : 0;
                                    return (
                                        <tr key={outlet.id} className="hover:bg-slate-50/40">
                                            <td className="px-5 py-3 font-medium text-slate-800">{outlet.name}</td>
                                            <td className="px-5 py-3 text-slate-500">{outlet.city}, {outlet.state}</td>
                                            <td className="px-5 py-3 text-right font-mono text-slate-700">
                                                {fmt(outlet.todaySales)}
                                            </td>
                                            <td className="px-5 py-3 text-right font-mono font-semibold text-slate-800">
                                                {fmt(outlet.periodSales)}
                                            </td>
                                            <td className="px-5 py-3 text-right text-slate-500">
                                                {outlet.periodInvoices}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="h-1.5 w-16 rounded-full bg-slate-100">
                                                        <div
                                                            className="h-1.5 rounded-full bg-primary"
                                                            style={{ width: `${Math.min(sharePct, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="w-10 text-right text-xs text-slate-500">
                                                        {sharePct.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                <Button
                                                    variant={outlet.id === user?.outletId ? "secondary" : "outline"}
                                                    size="sm"
                                                    disabled={outlet.id === user?.outletId || switchMutation.isPending}
                                                    onClick={() => switchMutation.mutate(outlet.id)}
                                                    className="w-full text-xs h-8"
                                                >
                                                    {switchMutation.variables === outlet.id && switchMutation.isPending ? (
                                                        <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                                                    ) : outlet.id === user?.outletId ? (
                                                        <span className="text-slate-500">Current</span>
                                                    ) : (
                                                        <>
                                                            Enter
                                                            <ArrowRight className="ml-1 h-3 w-3" />
                                                        </>
                                                    )}
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {(!data?.outlets || data.outlets.length === 0) && (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">
                                            No outlet data available
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {data && data.outlets.length > 1 && (
                                <tfoot className="border-t border-slate-200 bg-slate-50">
                                    <tr>
                                        <td className="px-5 py-3 text-xs font-semibold text-slate-600" colSpan={2}>
                                            Total ({data.outlets.length} outlets)
                                        </td>
                                        <td className="px-5 py-3 text-right font-mono text-xs font-semibold text-slate-700">
                                            {fmt(data.todaySales.total)}
                                        </td>
                                        <td className="px-5 py-3 text-right font-mono text-xs font-semibold text-slate-800">
                                            {fmt(data.totalSales.total)}
                                        </td>
                                        <td className="px-5 py-3 text-right text-xs font-semibold text-slate-700">
                                            {data.totalSales.invoices}
                                        </td>
                                        <td className="px-5 py-3 text-right text-xs text-slate-500">100%</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
