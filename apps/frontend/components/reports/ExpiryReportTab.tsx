'use client';

import { useState, useMemo } from 'react';
import {
    useReactTable, getCoreRowModel, getSortedRowModel,
    flexRender, createColumnHelper, SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';
import { useExpiryReportData } from '@/hooks/useReports';
import { ExpiryReportRow } from '@/types';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';

type ExpiryFilter = 30 | 60 | 90 | 180 | 9999;

const FILTER_OPTIONS: { value: ExpiryFilter; label: string }[] = [
    { value: 30,   label: '30 days' },
    { value: 60,   label: '60 days' },
    { value: 90,   label: '90 days' },
    { value: 180,  label: '180 days' },
    { value: 9999, label: 'All' },
];

const helper = createColumnHelper<ExpiryReportRow>();

function DaysRemainingBadge({ days }: { days: number }) {
    if (days < 0) {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-600 text-white">
                Expired ({Math.abs(days)}d ago)
            </span>
        );
    }
    if (days <= 30) {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                {days} days
            </span>
        );
    }
    if (days <= 90) {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                {days} days
            </span>
        );
    }
    return <span className="text-slate-600 text-sm">{days} days</span>;
}

export function ExpiryReportTab() {
    const { data, isLoading } = useExpiryReportData();
    const [filter, setFilter] = useState<ExpiryFilter>(90);
    const [sorting, setSorting] = useState<SortingState>([{ id: 'daysRemaining', desc: false }]);

    const filteredRows = useMemo(() => {
        if (!data) return [];
        return data.filter((r: any) => r.daysRemaining <= filter);
    }, [data, filter]);

    const counts = useMemo(() => {
        if (!data) return { expired: 0, critical: 0, warning: 0, caution: 0 };
        return {
            expired:  data.filter((r: any) => r.daysRemaining < 0).length,
            critical: data.filter((r: any) => r.daysRemaining >= 0 && r.daysRemaining <= 30).length,
            warning:  data.filter((r: any) => r.daysRemaining > 30 && r.daysRemaining <= 90).length,
            caution:  data.filter((r: any) => r.daysRemaining > 90 && r.daysRemaining <= 180).length,
        };
    }, [data]);

    const columns = [
        helper.accessor('productName', {
            header: 'Product',
            cell: info => <span className="font-medium">{info.getValue()}</span>,
        }),
        helper.accessor('batchNo', { header: 'Batch No' }),
        helper.accessor('expiryDate', { header: 'Expiry Date' }),
        helper.accessor('daysRemaining', {
            header: 'Days Remaining',
            cell: info => <DaysRemainingBadge days={info.getValue()} />,
        }),
        helper.accessor('qtyStrips', {
            header: 'Qty (Strips)',
        }),
        helper.accessor('mrp', {
            header: 'MRP',
            cell: info => `₹${info.getValue()}`,
        }),
        helper.accessor('stockValue', {
            header: 'Stock Value',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('distributorName', {
            header: 'Distributor',
            cell: info => (
                <span className="text-xs text-muted-foreground">{info.getValue()}</span>
            ),
        }),
    ];

    const table = useReactTable({
        data: filteredRows,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    if (isLoading) {
        return <div className="h-64 flex items-center justify-center text-muted-foreground">Loading expiry data...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Summary strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{counts.expired}</p>
                    <p className="text-xs text-red-600 font-medium">Expired</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{counts.critical}</p>
                    <p className="text-xs text-red-500 font-medium">{'< 30 days'}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700">{counts.warning}</p>
                    <p className="text-xs text-amber-600 font-medium">30–90 days</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-700">{counts.caution}</p>
                    <p className="text-xs text-yellow-600 font-medium">90–180 days</p>
                </div>
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show batches expiring within:</span>
                {FILTER_OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => setFilter(opt.value)}
                        className={cn(
                            'px-3 py-1 rounded-full text-sm font-medium transition-colors',
                            filter === opt.value
                                ? 'bg-primary text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
                <span className="ml-2 text-sm text-muted-foreground">
                    ({filteredRows.length} batches)
                </span>
            </div>

            {/* Expiry Table */}
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
                            {table.getRowModel().rows.map((row, idx) => {
                                const days = row.original.daysRemaining;
                                return (
                                    <tr
                                        key={row.id}
                                        className={cn(
                                            'border-b hover:bg-opacity-80',
                                            days < 0    ? 'bg-red-50' :
                                            days <= 30  ? 'bg-red-50/50' :
                                            days <= 90  ? 'bg-amber-50/50' :
                                            idx % 2 === 1 ? 'bg-slate-50/50' : ''
                                        )}
                                    >
                                        {row.getVisibleCells().map(cell => (
                                            <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredRows.length === 0 && (
                        <div className="py-12 text-center text-muted-foreground">
                            No batches expiring within {filter === 9999 ? 'the selected period' : `${filter} days`}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
