'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Scale, Package, Users, ArrowUpCircle, ArrowDownCircle, RefreshCw, TrendingUp } from 'lucide-react';
import { reportsApi } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { BalanceSheet } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function BalanceRow({ label, value, sub, bold }: { label: string; value: number; sub?: string; bold?: boolean }) {
    return (
        <div className={cn('flex items-center justify-between py-2', bold && 'font-semibold')}>
            <div>
                <span className={cn('text-sm', bold ? 'text-slate-800' : 'text-slate-600')}>{label}</span>
                {sub && <p className="text-xs text-slate-400">{sub}</p>}
            </div>
            <span className={cn('font-mono text-sm', bold ? 'text-slate-900' : 'text-slate-700')}>
                {fmt(value)}
            </span>
        </div>
    );
}

export default function BalanceSheetPage() {
    const user = useAuthStore((s) => s.user);
    const outletId = user?.outletId ?? '';

    const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<BalanceSheet>({
        queryKey: ['balance-sheet', outletId],
        queryFn: () => reportsApi.getBalanceSheet(outletId),
        enabled: !!outletId,
        staleTime: 1000 * 60 * 5,
    });

    const netPositive = (data?.netWorth ?? 0) >= 0;

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Scale className="h-6 w-6 text-primary" />
                        Balance Sheet
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        As of {data?.asOfDate ?? format(new Date(), 'dd MMM yyyy')}
                        {dataUpdatedAt > 0 && (
                            <span className="ml-2 text-xs text-slate-400">
                                · Updated {format(new Date(dataUpdatedAt), 'HH:mm')}
                            </span>
                        )}
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                    <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
                    Refresh
                </Button>
            </div>

            {isError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    Failed to load balance sheet data.
                </div>
            )}

            {/* Net Worth banner */}
            <div className={cn(
                'rounded-2xl border p-5',
                netPositive
                    ? 'border-green-200 bg-gradient-to-r from-green-50 to-emerald-50'
                    : 'border-red-200 bg-gradient-to-r from-red-50 to-orange-50'
            )}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn('rounded-xl p-3', netPositive ? 'bg-green-500' : 'bg-red-500')}>
                            <TrendingUp className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">Net Worth</p>
                            <p className="text-xs text-slate-400">Assets − Liabilities</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className={cn('text-3xl font-bold', netPositive ? 'text-green-700' : 'text-red-700')}>
                            {isLoading ? '—' : fmt(data?.netWorth ?? 0)}
                        </p>
                        <Badge variant={netPositive ? 'default' : 'destructive'} className="text-[11px]">
                            {netPositive ? 'Positive' : 'Negative'}
                        </Badge>
                    </div>
                </div>
            </div>

            {/* Two-column layout: Assets | Liabilities */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

                {/* ASSETS */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ArrowUpCircle className="h-4 w-4 text-green-500" />
                            Assets
                            {!isLoading && (
                                <span className="ml-auto font-mono text-base font-bold text-green-700">
                                    {fmt(data?.assets.totalAssets ?? 0)}
                                </span>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0 divide-y divide-slate-100">
                        <BalanceRow
                            label="Current Stock Value"
                            value={isLoading ? 0 : (data?.assets.currentStock ?? 0)}
                            sub={`${data?.assets.breakdown.batchCount ?? '—'} active batches at purchase rate`}
                        />
                        <BalanceRow
                            label="Customer Receivables"
                            value={isLoading ? 0 : (data?.assets.receivables ?? 0)}
                            sub={`${data?.assets.breakdown.customersWithOutstanding ?? '—'} customers with balance`}
                        />
                        <BalanceRow
                            label="Cash & Bank"
                            value={isLoading ? 0 : (data?.assets.cashAndBank ?? 0)}
                            sub="Not tracked separately"
                        />
                        <Separator className="my-1" />
                        <BalanceRow
                            label="Total Assets"
                            value={isLoading ? 0 : (data?.assets.totalAssets ?? 0)}
                            bold
                        />
                    </CardContent>
                </Card>

                {/* LIABILITIES */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ArrowDownCircle className="h-4 w-4 text-red-500" />
                            Liabilities
                            {!isLoading && (
                                <span className="ml-auto font-mono text-base font-bold text-red-700">
                                    {fmt(data?.liabilities.totalLiabilities ?? 0)}
                                </span>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0 divide-y divide-slate-100">
                        <BalanceRow
                            label="Distributor Payables"
                            value={isLoading ? 0 : (data?.liabilities.payables ?? 0)}
                            sub={`${data?.liabilities.breakdown.distributorsWithOutstanding ?? '—'} distributors with outstanding`}
                        />
                        <Separator className="my-1" />
                        <BalanceRow
                            label="Total Liabilities"
                            value={isLoading ? 0 : (data?.liabilities.totalLiabilities ?? 0)}
                            bold
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Summary equation */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-center text-xs text-slate-500 font-medium tracking-wide uppercase mb-3">
                    Accounting Equation
                </p>
                <div className="flex items-center justify-center gap-3 text-sm flex-wrap">
                    <div className="text-center">
                        <p className="font-mono font-bold text-green-700">{fmt(data?.assets.totalAssets ?? 0)}</p>
                        <p className="text-xs text-slate-400">Assets</p>
                    </div>
                    <span className="text-slate-400 text-lg">=</span>
                    <div className="text-center">
                        <p className="font-mono font-bold text-red-700">{fmt(data?.liabilities.totalLiabilities ?? 0)}</p>
                        <p className="text-xs text-slate-400">Liabilities</p>
                    </div>
                    <span className="text-slate-400 text-lg">+</span>
                    <div className="text-center">
                        <p className={cn('font-mono font-bold', netPositive ? 'text-green-700' : 'text-red-700')}>
                            {fmt(data?.netWorth ?? 0)}
                        </p>
                        <p className="text-xs text-slate-400">Net Worth</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
