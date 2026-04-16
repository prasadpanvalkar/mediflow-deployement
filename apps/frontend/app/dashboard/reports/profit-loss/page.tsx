'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    TrendingUp, TrendingDown, RefreshCw, Printer, Download, ChevronDown, ChevronRight,
    BarChart2, Package, Settings2, ExternalLink, X, Scale, CalendarDays,
    ChevronsDownUp, ChevronsUpDown, Receipt, Info,
} from 'lucide-react';
import { accountsApi, voucherApi } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (n: number) =>
    n === 0 ? '—' : '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtFull = (n: number) =>
    '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

function localToday(): string {
    const now = new Date();
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Returns April 01 of the current Indian Financial Year
// NOTE: This is only used as the fallback; actual initialization is done
// via useEffect on the client to avoid SSR/hydration date mismatches.
function fyStartDate(): string {
    const now = new Date();
    // getMonth() is 0-indexed: Jan=0, Apr=3, Dec=11
    const month = now.getMonth();
    const fullYear = now.getFullYear();
    // If Jan/Feb/Mar we are still in the FY that started April of the previous calendar year
    const fyStartYear = month >= 3 ? fullYear : fullYear - 1;
    return `${fyStartYear}-04-01`;
}

function fyYear(d: Date): number { return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; }

function lastDayOfMonth(year: number, month: number): string {
    const d = new Date(year, month + 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function firstDayOfMonth(year: number, month: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}
function calYearForFyMonth(fyStartYear: number, monthIdx: number): number {
    return monthIdx >= 3 ? fyStartYear : fyStartYear + 1;
}
function lastDayOfFyMonth(fyStartYear: number, monthIdx: number): string {
    return lastDayOfMonth(calYearForFyMonth(fyStartYear, monthIdx), monthIdx);
}
function firstDayOfFyMonth(fyStartYear: number, monthIdx: number): string {
    return firstDayOfMonth(calYearForFyMonth(fyStartYear, monthIdx), monthIdx);
}

const FY_MONTHS = [
    { label: 'Apr', idx: 3 }, { label: 'May', idx: 4 }, { label: 'Jun', idx: 5 },
    { label: 'Jul', idx: 6 }, { label: 'Aug', idx: 7 }, { label: 'Sep', idx: 8 },
    { label: 'Oct', idx: 9 }, { label: 'Nov', idx: 10 }, { label: 'Dec', idx: 11 },
    { label: 'Jan', idx: 0 }, { label: 'Feb', idx: 1 }, { label: 'Mar', idx: 2 },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface LedgerRow { id?: string; name: string; value: number; }
interface GroupBlock { name: string; value: number; ledgers: LedgerRow[]; }

interface PLData {
    from_date: string; to_date: string; fy_start: string;
    trading_account: {
        dr: {
            opening_stock: { value: number; label: string };
            purchases: { value: number; ledgers: LedgerRow[] };
            direct_expenses: { value: number; groups: GroupBlock[] };
            gross_profit: number;
        };
        cr: {
            sales: { value: number; ledgers: LedgerRow[] };
            sales_return: { value: number; ledgers: LedgerRow[] };
            closing_stock: { value: number; valuation_method: string };
            gross_loss: number;
        };
        trading_total_dr: number; trading_total_cr: number;
    };
    pl_account: {
        dr: {
            indirect_expenses: { value: number; groups: GroupBlock[] };
            gross_loss_bf: number; net_profit: number;
        };
        cr: {
            gross_profit_bf: number;
            direct_income: { value: number; groups: GroupBlock[] };
            indirect_income: { value: number; groups: GroupBlock[] };
            net_loss: number;
        };
        pl_total_dr: number; pl_total_cr: number;
    };
    summary: {
        gross_profit: number; net_profit: number;
        gross_profit_pct: number; net_profit_pct: number;
        total_sales: number; total_purchases: number;
        closing_stock: number; is_gross_profit: boolean; is_net_profit: boolean;
    };
    grand_total: number;
}

// ─── Stock Settings Dialog ─────────────────────────────────────────────────────
function StockSettingsDialog({ open, onClose, stockScope, stockValuation, onApply }: {
    open: boolean; onClose: () => void;
    stockScope: string; stockValuation: string;
    onApply: (scope: string, method: string) => void;
}) {
    const [scope, setScope] = useState(stockScope);
    const [method, setMethod] = useState(stockValuation);
    useEffect(() => { if (open) { setScope(stockScope); setMethod(stockValuation); } }, [open, stockScope, stockValuation]);

    return (
        <Dialog open={open} onOpenChange={o => !o && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-800">
                        <Package className="h-4 w-4 text-indigo-600" /> Stock Valuation Settings
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-5 py-2">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Stock Scope</p>
                        <RadioGroup value={scope} onValueChange={setScope} className="space-y-2">
                            {[
                                { value: 'no_stock', label: 'No Stock', desc: 'Exclude inventory (Opening & Closing = 0)' },
                                { value: 'all_days', label: 'All Days', desc: 'Include all current inventory (default)' },
                            ].map(item => (
                                <div key={item.value} className={cn('flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                                    scope === item.value ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200')}>
                                    <RadioGroupItem value={item.value} id={`pl-scope-${item.value}`} className="mt-0.5" />
                                    <label htmlFor={`pl-scope-${item.value}`} className="cursor-pointer">
                                        <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                                        <p className="text-xs text-slate-500">{item.desc}</p>
                                    </label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>
                    {scope !== 'no_stock' && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Valuation Method</p>
                            <RadioGroup value={method} onValueChange={setMethod} className="grid grid-cols-2 gap-2">
                                {[
                                    { value: 'purchase_rate', label: 'Purchase Rate' },
                                    { value: 'mrp_rate', label: 'MRP Rate' },
                                    { value: 'sale_rate', label: 'Sale Rate' },
                                    { value: 'cost_ext', label: 'Cost + 5%' },
                                ].map(item => (
                                    <div key={item.value} className={cn('flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm',
                                        method === item.value ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-semibold' : 'border-slate-200 text-slate-600 hover:border-indigo-200')}>
                                        <RadioGroupItem value={item.value} id={`pl-method-${item.value}`} />
                                        <label htmlFor={`pl-method-${item.value}`} className="cursor-pointer">{item.label}</label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>
                    )}
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                    <Button size="sm" onClick={() => { onApply(scope, method); onClose(); }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white">Apply</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Print Dialog ─────────────────────────────────────────────────────────────
function PrintDialog({ open, onClose, fromDate, toDate, outletName, onPrint, onExport }: {
    open: boolean; onClose: () => void; fromDate: string; toDate: string;
    outletName: string; onPrint: (layout: string, detail: string) => void; onExport: () => void;
}) {
    const [layout, setLayout] = useState('horizontal');
    const [detail, setDetail] = useState('with');

    return (
        <Dialog open={open} onOpenChange={o => !o && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-800">
                        <Printer className="h-4 w-4 text-indigo-600" /> Print Settings
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Layout</p>
                        <RadioGroup value={layout} onValueChange={setLayout} className="grid grid-cols-2 gap-2">
                            {[{ value: 'horizontal', label: 'Horizontal (T-Format)', desc: 'A4 Landscape' },
                              { value: 'vertical', label: 'Vertical (Top-Down)', desc: 'A4 Portrait' }].map(o => (
                                <div key={o.value} className={cn('p-3 rounded-lg border cursor-pointer text-sm transition-colors',
                                    layout === o.value ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200')}>
                                    <RadioGroupItem value={o.value} id={`pl-print-${o.value}`} className="sr-only" />
                                    <label htmlFor={`pl-print-${o.value}`} className="cursor-pointer">
                                        <p className="font-semibold text-slate-700">{o.label}</p>
                                        <p className="text-xs text-slate-400">{o.desc}</p>
                                    </label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Detail</p>
                        <RadioGroup value={detail} onValueChange={setDetail} className="grid grid-cols-2 gap-2">
                            {[{ value: 'with', label: 'With Detail', desc: 'All ledger rows' },
                              { value: 'without', label: 'Without Detail', desc: 'Group totals only' }].map(o => (
                                <div key={o.value} className={cn('p-3 rounded-lg border cursor-pointer text-sm transition-colors',
                                    detail === o.value ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200')}>
                                    <RadioGroupItem value={o.value} id={`pl-detail-${o.value}`} className="sr-only" />
                                    <label htmlFor={`pl-detail-${o.value}`} className="cursor-pointer">
                                        <p className="font-semibold text-slate-700">{o.label}</p>
                                        <p className="text-xs text-slate-400">{o.desc}</p>
                                    </label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500 space-y-0.5">
                        <p className="font-semibold text-slate-700">{outletName}</p>
                        <p>Profit & Loss Account</p>
                        <p>{fromDate} to {toDate}</p>
                    </div>
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" size="sm" onClick={onExport}>
                        <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
                    </Button>
                    <Button size="sm" onClick={() => { onPrint(layout, detail); onClose(); }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Expandable Group Row ─────────────────────────────────────────────────────
function GroupRow({ group, showZero, summaryMode, onLedgerClick, indent = 0 }: {
    group: GroupBlock; showZero: boolean; summaryMode: boolean;
    onLedgerClick: (id: string, name: string) => void; indent?: number;
}) {
    const [open, setOpen] = useState(false);
    const visible = group.ledgers.filter(l => showZero || Math.abs(l.value) > 0.001);

    return (
        <div className="border-b border-slate-100 last:border-b-0">
            <button
                onClick={() => !summaryMode && setOpen(p => !p)}
                className={cn('w-full flex items-center justify-between py-2 hover:bg-slate-50 transition-colors text-left',
                    indent === 0 ? 'px-4' : 'px-6')}
            >
                <div className="flex items-center gap-2">
                    {!summaryMode && (open
                        ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />)}
                    <span className="text-sm font-semibold text-slate-700">{group.name}</span>
                </div>
                <span className="font-mono text-sm font-semibold text-slate-800 w-28 text-right pl-print-val">
                    {fmt(Math.abs(group.value))}
                </span>
            </button>
            {!summaryMode && open && (
                <div className="bg-slate-50/60 border-t border-slate-100 pl-print-ledgers">
                    {visible.length === 0 && (
                        <div className="px-8 py-2 text-xs text-slate-400 italic">No entries in period</div>
                    )}
                    {visible.map((l, i) => (
                        <button
                            key={l.id ?? i}
                            onClick={() => l.id && onLedgerClick(l.id, l.name)}
                            className={cn('w-full flex items-center justify-between px-8 py-1.5 text-left group/l transition-colors',
                                l.id ? 'hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer' : 'cursor-default')}
                        >
                            <div className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full bg-slate-300 group-hover/l:bg-indigo-400 shrink-0" />
                                <span className="text-xs text-slate-600 group-hover/l:text-indigo-700">{l.name}</span>
                            </div>
                            <span className="font-mono text-xs text-slate-700 group-hover/l:text-indigo-700 w-28 text-right">
                                {fmt(Math.abs(l.value))}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Ledger Drill-down Sheet ──────────────────────────────────────────────────
function LedgerDrilldown({ ledgerId, ledgerName, fromDate, toDate, onClose }: {
    ledgerId: string | null; ledgerName: string; fromDate: string; toDate: string; onClose: () => void;
}) {
    const router = useRouter();
    const [activeTx, setActiveTx] = useState<any | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['pl-ledger-stmt', ledgerId, fromDate, toDate],
        queryFn: () => voucherApi.getLedgerStatement(ledgerId!, fromDate, toDate),
        enabled: !!ledgerId,
    });

    const transactions: any[] = data?.transactions ?? [];
    const txWithBal = useMemo(() => {
        let running = 0;
        return transactions.map(tx => { running += (tx.debit || 0) - (tx.credit || 0); return { ...tx, _running: running }; });
    }, [transactions]);
    const totalDr = transactions.reduce((s: number, t: any) => s + (t.debit || 0), 0);
    const totalCr = transactions.reduce((s: number, t: any) => s + (t.credit || 0), 0);

    const getRoute = (tx: any): { url: string; hasDetail: boolean } => {
        const type = (tx.sourceType || '').toUpperCase();
        if (type === 'SALE' && tx.sourceId) return { url: `/dashboard/billing/${tx.sourceId}`, hasDetail: true };
        if (type === 'PURCHASE') return { url: '/dashboard/purchases', hasDetail: false };
        if (type === 'RETURN') return { url: '/dashboard/accounts/sale-returns', hasDetail: false };
        return { url: '/dashboard/accounts/voucher-entry', hasDetail: false };
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && activeTx) { e.stopPropagation(); setActiveTx(null); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [activeTx]);

    return (
        <Sheet open={!!ledgerId} onOpenChange={o => !o && onClose()}>
            <SheetContent side="right" className="w-full sm:max-w-3xl flex flex-col bg-slate-50 p-0 overflow-hidden">
                <SheetHeader className="px-5 pt-5 pb-3 border-b border-slate-200 bg-white shrink-0">
                    <SheetTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                        <BarChart2 className="h-4 w-4 text-indigo-500" /> {ledgerName}
                    </SheetTitle>
                    <p className="text-xs text-slate-500 font-normal">Period: {fromDate} → {toDate}</p>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto">
                    {isLoading && (
                        <div className="p-4 space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-9 bg-slate-200 rounded animate-pulse" />)}</div>
                    )}
                    {!isLoading && transactions.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                            <BarChart2 className="h-8 w-8 mb-2" />
                            <p className="text-sm">No transactions in this period</p>
                        </div>
                    )}
                    {!isLoading && transactions.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs min-w-[640px]">
                                <thead className="sticky top-0 bg-slate-100 text-slate-500 uppercase tracking-wide z-10">
                                    <tr>
                                        <th className="text-left px-3 py-2 font-semibold w-24">Date</th>
                                        <th className="text-left px-3 py-2 font-semibold w-20">Type</th>
                                        <th className="text-left px-3 py-2 font-semibold w-28">Ref No</th>
                                        <th className="text-left px-3 py-2 font-semibold">Narration</th>
                                        <th className="text-right px-3 py-2 font-semibold w-24">Dr</th>
                                        <th className="text-right px-3 py-2 font-semibold w-24">Cr</th>
                                        <th className="text-right px-3 py-2 font-semibold w-28">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    <tr className="bg-blue-50">
                                        <td colSpan={6} className="px-3 py-2 text-xs font-semibold text-blue-700">↑ Opening Balance (before {fromDate})</td>
                                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-blue-700">—</td>
                                    </tr>
                                    {txWithBal.map((tx: any, i: number) => (
                                        <tr key={i}
                                            onClick={() => setActiveTx(activeTx?.date === tx.date && activeTx?.voucherNo === tx.voucherNo ? null : tx)}
                                            className={cn('hover:bg-indigo-50 transition-colors cursor-pointer',
                                                activeTx?.date === tx.date && activeTx?.voucherNo === tx.voucherNo ? 'bg-indigo-50 border-l-2 border-indigo-400' : '')}>
                                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{tx.date}</td>
                                            <td className="px-3 py-2">
                                                <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase',
                                                    tx.sourceType === 'SALE' ? 'bg-green-100 text-green-700' :
                                                    tx.sourceType === 'PURCHASE' ? 'bg-orange-100 text-orange-700' :
                                                    'bg-slate-100 text-slate-600')}>
                                                    {tx.sourceType || tx.voucherType || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-600 font-mono text-[11px]">
                                                {tx.voucherNo || (tx.sourceId ? `…${tx.sourceId.slice(-6)}` : '—')}
                                            </td>
                                            <td className="px-3 py-2 text-slate-700 max-w-[180px] truncate">{tx.description || '—'}</td>
                                            <td className="px-3 py-2 text-right font-mono text-red-600">{tx.debit > 0 ? fmtFull(tx.debit) : '—'}</td>
                                            <td className="px-3 py-2 text-right font-mono text-green-600">{tx.credit > 0 ? fmtFull(tx.credit) : '—'}</td>
                                            <td className={cn('px-3 py-2 text-right font-mono font-semibold', tx._running >= 0 ? 'text-slate-700' : 'text-red-600')}>
                                                {fmtFull(Math.abs(tx._running))}
                                                <span className="text-[10px] ml-0.5 font-normal opacity-60">{tx._running >= 0 ? 'Dr' : 'Cr'}</span>
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-slate-100">
                                        <td colSpan={4} className="px-3 py-2 text-xs font-bold text-slate-700">Closing Balance</td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-red-700">{totalDr > 0 ? fmtFull(totalDr) : '—'}</td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-green-700">{totalCr > 0 ? fmtFull(totalCr) : '—'}</td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">
                                            {fmtFull(Math.abs(totalDr - totalCr))}
                                            <span className="text-[10px] ml-0.5 font-normal opacity-60">{totalDr >= totalCr ? 'Dr' : 'Cr'}</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {activeTx && (
                    <div className="shrink-0 border-t-2 border-indigo-200 bg-white shadow-lg">
                        <div className="flex items-center justify-between px-4 pt-3 pb-1">
                            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                                <BarChart2 className="h-3.5 w-3.5" /> Transaction Detail
                            </span>
                            <button onClick={() => setActiveTx(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Ref No</p>
                                <p className="font-mono text-xs font-semibold text-slate-700">{activeTx.voucherNo || `…${activeTx.sourceId?.slice(-8) || '—'}`}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Voucher Type</p>
                                <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded uppercase',
                                    activeTx.sourceType === 'SALE' ? 'bg-green-100 text-green-700' :
                                    activeTx.sourceType === 'PURCHASE' ? 'bg-orange-100 text-orange-700' :
                                    'bg-slate-100 text-slate-600')}>
                                    {activeTx.sourceType || activeTx.voucherType || '—'}
                                </span>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Date</p>
                                <p className="text-xs text-slate-700">{activeTx.date}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Amount</p>
                                <p className="font-mono text-xs font-semibold">
                                    {activeTx.debit > 0
                                        ? <span className="text-red-600">{fmtFull(activeTx.debit)} Dr</span>
                                        : <span className="text-green-600">{fmtFull(activeTx.credit)} Cr</span>}
                                </p>
                            </div>
                            {activeTx.description && (
                                <div className="col-span-2">
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Narration</p>
                                    <p className="text-xs text-slate-700">{activeTx.description}</p>
                                </div>
                            )}
                        </div>
                        {activeTx.sourceId && (() => {
                            const route = getRoute(activeTx);
                            return (
                                <div className="px-4 pb-3">
                                    <button onClick={() => router.push(route.url)}
                                        className="w-full text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center justify-center gap-1.5 border border-indigo-200 rounded-lg py-2 hover:bg-indigo-50 transition-colors">
                                        {route.hasDetail
                                            ? <><ExternalLink className="h-3.5 w-3.5" /> View Full Invoice</>
                                            : <><ExternalLink className="h-3.5 w-3.5" /> Go to {activeTx.sourceType || 'Voucher'} Section</>}
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

// ─── Section Column Panel ─────────────────────────────────────────────────────
// Renders one SIDE (Dr or Cr) of either Trading or P&L account
function SectionPanel({ title, rows, total, totalLabel, summaryMode, showZero, onLedgerClick, expandSignal }: {
    title: string; rows: React.ReactNode[]; total: number; totalLabel: string;
    summaryMode: boolean; showZero: boolean;
    onLedgerClick: (id: string, name: string) => void;
    expandSignal: string | null;
}) {
    return (
        <div className="flex flex-col">
            {title && (
                <div className="px-3 py-2 bg-slate-600 text-white">
                    <span className="text-xs font-bold tracking-widest uppercase">{title}</span>
                </div>
            )}
            <div className="flex-1 divide-y divide-slate-100">
                {rows}
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-700 text-white print-total-row">
                <span className="text-xs font-bold uppercase tracking-wide">{totalLabel}</span>
                <span className="font-mono text-sm font-bold">{fmtFull(total)}</span>
            </div>
        </div>
    );
}

// ─── Simple data row ──────────────────────────────────────────────────────────
function DataRow({ label, value, sub, bold, colorClass, indent = 0 }: {
    label: string; value: number | string; sub?: string; bold?: boolean; colorClass?: string; indent?: number;
}) {
    return (
        <div className={cn('flex items-center justify-between py-2.5 border-b border-slate-100 last:border-b-0',
            indent === 0 ? 'px-4' : indent === 1 ? 'px-6' : 'px-8')}>
            <div>
                <span className={cn('text-sm text-slate-700', bold && 'font-bold')}>{label}</span>
                {sub && <span className="ml-2 text-xs text-slate-400">{sub}</span>}
            </div>
            <span className={cn('font-mono text-sm w-28 text-right pl-print-val', bold ? 'font-bold' : 'font-semibold', colorClass || 'text-slate-800')}>
                {typeof value === 'number' ? fmt(Math.abs(value)) : value}
            </span>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ProfitLossPage() {
    const router = useRouter();
    const { outlet } = useAuthStore();
    const { selectedOutletId } = useSettingsStore();
    const outletId = selectedOutletId ?? outlet?.id ?? '';
    const outletName = outlet?.name ?? 'MediFlow';

    // ── Date state ─────────────────────────────────────────────────────────
    // Start with a server-safe placeholder; client useEffect corrects it to
    // the real FY start.  This prevents SSR/hydration mismatch on April 1.
    const [fromDate, setFromDate] = useState(''); // set properly in effect below
    const [toDate, setToDate] = useState('');

    // On first client mount, set the real defaults
    useEffect(() => {
        if (!fromDate) setFromDate(fyStartDate());
        if (!toDate)   setToDate(localToday());
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Stock state ────────────────────────────────────────────────────────
    const [stockScope, setStockScope] = useState('all_days');
    const [stockValuation, setStockValuation] = useState('purchase_rate');
    const [showStockDialog, setShowStockDialog] = useState(false);

    // ── Display toggles ────────────────────────────────────────────────────
    const [showZero, setShowZero] = useState(false);
    const [summaryMode, setSummaryMode] = useState(false);
    const [showPrintDialog, setShowPrintDialog] = useState(false);

    // ── Drill-down ─────────────────────────────────────────────────────────
    const [drillLedgerId, setDrillLedgerId] = useState<string | null>(null);
    const [drillLedgerName, setDrillLedgerName] = useState('');

    // ── Preset select ref ──────────────────────────────────────────────────
    const presetSelectRef = useRef<HTMLSelectElement>(null);

    // ── API query ───────────────────────────────────────────────────────────
    const { data, isLoading, isError, refetch } = useQuery<PLData>({
        queryKey: ['profit-loss', outletId, fromDate, toDate, stockScope, stockValuation],
        queryFn: () => accountsApi.getProfitLoss(outletId, {
            from_date: fromDate, to_date: toDate,
            stock_valuation: stockValuation, stock_scope: stockScope,
        }),
        enabled: !!outletId,
        staleTime: 1000 * 60 * 5,
    });

    const handleLedgerClick = useCallback((id: string, name: string) => {
        setDrillLedgerId(id); setDrillLedgerName(name);
    }, []);

    // ── FY year for month pills ─────────────────────────────────────────────
    const fyStartYear = useMemo(() => {
        if (!fromDate) return new Date().getFullYear();
        const d = new Date(fromDate + 'T00:00:00');
        return fyYear(d);
    }, [fromDate]);

    // Active month = the month the user is looking at.
    // We also track whether the fromDate is exactly the 1st of that month
    // so the pill only highlights when a full-month range is selected.
    const activeFyMonth = useMemo(() => {
        if (!fromDate) return -1;
        const d = new Date(fromDate + 'T00:00:00');
        // Only highlight if fromDate is the 1st of the month
        return d.getDate() === 1 ? d.getMonth() : -1;
    }, [fromDate]);

    // ── Preset helper ───────────────────────────────────────────────────────
    const applyPreset = (preset: string) => {
        const today = new Date();
        const fy = fyYear(today);
        const m = today.getMonth();

        switch (preset) {
            case 'today':
                setFromDate(localToday()); setToDate(localToday()); break;
            case 'this_week': {
                const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
                const mon = new Date(today); mon.setDate(today.getDate() - dow);
                const monStr = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
                setFromDate(monStr); setToDate(localToday()); break;
            }
            case 'this_month':
                setFromDate(firstDayOfMonth(today.getFullYear(), m));
                setToDate(lastDayOfMonth(today.getFullYear(), m)); break;
            case 'last_month': {
                const pm = m === 0 ? 11 : m - 1;
                const py = m === 0 ? today.getFullYear() - 1 : today.getFullYear();
                setFromDate(firstDayOfMonth(py, pm));
                setToDate(lastDayOfMonth(py, pm)); break;
            }
            case 'this_quarter': {
                let qStart: number;
                if (m >= 3 && m <= 5)       qStart = 3;  // Q1 Apr-Jun
                else if (m >= 6 && m <= 8)  qStart = 6;  // Q2 Jul-Sep
                else if (m >= 9 && m <= 11) qStart = 9;  // Q3 Oct-Dec
                else                        qStart = 0;  // Q4 Jan-Mar
                // For Q4 (Jan/Feb/Mar) the calendar year is the same as today's year;
                // for Q1-Q3 it is also the same.  Simple: year = today.getFullYear().
                const qYear = today.getFullYear();
                setFromDate(firstDayOfMonth(qYear, qStart));
                setToDate(lastDayOfMonth(qYear, qStart === 0 ? 2 : qStart + 2)); break;
            }
            case 'last_quarter': {
                // Work out which quarter we are currently in, then go one back.
                let prevQStart: number, prevQEnd: number, yr = today.getFullYear();
                if (m >= 3 && m <= 5) {
                    // Currently Q1 (Apr-Jun) → last quarter = Q4 (Jan-Mar) same calendar year
                    prevQStart = 0; prevQEnd = 2;
                } else if (m >= 6 && m <= 8) {
                    // Currently Q2 (Jul-Sep) → last = Q1 (Apr-Jun) same calendar year
                    prevQStart = 3; prevQEnd = 5;
                } else if (m >= 9 && m <= 11) {
                    // Currently Q3 (Oct-Dec) → last = Q2 (Jul-Sep) same calendar year
                    prevQStart = 6; prevQEnd = 8;
                } else {
                    // Currently Q4 (Jan-Mar) → last = Q3 (Oct-Dec) of PREVIOUS calendar year
                    prevQStart = 9; prevQEnd = 11; yr -= 1;
                }
                setFromDate(firstDayOfMonth(yr, prevQStart));
                setToDate(lastDayOfMonth(yr, prevQEnd)); break;
            }
            case 'this_fy':
                setFromDate(`${fy}-04-01`); setToDate(localToday()); break;
            default: break;
        }
        if (presetSelectRef.current) presetSelectRef.current.value = '';
    };

    // ── CSV Export ──────────────────────────────────────────────────────────
    const handleExport = useCallback(() => {
        if (!data) return;
        const rows: string[] = ['Section,Side,Group,Account,Amount,Dr/Cr'];
        const add = (section: string, side: string, group: string, name: string, amt: number, dc: string) =>
            rows.push(`"${section}","${side}","${group}","${name}",${amt},"${dc}"`);

        const ta = data.trading_account;
        const pl = data.pl_account;

        add('Trading', 'Dr', 'Opening Stock', 'Opening Stock', ta.dr.opening_stock.value, 'Dr');
        ta.dr.purchases.ledgers.forEach(l => add('Trading', 'Dr', 'Purchases', l.name, l.value, 'Dr'));
        ta.dr.direct_expenses.groups.forEach(g =>
            g.ledgers.forEach(l => add('Trading', 'Dr', g.name, l.name, l.value, 'Dr')));
        if (ta.dr.gross_profit > 0) add('Trading', 'Dr', 'Gross Profit c/d', 'Gross Profit c/d', ta.dr.gross_profit, 'Dr');

        ta.cr.sales.ledgers.forEach(l => add('Trading', 'Cr', 'Sales', l.name, l.value, 'Cr'));
        add('Trading', 'Cr', 'Closing Stock', 'Closing Stock', ta.cr.closing_stock.value, 'Cr');
        if (ta.cr.gross_loss > 0) add('Trading', 'Cr', 'Gross Loss c/d', 'Gross Loss c/d', ta.cr.gross_loss, 'Cr');

        if (pl.dr.gross_loss_bf > 0) add('P&L', 'Dr', 'Gross Loss b/f', 'Gross Loss b/f', pl.dr.gross_loss_bf, 'Dr');
        pl.dr.indirect_expenses.groups.forEach(g =>
            g.ledgers.forEach(l => add('P&L', 'Dr', g.name, l.name, l.value, 'Dr')));
        if (pl.dr.net_profit > 0) add('P&L', 'Dr', 'Net Profit', 'Net Profit', pl.dr.net_profit, 'Dr');

        if (pl.cr.gross_profit_bf > 0) add('P&L', 'Cr', 'Gross Profit b/f', 'Gross Profit b/f', pl.cr.gross_profit_bf, 'Cr');
        pl.cr.direct_income.groups.forEach(g =>
            g.ledgers.forEach(l => add('P&L', 'Cr', g.name, l.name, l.value, 'Cr')));
        pl.cr.indirect_income.groups.forEach(g =>
            g.ledgers.forEach(l => add('P&L', 'Cr', g.name, l.name, l.value, 'Cr')));
        if (pl.cr.net_loss > 0) add('P&L', 'Cr', 'Net Loss', 'Net Loss', pl.cr.net_loss, 'Cr');

        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `pl-${fromDate}-to-${toDate}.csv`; a.click();
        URL.revokeObjectURL(url);
    }, [data, fromDate, toDate]);

    const handlePrint = (layout: string, detail: string) => {
        const root = document.getElementById('pl-print-root');
        if (root) { root.dataset.printLayout = layout; root.dataset.printDetail = detail; }
        setTimeout(() => window.print(), 100);
    };

    const stockLabel = stockScope === 'no_stock' ? 'No Stock' : ({
        purchase_rate: 'Purchase Rate', mrp_rate: 'MRP Rate', sale_rate: 'Sale Rate', cost_ext: 'Cost+5%',
    }[stockValuation] ?? stockValuation);

    const s = data?.summary;
    const ta = data?.trading_account;
    const pla = data?.pl_account;

    return (
        <>
            {/* Print styles */}
            <style>{`
                .pl-print-company { display: none; }
                @media print {
                    body > *:not(#pl-print-root) { display: none !important; }
                    #pl-print-root { display: block !important; padding: 0 !important; }
                    .no-print { display: none !important; }
                    .pl-print-company { display: block !important; text-align: center; margin-bottom: 0.5rem; }
                    .pl-print-company h1 { font-size: 1.3rem; font-weight: 700; }
                    .pl-print-company p  { font-size: 0.8rem; color: #555; }
                    #pl-print-root[data-print-layout="horizontal"] .pl-col-wrapper {
                        display: grid !important; grid-template-columns: 1fr 1fr; gap: 1rem;
                    }
                    #pl-print-root[data-print-layout="vertical"] .pl-col-wrapper { display: block !important; }
                    #pl-print-root[data-print-layout="vertical"] .pl-vertical-divider {
                        display: block !important; border-top: 2px solid #374151; margin: 1rem 0;
                    }
                    #pl-print-root[data-print-detail="without"] .pl-print-ledgers { display: none !important; }
                    #pl-print-root[data-print-detail="without"] .pl-print-val { }
                    .print-total-row { font-weight: 700 !important; border-top: 2px solid #374151; }
                    .shadow-sm { box-shadow: none !important; }
                    .rounded-xl { border-radius: 0 !important; }
                }
            `}</style>

            <div id="pl-print-root" className="space-y-4 p-4 lg:p-6 max-w-[1700px] mx-auto">

                {/* Print-only header */}
                <div className="pl-print-company">
                    <h1>{outletName}</h1>
                    <p>Profit & Loss Account</p>
                    <p>From: {fromDate} To: {toDate}</p>
                </div>

                {/* Page header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Receipt className="h-6 w-6 text-indigo-600" /> Profit & Loss Account
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Period: <span className="font-semibold text-slate-700">{fromDate}</span> to <span className="font-semibold text-slate-700">{toDate}</span>
                            {data?.fy_start && <span className="ml-2 text-xs text-slate-400">(FY from {data.fy_start})</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/reports/balance-sheet')}>
                            <Scale className="mr-1.5 h-4 w-4" /> Switch to Balance Sheet
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExport} disabled={!data}>
                            <Download className="mr-1.5 h-4 w-4" /> Export CSV
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setShowPrintDialog(true)}>
                            <Printer className="mr-1.5 h-4 w-4" /> Print
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                            <RefreshCw className={cn('mr-1.5 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
                        </Button>
                    </div>
                </div>

                {/* Summary cards */}
                {!isLoading && data && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
                        {[
                            { label: 'Total Sales', value: s!.total_sales, color: 'text-emerald-600', icon: <TrendingUp className="h-4 w-4 text-emerald-500" /> },
                            { label: 'Total Purchases', value: s!.total_purchases, color: 'text-orange-600', icon: <TrendingDown className="h-4 w-4 text-orange-500" /> },
                            { label: s!.is_gross_profit ? 'Gross Profit' : 'Gross Loss', value: Math.abs(s!.gross_profit), color: s!.is_gross_profit ? 'text-emerald-700' : 'text-red-700', icon: <BarChart2 className="h-4 w-4 text-indigo-400" />, pct: s!.gross_profit_pct },
                            { label: s!.is_net_profit ? 'Net Profit' : 'Net Loss', value: Math.abs(s!.net_profit), color: s!.is_net_profit ? 'text-emerald-700' : 'text-red-700', icon: <Receipt className="h-4 w-4 text-indigo-500" />, pct: s!.net_profit_pct },
                        ].map((card, i) => (
                            <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                    {card.icon}
                                    <p className="text-xs text-slate-500">{card.label}</p>
                                </div>
                                <p className={cn('text-lg font-bold font-mono', card.color)}>{fmtFull(card.value)}</p>
                                {card.pct !== undefined && (
                                    <p className={cn('text-xs font-medium', (card.pct ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                                        {fmtPct(card.pct ?? 0)} margin
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Controls bar */}
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-3 no-print">
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Date pickers */}
                        <div className="flex items-center gap-2">
                            <div className="flex flex-col gap-0.5">
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">From Date</label>
                                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                                    className="h-8 px-2 rounded-md border border-slate-300 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">To Date</label>
                                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                                    className="h-8 px-2 rounded-md border border-slate-300 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            </div>
                        </div>

                        <div className="h-7 w-px bg-slate-200" />

                        {/* Quick presets */}
                        <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Quick</label>
                            <select ref={presetSelectRef} onChange={e => { if (e.target.value) applyPreset(e.target.value); }} defaultValue=""
                                className="h-8 px-2 rounded-md border border-slate-300 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                                <option value="" disabled>Preset…</option>
                                <option value="today">Today</option>
                                <option value="this_week">This Week</option>
                                <option value="this_month">This Month</option>
                                <option value="last_month">Last Month</option>
                                <option value="this_quarter">FY Quarter (Current)</option>
                                <option value="last_quarter">FY Quarter (Last)</option>
                                <option value="this_fy">This Financial Year</option>
                            </select>
                        </div>

                        <div className="h-7 w-px bg-slate-200" />

                        {/* Stock Settings */}
                        <Button variant="outline" size="sm" onClick={() => setShowStockDialog(true)}
                            className="text-xs flex items-center gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                            <Settings2 className="h-3.5 w-3.5" /> Stock: {stockLabel}
                        </Button>

                        <div className="h-7 w-px bg-slate-200 hidden sm:block" />

                        {/* Display toggles */}
                        <div className="flex items-center gap-2">
                            <Switch id="pl-hide-zero" checked={!showZero} onCheckedChange={v => setShowZero(!v)} />
                            <Label htmlFor="pl-hide-zero" className="text-sm text-slate-600 cursor-pointer">Hide Zero</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch id="pl-summary" checked={summaryMode} onCheckedChange={setSummaryMode} />
                            <Label htmlFor="pl-summary" className="text-sm text-slate-600 cursor-pointer">Summary</Label>
                        </div>
                    </div>

                    {/* Month pills — Indian FY order */}
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide self-center mr-1 flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" /> Month
                        </span>
                        {FY_MONTHS.map(m => {
                            const isActive = activeFyMonth === m.idx;
                            return (
                                <button key={m.label}
                                    onClick={() => {
                                        setFromDate(firstDayOfFyMonth(fyStartYear, m.idx));
                                        setToDate(lastDayOfFyMonth(fyStartYear, m.idx));
                                    }}
                                    className={cn('px-3 py-1 rounded-full text-xs font-medium transition-colors',
                                        isActive ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700')}>
                                    {m.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Error */}
                {isError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 no-print">
                        Failed to load P&L. Please refresh.
                    </div>
                )}

                {/* Skeleton */}
                {isLoading && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {[0, 1].map(i => (
                            <div key={i} className="space-y-2">
                                <div className="h-10 bg-slate-700 rounded-t-lg animate-pulse" />
                                {[...Array(8)].map((_, j) => <div key={j} className="h-10 bg-slate-100 rounded animate-pulse" />)}
                            </div>
                        ))}
                    </div>
                )}

                {/* Main two-column T-format table */}
                {!isLoading && data && (() => {
                    const ta = data.trading_account;
                    const pla = data.pl_account;
                    const s = data.summary;

                    // ── Build LEFT (Dr) column rows ─────────────────────────
                    const drTradingRows: React.ReactNode[] = [];

                    // Opening Stock — with visible info note (not tracked in current version)
                    drTradingRows.push(
                        <div key="op-stock"
                            className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-700">Opening Stock</span>
                                {/* Info badge — always visible so user understands why value is ₹0 */}
                                <span className="group relative inline-flex items-center">
                                    <Info className="h-3.5 w-3.5 text-amber-500 cursor-help" />
                                    {/* Tooltip */}
                                    <span className="pointer-events-none absolute left-5 top-0 z-50 w-64 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                        <strong className="block mb-0.5">Opening Stock not tracked</strong>
                                        The current inventory system does not record historical batch quantities.
                                        Opening Stock is set to ₹0.00 and should be entered as a manual journal
                                        entry if required.
                                    </span>
                                </span>
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                    Not tracked
                                </span>
                            </div>
                            <span className="font-mono text-sm font-semibold text-slate-400 w-28 text-right pl-print-val">
                                ₹0.00
                            </span>
                        </div>
                    );

                    // Purchases
                    drTradingRows.push(
                        <GroupRow key="purchases"
                            group={{ name: 'Purchases', value: ta.dr.purchases.value, ledgers: ta.dr.purchases.ledgers }}
                            showZero={showZero} summaryMode={summaryMode} onLedgerClick={handleLedgerClick} />
                    );

                    // Direct Expenses
                    ta.dr.direct_expenses.groups.map((g, i) => (
                        showZero || g.value > 0.001
                            ? drTradingRows.push(<GroupRow key={`de-${i}`} group={g} showZero={showZero} summaryMode={summaryMode} onLedgerClick={handleLedgerClick} />)
                            : null
                    ));

                    // Gross Profit (on Dr side if profit)
                    if (ta.dr.gross_profit > 0) {
                        drTradingRows.push(
                            <DataRow key="gp-cd" label="Gross Profit c/d" value={ta.dr.gross_profit}
                                bold colorClass="text-emerald-700" />
                        );
                    }

                    // ── Build RIGHT (Cr) column rows ────────────────────────
                    const crTradingRows: React.ReactNode[] = [];

                    // Sales
                    crTradingRows.push(
                        <GroupRow key="sales"
                            group={{ name: 'Sales', value: ta.cr.sales.value, ledgers: ta.cr.sales.ledgers }}
                            showZero={showZero} summaryMode={summaryMode} onLedgerClick={handleLedgerClick} />
                    );

                    // Sales Return
                    if (showZero || ta.cr.sales_return.value > 0.001) {
                        crTradingRows.push(
                            <DataRow key="sales-ret" label="(−) Sales Return" value={ta.cr.sales_return.value}
                                colorClass="text-red-600" />
                        );
                    }

                    // Closing Stock
                    crTradingRows.push(
                        <DataRow key="cl-stock" label="Closing Stock"
                            value={ta.cr.closing_stock.value}
                            sub={`(${ta.cr.closing_stock.valuation_method.replace('_', ' ')})`}
                            colorClass="text-indigo-700" />
                    );

                    // Gross Loss (on Cr side if loss)
                    if (ta.cr.gross_loss > 0) {
                        crTradingRows.push(
                            <DataRow key="gl-cd" label="Gross Loss c/d" value={ta.cr.gross_loss}
                                bold colorClass="text-red-700" />
                        );
                    }

                    // ── P&L Dr rows ─────────────────────────────────────────
                    const drPLRows: React.ReactNode[] = [];

                    // Gross Loss b/f (if any)
                    if (pla.dr.gross_loss_bf > 0) {
                        drPLRows.push(
                            <DataRow key="gl-bf" label="Gross Loss b/d" value={pla.dr.gross_loss_bf}
                                bold colorClass="text-red-600" />
                        );
                    }

                    // Indirect Expenses
                    pla.dr.indirect_expenses.groups.map((g, i) => (
                        showZero || g.value > 0.001
                            ? drPLRows.push(<GroupRow key={`ie-${i}`} group={g} showZero={showZero} summaryMode={summaryMode} onLedgerClick={handleLedgerClick} />)
                            : null
                    ));
                    if (pla.dr.indirect_expenses.groups.length === 0 && (showZero || pla.dr.indirect_expenses.value > 0)) {
                        drPLRows.push(
                            <DataRow key="ie-empty" label="Indirect Expenses" value={pla.dr.indirect_expenses.value} />
                        );
                    }

                    // Net Profit (if profit)
                    if (pla.dr.net_profit > 0) {
                        drPLRows.push(
                            <DataRow key="net-p" label="Net Profit" value={pla.dr.net_profit}
                                bold colorClass="text-emerald-700" />
                        );
                    }

                    // ── P&L Cr rows ─────────────────────────────────────────
                    const crPLRows: React.ReactNode[] = [];

                    // Gross Profit b/f
                    crPLRows.push(
                        <DataRow key="gp-bf" label="Gross Profit b/d" value={pla.cr.gross_profit_bf}
                            bold colorClass={pla.cr.gross_profit_bf > 0 ? 'text-emerald-700' : 'text-slate-400'} />
                    );

                    // Direct Income
                    pla.cr.direct_income.groups.map((g, i) => (
                        showZero || g.value > 0.001
                            ? crPLRows.push(<GroupRow key={`di-${i}`} group={g} showZero={showZero} summaryMode={summaryMode} onLedgerClick={handleLedgerClick} />)
                            : null
                    ));

                    // Indirect Income
                    pla.cr.indirect_income.groups.map((g, i) => (
                        showZero || g.value > 0.001
                            ? crPLRows.push(<GroupRow key={`ii-${i}`} group={g} showZero={showZero} summaryMode={summaryMode} onLedgerClick={handleLedgerClick} />)
                            : null
                    ));

                    // Net Loss (if loss)
                    if (pla.cr.net_loss > 0) {
                        crPLRows.push(
                            <DataRow key="net-l" label="Net Loss" value={pla.cr.net_loss}
                                bold colorClass="text-red-700" />
                        );
                    }

                    return (
                        <div className="pl-col-wrapper grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-xl overflow-hidden border border-slate-300 shadow-sm bg-white">
                            {/* ── COLUMN HEADERS ─────────────────────────────── */}
                            <div className="bg-gradient-to-r from-red-700 to-rose-800 px-4 py-3 flex items-center justify-between">
                                <div>
                                    <h2 className="text-white font-bold text-sm tracking-wide">Dr (Expenses & Losses)</h2>
                                    <p className="text-red-100 text-xs">Trading Account + P&L Account</p>
                                </div>
                            </div>
                            <div className="bg-gradient-to-r from-emerald-700 to-teal-800 px-4 py-3 flex items-center justify-between">
                                <div>
                                    <h2 className="text-white font-bold text-sm tracking-wide">Cr (Income & Profits)</h2>
                                    <p className="text-emerald-100 text-xs">Sales + Closing Stock + Income</p>
                                </div>
                            </div>

                            {/* ── TRADING ACCOUNT ─────────────────────────────── */}
                            {/* Dr trading */}
                            <div className="border-r border-slate-200">
                                <div className="px-3 py-2 bg-amber-600 flex items-center justify-between">
                                    <span className="text-xs font-bold text-white tracking-widest uppercase">Trading Account (Dr)</span>
                                    <span className="font-mono text-xs text-amber-100">{fmtFull(ta.trading_total_dr)}</span>
                                </div>
                                <div className="divide-y divide-slate-100">{drTradingRows}</div>
                                <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-t border-amber-200 print-total-row">
                                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">Total Trading (Dr)</span>
                                    <span className="font-mono text-sm font-bold text-amber-900">{fmtFull(ta.trading_total_dr)}</span>
                                </div>
                            </div>

                            {/* Cr trading */}
                            <div>
                                <div className="px-3 py-2 bg-amber-600 flex items-center justify-between">
                                    <span className="text-xs font-bold text-white tracking-widest uppercase">Trading Account (Cr)</span>
                                    <span className="font-mono text-xs text-amber-100">{fmtFull(ta.trading_total_cr)}</span>
                                </div>
                                <div className="divide-y divide-slate-100">{crTradingRows}</div>
                                <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-t border-amber-200 print-total-row">
                                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">Total Trading (Cr)</span>
                                    <span className="font-mono text-sm font-bold text-amber-900">{fmtFull(ta.trading_total_cr)}</span>
                                </div>
                            </div>

                            {/* Vertical divider for print */}
                            <div className="pl-vertical-divider hidden col-span-2" />

                            {/* ── P&L ACCOUNT ─────────────────────────────────── */}
                            {/* Dr P&L */}
                            <div className="border-r border-t border-slate-200">
                                <div className="px-3 py-2 bg-indigo-700 flex items-center justify-between">
                                    <span className="text-xs font-bold text-white tracking-widest uppercase">P&L Account (Dr)</span>
                                    <span className="font-mono text-xs text-indigo-200">{fmtFull(pla.pl_total_dr)}</span>
                                </div>
                                <div className="divide-y divide-slate-100">{drPLRows}</div>
                                <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50 border-t border-indigo-200 print-total-row">
                                    <span className="text-xs font-bold text-indigo-900 uppercase tracking-wide">Total P&L (Dr)</span>
                                    <span className="font-mono text-sm font-bold text-indigo-900">{fmtFull(pla.pl_total_dr)}</span>
                                </div>
                            </div>

                            {/* Cr P&L */}
                            <div className="border-t border-slate-200">
                                <div className="px-3 py-2 bg-indigo-700 flex items-center justify-between">
                                    <span className="text-xs font-bold text-white tracking-widest uppercase">P&L Account (Cr)</span>
                                    <span className="font-mono text-xs text-indigo-200">{fmtFull(pla.pl_total_cr)}</span>
                                </div>
                                <div className="divide-y divide-slate-100">{crPLRows}</div>
                                <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50 border-t border-indigo-200 print-total-row">
                                    <span className="text-xs font-bold text-indigo-900 uppercase tracking-wide">Total P&L (Cr)</span>
                                    <span className="font-mono text-sm font-bold text-indigo-900">{fmtFull(pla.pl_total_cr)}</span>
                                </div>
                            </div>

                            {/* ── GRAND TOTAL ──────────────────────────────────── */}
                            <div className="col-span-2 bg-slate-800 flex items-center justify-between px-4 py-3 print-total-row">
                                <span className="text-sm font-bold text-white uppercase tracking-wide">Grand Total</span>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className="text-[10px] text-slate-400">Dr</p>
                                        <p className="font-mono text-base font-bold text-red-300">{fmtFull(ta.trading_total_dr + pla.pl_total_dr)}</p>
                                    </div>
                                    <div className="w-px h-8 bg-slate-600" />
                                    <div className="text-right">
                                        <p className="text-[10px] text-slate-400">Cr</p>
                                        <p className="font-mono text-base font-bold text-emerald-300">{fmtFull(ta.trading_total_cr + pla.pl_total_cr)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Drill-down sheet */}
                <LedgerDrilldown
                    ledgerId={drillLedgerId} ledgerName={drillLedgerName}
                    fromDate={fromDate} toDate={toDate}
                    onClose={() => setDrillLedgerId(null)}
                />

                {/* Dialogs */}
                <StockSettingsDialog
                    open={showStockDialog} onClose={() => setShowStockDialog(false)}
                    stockScope={stockScope} stockValuation={stockValuation}
                    onApply={(sc, mv) => { setStockScope(sc); setStockValuation(mv); }}
                />
                <PrintDialog
                    open={showPrintDialog} onClose={() => setShowPrintDialog(false)}
                    fromDate={fromDate} toDate={toDate} outletName={outletName}
                    onPrint={handlePrint} onExport={handleExport}
                />
            </div>
        </>
    );
}
