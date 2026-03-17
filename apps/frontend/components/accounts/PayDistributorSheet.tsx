'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
    Banknote, Smartphone, FileText, Building2, X, AlertCircle,
} from 'lucide-react';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useDistributors } from '@/hooks/usePurchases';
import { useUnpaidInvoices, useCreatePayment } from '@/hooks/useAccounts';
import { useToast } from '@/hooks/use-toast';
import { PaymentMode, PurchaseInvoiceFull } from '@/types';
import { cn } from '@/lib/utils';

const formatINR = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TODAY = format(new Date(), 'yyyy-MM-dd');

const PAYMENT_MODES: { value: PaymentMode; label: string; icon: any }[] = [
    { value: 'cash',          label: 'Cash',          icon: Banknote   },
    { value: 'upi',           label: 'UPI',           icon: Smartphone },
    { value: 'cheque',        label: 'Cheque',        icon: FileText   },
    { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2  },
];

function refLabel(mode: PaymentMode): string {
    if (mode === 'upi')           return 'UTR Number';
    if (mode === 'cheque')        return 'Cheque No';
    if (mode === 'bank_transfer') return 'Transaction ID';
    return 'Reference No';
}

interface Props {
    open: boolean;
    onClose: () => void;
    preSelectedDistributorId?: string;
    onSuccess?: () => void;
}

export function PayDistributorSheet({ open, onClose, preSelectedDistributorId, onSuccess }: Props) {
    const { toast } = useToast();
    const { data: distributors, isLoading: distsLoading } = useDistributors();
    const createPayment = useCreatePayment();

    const [distributorId, setDistributorId] = useState(preSelectedDistributorId ?? '');
    const [date, setDate] = useState(TODAY);
    const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
    const [referenceNo, setReferenceNo] = useState('');
    const [notes, setNotes] = useState('');
    const [amounts, setAmounts] = useState<Record<string, string>>({});

    const { data: unpaidInvoices, isLoading: invLoading } = useUnpaidInvoices(distributorId);

    // Sync pre-selected distributor
    useEffect(() => {
        if (preSelectedDistributorId) setDistributorId(preSelectedDistributorId);
    }, [preSelectedDistributorId]);

    // Reset amounts when distributor changes
    useEffect(() => {
        setAmounts({});
    }, [distributorId]);

    const today = new Date().toISOString().split('T')[0];

    function isOverdue(inv: PurchaseInvoiceFull): boolean {
        return !!(inv.dueDate && inv.dueDate < today);
    }

    function setAmount(id: string, val: string) {
        setAmounts((prev) => ({ ...prev, [id]: val }));
    }

    function payAll() {
        const next: Record<string, string> = {};
        for (const inv of unpaidInvoices ?? []) {
            next[inv.id] = String(inv.outstanding);
        }
        setAmounts(next);
    }

    const allocations = (unpaidInvoices ?? [])
        .map((inv: any) => ({
            inv,
            amt: parseFloat(amounts[inv.id] ?? '0') || 0,
        }))
        .filter((a: any) => a.amt > 0);

    const totalAllocated = allocations.reduce((s: number, a: any) => s + a.amt, 0);

    const totalOutstanding = (unpaidInvoices ?? []).reduce((s: number, i: any) => s + i.outstanding, 0);

    const hasErrors = allocations.some((a: any) => a.amt > a.inv.outstanding);
    const canSubmit =
        !!distributorId &&
        allocations.length > 0 &&
        totalAllocated > 0 &&
        !hasErrors &&
        (paymentMode === 'cash' || !!referenceNo.trim());

    async function handleSubmit() {
        if (!canSubmit) return;
        try {
            await createPayment.mutateAsync({
                distributorId,
                date,
                totalAmount: totalAllocated,
                paymentMode,
                referenceNo: paymentMode !== 'cash' ? referenceNo : undefined,
                notes: notes || undefined,
                allocations: allocations.map((a: any) => ({
                    purchaseInvoiceId: a.inv.id,
                    allocatedAmount: a.amt,
                })),
            });
            toast({
                title: `Payment of ${formatINR(totalAllocated)} recorded`,
                description: `Against ${allocations.length} invoice${allocations.length !== 1 ? 's' : ''}`,
            });
            onClose();
            onSuccess?.();
            // Reset
            setAmounts({});
            setReferenceNo('');
            setNotes('');
            setPaymentMode('cash');
            if (!preSelectedDistributorId) setDistributorId('');
        } catch {
            toast({ variant: 'destructive', title: 'Failed to record payment' });
        }
    }

    return (
        <Sheet open={open} onOpenChange={(v: boolean) => { if (!v) onClose(); }}>
            <SheetContent side="right" className="flex flex-col h-full p-0 sm:max-w-xl w-full">

                {/* Header */}
                <SheetHeader className="shrink-0 border-b px-6 py-4">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Building2 className="h-4 w-4" />
                            </div>
                            <div>
                                <SheetTitle className="text-base">Pay Distributor</SheetTitle>
                                <SheetDescription className="text-xs mt-0.5">
                                    Record payment against purchase invoices
                                </SheetDescription>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </SheetHeader>

                {/* Body */}
                <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-6">

                    {/* Section 1: Select Distributor */}
                    <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Select Distributor</p>
                        {distsLoading ? (
                            <Skeleton className="h-9 w-full" />
                        ) : (
                            <Select
                                value={distributorId}
                                onValueChange={setDistributorId}
                                disabled={!!preSelectedDistributorId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose distributor…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(distributors ?? []).map((d: any) => (
                                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {distributorId && totalOutstanding > 0 && (
                            <p className="text-sm text-muted-foreground">
                                Total outstanding:{' '}
                                <span className="font-semibold text-red-600">{formatINR(totalOutstanding)}</span>
                                {' '}across {unpaidInvoices?.length ?? 0} invoice{(unpaidInvoices?.length ?? 0) !== 1 ? 's' : ''}
                            </p>
                        )}
                    </div>

                    {/* Section 2: Invoice Allocation */}
                    {distributorId && (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Select Invoices to Pay</p>
                                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={payAll}>
                                        Pay All
                                    </Button>
                                </div>

                                {invLoading ? (
                                    <div className="space-y-2">
                                        {[...Array(3)].map((_, i) => (
                                            <div key={i} className="rounded-lg border p-3 space-y-2">
                                                <Skeleton className="h-4 w-full" />
                                                <Skeleton className="h-4 w-3/4" />
                                            </div>
                                        ))}
                                    </div>
                                ) : !unpaidInvoices?.length ? (
                                    <div className="flex flex-col items-center justify-center py-8 text-center">
                                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                                            <FileText className="h-6 w-6 text-muted-foreground" />
                                        </div>
                                        <p className="font-medium text-sm">No outstanding invoices</p>
                                        <p className="text-xs text-muted-foreground">All invoices for this distributor are paid.</p>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-border overflow-hidden">
                                        <table className="w-full text-xs">
                                            <thead className="bg-muted/50 border-b border-border">
                                                <tr>
                                                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Invoice No</th>
                                                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Date</th>
                                                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Outstanding</th>
                                                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-28">Pay Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {(unpaidInvoices ?? []).map((inv: any) => {
                                                    const amt = parseFloat(amounts[inv.id] ?? '0') || 0;
                                                    const overPay = amt > inv.outstanding;
                                                    const fullPay = amt > 0 && amt === inv.outstanding;
                                                    const partialPay = amt > 0 && amt < inv.outstanding;
                                                    const overdue = isOverdue(inv);

                                                    return (
                                                        <tr key={inv.id} className="hover:bg-muted/30">
                                                            <td className="px-3 py-3">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-mono text-foreground">{inv.invoiceNo}</span>
                                                                    {overdue && (
                                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700">
                                                                            Overdue
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-3 text-muted-foreground">
                                                                {format(new Date(inv.invoiceDate), 'dd MMM yy')}
                                                            </td>
                                                            <td className={cn(
                                                                'px-3 py-3 text-right font-semibold tabular-nums',
                                                                overdue ? 'text-red-600' : 'text-amber-600',
                                                            )}>
                                                                {formatINR(inv.outstanding)}
                                                            </td>
                                                            <td className="px-3 py-3">
                                                                <div className="relative">
                                                                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        max={inv.outstanding}
                                                                        step={0.01}
                                                                        value={amounts[inv.id] ?? ''}
                                                                        onChange={(e) => setAmount(inv.id, e.target.value)}
                                                                        className={cn(
                                                                            'h-8 pl-5 text-xs text-right tabular-nums',
                                                                            overPay && 'border-red-500 focus-visible:ring-red-500',
                                                                            fullPay && 'border-emerald-500 focus-visible:ring-emerald-500',
                                                                            partialPay && 'border-amber-500 focus-visible:ring-amber-500',
                                                                        )}
                                                                        placeholder="0.00"
                                                                    />
                                                                </div>
                                                                {overPay && (
                                                                    <p className="mt-0.5 text-[10px] text-red-600">Exceeds outstanding</p>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {totalAllocated > 0 && (
                                    <div className={cn(
                                        'flex items-center justify-between rounded-lg px-4 py-2.5 text-sm',
                                        hasErrors ? 'bg-red-50 text-red-700' : 'bg-primary/5 text-primary',
                                    )}>
                                        <span>Allocating across {allocations.length} invoice{allocations.length !== 1 ? 's' : ''}</span>
                                        <span className="font-semibold tabular-nums">{formatINR(totalAllocated)}</span>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Section 3: Payment Details */}
                    {distributorId && (
                        <>
                            <Separator />
                            <div className="space-y-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payment Details</p>

                                {/* Date */}
                                <div className="space-y-1.5">
                                    <Label className="text-sm">Payment Date</Label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e: any) => setDate(e.target.value)}
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                </div>

                                {/* Payment Mode */}
                                <div className="space-y-1.5">
                                    <Label className="text-sm">Payment Mode</Label>
                                    <div className="flex gap-2 flex-wrap">
                                        {PAYMENT_MODES.map((m) => {
                                            const Icon = m.icon;
                                            const active = paymentMode === m.value;
                                            return (
                                                <button
                                                    key={m.value}
                                                    type="button"
                                                    onClick={() => { setPaymentMode(m.value); setReferenceNo(''); }}
                                                    className={cn(
                                                        'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                                                        active
                                                            ? 'border-primary bg-primary text-white'
                                                            : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-border/80',
                                                    )}
                                                >
                                                    <Icon className="h-3.5 w-3.5" />
                                                    {m.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Reference No (conditional) */}
                                {paymentMode !== 'cash' && (
                                    <div className="space-y-1.5">
                                        <Label className="text-sm">{refLabel(paymentMode)} <span className="text-red-500">*</span></Label>
                                        <Input
                                            value={referenceNo}
                                            onChange={(e: any) => setReferenceNo(e.target.value)}
                                            placeholder={`Enter ${refLabel(paymentMode).toLowerCase()}…`}
                                            className="font-mono text-sm"
                                        />
                                    </div>
                                )}

                                {/* Notes */}
                                <div className="space-y-1.5">
                                    <Label className="text-sm">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                    <textarea
                                        value={notes}
                                        onChange={(e: any) => setNotes(e.target.value)}
                                        rows={2}
                                        placeholder="Any remarks…"
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="shrink-0 border-t px-6 py-4 bg-background flex items-center justify-between gap-3">
                    <div>
                        {totalAllocated > 0 && (
                            <>
                                <p className="text-xs text-muted-foreground">Total payment</p>
                                <p className="text-lg font-bold tabular-nums">{formatINR(totalAllocated)}</p>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={!canSubmit || createPayment.isPending}
                            className="gap-1.5"
                        >
                            {createPayment.isPending ? (
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-background border-t-transparent" />
                            ) : null}
                            {totalAllocated > 0
                                ? `Record Payment ${formatINR(totalAllocated)}`
                                : 'Record Payment'
                            }
                        </Button>
                    </div>
                </div>

            </SheetContent>
        </Sheet>
    );
}
