'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
    ChevronDown, ChevronRight, Search, X,
    PackageOpen, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PurchaseSummaryCards } from './PurchaseSummaryCards';
import { PurchaseDetailModal } from './PurchaseDetailModal';
import { usePurchasesList } from '@/hooks/usePurchases';
import { PurchaseInvoiceFull } from '@/types';
import { cn } from '@/lib/utils';
import { getPurchaseStatus, STATUS_CONFIG } from '@/lib/purchaseUtils';

/* ─── helpers ─────────────────────────────────────────────── */

const formatINR = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type StatusFilter = 'all' | 'paid' | 'partial' | 'unpaid' | 'overdue';
type PeriodFilter = 'this_week' | 'this_month' | 'last_month' | 'all';

const PAGE_SIZE = 10;

function getPeriodBounds(period: PeriodFilter): { start: string; end: string } | null {
    if (period === 'all') return null;
    const today = new Date();
    let start: Date, end: Date = today;

    if (period === 'this_week') {
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
    } else if (period === 'this_month') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else {
        // last_month
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
    }

    return {
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd'),
    };
}

/* ─── component ───────────────────────────────────────────── */

export function PurchasesList({ onEditInvoice }: { onEditInvoice?: (invoice: PurchaseInvoiceFull) => void }) {
    const { data, isLoading } = usePurchasesList();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [period, setPeriod] = useState<PeriodFilter>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoiceFull | null>(null);

    const allInvoices: PurchaseInvoiceFull[] = data?.data ?? [];

    /* invoices filtered only by period — used for status pill counts */
    const periodInvoices = useMemo(() => {
        const bounds = getPeriodBounds(period);
        if (!bounds) return allInvoices;
        return allInvoices.filter(
            (inv) => inv.invoiceDate >= bounds.start && inv.invoiceDate <= bounds.end
        );
    }, [allInvoices, period]);

    /* status counts for the pill badges */
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { paid: 0, partial: 0, unpaid: 0, overdue: 0 };
        periodInvoices.forEach((inv) => counts[getPurchaseStatus(inv)]++);
        return counts;
    }, [periodInvoices]);

    /* fully filtered list */
    const filtered = useMemo(() => {
        return periodInvoices.filter((inv) => {
            // ✅ fixed: actually check status
            if (statusFilter !== 'all' && getPurchaseStatus(inv) !== statusFilter) return false;

            // ✅ fixed: search always runs regardless of statusFilter
            if (search.trim()) {
                const q = search.toLowerCase();
                const matchInvoice = inv.invoiceNo.toLowerCase().includes(q);
                const matchDist = inv.distributor?.name?.toLowerCase().includes(q) ?? false;
                if (!matchInvoice && !matchDist) return false;
            }
            return true;
        });
    }, [periodInvoices, search, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const resetPage = () => setPage(1);

    /* ── render ─────────────────────────────────────────────── */

    return (
        <div className="space-y-6">
            <PurchaseSummaryCards invoices={allInvoices} />

            {/* ── Controls ── */}
            <div className="flex flex-wrap gap-3 items-center justify-between">

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                        className="pl-9 pr-8 w-64 h-9"
                        placeholder="Search invoice or distributor…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                    />
                    {search && (
                        <button
                            onClick={() => { setSearch(''); resetPage(); }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Status pills with live counts */}
                    {(['all', 'paid', 'partial', 'unpaid', 'overdue'] as StatusFilter[]).map((s) => {
                        const isActive = statusFilter === s;
                        const count = s === 'all' ? periodInvoices.length : statusCounts[s];
                        return (
                            <button
                                key={s}
                                onClick={() => { setStatusFilter(s); resetPage(); }}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150',
                                    isActive
                                        ? 'bg-foreground text-background border-foreground shadow-sm'
                                        : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/40'
                                )}
                            >
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                                <span className={cn(
                                    'inline-flex items-center justify-center rounded-full text-[10px] font-semibold min-w-[16px] h-4 px-1',
                                    isActive
                                        ? 'bg-background/20 text-background'
                                        : 'bg-muted text-muted-foreground'
                                )}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}

                    {/* Period selector */}
                    <Select
                        value={period}
                        onValueChange={(v) => { setPeriod(v as PeriodFilter); resetPage(); }}
                    >
                        <SelectTrigger className="w-36 h-9 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="this_week">This Week</SelectItem>
                            <SelectItem value="this_month">This Month</SelectItem>
                            <SelectItem value="last_month">Last Month</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* ── Table ── */}
            <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        {/* sticky header */}
                        <thead className="bg-muted/50 border-b border-border sticky top-0 z-10">
                            <tr>
                                <th className="w-10" />
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Date</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Invoice No</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Distributor</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Items</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Goods Value</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Discount</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Net Amount</th>
                                <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-border">
                            {isLoading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-3"><Skeleton className="h-4 w-4 rounded" /></td>
                                        {[120, 80, 160, 40, 80, 80, 80, 60, 60].map((w, j) => (
                                            <td key={j} className="px-4 py-3">
                                                <Skeleton className={`h-4 w-[${w}px]`} />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : paginated.length === 0 ? (
                                <tr>
                                    <td colSpan={10}>
                                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                                <PackageOpen className="h-6 w-6" />
                                            </div>
                                            <div className="text-center">
                                                <p className="font-medium text-foreground">No purchases found</p>
                                                <p className="text-sm mt-0.5">
                                                    {search || statusFilter !== 'all'
                                                        ? 'Try adjusting your filters'
                                                        : 'Click "New Purchase" above to record one'}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginated.map((inv) => {
                                    const status = getPurchaseStatus(inv);
                                    const isExpanded = expandedId === inv.id;
                                    const cfg = STATUS_CONFIG[status];

                                    return (
                                        /* ✅ fixed: key on fragment */
                                        <tr
                                            key={inv.id}
                                            className={cn(
                                                'group cursor-pointer transition-colors hover:bg-muted/40',
                                                isExpanded && 'bg-muted/30'
                                            )}
                                            onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                                        >
                                            <td className="pl-3 pr-0 py-3 text-muted-foreground">
                                                <ChevronDown className={cn(
                                                    'w-4 h-4 transition-transform duration-200',
                                                    !isExpanded && '-rotate-90'
                                                )} />
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                                {format(new Date(inv.invoiceDate), 'dd MMM yyyy')}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-foreground whitespace-nowrap">
                                                {inv.invoiceNo}
                                            </td>
                                            <td className="px-4 py-3 text-foreground max-w-[180px] truncate">
                                                {inv.distributor?.name}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                                {inv.items?.length ?? 0}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-foreground whitespace-nowrap">
                                                {formatINR(inv.subtotal)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                                −{formatINR(inv.discountAmount)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground whitespace-nowrap">
                                                {formatINR(inv.grandTotal)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={cn(
                                                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                                                    cfg.classes
                                                )}>
                                                    {cfg.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setSelectedInvoice(inv)}>
                                                    <FileText className="h-3.5 w-3.5" />
                                                    View
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Expanded row — rendered OUTSIDE the table to avoid DOM nesting issues */}
                {paginated.map((inv) => {
                    if (expandedId !== inv.id) return null;
                    return (
                        <div key={`${inv.id}-expand`} className="border-t border-border bg-muted/20 px-6 py-4">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                Line Items — {inv.items?.length ?? 0} products
                            </p>
                            <div className="rounded-lg border border-border overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/60 border-b border-border">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Batch</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Expiry</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qty</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Rate</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">GST %</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {(inv.items ?? []).map((item) => (
                                            <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-3 py-2 font-medium text-foreground">
                                                    {item.product?.name ?? '—'}
                                                </td>
                                                <td className="px-3 py-2 font-mono text-muted-foreground">{item.batchNo}</td>
                                                <td className="px-3 py-2 text-muted-foreground">{item.expiryDate}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{item.qty}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{formatINR(item.purchaseRate)}</td>
                                                <td className="px-3 py-2 text-right text-muted-foreground">{item.gstRate}%</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                                                    {formatINR(item.totalAmount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                        Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline" size="sm" className="h-8 w-8 p-0"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            ‹
                        </Button>

                        {/* numbered page buttons */}
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                            .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                                acc.push(p);
                                return acc;
                            }, [])
                            .map((p, idx) =>
                                p === '...'
                                    ? <span key={`ellipsis-${idx}`} className="px-1">…</span>
                                    : (
                                        <Button
                                            key={p}
                                            variant={page === p ? 'default' : 'outline'}
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onClick={() => setPage(p as number)}
                                        >
                                            {p}
                                        </Button>
                                    )
                            )
                        }

                        <Button
                            variant="outline" size="sm" className="h-8 w-8 p-0"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            ›
                        </Button>
                    </div>
                </div>
            )}

            <PurchaseDetailModal
                open={!!selectedInvoice}
                onOpenChange={(open) => !open && setSelectedInvoice(null)}
                invoice={selectedInvoice}
                onEdit={onEditInvoice ? (inv) => { setSelectedInvoice(null); onEditInvoice(inv); } : undefined}
            />
        </div>
    );
}
