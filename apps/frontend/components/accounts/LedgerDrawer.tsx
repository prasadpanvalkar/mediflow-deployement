'use client';

import { useState } from 'react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { BookOpen, X, Download, Building2, User } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useDistributorLedger, useCustomerLedger } from '@/hooks/useAccounts';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const formatINR = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AVATAR_COLORS = [
    'bg-blue-100 text-blue-700',
    'bg-violet-100 text-violet-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
];

function avatarColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string) {
    return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const ENTRY_TYPE_CONFIG: Record<string, { label: string; classes: string }> = {
    purchase:        { label: 'Purchase',    classes: 'bg-slate-100 text-slate-700' },
    payment:         { label: 'Payment',     classes: 'bg-emerald-50 text-emerald-700' },
    sale:            { label: 'Sale',        classes: 'bg-blue-50 text-blue-700' },
    receipt:         { label: 'Receipt',     classes: 'bg-emerald-50 text-emerald-700' },
    debit_note:      { label: 'Debit Note',  classes: 'bg-red-50 text-red-700' },
    credit_note:     { label: 'Credit Note', classes: 'bg-amber-50 text-amber-700' },
    expense:         { label: 'Expense',     classes: 'bg-orange-50 text-orange-700' },
    opening_balance: { label: 'Opening',     classes: 'bg-slate-100 text-slate-600' },
};

interface Props {
    entityType: 'distributor' | 'customer';
    entityId: string;
    entityName: string;
    open: boolean;
    onClose: () => void;
    onPayNow?: () => void;
}

function DistributorLedgerContent({ entityId, from, to }: { entityId: string; from: string; to: string }) {
    const { data, isLoading } = useDistributorLedger(entityId);

    if (isLoading) {
        return (
            <div className="space-y-2 px-6 py-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-4">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                    </div>
                ))}
            </div>
        );
    }

    const getEntries = (d: any) => {
        if (!d) return [];
        if (Array.isArray(d)) return d;
        return d.entries || d.ledger || d.data || [];
    };

    const entries = getEntries(data).filter((e: any) =>
        e.date >= from && e.date <= to + 'T23:59:59'
    );

    return <LedgerTable entries={entries} openingBalance={(data as any)?.openingBalance ?? 0} closingBalance={(data as any)?.closingBalance ?? 0} />;
}

function CustomerLedgerContent({ entityId, from, to }: { entityId: string; from: string; to: string }) {
    const { data, isLoading } = useCustomerLedger(entityId);

    if (isLoading) {
        return (
            <div className="space-y-2 px-6 py-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex gap-4">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                    </div>
                ))}
            </div>
        );
    }

    const getEntries = (d: any) => {
        if (!d) return [];
        if (Array.isArray(d)) return d;
        return d.entries || d.ledger || d.data || [];
    };

    const entries = getEntries(data).filter((e: any) =>
        e.date >= from && e.date <= to + 'T23:59:59'
    );

    return <LedgerTable entries={entries} openingBalance={(data as any)?.openingBalance ?? 0} closingBalance={(data as any)?.closingBalance ?? 0} />;
}

function LedgerTable({ entries, openingBalance, closingBalance }: {
    entries: import('@/types').LedgerEntry[];
    openingBalance: number;
    closingBalance: number;
}) {
    if (!entries.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <BookOpen className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium">No transactions in this period</p>
                <p className="text-sm text-muted-foreground">Try selecting a wider date range.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border sticky top-0 z-10">
                    <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Date</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Type</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Reference</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Description</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Debit</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Credit</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Balance</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {entries.map((entry) => {
                        const typeConf = ENTRY_TYPE_CONFIG[entry.entryType] ?? ENTRY_TYPE_CONFIG.purchase;
                        const isPaymentRow = entry.entryType === 'payment' || entry.entryType === 'receipt';
                        return (
                            <tr
                                key={entry.id}
                                className={cn(
                                    'transition-colors hover:bg-muted/30',
                                    isPaymentRow && 'border-l-2 border-l-emerald-400',
                                )}
                            >
                                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                                    {format(new Date(entry.date), 'dd MMM yy')}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium', typeConf.classes)}>
                                        {typeConf.label}
                                    </span>
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                                    {entry.referenceNo}
                                </td>
                                <td className="px-4 py-3 text-sm max-w-[180px] truncate">
                                    {entry.description}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-sm whitespace-nowrap">
                                    {entry.debit > 0 ? (
                                        <span className="text-red-600 font-medium">{formatINR(entry.debit)}</span>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-sm whitespace-nowrap">
                                    {entry.credit > 0 ? (
                                        <span className="text-emerald-600 font-medium">{formatINR(entry.credit)}</span>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </td>
                                <td className={cn(
                                    'px-4 py-3 text-right tabular-nums text-sm font-semibold whitespace-nowrap',
                                    entry.balance > 0 ? 'text-red-600' : 'text-emerald-600',
                                )}>
                                    {formatINR(Math.abs(entry.balance))}
                                    {entry.balance > 0 ? ' DR' : ' CR'}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export function LedgerDrawer({ entityType, entityId, entityName, open, onClose, onPayNow }: Props) {
    const { toast } = useToast();
    const today = new Date();
    const [from, setFrom] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
    const [to, setTo] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));

    const color = avatarColor(entityName);

    const setThisMonth = () => {
        setFrom(format(startOfMonth(today), 'yyyy-MM-dd'));
        setTo(format(endOfMonth(today), 'yyyy-MM-dd'));
    };
    const setLastMonth = () => {
        const last = subMonths(today, 1);
        setFrom(format(startOfMonth(last), 'yyyy-MM-dd'));
        setTo(format(endOfMonth(last), 'yyyy-MM-dd'));
    };
    const setAllTime = () => {
        setFrom('2020-01-01');
        setTo(format(today, 'yyyy-MM-dd'));
    };

    return (
        <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <SheetContent side="right" className="flex flex-col h-full p-0 sm:max-w-3xl w-full">

                {/* Header */}
                <SheetHeader className="shrink-0 border-b px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold', color)}>
                                {initials(entityName)}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold text-base">{entityName}</p>
                                    <Badge variant="outline" className="text-[10px] h-5">
                                        {entityType === 'distributor' ? (
                                            <><Building2 className="h-2.5 w-2.5 mr-1" />Distributor</>
                                        ) : (
                                            <><User className="h-2.5 w-2.5 mr-1" />Customer</>
                                        )}
                                    </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mt-0.5">Account Ledger</p>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </SheetHeader>

                {/* Controls */}
                <div className="shrink-0 border-b px-6 py-3 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <label className="text-xs text-muted-foreground whitespace-nowrap">From</label>
                            <input
                                type="date"
                                value={from}
                                onChange={(e) => setFrom(e.target.value)}
                                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <label className="text-xs text-muted-foreground whitespace-nowrap">To</label>
                            <input
                                type="date"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={setThisMonth}>This Month</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={setLastMonth}>Last Month</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={setAllTime}>All Time</Button>
                    </div>
                </div>

                {/* Scrollable Table */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    {entityType === 'distributor' ? (
                        <DistributorLedgerContent entityId={entityId} from={from} to={to} />
                    ) : (
                        <CustomerLedgerContent entityId={entityId} from={from} to={to} />
                    )}
                </div>

                {/* Footer */}
                <div className="shrink-0 border-t px-6 py-4 bg-background flex items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                        <div>
                            <p className="text-xs text-muted-foreground">Closing Balance</p>
                            <p className="text-lg font-bold tabular-nums text-foreground">
                                View above
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => toast({ title: 'Exporting PDF…', description: 'Your ledger export will be ready shortly.' })}
                        >
                            <Download className="h-3.5 w-3.5" />
                            Export PDF
                        </Button>
                        {entityType === 'distributor' && onPayNow && (
                            <Button size="sm" className="gap-1.5" onClick={() => { onClose(); onPayNow(); }}>
                                Record Payment
                            </Button>
                        )}
                    </div>
                </div>

            </SheetContent>
        </Sheet>
    );
}
