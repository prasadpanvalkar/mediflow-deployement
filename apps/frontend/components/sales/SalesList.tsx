'use client';

import { useState, useEffect } from 'react';
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import {
    Printer, Eye, X, ShoppingBag, Search,
    CalendarRange, PlusCircle, ChevronLeft, ChevronRight, Users,
    TrendingUp, BarChart3, Wallet, CreditCard, Smartphone, Banknote, Tag, ArrowUpRight,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useSalesList, useSaleById } from '@/hooks/useSales';
import { SaleInvoice } from '@/types';
import { cn } from '@/lib/utils';
import { InvoicePreviewModal } from '@/components/billing/InvoicePreviewModal';

// ── formatters ────────────────────────────────────────────────────────────────
const fmt = (n: number | undefined) =>
    '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = (n: number) =>
    n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : '₹' + n.toFixed(0);

const PAYMENT_COLORS: Record<string, string> = {
    cash: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    upi: 'bg-blue-100 text-blue-700 border-blue-200',
    card: 'bg-purple-100 text-purple-700 border-purple-200',
    credit: 'bg-orange-100 text-orange-700 border-orange-200',
    split: 'bg-slate-100 text-slate-700 border-slate-200',
    ledger: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    cheque: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    bank_transfer: 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

// ── date helpers ──────────────────────────────────────────────────────────────
const fd = (d: Date) => format(d, 'yyyy-MM-dd');
const now = new Date();

const DATE_PRESETS = [
    { label: 'Today', start: fd(now), end: fd(now) },
    { label: 'Yesterday', start: fd(subDays(now, 1)), end: fd(subDays(now, 1)) },
    { label: 'This Week', start: fd(startOfWeek(now, { weekStartsOn: 1 })), end: fd(endOfWeek(now, { weekStartsOn: 1 })) },
    { label: 'This Month', start: fd(startOfMonth(now)), end: fd(endOfMonth(now)) },
    { label: 'Last 7 Days', start: fd(subDays(now, 6)), end: fd(now) },
    { label: 'Last 30 Days', start: fd(subDays(now, 29)), end: fd(now) },
];

// ── Invoice View Modal ────────────────────────────────────────────────────────
function SaleInvoiceModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
    const { data: invoice } = useSaleById(invoiceId);

    return (
        <InvoicePreviewModal
            isOpen={true}
            onClose={onClose}
            invoice={invoice as any}
        />
    );
}


// ── Main Sales Page ───────────────────────────────────────────────────────────
export default function SalesList() {
    const router = useRouter();
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
    const [startDate, setStartDate] = useState(fd(now));
    const [endDate, setEndDate] = useState(fd(now));
    const [activePreset, setActivePreset] = useState('Today');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 50;

    // When search is active: bypass date filters → search ALL dates (newest first)
    // When search is empty: apply selected date range
    const isSearching = search.trim().length > 0;
    const { data, isLoading } = useSalesList({
        startDate: isSearching ? undefined : startDate,
        endDate:   isSearching ? undefined : endDate,
        page,
        pageSize: PAGE_SIZE,
        search: search.trim() || undefined,
    });
    const invoices: SaleInvoice[] = data?.data ?? [];
    const pagination = data?.pagination;
    // No further client-side filter needed; backend handles search
    const filteredInvoices = invoices;

    // ── Analytics from backend (already filtered by date) ───────────────────
    // Backend returns analytics object with pre-aggregated numbers for selected date range.
    // client-side search only filters table rows, not the analytics numbers.
    const analytics = (data as any)?.analytics;
    const totalRevenue    = analytics?.totalRevenue    ?? 0;
    const totalCost       = analytics?.totalCost       ?? 0;
    const totalProfit     = analytics?.totalProfit     ?? 0;
    const totalBills      = analytics?.totalBills      ?? pagination?.totalRecords ?? 0;
    const totalDiscount   = analytics?.totalDiscount   ?? 0;
    const cashTotal       = analytics?.cashCollected   ?? 0;
    const upiTotal        = analytics?.upiCollected    ?? 0;
    const cardTotal       = analytics?.cardCollected   ?? 0;
    const creditTotal     = analytics?.creditGiven     ?? 0;
    const totalGst        = invoices.reduce((s, i) => s + ((i.cgstAmount ?? 0) + (i.sgstAmount ?? 0)), 0);
    const collectedTotal  = cashTotal + upiTotal + cardTotal;
    const avgBillValue    = totalBills > 0 ? totalRevenue / totalBills : 0;
    const profitMarginPct = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

    const applyPreset = (start: string, end: string, label: string) => {
        setStartDate(start);
        setEndDate(end);
        setActivePreset(label);
        setPage(1);
    };

    return (
        <div className="space-y-6">
            {/* ── Page Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Complete billing & invoice history with revenue analytics</p>
                </div>
                <Button onClick={() => router.push('/dashboard/billing')} className="shrink-0">
                    <PlusCircle className="w-4 h-4 mr-2" />
                    New Sale
                </Button>
            </div>

            {/* ── Date Filter Presets ── */}
            <div className="flex flex-wrap items-center gap-2">
                {DATE_PRESETS.map(p => (
                    <button
                        key={p.label}
                        onClick={() => applyPreset(p.start, p.end, p.label)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                            activePreset === p.label
                                ? 'bg-primary text-white border-primary shadow-sm'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                        )}
                    >
                        {p.label}
                    </button>
                ))}
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                        type="date"
                        value={startDate}
                        onChange={e => { setStartDate(e.target.value); setActivePreset('Custom'); setPage(1); }}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary/60"
                    />
                    <span className="text-muted-foreground text-sm">to</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={e => { setEndDate(e.target.value); setActivePreset('Custom'); setPage(1); }}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary/60"
                    />
                </div>
            </div>

            {/* ── Selected Range Label ── */}
            <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
                    📅 Showing: {startDate === endDate ? format(new Date(startDate), 'dd MMM yyyy') : `${format(new Date(startDate), 'dd MMM yyyy')} → ${format(new Date(endDate), 'dd MMM yyyy')}`}
                </span>
                {isLoading && <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>}
            </div>

            {/* ── Revenue Analytics Section ── */}
            <div className="bg-gradient-to-br from-primary/5 to-blue-50/50 border border-primary/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-bold text-primary uppercase tracking-wide">Sales &amp; Profit Analytics</h2>
                    <span className="ml-auto text-xs text-muted-foreground">
                        {isSearching
                            ? `Search results: ${totalBills} bills (all dates)`
                            : `Based on ${totalBills} bills · ${activePreset === 'Custom' ? 'custom range' : activePreset.toLowerCase()}`
                        }
                    </span>
                </div>

                {/* How revenue and profit are calculated — explained */}
                <p className="text-xs text-slate-500 bg-white/80 rounded-lg px-3 py-2 border border-slate-100">
                    💡 <strong>Revenue</strong> = Grand Total of all invoices (incl. GST). <strong>Cost</strong> = purchase rate × qty from batch records. <strong>Profit</strong> = Revenue − Cost. Numbers are server-computed for the exact selected date range.
                </p>

                {/* Main Revenue Metrics — 5 cards */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-4 h-4 text-primary shrink-0" />
                            <p className="text-xs text-muted-foreground font-medium">Total Sales</p>
                        </div>
                        {isLoading
                            ? <div className="h-7 bg-slate-100 animate-pulse rounded" />
                            : <p className="text-2xl font-bold text-primary tabular-nums">{fmtShort(totalRevenue)}</p>
                        }
                        <p className="text-[10px] text-muted-foreground mt-1">{totalBills} bills (incl. GST)</p>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
                            <p className="text-xs text-muted-foreground font-medium">Collected</p>
                        </div>
                        {isLoading
                            ? <div className="h-7 bg-slate-100 animate-pulse rounded" />
                            : <p className="text-2xl font-bold text-emerald-700 tabular-nums">{fmtShort(collectedTotal)}</p>
                        }
                        <p className="text-[10px] text-muted-foreground mt-1">Cash + UPI + Card</p>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Tag className="w-4 h-4 text-orange-500 shrink-0" />
                            <p className="text-xs text-muted-foreground font-medium">Credit Pending</p>
                        </div>
                        {isLoading
                            ? <div className="h-7 bg-slate-100 animate-pulse rounded" />
                            : <p className="text-2xl font-bold text-orange-600 tabular-nums">{fmtShort(creditTotal)}</p>
                        }
                        <p className="text-[10px] text-muted-foreground mt-1">Not yet collected</p>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <BarChart3 className="w-4 h-4 text-blue-600 shrink-0" />
                            <p className="text-xs text-muted-foreground font-medium">Avg Bill Value</p>
                        </div>
                        {isLoading
                            ? <div className="h-7 bg-slate-100 animate-pulse rounded" />
                            : <p className="text-2xl font-bold text-blue-700 tabular-nums">{fmtShort(avgBillValue)}</p>
                        }
                        <p className="text-[10px] text-muted-foreground mt-1">Per bill average</p>
                    </div>

                    {/* ── Profit Card ── */}
                    <div className={cn(
                        'rounded-xl border p-4 shadow-sm',
                        totalProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                    )}>
                        <div className="flex items-center gap-2 mb-2">
                            <ArrowUpRight className={cn('w-4 h-4 shrink-0', totalProfit >= 0 ? 'text-green-600' : 'text-red-600')} />
                            <p className="text-xs text-muted-foreground font-medium">Our Profit</p>
                        </div>
                        {isLoading
                            ? <div className="h-7 bg-slate-100 animate-pulse rounded" />
                            : <p className={cn('text-2xl font-bold tabular-nums', totalProfit >= 0 ? 'text-green-700' : 'text-red-700')}>{fmtShort(totalProfit)}</p>
                        }
                        <p className="text-[10px] text-muted-foreground mt-1">
                            {isLoading ? '...' : `Sale − Cost · ${profitMarginPct.toFixed(1)}% margin`}
                        </p>
                    </div>
                </div>

                {/* Payment mode breakdown */}
                <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Payment Mode Breakdown</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                            { label: 'Cash', amount: cashTotal, icon: Banknote, color: 'text-emerald-700', bar: 'bg-emerald-500' },
                            { label: 'UPI', amount: upiTotal, icon: Smartphone, color: 'text-blue-700', bar: 'bg-blue-500' },
                            { label: 'Card', amount: cardTotal, icon: CreditCard, color: 'text-purple-700', bar: 'bg-purple-500' },
                            { label: 'Credit', amount: creditTotal, icon: Tag, color: 'text-orange-700', bar: 'bg-orange-500' },
                        ].map(({ label, amount, icon: Icon, color, bar }) => (
                            <div key={label} className="space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                    <Icon className={cn('w-3.5 h-3.5 shrink-0', color)} />
                                    <span className="text-xs text-muted-foreground">{label}</span>
                                </div>
                                <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className={cn(bar, 'h-full rounded-full transition-all duration-700')}
                                        style={{ width: totalRevenue > 0 ? `${Math.min(100, (amount / totalRevenue) * 100)}%` : '0%' }}
                                    />
                                </div>
                                <p className={cn('text-sm font-bold tabular-nums', color)}>
                                    {isLoading ? '—' : fmt(amount)}
                                </p>
                            </div>
                        ))}
                    </div>
                    {/* GST + Discount info */}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>Total GST Collected: <strong className="text-slate-700">{fmt(totalGst)}</strong></span>
                        <span>Total Discount Given: <strong className="text-red-600">−{fmt(totalDiscount)}</strong></span>
                    </div>
                </div>
            </div>

            {/* ── Search ── */}
            <div className="flex flex-col gap-1 max-w-md">
                <div className={cn(
                    'flex items-center gap-2 bg-white border rounded-lg px-3 py-2 transition-colors focus-within:border-primary/50',
                    isSearching ? 'border-primary/40 bg-primary/5' : 'border-slate-200'
                )}>
                    <Search className={cn('w-4 h-4 shrink-0', isSearching ? 'text-primary' : 'text-muted-foreground')} />
                    <input
                        type="text"
                        placeholder="Search invoice, customer, staff... (searches all dates)"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-slate-900">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
                {isSearching && (
                    <p className="text-xs text-primary font-medium px-1">
                        🔍 Searching all dates · date filter paused · latest first
                    </p>
                )}
            </div>

            {/* ── Table ── */}
            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">Invoice No</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">Date</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">Customer</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs text-right">Items</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs text-right">Amount</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">Payment</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">Billed By</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {isLoading && [...Array(6)].map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    {[...Array(8)].map((_, j) => (
                                        <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded" /></td>
                                    ))}
                                </tr>
                            ))}
                            {!isLoading && filteredInvoices.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">
                                        <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                                        <p className="font-medium">No sales found</p>
                                        <p className="text-xs mt-1">Try changing the date range or search query</p>
                                    </td>
                                </tr>
                            )}
                            {!isLoading && filteredInvoices.map(inv => (
                                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{inv.invoiceNo}</td>
                                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{format(new Date(inv.invoiceDate), 'dd MMM yyyy')}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-slate-700">{inv.customer?.name ?? 'Walk-in'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-600">{inv.items?.length ?? 0}</td>
                                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{fmt(inv.grandTotal)}</td>
                                    <td className="px-4 py-3">
                                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase', PAYMENT_COLORS[inv.paymentMode] ?? 'bg-slate-100 text-slate-700 border-slate-200')}>
                                            {inv.paymentMode}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 text-xs">{inv.billedByName ?? '—'}</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="icon" className="h-7 w-7" title="View Invoice" onClick={() => setSelectedInvoiceId(inv.id)}>
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Print Invoice" onClick={() => setSelectedInvoiceId(inv.id)}>
                                                <Printer className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
                        <p className="text-xs text-muted-foreground">
                            Page {pagination.page} of {pagination.totalPages} · {pagination.totalRecords} total records
                        </p>
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            {/* Invoice Modal */}
            {selectedInvoiceId && (
                <SaleInvoiceModal invoiceId={selectedInvoiceId} onClose={() => setSelectedInvoiceId(null)} />
            )}
        </div>
    );
}
