'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowDownLeft, Plus } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useOutletId } from '@/hooks/useOutletId';
import { salesApi } from '@/lib/apiClient';
import { SaleReturnDetailModal } from '@/components/accounts/SaleReturnDetailModal';

const REFUND_MODE_LABELS: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    credit_note: 'Credit Note',
};

export default function SaleReturnsPage() {
    const outletId = useOutletId();
    const { toast } = useToast();
    const [returns, setReturns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);

    useEffect(() => {
        if (!outletId) return;
        salesApi
            .getSalesReturns(outletId)
            .then((res: any) => setReturns(res?.data || []))
            .catch(() => toast({ variant: 'destructive', title: 'Failed to load sale returns' }))
            .finally(() => setLoading(false));
    }, [outletId]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <ArrowDownLeft className="h-4 w-4" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">Sale Returns</h1>
                    </div>
                    <p className="pl-[46px] text-sm text-muted-foreground">
                        Accept returned goods from customers and restore stock
                    </p>
                </div>
                <Button asChild>
                    <Link href="/dashboard/accounts/sale-returns/new">
                        <Plus className="mr-2 h-4 w-4" /> New Return
                    </Link>
                </Button>
            </div>

            <Separator />

            {loading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
            ) : returns.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    <ArrowDownLeft className="mx-auto h-10 w-10 mb-3 opacity-30" />
                    <p className="font-medium">No sale returns yet</p>
                    <p className="text-sm mt-1">Process a return when a customer brings back goods</p>
                    <Button asChild className="mt-4" variant="outline">
                        <Link href="/dashboard/accounts/sale-returns/new">New Return</Link>
                    </Button>
                </div>
            ) : (
                <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Return No</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Original Invoice</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
                                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Refund Mode</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {returns.map((r) => (
                                <tr 
                                    key={r.id} 
                                    className="hover:bg-muted/50 transition-colors cursor-pointer group"
                                    onClick={() => setSelectedReturnId(r.id)}
                                >
                                    <td className="px-4 py-3 font-mono text-xs">{r.returnNo}</td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {format(new Date(r.returnDate), 'dd MMM yyyy')}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs">{r.originalInvoiceNo}</td>
                                    <td className="px-4 py-3">{r.customerName || '—'}</td>
                                    <td className="px-4 py-3 text-right font-medium">
                                        ₹{Number(r.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                            {REFUND_MODE_LABELS[r.refundMode] ?? r.refundMode}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <SaleReturnDetailModal 
                open={!!selectedReturnId} 
                onOpenChange={(open) => !open && setSelectedReturnId(null)} 
                returnId={selectedReturnId} 
            />
        </div>
    );
}
