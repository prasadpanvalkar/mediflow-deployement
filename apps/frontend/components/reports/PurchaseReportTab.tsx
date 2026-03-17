'use client';

import { useMemo, useState } from 'react';
import {
    AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer,
} from 'recharts';
import {
    useReactTable, getCoreRowModel, getSortedRowModel,
    flexRender, createColumnHelper, SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DateRangeFilter, PurchaseReportRow } from '@/types';
import { usePurchaseReport } from '@/hooks/useReports';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const DIST_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444'];

const helper = createColumnHelper<PurchaseReportRow>();

function StatusBadge({ row }: { row: PurchaseReportRow }) {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (row.outstanding <= 0) {
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Paid</Badge>;
    }
    // Check overdue: no dueDate in PurchaseReportRow, so we derive from purchase data
    // For mock data where purchase-5 is 45 days old, we detect by date
    const daysSincePurchase = Math.floor((new Date(today).getTime() - new Date(row.date).getTime()) / 86400000);
    if (daysSincePurchase > 30 && row.outstanding > 0) {
        return <Badge className="bg-red-600 text-white hover:bg-red-600">Overdue</Badge>;
    }
    if (row.outstanding < row.grandTotal) {
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Partial</Badge>;
    }
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Unpaid</Badge>;
}

interface PurchaseReportTabProps {
    dateRange: DateRangeFilter;
}

export function PurchaseReportTab({ dateRange }: PurchaseReportTabProps) {
    const { data, isLoading } = usePurchaseReport(dateRange);
    const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);

    const rows = data?.rows ?? [];

    const distributorPie = useMemo(() => {
        const map = new Map<string, number>();
        rows.forEach((r: any) => {
            map.set(r.distributorName, (map.get(r.distributorName) ?? 0) + r.grandTotal);
        });
        return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    }, [rows]);

    const columns = [
        helper.accessor('date', {
            header: 'Date',
            cell: info => format(new Date(info.getValue()), 'd MMM yyyy'),
        }),
        helper.accessor('invoiceNo', { header: 'Invoice No' }),
        helper.accessor('distributorName', {
            header: 'Distributor',
            cell: info => (
                <span className="text-xs">{info.getValue()}</span>
            ),
        }),
        helper.accessor('itemCount', { header: 'Items' }),
        helper.accessor('grandTotal', {
            header: 'Total',
            cell: info => <span className="font-medium">{formatCurrency(info.getValue())}</span>,
        }),
        helper.accessor('amountPaid', {
            header: 'Paid',
            cell: info => (
                <span className="text-green-700 font-medium">{formatCurrency(info.getValue())}</span>
            ),
        }),
        helper.accessor('outstanding', {
            header: 'Outstanding',
            cell: info => (
                <span className={cn(
                    'font-medium',
                    info.getValue() > 0 ? 'text-red-600' : 'text-slate-400'
                )}>
                    {formatCurrency(info.getValue())}
                </span>
            ),
        }),
        helper.display({
            id: 'status',
            header: 'Status',
            cell: ({ row }) => <StatusBadge row={row.original} />,
        }),
    ];

    const table = useReactTable({
        data: rows,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    if (isLoading) {
        return <div className="h-64 flex items-center justify-center text-muted-foreground">Loading purchase data...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Purchased</p>
                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(data?.totalPurchased ?? 0)}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Paid</p>
                    <p className="text-2xl font-bold text-green-700">{formatCurrency(data?.totalPaid ?? 0)}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Outstanding</p>
                    <p className={cn('text-2xl font-bold', (data?.totalOutstanding ?? 0) > 0 ? 'text-red-600' : 'text-slate-400')}>
                        {formatCurrency(data?.totalOutstanding ?? 0)}
                    </p>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Purchase Trend */}
                <div className="bg-white rounded-xl border p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Purchase Trend</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart
                            data={[...rows].sort((a, b) => a.date.localeCompare(b.date))}
                        >
                            <defs>
                                <linearGradient id="purchaseGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={v => format(new Date(v), 'd MMM')}
                                tick={{ fontSize: 10 }}
                            />
                            <YAxis
                                tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
                                tick={{ fontSize: 10 }}
                            />
                            <Tooltip
                                formatter={(v) => formatCurrency(v as number)}
                                labelFormatter={v => format(new Date(v), 'd MMM yyyy')}
                            />
                            <Area
                                type="monotone"
                                dataKey="grandTotal"
                                name="Total"
                                stroke="#3b82f6"
                                fill="url(#purchaseGrad)"
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Distributor Breakup */}
                <div className="bg-white rounded-xl border p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Distributor Breakup</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                            <Pie
                                data={distributorPie}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={75}
                                dataKey="value"
                                label={({ name, percent }: { name?: string; percent?: number }) =>
                                    `${(name ?? '').split(' ')[0]} (${((percent ?? 0) * 100).toFixed(0)}%)`
                                }
                                labelLine={false}
                            >
                                {distributorPie.map((_: any, idx: number) => (
                                    <Cell key={idx} fill={DIST_COLORS[idx % DIST_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(v) => formatCurrency(v as number)} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Purchase Table */}
            <div className="bg-white rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            {table.getHeaderGroups().map(hg => (
                                <tr key={hg.id} className="bg-slate-50 border-b">
                                    {hg.headers.map(h => (
                                        <th
                                            key={h.id}
                                            className="px-3 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap cursor-pointer select-none"
                                            onClick={h.column.getToggleSortingHandler()}
                                        >
                                            <div className="flex items-center gap-1">
                                                {flexRender(h.column.columnDef.header, h.getContext())}
                                                <ArrowUpDown className="w-3 h-3 text-slate-400" />
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map((row, idx) => (
                                <tr
                                    key={row.id}
                                    className={cn('border-b hover:bg-slate-50', idx % 2 === 1 && 'bg-slate-50/50')}
                                >
                                    {row.getVisibleCells().map(cell => (
                                        <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                        {rows.length === 0 && (
                            <tbody>
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                                        No purchases in selected period
                                    </td>
                                </tr>
                            </tbody>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
