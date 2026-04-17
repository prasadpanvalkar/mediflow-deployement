'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    Scale, RefreshCw, Printer, Download, ChevronDown, ChevronRight,
    CheckCircle, XCircle, TrendingUp, TrendingDown, BarChart2,
    Package, Settings2, ExternalLink, X, ChevronsDownUp, ChevronsUpDown,
    CalendarDays,
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

function localToday(): string {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

// ── Timezone-safe date helpers ───────────────────────────────────────────────
// Returns YYYY-MM-DD for the last day of a given month using local time only.
// Avoids .toISOString() which converts to UTC and can shift the date in IST (+5:30).
function lastDayOfMonth(year: number, month: number): string {
    const d = new Date(year, month + 1, 0); // day 0 = last day of `month`
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// FY year from a date (Indian FY starts April 1)
function fyYear(d: Date): number {
    return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

// Returns YYYY (calendar year) for a FY-month given the FY start year.
// monthIdx is JS month (0-11): Apr=3...Dec=11, Jan=0...Mar=2
function calYearForFyMonth(fyStartYear: number, monthIdx: number): number {
    return monthIdx >= 3 ? fyStartYear : fyStartYear + 1;
}

// Last day of a FY-month given FY start year
function lastDayOfFyMonth(fyStartYear: number, monthIdx: number): string {
    return lastDayOfMonth(calYearForFyMonth(fyStartYear, monthIdx), monthIdx);
}

// Indian FY months in order: Apr(3)→Mar(2)
const FY_MONTHS = [
    { label: 'Apr', idx: 3 },  { label: 'May', idx: 4 },  { label: 'Jun', idx: 5 },
    { label: 'Jul', idx: 6 },  { label: 'Aug', idx: 7 },  { label: 'Sep', idx: 8 },
    { label: 'Oct', idx: 9 },  { label: 'Nov', idx: 10 }, { label: 'Dec', idx: 11 },
    { label: 'Jan', idx: 0 },  { label: 'Feb', idx: 1 },  { label: 'Mar', idx: 2 },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface LedgerEntry {
    id: string; name: string;
    closing_balance: number; opening_balance: number;
    closing_debit: number; closing_credit: number;
    is_debit_balance: boolean; balance_type: string;
}
interface GroupEntry {
    id: string; name: string;
    closing_balance: number; closing_debit: number; closing_credit: number;
    is_debit_balance: boolean; ledgers: LedgerEntry[];
}
interface BSSide {
    groups: GroupEntry[]; total: number;
    net_profit?: number; is_profit?: boolean;
}
interface BSData {
    as_on_date: string; fy_start: string;
    liabilities: {
        capital: BSSide; loans: BSSide; current_liabilities: BSSide;
        total_liabilities: number;
    };
    assets: {
        fixed_assets: BSSide; investments: BSSide; current_assets: BSSide;
        stock_in_hand: { valuation_method: string; value: number };
        total_assets: number;
    };
    is_tallied: boolean; difference: number;
}

// ─── Stock Settings Dialog (Feature 1) ────────────────────────────────────────
function StockSettingsDialog({
    open, onClose, stockScope, stockValuation, onApply,
}: {
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
                        <Package className="h-4 w-4 text-indigo-600" />
                        Stock Valuation Settings
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* Stock Scope */}
                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Stock Scope</p>
                        <RadioGroup value={scope} onValueChange={setScope} className="space-y-2">
                            {[
                                { value: 'no_stock', label: 'No Stock', desc: 'Exclude inventory from Balance Sheet' },
                                { value: 'all_days', label: 'All Days', desc: 'Include all current inventory (default)' },
                            ].map(opt => (
                                <label key={opt.value} className={cn(
                                    'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                                    scope === opt.value ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                                )}>
                                    <RadioGroupItem value={opt.value} className="mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-slate-700">{opt.label}</p>
                                        <p className="text-xs text-slate-400">{opt.desc}</p>
                                    </div>
                                </label>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* Valuation Method — only visible when scope is not no_stock */}
                    {scope !== 'no_stock' && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Valuation Method</p>
                            <select
                                value={method}
                                onChange={e => setMethod(e.target.value)}
                                className="w-full h-9 px-3 rounded-md border border-slate-300 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            >
                                <option value="purchase_rate">Purchase Rate (default)</option>
                                <option value="mrp_rate">MRP Rate</option>
                                <option value="sale_rate">Sale Rate</option>
                                <option value="cost_ext">Cost + 5% Extra</option>
                            </select>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setScope('all_days'); setMethod('purchase_rate'); }}>
                        Reset Defaults
                    </Button>
                    <Button size="sm" onClick={() => { onApply(scope, method); onClose(); }}>
                        Apply
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Print Dialog (Feature 3) ─────────────────────────────────────────────────
function PrintDialog({
    open, onClose, outletName, asOnDate, fyStart, data, showZero, summaryMode,
}: {
    open: boolean; onClose: () => void;
    outletName: string; asOnDate: string; fyStart: string;
    data: BSData | undefined; showZero: boolean; summaryMode: boolean;
}) {
    const [layout, setLayout] = useState<'horizontal' | 'vertical'>('horizontal');
    const [detail, setDetail] = useState<'with' | 'without'>('with');
    const [heading, setHeading] = useState('Balance Sheet');

    const handlePrint = useCallback(() => {
        onClose(); // Close dialog immediately
        
        const root = document.getElementById('bs-print-root');
        if (root) {
            root.setAttribute('data-print-layout', layout);
            root.setAttribute('data-print-detail', detail);
        }
        
        // Temporarily override the summaryMode if user chose 'With Detail'
        const isDetail = detail === 'with';
        const expandBtnStyles = document.createElement('style');
        expandBtnStyles.id = 'bs-force-expand';
        if (isDetail) {
            expandBtnStyles.textContent = `@media print { .print-ledger-row { display: block !important; } }`;
            document.head.appendChild(expandBtnStyles);
        }
        
        // Inject page orientation style
        const existing = document.getElementById('bs-page-style');
        if (existing) existing.remove();
        const styleEl = document.createElement('style');
        styleEl.id = 'bs-page-style';
        styleEl.textContent = `@media print { @page { size: A4 ${layout === 'horizontal' ? 'landscape' : 'portrait'}; margin: 1cm; } .bs-print-company { display: block !important; } }`;
        document.head.appendChild(styleEl);

        // Set heading
        const headingEl = document.getElementById('bs-print-heading');
        if (headingEl) headingEl.textContent = heading;
        const companyEl = document.getElementById('bs-print-company');
        if (companyEl) companyEl.textContent = outletName;

        setTimeout(() => {
            window.print();
            setTimeout(() => {
                document.getElementById('bs-page-style')?.remove();
                document.getElementById('bs-force-expand')?.remove();
            }, 1000);
        }, 150); // give time for dialog animation to finish
    }, [layout, detail, heading, outletName, onClose]);

    return (
        <Dialog open={open} onOpenChange={o => !o && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-800">
                        <Printer className="h-4 w-4 text-indigo-600" />
                        Print / Export
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    {/* Layout */}
                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Layout</p>
                        <RadioGroup value={layout} onValueChange={v => setLayout(v as 'horizontal' | 'vertical')} className="space-y-2">
                            <label className={cn('flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors', layout === 'horizontal' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300')}>
                                <RadioGroupItem value="horizontal" className="mt-0.5" />
                                <div><p className="text-sm font-medium text-slate-700">Horizontal (T-Format)</p><p className="text-xs text-slate-400">Two columns side by side · A4 Landscape</p></div>
                            </label>
                            <label className={cn('flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors', layout === 'vertical' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300')}>
                                <RadioGroupItem value="vertical" className="mt-0.5" />
                                <div><p className="text-sm font-medium text-slate-700">Vertical (Top-Down)</p><p className="text-xs text-slate-400">Liabilities then Assets · A4 Portrait</p></div>
                            </label>
                        </RadioGroup>
                    </div>

                    {/* Detail level */}
                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Detail Level</p>
                        <RadioGroup value={detail} onValueChange={v => setDetail(v as 'with' | 'without')} className="flex gap-3">
                            {[{ v: 'with', l: 'With Detail' }, { v: 'without', l: 'Group Totals Only' }].map(o => (
                                <label key={o.v} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm transition-colors', detail === o.v ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                                    <RadioGroupItem value={o.v} />
                                    {o.l}
                                </label>
                            ))}
                        </RadioGroup>
                    </div>

                    {/* Heading */}
                    <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Report Title</p>
                        <input
                            value={heading}
                            onChange={e => setHeading(e.target.value)}
                            className="w-full h-9 px-3 rounded-md border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                        <p className="text-xs text-slate-400">Company: {outletName} · As on: {asOnDate}</p>
                    </div>
                </div>

                <DialogFooter>
                    <Button size="sm" onClick={handlePrint} className="w-full">
                        <Printer className="mr-1.5 h-4 w-4" /> Print
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Section Block (Features 5 + 6 enhanced) ──────────────────────────────────
function SectionBlock({
    title, side, total, showZero, showOpening, isLiability,
    onLedgerClick, extraRow, summaryMode, expandSignal,
}: {
    title: string; side: BSSide; total: number;
    showZero: boolean; showOpening: boolean; isLiability: boolean;
    onLedgerClick: (id: string, name: string) => void;
    extraRow?: React.ReactNode;
    summaryMode: boolean;
    expandSignal: string | null; // 'expand' | 'collapse' | null
}) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (!expandSignal) return;
        if (expandSignal.startsWith('expand')) {
            const m: Record<string, boolean> = {};
            side.groups.forEach(g => { m[g.id] = true; });
            setExpanded(m);
        } else {
            setExpanded({});
        }
    }, [expandSignal, side.groups]);

    const toggle = (id: string) => !summaryMode && setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    const visibleGroups = useMemo(
        // Use debit+credit sum so a group with only-credit balance (closing_debit=0) isn't hidden.
        // closing_balance is abs(net), but we check raw debit+credit to catch any non-zero entry.
        () => side.groups.filter(g => showZero || (g.closing_debit + g.closing_credit) > 0),
        [side.groups, showZero]
    );

    return (
        <div className="space-y-0">
            {/* Section header */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-700">
                <span className="text-xs font-bold tracking-widest text-slate-200 uppercase">{title}</span>
                <span className="font-mono text-xs font-bold text-slate-200">{fmtFull(total)}</span>
            </div>

            {visibleGroups.length === 0 && (
                <div className="px-4 py-3 text-xs text-slate-400 italic border-b border-slate-100 print-group-row">No entries</div>
            )}

            {visibleGroups.map(group => {
                const isOpen = !summaryMode && !!expanded[group.id];
                const visibleLedgers = group.ledgers.filter(l => showZero || (l.closing_debit + l.closing_credit) > 0);
                const groupNet = isLiability
                    ? group.closing_credit - group.closing_debit
                    : group.closing_debit - group.closing_credit;
                const openingNet = group.ledgers.reduce((s, l) => s + l.opening_balance, 0);

                return (
                    <div key={group.id} className="border-b border-slate-100 last:border-b-0 print-group-row">
                        {/* Group header row */}
                        <button
                            onClick={() => toggle(group.id)}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                {!summaryMode && (
                                    isOpen
                                        ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                        : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                )}
                                <span className="text-sm font-semibold text-slate-700">{group.name}</span>
                            </div>
                            <div className="flex items-center gap-6">
                                {showOpening && (
                                    <span className="font-mono text-xs text-slate-400 w-24 text-right">
                                        {openingNet > 0 ? fmt(openingNet) : '—'}
                                    </span>
                                )}
                                <span className="font-mono text-sm font-semibold text-slate-800 w-24 text-right">
                                    {fmt(Math.abs(groupNet))}
                                </span>
                            </div>
                        </button>

                        {/* Ledger rows (expanded in-page – Level 2) */}
                        {isOpen && (
                            <div className="bg-slate-50/60 border-t border-slate-100 print-ledger-row">
                                {visibleLedgers.length === 0 && (
                                    <div className="px-8 py-2 text-xs text-slate-400 italic">No ledger entries</div>
                                )}
                                {visibleLedgers.map(ledger => {
                                    const ledgerBalance = isLiability ? ledger.closing_credit - ledger.closing_debit : ledger.closing_debit - ledger.closing_credit;
                                    return (
                                        <button
                                            key={ledger.id}
                                            onClick={() => onLedgerClick(ledger.id, ledger.name)}
                                            className="w-full flex items-center justify-between px-8 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left group/l"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-1.5 rounded-full bg-slate-300 group-hover/l:bg-indigo-400 transition-colors shrink-0" />
                                                <span className="text-xs text-slate-600 group-hover/l:text-indigo-700">{ledger.name}</span>
                                            </div>
                                            <div className="flex items-center gap-6">
                                                {showOpening && (
                                                    <span className="font-mono text-[11px] text-slate-400 w-24 text-right">
                                                        {ledger.opening_balance > 0 ? fmt(ledger.opening_balance) : '—'}
                                                    </span>
                                                )}
                                                <span className="font-mono text-xs text-slate-700 group-hover/l:text-indigo-700 w-24 text-right">
                                                    {fmt(Math.abs(ledgerBalance))}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}

            {extraRow}
        </div>
    );
}

// ─── Ledger Drill-down Sheet (Features 2 + 6 enhanced) ───────────────────────
function LedgerDrilldown({
    ledgerId, ledgerName, fromDate, toDate, onClose,
}: {
    ledgerId: string | null; ledgerName: string;
    fromDate: string; toDate: string;
    onClose: () => void;
}) {
    const router = useRouter();
    const [activeTx, setActiveTx] = useState<any | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['ledger-statement', ledgerId, fromDate, toDate],
        queryFn: () => voucherApi.getLedgerStatement(ledgerId!, fromDate, toDate),
        enabled: !!ledgerId,
    });

    const transactions: any[] = data?.transactions ?? [];

    // Compute running balance cumulatively (Dr adds, Cr subtracts)
    const txWithBal = useMemo(() => {
        let running = 0;
        return transactions.map(tx => {
            running += (tx.debit || 0) - (tx.credit || 0);
            return { ...tx, _running: running };
        });
    }, [transactions]);

    const totalDr = transactions.reduce((s: number, t: any) => s + (t.debit || 0), 0);
    const totalCr = transactions.reduce((s: number, t: any) => s + (t.credit || 0), 0);

    const getRoute = (tx: any): { url: string; hasDetail: boolean } => {
        const type = (tx.sourceType || '').toUpperCase();
        if (type === 'SALE' && tx.sourceId) {
            // /dashboard/billing/[id] page exists — direct invoice view
            return { url: `/dashboard/billing/${tx.sourceId}`, hasDetail: true };
        }
        if (type === 'PURCHASE') {
            // No /purchases/[id] detail page — go to purchases list
            return { url: '/dashboard/purchases', hasDetail: false };
        }
        if (type === 'RETURN') {
            return { url: '/dashboard/accounts/sale-returns', hasDetail: false };
        }
        // CREDIT_PAYMENT, VOUCHER, or anything else → voucher entry list
        return { url: '/dashboard/accounts/voucher-entry', hasDetail: false };
    };

    // Close activeTx on ESC
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && activeTx) { e.stopPropagation(); setActiveTx(null); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [activeTx]);

    return (
        <Sheet open={!!ledgerId} onOpenChange={o => !o && onClose()}>
            <SheetContent side="right" className="w-full sm:max-w-3xl flex flex-col bg-slate-50 p-0 overflow-hidden">
                {/* Header */}
                <SheetHeader className="px-5 pt-5 pb-3 border-b border-slate-200 bg-white shrink-0">
                    <SheetTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                        <BarChart2 className="h-4 w-4 text-indigo-500" />
                        {ledgerName}
                    </SheetTitle>
                    <p className="text-xs text-slate-500 font-normal">
                        Period: {fromDate} → {toDate}
                        {activeTx && (
                            <span className="ml-2 text-indigo-600 font-medium">
                                &nbsp;›&nbsp;{activeTx.voucherNo || activeTx.sourceId?.slice(0, 8) || 'Transaction'}
                            </span>
                        )}
                    </p>
                </SheetHeader>

                {/* Table */}
                <div className="flex-1 overflow-y-auto">
                    {isLoading && (
                        <div className="p-4 space-y-2">
                            {[...Array(8)].map((_, i) => <div key={i} className="h-9 bg-slate-200 rounded animate-pulse" />)}
                        </div>
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
                                    {/* Opening row */}
                                    <tr className="bg-blue-50">
                                        <td colSpan={6} className="px-3 py-2 text-xs font-semibold text-blue-700">
                                            ↑ Opening Balance (before {fromDate})
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-blue-700">—</td>
                                    </tr>

                                    {txWithBal.map((tx: any, i: number) => (
                                        <tr
                                            key={i}
                                            onClick={() => setActiveTx(activeTx?.voucherNo === tx.voucherNo && activeTx?.date === tx.date ? null : tx)}
                                            className={cn(
                                                'hover:bg-indigo-50 transition-colors cursor-pointer',
                                                activeTx?.voucherNo === tx.voucherNo && activeTx?.date === tx.date ? 'bg-indigo-50 border-l-2 border-indigo-400' : ''
                                            )}
                                        >
                                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{tx.date}</td>
                                            <td className="px-3 py-2">
                                                <span className={cn(
                                                    'text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase',
                                                    tx.sourceType === 'SALE' ? 'bg-green-100 text-green-700' :
                                                    tx.sourceType === 'PURCHASE' ? 'bg-orange-100 text-orange-700' :
                                                    'bg-slate-100 text-slate-600'
                                                )}>
                                                    {tx.sourceType || tx.voucherType || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-600 font-mono text-[11px]">
                                                {tx.voucherNo || (tx.sourceId ? `…${tx.sourceId.slice(-6)}` : '—')}
                                            </td>
                                            <td className="px-3 py-2 text-slate-700 max-w-[180px] truncate">
                                                {tx.description || '—'}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-red-600">
                                                {tx.debit > 0 ? fmtFull(tx.debit) : '—'}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-green-600">
                                                {tx.credit > 0 ? fmtFull(tx.credit) : '—'}
                                            </td>
                                            <td className={cn('px-3 py-2 text-right font-mono font-semibold',
                                                tx._running >= 0 ? 'text-slate-700' : 'text-red-600')}>
                                                {fmtFull(Math.abs(tx._running))}
                                                <span className="text-[10px] ml-0.5 font-normal opacity-60">
                                                    {tx._running >= 0 ? 'Dr' : 'Cr'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Closing row */}
                                    <tr className="bg-slate-100">
                                        <td colSpan={4} className="px-3 py-2 text-xs font-bold text-slate-700">
                                            Closing Balance
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-red-700">
                                            {totalDr > 0 ? fmtFull(totalDr) : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-green-700">
                                            {totalCr > 0 ? fmtFull(totalCr) : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">
                                            {fmtFull(Math.abs(totalDr - totalCr))}
                                            <span className="text-[10px] ml-0.5 font-normal opacity-60">
                                                {totalDr >= totalCr ? 'Dr' : 'Cr'}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Level 4 — Transaction Detail Panel */}
                {activeTx && (
                    <div className="shrink-0 border-t-2 border-indigo-200 bg-white shadow-lg">
                        <div className="flex items-center justify-between px-4 pt-3 pb-1">
                            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                                <BarChart2 className="h-3.5 w-3.5" />
                                Transaction Detail
                            </span>
                            <button onClick={() => setActiveTx(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Ref No</p>
                                <p className="font-mono text-xs font-semibold text-slate-700">
                                    {activeTx.voucherNo || `…${activeTx.sourceId?.slice(-8) || '—'}`}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Voucher Type</p>
                                <span className={cn(
                                    'text-[11px] font-semibold px-2 py-0.5 rounded uppercase',
                                    activeTx.sourceType === 'SALE' ? 'bg-green-100 text-green-700' :
                                    activeTx.sourceType === 'PURCHASE' ? 'bg-orange-100 text-orange-700' :
                                    'bg-slate-100 text-slate-600'
                                )}>
                                    {activeTx.sourceType || activeTx.voucherType || '—'}
                                </span>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Date</p>
                                <p className="text-xs text-slate-700">{activeTx.date}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Amount</p>
                                <p className="font-mono text-xs font-semibold text-slate-700">
                                    {activeTx.debit > 0 ? <span className="text-red-600">{fmtFull(activeTx.debit)} Dr</span>
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
                                    <button
                                        onClick={() => router.push(route.url)}
                                        className="w-full text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center justify-center gap-1.5 border border-indigo-200 rounded-lg py-2 hover:bg-indigo-50 transition-colors"
                                    >
                                        {route.hasDetail
                                            ? <><ExternalLink className="h-3.5 w-3.5" /> View Full Invoice</>
                                            : <><ExternalLink className="h-3.5 w-3.5" /> Go to {activeTx.sourceType || 'Voucher'} Section</>
                                        }
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BalanceSheetPage() {
    const router = useRouter();
    const { outlet } = useAuthStore();
    const { selectedOutletId } = useSettingsStore();
    const outletId = selectedOutletId ?? outlet?.id ?? '';
    const outletName = outlet?.name ?? 'MediFlow';

    // ── Date state (Feature 4) ─────────────────────────────────────────────
    const [asOnDate, setAsOnDate] = useState(localToday());
    const [periodMode, setPeriodMode] = useState(false);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date(); d.setDate(1);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    });

    // ── Stock state (Feature 1) ────────────────────────────────────────────
    const [stockScope, setStockScope] = useState('all_days');
    const [stockValuation, setStockValuation] = useState('purchase_rate');
    const [showStockDialog, setShowStockDialog] = useState(false);

    // ── Display toggles (Features 5 + 6) ──────────────────────────────────
    const [showOpening, setShowOpening] = useState(false);
    const [showZero, setShowZero] = useState(false);
    const [summaryMode, setSummaryMode] = useState(false);

    // ── Expand / collapse signals per column ──────────────────────────────
    const [libSignal, setLibSignal] = useState<string | null>(null);
    const [assetSignal, setAssetSignal] = useState<string | null>(null);

    // ── Drill-down state ───────────────────────────────────────────────────
    const [drillLedgerId, setDrillLedgerId] = useState<string | null>(null);
    const [drillLedgerName, setDrillLedgerName] = useState('');

    // ── Print dialog (Feature 3) ───────────────────────────────────────────
    const [showPrintDialog, setShowPrintDialog] = useState(false);

    // ── API query — queryKey includes all filter params so any change triggers refetch ──
    const { data, isLoading, isError, refetch } = useQuery<BSData>({
        queryKey: ['balance-sheet', outletId, asOnDate, stockScope, stockValuation, showOpening],
        queryFn: () => accountsApi.getBalanceSheet(outletId, {
            as_on_date: asOnDate,
            stock_valuation: stockValuation,
            stock_scope: stockScope,
            show_opening: showOpening,
        }),
        enabled: !!outletId,
        staleTime: 1000 * 60 * 5,
    });

    const handleLedgerClick = useCallback((id: string, name: string) => {
        setDrillLedgerId(id); setDrillLedgerName(name);
    }, []);

    // ── Date preset helpers (Feature 4) ─────────────────────────────────────
    // useRef for select so we can imperatively reset value after selection
    const presetSelectRef = useRef<HTMLSelectElement>(null);

    const applyPreset = (preset: string) => {
        const today = new Date();
        const fy = fyYear(today);
        const m = today.getMonth(); // 0-11

        switch (preset) {
            case 'today':
                setAsOnDate(localToday());
                break;

            case 'month_end':
                // Last day of current calendar month — timezone-safe
                setAsOnDate(lastDayOfMonth(today.getFullYear(), m));
                break;

            case 'last_month_end': {
                // Last day of previous calendar month — timezone-safe
                const prevMonth = m === 0 ? 11 : m - 1;
                const prevYear  = m === 0 ? today.getFullYear() - 1 : today.getFullYear();
                setAsOnDate(lastDayOfMonth(prevYear, prevMonth));
                break;
            }

            case 'quarter_end': {
                // Indian FY quarters: Q1=Apr-Jun(3-5), Q2=Jul-Sep(6-8), Q3=Oct-Dec(9-11), Q4=Jan-Mar(0-2)
                let qEndMonth: number;
                if      (m >= 3 && m <= 5)  qEndMonth = 5;   // Q1 → Jun
                else if (m >= 6 && m <= 8)  qEndMonth = 8;   // Q2 → Sep
                else if (m >= 9 && m <= 11) qEndMonth = 11;  // Q3 → Dec
                else                         qEndMonth = 2;   // Q4 → Mar (next calendar year)
                const qEndYear = qEndMonth < 3 ? today.getFullYear() + 1 : today.getFullYear();
                // But if Q4 and we are past Jan in the next FY year, use correct year
                const finalYear = (qEndMonth === 2 && m >= 1) ? today.getFullYear() : qEndYear;
                setAsOnDate(lastDayOfMonth(finalYear, qEndMonth));
                break;
            }

            case 'fy_end':
                // Always March 31 of the current FY's ending year
                setAsOnDate(`${fy + 1}-03-31`);
                break;
        }

        // Reset the select's displayed value imperatively so same option can be re-selected
        if (presetSelectRef.current) presetSelectRef.current.value = '';
    };

    // Month pills — FY order (Feature 4)
    const fyStartYear = useMemo(() => {
        const d = new Date(asOnDate + 'T00:00:00');
        return fyYear(d);
    }, [asOnDate]);

    const activeFyMonth = useMemo(() => {
        const d = new Date(asOnDate + 'T00:00:00');
        return d.getMonth(); // 0-11
    }, [asOnDate]);

    // ── Excel Export ────────────────────────────────────────────────────────
    const handleExportExcel = useCallback(() => {
        if (!data) return;

        const fmtXl = (n: number) =>
            '₹' + Math.abs(n).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });

        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <!--[if gte mso 9]><xml>
                  <x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
                    <x:Name>Balance Sheet</x:Name>
                    <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
                  </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
                </xml><![endif]-->
            </head>
            <body>
            <table border="1" cellpadding="3" cellspacing="0" style="font-family: Calibri, sans-serif;">
                <thead>
                    <tr>
                        <th colspan="7" style="text-align:center;font-size:16px;font-weight:bold;height:34px;vertical-align:middle;">
                            Balance Sheet (As on ${asOnDate})
                        </th>
                    </tr>
                    <tr>
                        <th style="background-color:#f3f4f6;font-weight:bold;width:100px;">Side</th>
                        <th style="background-color:#f3f4f6;font-weight:bold;width:150px;">Section</th>
                        <th style="background-color:#f3f4f6;font-weight:bold;width:200px;">Group</th>
                        <th style="background-color:#f3f4f6;font-weight:bold;width:250px;">Ledger</th>
                        <th style="background-color:#f3f4f6;font-weight:bold;width:120px;">Opening Balance</th>
                        <th style="background-color:#f3f4f6;font-weight:bold;width:120px;">Closing Balance</th>
                        <th style="background-color:#f3f4f6;font-weight:bold;width:80px;">Dr/Cr</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const addRow = (side: string, section: string, gName: string, lName: string, ob: number, cb: number, dc: string) => {
            html += `
                <tr>
                    <td>${side}</td>
                    <td>${section}</td>
                    <td>${gName}</td>
                    <td>${lName}</td>
                    <td style="text-align:right;">${ob !== 0 ? fmtXl(ob) : '—'}</td>
                    <td style="text-align:right;">${cb !== 0 ? fmtXl(cb) : '—'}</td>
                    <td style="text-align:center;">${dc}</td>
                </tr>`;
        };

        const addSection = (side: string, section: string, s: BSSide) => {
            s.groups.forEach(g => {
                if (!showZero && g.closing_balance === 0) return;
                g.ledgers.forEach(l => {
                    if (!showZero && l.closing_balance === 0) return;
                    addRow(side, section, g.name, l.name, l.opening_balance, l.closing_balance, String(l.balance_type));
                });
            });
        };

        addSection('Liabilities', 'Capital', data.liabilities.capital);
        addSection('Liabilities', 'Loans', data.liabilities.loans);
        addSection('Liabilities', 'Current Liabilities', data.liabilities.current_liabilities);
        addSection('Assets', 'Fixed Assets', data.assets.fixed_assets);
        addSection('Assets', 'Investments', data.assets.investments);
        addSection('Assets', 'Current Assets', data.assets.current_assets);
        addRow('Assets', 'Stock in Hand', 'Stock in Hand', 'Closing Stock', 0, data.assets.stock_in_hand.value, 'Dr');

        html += `
                </tbody>
            </table>
            </body>
            </html>`;

        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `balance-sheet-${asOnDate}.xls`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [data, asOnDate, showZero]);

    // ── CSV Export ─────────────────────────────────────────────────────────
    const handleExport = useCallback(() => {
        if (!data) return;
        const rows = ['Side,Section,Group,Ledger,Opening Balance,Closing Balance,Dr/Cr'];
        const addSection = (side: string, section: string, s: BSSide) => {
            s.groups.forEach(g => {
                if (!showZero && g.closing_balance === 0) return;
                g.ledgers.forEach(l => {
                    if (!showZero && l.closing_balance === 0) return;
                    rows.push(`"${side}","${section}","${g.name}","${l.name}",${l.opening_balance},${l.closing_balance},${l.balance_type}`);
                });
            });
        };
        addSection('Liabilities', 'Capital', data.liabilities.capital);
        addSection('Liabilities', 'Loans', data.liabilities.loans);
        addSection('Liabilities', 'Current Liabilities', data.liabilities.current_liabilities);
        addSection('Assets', 'Fixed Assets', data.assets.fixed_assets);
        addSection('Assets', 'Investments', data.assets.investments);
        addSection('Assets', 'Current Assets', data.assets.current_assets);
        rows.push(`"Assets","Stock in Hand","Stock in Hand","Closing Stock",0,${data.assets.stock_in_hand.value},Dr`);
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `balance-sheet-${asOnDate}.csv`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [data, asOnDate, showZero]);

    // Derived values
    const netProfit = data?.liabilities.capital.net_profit ?? 0;
    const isProfit = data?.liabilities.capital.is_profit ?? true;
    const totalLiab = data?.liabilities.total_liabilities ?? 0;
    const totalAssets = data?.assets.total_assets ?? 0;
    const isTallied = data?.is_tallied ?? false;
    const difference = data?.difference ?? 0;
    const fyStart = data?.fy_start ?? '';

    const stockLabel = stockScope === 'no_stock' ? 'No Stock' : {
        purchase_rate: 'Purchase Rate', mrp_rate: 'MRP Rate', sale_rate: 'Sale Rate', cost_ext: 'Cost+5%',
    }[stockValuation] ?? stockValuation;

    return (
        <>
            {/* ── Print Styles (Features 3 + horizontal/vertical) ────────── */}
            <style>{`
                .bs-print-company { display: none; }
                @media print {
                    .no-print { display: none !important; }

                    /* Company / heading header */
                    .bs-print-company { display: block !important; text-align: center; margin-bottom: 0.5rem; }
                    .bs-print-company h1 { font-size: 1.3rem; font-weight: 700; }
                    .bs-print-company p  { font-size: 0.8rem; color: #555; }

                    /* Horizontal (default) */
                    #bs-print-root[data-print-layout="horizontal"] .print-section-wrapper {
                        display: grid !important;
                        grid-template-columns: 1fr 1fr;
                        gap: 1rem;
                    }
                    /* Vertical */
                    #bs-print-root[data-print-layout="vertical"] .print-section-wrapper { display: block !important; }
                    #bs-print-root[data-print-layout="vertical"] .print-vertical-divider {
                        display: block !important; border-top: 2px solid #374151; margin: 1rem 0;
                    }
                    
                    /* Without detail: hide ledger rows */
                    #bs-print-root[data-print-detail="without"] .print-ledger-row { display: none !important; }

                    /* Table styling */
                    .print-group-row { border-bottom: 1px solid #e2e8f0; page-break-inside: avoid; }
                    .print-total-row { font-weight: 700 !important; border-top: 2px solid #374151; }

                    /* Shadows / borders irrelevant in print */
                    .shadow-sm { box-shadow: none !important; }
                    .rounded-xl { border-radius: 0 !important; }
                }
            `}</style>

            <div id="bs-print-root" className="space-y-4 p-4 lg:p-6 max-w-[1700px] mx-auto">

                {/* ── Print-only header ──────────────────────────────────── */}
                <div className="bs-print-company">
                    <h1 id="bs-print-company">{outletName}</h1>
                    <p id="bs-print-heading">Balance Sheet</p>
                    <p>As on: {asOnDate}{fyStart && ` · FY from ${fyStart}`}</p>
                </div>

                {/* ── Page Header ────────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Scale className="h-6 w-6 text-indigo-600" />
                            Balance Sheet
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Financial Position — As on <span className="font-semibold text-slate-700">{asOnDate}</span>
                            {fyStart && <span className="ml-2 text-xs text-slate-400">(FY from {fyStart})</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/reports/profit-loss')}>
                            <BarChart2 className="mr-1.5 h-4 w-4" /> Switch to P&L
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!data}>
                            <Download className="mr-1.5 h-4 w-4" /> Export Excel
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

                {/* ── Controls Bar ───────────────────────────────────────── */}
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-3 no-print">
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Period toggle */}
                        <div className="flex items-center gap-2">
                            <Switch id="period-mode" checked={periodMode} onCheckedChange={setPeriodMode} />
                            <Label htmlFor="period-mode" className="text-sm text-slate-600 cursor-pointer">Period View</Label>
                        </div>

                        <div className="h-7 w-px bg-slate-200" />

                        {/* Date pickers */}
                        {periodMode ? (
                            <div className="flex items-center gap-2">
                                <div className="flex flex-col gap-0.5">
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">From Date</label>
                                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                                        className="h-8 px-2 rounded-md border border-slate-300 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">As On Date</label>
                                    <input type="date" value={asOnDate} onChange={e => setAsOnDate(e.target.value)}
                                        className="h-8 px-2 rounded-md border border-slate-300 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-0.5">
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">As On Date</label>
                                <input type="date" value={asOnDate} onChange={e => setAsOnDate(e.target.value)}
                                    className="h-8 px-2 rounded-md border border-slate-300 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            </div>
                        )}

                        {/* Quick presets — controlled select so same option can fire again */}
                        <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Quick</label>
                            <select
                                ref={presetSelectRef}
                                onChange={e => { if (e.target.value) applyPreset(e.target.value); }}
                                defaultValue=""
                                className="h-8 px-2 rounded-md border border-slate-300 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            >
                                <option value="" disabled>Preset…</option>
                                <option value="today">Today</option>
                                <option value="month_end">This Month End</option>
                                <option value="last_month_end">Last Month End</option>
                                <option value="quarter_end">FY Quarter End</option>
                                <option value="fy_end">FY Year End (Mar 31)</option>
                            </select>
                        </div>

                        <div className="h-7 w-px bg-slate-200" />

                        {/* Stock Settings */}
                        <Button variant="outline" size="sm" onClick={() => setShowStockDialog(true)}
                            className="text-xs flex items-center gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                            <Settings2 className="h-3.5 w-3.5" />
                            Stock: {stockLabel}
                        </Button>

                        <div className="h-7 w-px bg-slate-200 hidden sm:block" />

                        {/* Display toggles */}
                        <div className="flex items-center gap-2">
                            <Switch id="show-opening" checked={showOpening} onCheckedChange={setShowOpening} />
                            <Label htmlFor="show-opening" className="text-sm text-slate-600 cursor-pointer">Opening</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch id="hide-zero" checked={!showZero} onCheckedChange={v => setShowZero(!v)} />
                            <Label htmlFor="hide-zero" className="text-sm text-slate-600 cursor-pointer">Hide Zero</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch id="summary-mode" checked={summaryMode} onCheckedChange={setSummaryMode} />
                            <Label htmlFor="summary-mode" className="text-sm text-slate-600 cursor-pointer">Summary</Label>
                        </div>
                    </div>

                    {/* Month pills — Indian FY order Apr→Mar (Feature 4) */}
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide self-center mr-1 flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" /> Month
                        </span>
                        {FY_MONTHS.map(m => {
                            const lastDay = lastDayOfFyMonth(fyStartYear, m.idx);
                            const isActive = activeFyMonth === m.idx;
                            return (
                                <button
                                    key={m.label}
                                    onClick={() => setAsOnDate(lastDay)}
                                    className={cn(
                                        'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                                        isActive
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700'
                                    )}
                                >
                                    {m.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Error ─────────────────────────────────────────────── */}
                {isError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 no-print">
                        Failed to load Balance Sheet. Please refresh.
                    </div>
                )}

                {/* ── Summary Cards ──────────────────────────────────────── */}
                {!isLoading && data && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
                        <div className="bg-white rounded-xl border border-slate-200 p-3">
                            <p className="text-xs text-slate-500">Total Liabilities</p>
                            <p className="text-lg font-bold text-red-600 font-mono">{fmtFull(totalLiab)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-3">
                            <p className="text-xs text-slate-500">Total Assets</p>
                            <p className="text-lg font-bold text-green-600 font-mono">{fmtFull(totalAssets)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-3">
                            <p className="text-xs text-slate-500">Net {isProfit ? 'Profit' : 'Loss'} (FY)</p>
                            <p className={cn('text-lg font-bold font-mono', isProfit ? 'text-emerald-600' : 'text-red-600')}>
                                {fmtFull(Math.abs(netProfit))}
                            </p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-3">
                            <p className="text-xs text-slate-500">Stock in Hand</p>
                            <p className="text-lg font-bold text-indigo-600 font-mono">{fmtFull(data.assets.stock_in_hand.value)}</p>
                        </div>
                    </div>
                )}

                {/* ── Skeleton ───────────────────────────────────────────── */}
                {isLoading && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {[0, 1].map(i => (
                            <div key={i} className="space-y-2">
                                <div className="h-9 bg-slate-700 rounded-t-lg animate-pulse" />
                                {[...Array(7)].map((_, j) => <div key={j} className="h-10 bg-slate-100 rounded animate-pulse" />)}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Two-column Balance Sheet ───────────────────────────── */}
                {!isLoading && data && (
                    <div className="print-section-wrapper grid grid-cols-1 lg:grid-cols-2 gap-4">

                        {/* ── LEFT: LIABILITIES ──────────────────────────── */}
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="bg-gradient-to-r from-red-600 to-rose-700 px-4 py-3 flex items-center justify-between">
                                <div>
                                    <h2 className="text-white font-bold text-sm tracking-wide">LIABILITIES &amp; CAPITAL</h2>
                                    <p className="text-red-100 text-xs">Capital + Loans + Current Liabilities</p>
                                </div>
                                <span className="text-white font-mono text-base font-bold">{fmtFull(totalLiab)}</span>
                            </div>

                            {/* Column-level Expand / Collapse (Feature 5) */}
                            <div className="flex justify-end gap-2 px-4 py-1.5 border-b border-slate-100 bg-slate-50 no-print">
                                <button onClick={() => setLibSignal(`expand-${Date.now()}`)}
                                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-700 transition-colors">
                                    <ChevronsUpDown className="h-3 w-3" /> Expand All
                                </button>
                                <span className="text-slate-300">·</span>
                                <button onClick={() => setLibSignal(`collapse-${Date.now()}`)}
                                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-700 transition-colors">
                                    <ChevronsDownUp className="h-3 w-3" /> Collapse
                                </button>
                            </div>

                            {/* Opening column header (Feature 6) */}
                            {showOpening && (
                                <div className="flex items-center justify-end gap-6 px-4 py-1.5 bg-blue-50 border-b border-blue-100 text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
                                    <span className="w-24 text-right">Opening</span>
                                    <span className="w-24 text-right">Closing</span>
                                </div>
                            )}

                            <div className="divide-y divide-slate-100">
                                <SectionBlock title="Capital Account" side={data.liabilities.capital}
                                    total={data.liabilities.capital.total} showZero={showZero} showOpening={showOpening}
                                    isLiability summaryMode={summaryMode} expandSignal={libSignal}
                                    onLedgerClick={handleLedgerClick}
                                    extraRow={
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 border-b border-emerald-100 print-group-row">
                                            <div className="flex items-center gap-2">
                                                {isProfit ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                                                <span className="text-sm font-medium text-slate-700">
                                                    {isProfit ? '(+) Net Profit' : '(−) Net Loss'}
                                                    <span className="text-xs text-slate-400 ml-1">(FY {fyStart} to {asOnDate})</span>
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-6">
                                                {showOpening && <span className="w-24 text-right text-xs text-slate-400">—</span>}
                                                <span className={cn('font-mono text-sm font-semibold w-24 text-right', isProfit ? 'text-emerald-700' : 'text-red-600')}>
                                                    {fmtFull(Math.abs(netProfit))}
                                                </span>
                                            </div>
                                        </div>
                                    }
                                />
                                <SectionBlock title="Loans (Liability)" side={data.liabilities.loans}
                                    total={data.liabilities.loans.total} showZero={showZero} showOpening={showOpening}
                                    isLiability summaryMode={summaryMode} expandSignal={libSignal} onLedgerClick={handleLedgerClick} />
                                <SectionBlock title="Current Liabilities" side={data.liabilities.current_liabilities}
                                    total={data.liabilities.current_liabilities.total} showZero={showZero} showOpening={showOpening}
                                    isLiability summaryMode={summaryMode} expandSignal={libSignal} onLedgerClick={handleLedgerClick} />

                                {/* TOTAL LIABILITIES */}
                                <div className="flex items-center justify-between px-4 py-3 bg-red-50 print-total-row">
                                    <span className="text-sm font-bold text-red-800">TOTAL LIABILITIES</span>
                                    <span className="font-mono text-base font-bold text-red-700">{fmtFull(totalLiab)}</span>
                                </div>
                            </div>
                        </div>

                        {/* ── Vertical divider (print only) ─────────────── */}
                        <div className="print-vertical-divider hidden" />

                        {/* ── RIGHT: ASSETS ──────────────────────────────── */}
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3 flex items-center justify-between">
                                <div>
                                    <h2 className="text-white font-bold text-sm tracking-wide">ASSETS</h2>
                                    <p className="text-emerald-100 text-xs">Fixed Assets + Current Assets + Stock</p>
                                </div>
                                <span className="text-white font-mono text-base font-bold">{fmtFull(totalAssets)}</span>
                            </div>

                            {/* Column-level Expand / Collapse */}
                            <div className="flex justify-end gap-2 px-4 py-1.5 border-b border-slate-100 bg-slate-50 no-print">
                                <button onClick={() => setAssetSignal(`expand-${Date.now()}`)}
                                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-700 transition-colors">
                                    <ChevronsUpDown className="h-3 w-3" /> Expand All
                                </button>
                                <span className="text-slate-300">·</span>
                                <button onClick={() => setAssetSignal(`collapse-${Date.now()}`)}
                                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-700 transition-colors">
                                    <ChevronsDownUp className="h-3 w-3" /> Collapse
                                </button>
                            </div>

                            {showOpening && (
                                <div className="flex items-center justify-end gap-6 px-4 py-1.5 bg-blue-50 border-b border-blue-100 text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
                                    <span className="w-24 text-right">Opening</span>
                                    <span className="w-24 text-right">Closing</span>
                                </div>
                            )}

                            <div className="divide-y divide-slate-100">
                                <SectionBlock title="Fixed Assets" side={data.assets.fixed_assets}
                                    total={data.assets.fixed_assets.total} showZero={showZero} showOpening={showOpening}
                                    isLiability={false} summaryMode={summaryMode} expandSignal={assetSignal} onLedgerClick={handleLedgerClick} />
                                <SectionBlock title="Investments" side={data.assets.investments}
                                    total={data.assets.investments.total} showZero={showZero} showOpening={showOpening}
                                    isLiability={false} summaryMode={summaryMode} expandSignal={assetSignal} onLedgerClick={handleLedgerClick} />
                                <SectionBlock title="Current Assets (incl. GST Input)" side={data.assets.current_assets}
                                    total={data.assets.current_assets.total} showZero={showZero} showOpening={showOpening}
                                    isLiability={false} summaryMode={summaryMode} expandSignal={assetSignal} onLedgerClick={handleLedgerClick} />

                                {/* Stock in Hand special row */}
                                {stockScope !== 'no_stock' && (
                                    <div className="print-group-row">
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50">
                                            <div className="flex items-center gap-2">
                                                <Package className="h-3.5 w-3.5 text-indigo-600" />
                                                <span className="text-sm font-medium text-slate-700">Stock in Hand</span>
                                                <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-200 bg-white">
                                                    {stockLabel}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-6">
                                                {showOpening && <span className="w-24 text-right text-xs text-slate-400">—</span>}
                                                <span className="font-mono text-sm font-semibold text-indigo-700 w-24 text-right">
                                                    {fmtFull(data.assets.stock_in_hand.value)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TOTAL ASSETS */}
                                <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 print-total-row">
                                    <span className="text-sm font-bold text-emerald-800">TOTAL ASSETS</span>
                                    <span className="font-mono text-base font-bold text-emerald-700">{fmtFull(totalAssets)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Tally Indicator ────────────────────────────────────── */}
                {!isLoading && data && (
                    <div className={cn(
                        'flex items-center justify-center gap-3 rounded-xl border px-6 py-4 no-print',
                        isTallied ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                    )}>
                        {isTallied ? (
                            <>
                                <CheckCircle className="h-5 w-5 text-emerald-600" />
                                <span className="text-sm font-semibold text-emerald-800">
                                    ✅ Balance Sheet Tallied — Assets = Liabilities ({fmtFull(totalAssets)})
                                </span>
                            </>
                        ) : (
                            <>
                                <XCircle className="h-5 w-5 text-red-600" />
                                <span className="text-sm font-semibold text-red-800">
                                    ⚠️ Difference: {fmtFull(difference)} — Balance Sheet Not Tallied
                                </span>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ── Dialogs & Sheet ─────────────────────────────────────────── */}
            <StockSettingsDialog
                open={showStockDialog}
                onClose={() => setShowStockDialog(false)}
                stockScope={stockScope}
                stockValuation={stockValuation}
                onApply={(scope, method) => { setStockScope(scope); setStockValuation(method); }}
            />

            <PrintDialog
                open={showPrintDialog}
                onClose={() => setShowPrintDialog(false)}
                outletName={outletName}
                asOnDate={asOnDate}
                fyStart={fyStart}
                data={data}
                showZero={showZero}
                summaryMode={summaryMode}
            />

            <LedgerDrilldown
                ledgerId={drillLedgerId}
                ledgerName={drillLedgerName}
                fromDate={data?.fy_start ?? asOnDate}
                toDate={asOnDate}
                onClose={() => setDrillLedgerId(null)}
            />
        </>
    );
}
