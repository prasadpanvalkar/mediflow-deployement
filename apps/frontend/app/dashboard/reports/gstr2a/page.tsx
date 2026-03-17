'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import { CheckCircle2, XCircle, AlertCircle, FileSearch, Loader2, RefreshCw } from 'lucide-react';
import { reportsApi } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { GSTR2AReconciliation, GSTR2AInvoiceRow } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function InvoiceTable({
    rows,
    showVariance,
    emptyMessage,
}: {
    rows: GSTR2AInvoiceRow[];
    showVariance?: boolean;
    emptyMessage: string;
}) {
    if (rows.length === 0) {
        return (
            <div className="flex h-28 items-center justify-center text-sm text-slate-400">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs">
                <thead className="border-b border-slate-100 bg-slate-50">
                    <tr>
                        <th className="px-4 py-2.5 text-left font-medium text-slate-500">Supplier GSTIN</th>
                        <th className="px-4 py-2.5 text-left font-medium text-slate-500">Supplier</th>
                        <th className="px-4 py-2.5 text-left font-medium text-slate-500">Invoice No</th>
                        <th className="px-4 py-2.5 text-left font-medium text-slate-500">Date</th>
                        <th className="px-4 py-2.5 text-right font-medium text-slate-500">Amount</th>
                        <th className="px-4 py-2.5 text-right font-medium text-slate-500">GST</th>
                        {showVariance && (
                            <>
                                <th className="px-4 py-2.5 text-right font-medium text-slate-500">GSTR-2A Amt</th>
                                <th className="px-4 py-2.5 text-right font-medium text-slate-500">Variance</th>
                            </>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/40">
                            <td className="px-4 py-2.5 font-mono text-slate-500">{row.supplierGstin || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-700 max-w-[160px] truncate">{row.supplierName}</td>
                            <td className="px-4 py-2.5 font-medium text-slate-800">{row.invoiceNo}</td>
                            <td className="px-4 py-2.5 text-slate-500">{row.invoiceDate}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-700">{fmt(row.totalAmount)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-slate-500">{fmt(row.gstAmount)}</td>
                            {showVariance && (
                                <>
                                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                                        {row.gstr2aAmount !== undefined ? fmt(row.gstr2aAmount) : '—'}
                                    </td>
                                    <td className={cn(
                                        'px-4 py-2.5 text-right font-mono font-medium',
                                        (row.variance ?? 0) === 0
                                            ? 'text-green-600'
                                            : (row.variance ?? 0) > 0 ? 'text-amber-600' : 'text-red-600'
                                    )}>
                                        {row.variance !== undefined
                                            ? (row.variance >= 0 ? '+' : '') + fmt(row.variance)
                                            : '—'}
                                    </td>
                                </>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function GSTR2APage() {
    const user = useAuthStore((s) => s.user);
    const outlet = user?.outlet;

    const [gstin, setGstin] = useState(outlet?.gstin ?? '');
    const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));

    const { mutate, data, isPending, isError, reset } = useMutation<GSTR2AReconciliation, any>({
        mutationFn: () => reportsApi.reconcileGSTR2A({ gstin, from, to }),
    });

    const handleReconcile = () => {
        reset();
        mutate();
    };

    const summary = data?.summary;

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <FileSearch className="h-6 w-6 text-primary" />
                    GSTR-2A Reconciliation
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                    Match your purchase invoices against GSTR-2A data from GSTN
                </p>
            </div>

            {/* Input form */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-500">Your GSTIN</Label>
                        <Input
                            className="h-9 font-mono text-sm uppercase"
                            placeholder="27AABCU9603R1ZX"
                            maxLength={15}
                            value={gstin}
                            onChange={(e) => setGstin(e.target.value.toUpperCase())}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-500">From</Label>
                        <Input
                            type="date" className="h-9 text-sm"
                            value={from} onChange={(e) => setFrom(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-500">To</Label>
                        <Input
                            type="date" className="h-9 text-sm"
                            value={to} onChange={(e) => setTo(e.target.value)}
                        />
                    </div>
                    <div className="flex items-end">
                        <Button
                            className="w-full h-9"
                            onClick={handleReconcile}
                            disabled={isPending || !gstin}
                        >
                            {isPending ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running...</>
                            ) : (
                                <><RefreshCw className="mr-2 h-4 w-4" />Reconcile</>
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {isError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    Reconciliation failed. Ensure GSTIN and dates are valid.
                </div>
            )}

            {/* Results */}
            {data && summary && (
                <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <Card>
                            <CardContent className="flex items-center gap-3 p-4">
                                <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
                                <div>
                                    <p className="text-xs text-slate-500">Matched</p>
                                    <p className="text-2xl font-bold text-green-700">{summary.matched}</p>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="flex items-center gap-3 p-4">
                                <AlertCircle className="h-8 w-8 text-amber-500 shrink-0" />
                                <div>
                                    <p className="text-xs text-slate-500">Our Only</p>
                                    <p className="text-2xl font-bold text-amber-700">{summary.ourOnly}</p>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="flex items-center gap-3 p-4">
                                <XCircle className="h-8 w-8 text-red-500 shrink-0" />
                                <div>
                                    <p className="text-xs text-slate-500">GSTR-2A Only</p>
                                    <p className="text-2xl font-bold text-red-700">{summary.gstr2aOnly}</p>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <p className="text-xs text-slate-500">Total Variance</p>
                                <p className="text-2xl font-bold font-mono text-red-700">
                                    {fmt(summary.totalVariance)}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Note about mock data */}
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>{data.note}</p>
                    </div>

                    {/* Tabs for matched / our_only / gstr2a_only */}
                    <Tabs defaultValue="matched">
                        <TabsList>
                            <TabsTrigger value="matched">
                                Matched
                                <Badge variant="secondary" className="ml-1.5 text-[10px]">{summary.matched}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="our_only">
                                Our Only
                                <Badge variant="secondary" className="ml-1.5 text-[10px]">{summary.ourOnly}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="gstr2a_only">
                                GSTR-2A Only
                                <Badge variant="secondary" className="ml-1.5 text-[10px]">{summary.gstr2aOnly}</Badge>
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="matched">
                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    <p className="text-xs font-semibold text-slate-600">
                                        Matched invoices — found in both our records and GSTR-2A
                                    </p>
                                </div>
                                <InvoiceTable
                                    rows={data.matched}
                                    showVariance
                                    emptyMessage="No matched invoices"
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="our_only">
                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                <div className="flex items-center gap-2 border-b border-slate-100 bg-amber-50 px-4 py-2.5">
                                    <AlertCircle className="h-4 w-4 text-amber-500" />
                                    <p className="text-xs font-semibold text-amber-700">
                                        In our records but NOT in GSTR-2A — supplier may not have filed
                                    </p>
                                </div>
                                <InvoiceTable
                                    rows={data.ourOnly}
                                    emptyMessage="No unmatched invoices on our side"
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="gstr2a_only">
                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                <div className="flex items-center gap-2 border-b border-slate-100 bg-red-50 px-4 py-2.5">
                                    <XCircle className="h-4 w-4 text-red-500" />
                                    <p className="text-xs font-semibold text-red-700">
                                        In GSTR-2A but NOT in our records — may be missing purchase entries
                                    </p>
                                </div>
                                <InvoiceTable
                                    rows={data.gstr2aOnly}
                                    emptyMessage="No invoices missing from our records"
                                />
                            </div>
                        </TabsContent>
                    </Tabs>
                </>
            )}

            {!data && !isPending && (
                <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 text-slate-400">
                    <FileSearch className="h-10 w-10 mb-2 opacity-40" />
                    <p className="text-sm">Enter your GSTIN and date range, then click Reconcile</p>
                </div>
            )}
        </div>
    );
}
