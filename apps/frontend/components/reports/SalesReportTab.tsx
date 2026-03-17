'use client';

import { useMemo } from 'react';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
    useReactTable, getCoreRowModel, getSortedRowModel,
    flexRender, createColumnHelper, SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { format } from 'date-fns';
import { ArrowUpDown } from 'lucide-react';
import { DateRangeFilter, SalesReportRow } from '@/types';
import { useSalesReport } from '@/hooks/useReports';
import { ReportSummaryCards } from './ReportSummaryCards';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';

const PIE_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#ef4444'];

const helper = createColumnHelper<SalesReportRow>();

interface SalesReportTabProps {
    dateRange: DateRangeFilter;
}

export function SalesReportTab({ dateRange }: SalesReportTabProps) {
    const { data, isLoading } = useSalesReport(dateRange);
    const [sorting, setSorting] = useState<SortingState>([]);

    const rows = data?.rows ?? [];

    const totals = useMemo(() => ({
        invoiceCount: rows.reduce((s, r) => s + r.invoiceCount, 0),
        totalSales: rows.reduce((s, r) => s + r.totalSales, 0),
        totalDiscount: rows.reduce((s, r) => s + r.totalDiscount, 0),
        totalTax: rows.reduce((s, r) => s + r.totalTax, 0),
        netSales: rows.reduce((s, r) => s + r.netSales, 0),
        cashSales: rows.reduce((s, r) => s + r.cashSales, 0),
        upiSales: rows.reduce((s, r) => s + r.upiSales, 0),
        cardSales: rows.reduce((s, r) => s + r.cardSales, 0),
        creditSales: rows.reduce((s, r) => s + r.creditSales, 0),
    }), [rows]);

    const pieData = [
        { name: 'Cash',   value: totals.cashSales   },
        { name: 'UPI',    value: totals.upiSales    },
        { name: 'Card',   value: totals.cardSales   },
        { name: 'Credit', value: totals.creditSales },
    ];

    const columns = [
        helper.accessor('date', {
            header: 'Date',
            cell: info => format(new Date(info.getValue()), 'd MMM yyyy'),
        }),
        helper.accessor('invoiceCount', { header: 'Invoices' }),
        helper.accessor('totalSales', {
            header: 'Sales',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('totalDiscount', {
            header: 'Discount',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('totalTax', {
            header: 'GST',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('netSales', {
            header: 'Net Sales',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('cashSales', {
            header: 'Cash',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('upiSales', {
            header: 'UPI',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('cardSales', {
            header: 'Card',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('creditSales', {
            header: 'Credit',
            cell: info => formatCurrency(info.getValue()),
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
        return <div className="h-64 flex items-center justify-center text-muted-foreground">Loading sales data...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <ReportSummaryCards cards={(data?.summary ?? []).map((c: any) => ({ ...c, trend: c.trend as "up" | "down" | "flat" }))} isLoading={isLoading} />

            {/* Sales Trend Chart */}
            <div className="bg-white rounded-xl border p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Daily Sales Trend</h3>
                <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={data?.chartData ?? []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                            dataKey="date"
                            tickFormatter={v => format(new Date(v), 'd MMM')}
                            tick={{ fontSize: 11 }}
                        />
                        <YAxis
                            yAxisId="sales"
                            orientation="left"
                            tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
                            tick={{ fontSize: 11 }}
                        />
                        <YAxis
                            yAxisId="bills"
                            orientation="right"
                            tick={{ fontSize: 11 }}
                        />
                        <Tooltip
                            formatter={(value, name) =>
                                name === 'sales'
                                    ? [formatCurrency(value as number), 'Sales']
                                    : [value, 'Bills']
                            }
                            labelFormatter={v => format(new Date(v), 'd MMM yyyy')}
                            contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        />
                        <Legend />
                        <Bar
                            yAxisId="sales"
                            dataKey="sales"
                            name="Sales"
                            fill="#3b82f6"
                            opacity={0.8}
                            radius={[2, 2, 0, 0]}
                        />
                        <Line
                            yAxisId="bills"
                            type="monotone"
                            dataKey="bills"
                            name="Bills"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Payment Mode Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Payment Mode Split</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                dataKey="value"
                                label={({ name, percent }: { name?: string; percent?: number }) =>
                                    `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                                }
                                labelLine={false}
                            >
                                {pieData.map((_, idx) => (
                                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(v) => formatCurrency(v as number)} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl border p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Payment Amounts</h3>
                    <div className="space-y-3 mt-2">
                        {pieData.map((item, idx) => (
                            <div key={item.name} className="flex items-center gap-3">
                                <span
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: PIE_COLORS[idx] }}
                                />
                                <span className="text-sm text-slate-600 w-16">{item.name}</span>
                                <div className="flex-1 bg-slate-100 rounded-full h-2">
                                    <div
                                        className="h-2 rounded-full"
                                        style={{
                                            backgroundColor: PIE_COLORS[idx],
                                            width: `${totals.totalSales > 0 ? (item.value / totals.totalSales) * 100 : 0}%`,
                                        }}
                                    />
                                </div>
                                <span className="text-sm font-medium text-slate-800 w-20 text-right">
                                    {formatCurrency(item.value)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Data Table */}
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
                                    className={cn(
                                        'border-b hover:bg-slate-50',
                                        idx % 2 === 1 && 'bg-slate-50/50'
                                    )}
                                >
                                    {row.getVisibleCells().map(cell => (
                                        <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                        {rows.length > 0 && (
                            <tfoot>
                                <tr className="bg-slate-900 text-white">
                                    <td className="px-3 py-2 font-semibold text-xs">TOTALS</td>
                                    <td className="px-3 py-2 font-semibold">{totals.invoiceCount}</td>
                                    <td className="px-3 py-2 font-semibold">{formatCurrency(totals.totalSales)}</td>
                                    <td className="px-3 py-2 font-semibold">{formatCurrency(totals.totalDiscount)}</td>
                                    <td className="px-3 py-2 font-semibold">{formatCurrency(totals.totalTax)}</td>
                                    <td className="px-3 py-2 font-semibold">{formatCurrency(totals.netSales)}</td>
                                    <td className="px-3 py-2 font-semibold">{formatCurrency(totals.cashSales)}</td>
                                    <td className="px-3 py-2 font-semibold">{formatCurrency(totals.upiSales)}</td>
                                    <td className="px-3 py-2 font-semibold">{formatCurrency(totals.cardSales)}</td>
                                    <td className="px-3 py-2 font-semibold">{formatCurrency(totals.creditSales)}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
