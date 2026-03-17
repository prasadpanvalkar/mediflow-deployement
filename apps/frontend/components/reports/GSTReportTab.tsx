'use client';

import { useState } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
    useReactTable, getCoreRowModel, getSortedRowModel,
    flexRender, createColumnHelper, SortingState,
} from '@tanstack/react-table';
import { FileDown, Loader2, ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateRangeFilter, GSTReportRow } from '@/types';
import { useGSTReport } from '@/hooks/useReports';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';

const SLAB_COLORS: Record<number, string> = {
    0: '#94a3b8',
    5: '#3b82f6',
    12: '#22c55e',
    18: '#f59e0b',
    28: '#ef4444',
};

const helper = createColumnHelper<GSTReportRow>();

interface GSTReportTabProps {
    dateRange: DateRangeFilter;
}

export function GSTReportTab({ dateRange }: GSTReportTabProps) {
    const { data, isLoading } = useGSTReport(dateRange);
    const [sorting, setSorting] = useState<SortingState>([]);
    const [pdfLoading, setPdfLoading] = useState(false);
    const { outlet } = useAuthStore();

    const columns = [
        helper.accessor('hsnCode', { header: 'HSN Code' }),
        helper.accessor('productName', {
            header: 'Product Description',
            cell: info => (
                <span className="max-w-[200px] truncate block">{info.getValue()}</span>
            ),
        }),
        helper.accessor('taxableAmount', {
            header: 'Taxable Amt',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('cgstRate', {
            header: 'CGST Rate',
            cell: info => `${info.getValue()}%`,
        }),
        helper.accessor('cgstAmount', {
            header: 'CGST Amt',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('sgstRate', {
            header: 'SGST Rate',
            cell: info => `${info.getValue()}%`,
        }),
        helper.accessor('sgstAmount', {
            header: 'SGST Amt',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('totalTax', {
            header: 'Total Tax',
            cell: info => formatCurrency(info.getValue()),
        }),
    ];

    const table = useReactTable({
        data: data?.rows ?? [],
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const handlePDFDownload = async () => {
        if (!data || !outlet) return;
        setPdfLoading(true);
        try {
            const { pdf } = await import('@react-pdf/renderer');
            const { GSTReportPDF } = await import('@/lib/GSTReportPDF');
            const blob = await pdf(<GSTReportPDF summary={data} outlet={outlet} />).toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `GST-Report-${dateRange.from}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setPdfLoading(false);
        }
    };

    if (isLoading) {
        return <div className="h-64 flex items-center justify-center text-muted-foreground">Loading GST data...</div>;
    }

    if (!data) return null;

    const pieData = data.gstSlabBreakup
        .filter((s: any) => s.taxAmount > 0)
        .map((s: any) => ({
            name: `${s.rate}% GST`,
            value: s.taxAmount,
            rate: s.rate,
        }));

    return (
        <div className="space-y-6">
            {/* GST Slab Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {data.gstSlabBreakup.map((slab: any) => (
                    <div key={slab.rate} className="bg-white rounded-xl border p-4">
                        <p className="text-2xl font-bold" style={{ color: SLAB_COLORS[slab.rate] ?? '#0f172a' }}>
                            {slab.rate}% GST
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Taxable</p>
                        <p className="text-sm font-semibold">{formatCurrency(slab.taxableAmount)}</p>
                        <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                            <span>CGST: {formatCurrency(slab.taxAmount / 2)}</span>
                            <span>SGST: {formatCurrency(slab.taxAmount / 2)}</span>
                        </div>
                        <p className="text-sm font-bold text-primary mt-1">
                            Total: {formatCurrency(slab.taxAmount)}
                        </p>
                    </div>
                ))}
            </div>

            {/* Outlet + Period Header */}
            <div className="bg-slate-50 rounded-xl p-4 flex items-start justify-between">
                <div>
                    <p className="font-bold text-slate-900">{data.outletName}</p>
                    <p className="text-sm text-muted-foreground">GSTIN: {data.outletGstin}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        Period: {data.period.from} to {data.period.to}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">GSTR-1 Summary</Badge>
                    <Button onClick={handlePDFDownload} disabled={pdfLoading} size="sm">
                        {pdfLoading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <FileDown className="w-4 h-4 mr-2" />
                        )}
                        {pdfLoading ? 'Generating PDF...' : 'Download GST Report PDF'}
                    </Button>
                </div>
            </div>

            {/* GST Breakup Pie Chart */}
            <div className="bg-white rounded-xl border p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">GST Collection by Slab</h3>
                <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                        <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            dataKey="value"
                            label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                        >
                            {pieData.map((entry: any, idx: number) => (
                                <Cell key={idx} fill={SLAB_COLORS[entry.rate] ?? '#94a3b8'} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatCurrency(v as number)} />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* HSN-wise Table */}
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
                        <tfoot>
                            <tr className="bg-slate-900 text-white">
                                <td className="px-3 py-2 font-bold text-xs">TOTAL</td>
                                <td className="px-3 py-2"></td>
                                <td className="px-3 py-2 font-bold">{formatCurrency(data.totals.taxableAmount)}</td>
                                <td className="px-3 py-2"></td>
                                <td className="px-3 py-2 font-bold">{formatCurrency(data.totals.cgstAmount)}</td>
                                <td className="px-3 py-2"></td>
                                <td className="px-3 py-2 font-bold">{formatCurrency(data.totals.sgstAmount)}</td>
                                <td className="px-3 py-2 font-bold">{formatCurrency(data.totals.totalTax)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
}
