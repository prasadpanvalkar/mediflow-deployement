'use client';

import { useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isToday, isYesterday } from 'date-fns';
import {
    Home, Users, Zap, Truck, Wrench, Megaphone, PlusCircle,
    Banknote, Smartphone, FileText, Building2, Package,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useExpenses, useCreateExpense } from '@/hooks/useAccounts';
import { useToast } from '@/hooks/use-toast';
import { ExpenseHead, PaymentMode, ExpenseEntry } from '@/types';
import { cn } from '@/lib/utils';

const formatINR = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TODAY_STR = format(new Date(), 'yyyy-MM-dd');

const EXPENSE_HEADS: { value: ExpenseHead; label: string; icon: any }[] = [
    { value: 'rent',        label: 'Rent',        icon: Home      },
    { value: 'salary',      label: 'Salary',      icon: Users     },
    { value: 'electricity', label: 'Electricity', icon: Zap       },
    { value: 'transport',   label: 'Transport',   icon: Truck     },
    { value: 'maintenance', label: 'Maintenance', icon: Wrench    },
    { value: 'marketing',   label: 'Marketing',   icon: Megaphone },
    { value: 'other',       label: 'Other',       icon: PlusCircle},
];

const PAYMENT_MODES: { value: PaymentMode; label: string; icon: any }[] = [
    { value: 'cash',          label: 'Cash',    icon: Banknote   },
    { value: 'upi',           label: 'UPI',     icon: Smartphone },
    { value: 'cheque',        label: 'Cheque',  icon: FileText   },
];

function refLabel(mode: PaymentMode): string {
    if (mode === 'upi')    return 'UTR Number';
    if (mode === 'cheque') return 'Cheque No';
    return 'Reference No';
}

function headLabel(head: ExpenseHead) {
    return EXPENSE_HEADS.find(h => h.value === head)?.label ?? head;
}

function headIcon(head: ExpenseHead) {
    return EXPENSE_HEADS.find(h => h.value === head)?.icon ?? Package;
}

function headColor(head: ExpenseHead) {
    const MAP: Record<ExpenseHead, string> = {
        rent:        'bg-blue-50 text-blue-700',
        salary:      'bg-violet-50 text-violet-700',
        electricity: 'bg-yellow-50 text-yellow-700',
        transport:   'bg-cyan-50 text-cyan-700',
        maintenance: 'bg-orange-50 text-orange-700',
        marketing:   'bg-pink-50 text-pink-700',
        other:       'bg-slate-50 text-slate-700',
    };
    return MAP[head] ?? 'bg-slate-50 text-slate-700';
}

function modeColor(mode: PaymentMode) {
    const MAP: Record<string, string> = {
        cash:          'bg-emerald-50 text-emerald-700',
        upi:           'bg-blue-50 text-blue-700',
        cheque:        'bg-amber-50 text-amber-700',
        bank_transfer: 'bg-violet-50 text-violet-700',
    };
    return MAP[mode] ?? 'bg-slate-50 text-slate-700';
}

function groupByDate(entries: ExpenseEntry[]): { label: string; items: ExpenseEntry[] }[] {
    const map = new Map<string, ExpenseEntry[]>();
    for (const e of entries) {
        if (!map.has(e.date)) map.set(e.date, []);
        map.get(e.date)!.push(e);
    }
    return Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, items]) => {
            const d = new Date(date + 'T12:00:00');
            let label = format(d, 'dd MMM yyyy');
            if (isToday(d)) label = 'Today';
            else if (isYesterday(d)) label = 'Yesterday';
            return { label, items };
        });
}

export function ExpensesTab() {
    const { toast } = useToast();
    const createExpense = useCreateExpense();

    const today = new Date();
    const [filterFrom, setFilterFrom] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
    const [filterTo,   setFilterTo]   = useState(format(endOfMonth(today), 'yyyy-MM-dd'));
    const [filterHead, setFilterHead] = useState<string>('all');

    const { data: expenses, isLoading } = useExpenses({
        from: filterFrom,
        to:   filterTo,
        head: filterHead !== 'all' ? filterHead : undefined,
    });

    // Form state
    const [date,        setDate]        = useState(TODAY_STR);
    const [head,        setHead]        = useState<ExpenseHead>('rent');
    const [customHead,  setCustomHead]  = useState('');
    const [amount,      setAmount]      = useState('');
    const [payMode,     setPayMode]     = useState<PaymentMode>('cash');
    const [referenceNo, setReferenceNo] = useState('');
    const [notes,       setNotes]       = useState('');

    const canSave = !!amount && parseFloat(amount) > 0 && (head !== 'other' || !!customHead.trim());

    async function handleSave() {
        if (!canSave) return;
        try {
            await createExpense.mutateAsync({
                date,
                expenseHead: head,
                customHead: head === 'other' ? customHead : undefined,
                amount: parseFloat(amount),
                paymentMode: payMode,
                notes: notes || undefined,
            });
            toast({ title: 'Expense recorded ✓' });
            setAmount('');
            setCustomHead('');
            setNotes('');
            setReferenceNo('');
            setPayMode('cash');
            setHead('rent');
        } catch {
            toast({ variant: 'destructive', title: 'Failed to save expense' });
        }
    }

    // Summary stats
    const allExpenses = Array.isArray(expenses) ? expenses : [];
    const monthStart = format(startOfMonth(today), 'yyyy-MM-dd');
    const weekStart  = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd    = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const todayStr   = format(today, 'yyyy-MM-dd');

    const monthTotal = allExpenses.filter((e: any) => e.date >= monthStart).reduce((s: number, e: any) => s + e.amount, 0);
    const weekTotal  = allExpenses.filter((e: any) => e.date >= weekStart && e.date <= weekEnd).reduce((s: number, e: any) => s + e.amount, 0);
    const todayTotal = allExpenses.filter((e: any) => e.date === todayStr).reduce((s: number, e: any) => s + e.amount, 0);

    const grouped = groupByDate(allExpenses);

    return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

            {/* Left: Add Expense */}
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <PlusCircle className="h-4 w-4" />
                        </div>
                        Record Expense
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Date */}
                    <div className="space-y-1.5">
                        <Label className="text-sm">Date</Label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>

                    {/* Expense Head */}
                    <div className="space-y-1.5">
                        <Label className="text-sm">Expense Head <span className="text-red-500">*</span></Label>
                        <Select value={head} onValueChange={(v) => setHead(v as ExpenseHead)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {EXPENSE_HEADS.map((h) => {
                                    const Icon = h.icon;
                                    return (
                                        <SelectItem key={h.value} value={h.value}>
                                            <div className="flex items-center gap-2">
                                                <Icon className="h-3.5 w-3.5" />
                                                {h.label}
                                            </div>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Custom Head */}
                    {head === 'other' && (
                        <div className="space-y-1.5">
                            <Label className="text-sm">Custom Head <span className="text-red-500">*</span></Label>
                            <Input
                                value={customHead}
                                onChange={(e) => setCustomHead(e.target.value)}
                                placeholder="e.g. Office supplies"
                            />
                        </div>
                    )}

                    {/* Amount */}
                    <div className="space-y-1.5">
                        <Label className="text-sm">Amount <span className="text-red-500">*</span></Label>
                        <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                            <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="pl-7"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {/* Payment Mode */}
                    <div className="space-y-1.5">
                        <Label className="text-sm">Payment Mode</Label>
                        <div className="flex gap-2">
                            {PAYMENT_MODES.map((m) => {
                                const Icon = m.icon;
                                const active = payMode === m.value;
                                return (
                                    <button
                                        key={m.value}
                                        type="button"
                                        onClick={() => { setPayMode(m.value); setReferenceNo(''); }}
                                        className={cn(
                                            'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all flex-1 justify-center',
                                            active
                                                ? 'border-primary bg-primary text-white'
                                                : 'border-border bg-background text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                        {m.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Reference */}
                    {payMode !== 'cash' && (
                        <div className="space-y-1.5">
                            <Label className="text-sm">{refLabel(payMode)}</Label>
                            <Input
                                value={referenceNo}
                                onChange={(e) => setReferenceNo(e.target.value)}
                                placeholder={`Enter ${refLabel(payMode).toLowerCase()}…`}
                                className="font-mono"
                            />
                        </div>
                    )}

                    {/* Notes */}
                    <div className="space-y-1.5">
                        <Label className="text-sm">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            placeholder="Any remarks…"
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        />
                    </div>

                    <Button
                        className="w-full gap-1.5"
                        onClick={handleSave}
                        disabled={!canSave || createExpense.isPending}
                    >
                        {createExpense.isPending ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-background border-t-transparent" />
                        ) : (
                            <PlusCircle className="h-4 w-4" />
                        )}
                        Save Expense
                    </Button>
                </CardContent>
            </Card>

            {/* Right: Expense History */}
            <div className="space-y-4">
                {/* Stat cards */}
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: 'This Month', value: monthTotal },
                        { label: 'This Week',  value: weekTotal  },
                        { label: 'Today',      value: todayTotal },
                    ].map((stat) => (
                        <Card key={stat.label}>
                            <CardContent className="p-4">
                                <p className="text-xs text-muted-foreground">{stat.label}</p>
                                <p className="mt-1 text-lg font-bold tabular-nums">{formatINR(stat.value)}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Filter bar */}
                <div className="flex gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <input
                            type="date"
                            value={filterFrom}
                            onChange={(e) => setFilterFrom(e.target.value)}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <input
                            type="date"
                            value={filterTo}
                            onChange={(e) => setFilterTo(e.target.value)}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>
                    <Select value={filterHead} onValueChange={setFilterHead}>
                        <SelectTrigger className="h-8 text-xs w-36">
                            <SelectValue placeholder="All categories" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All categories</SelectItem>
                            {EXPENSE_HEADS.map((h) => (
                                <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Expense list */}
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="space-y-2">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-4 w-24" />
                                        <Skeleton className="h-3 w-32" />
                                    </div>
                                    <Skeleton className="h-5 w-20" />
                                </div>
                            ))}
                        </div>
                    ) : !grouped.length ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                                <Package className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <p className="font-medium">No expenses recorded yet</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                Use the form on the left to record expenses.
                            </p>
                        </div>
                    ) : (
                        grouped.map(({ label, items }) => (
                            <div key={label}>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                                <div className="space-y-1.5">
                                    {items.map((e) => {
                                        const Icon = headIcon(e.expenseHead);
                                        const hColor = headColor(e.expenseHead);
                                        const mColor = modeColor(e.paymentMode);
                                        return (
                                            <div key={e.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                                                <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', hColor)}>
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm">
                                                        {e.expenseHead === 'other' ? (e.customHead ?? 'Other') : headLabel(e.expenseHead)}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {format(new Date(e.date + 'T12:00:00'), 'dd MMM yyyy')}
                                                        {e.notes && <> · {e.notes}</>}
                                                    </p>
                                                </div>
                                                <div className="text-right space-y-1">
                                                    <p className="font-semibold text-sm tabular-nums">{formatINR(e.amount)}</p>
                                                    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium', mColor)}>
                                                        {e.paymentMode === 'bank_transfer' ? 'Bank' : e.paymentMode.charAt(0).toUpperCase() + e.paymentMode.slice(1)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
