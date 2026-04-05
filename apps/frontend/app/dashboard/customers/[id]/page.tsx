'use client';

import { useState, useMemo, Fragment } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft, Pencil, Heart, Phone,
    Building2, Receipt,
    ChevronDown, FileText, Package, AlertCircle, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CustomerForm from '@/components/customers/CustomerForm';
import { useCustomerById } from '@/hooks/useCustomers';
import { useCustomerInvoices, useInvoiceItems } from '@/hooks/useSales';
import { useBillingStore } from '@/store/billingStore';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency } from '@/lib/gst';
import { formatQty, cn } from '@/lib/utils';
import { format, startOfMonth, subMonths } from 'date-fns';
import { Customer, SaleInvoiceSummary, SaleInvoice } from '@/types';
import { salesApi } from '@/lib/apiClient';
import { InvoicePreviewModal } from '@/components/billing/InvoicePreviewModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL!; // Required — set NEXT_PUBLIC_API_URL in .env

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatINR = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function DetailRow({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
    return (
        <div className="flex items-start justify-between py-2.5 border-b last:border-b-0">
            <span className="text-sm text-muted-foreground w-40 shrink-0">{label}</span>
            <span className={cn('text-sm font-medium text-right', className)}>{value || '—'}</span>
        </div>
    );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
    return (
        <div className="bg-white rounded-xl border p-4">
            <div className={cn('text-xs font-medium mb-1', color)}>{label}</div>
            <div className="text-xl font-bold text-slate-900">{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        </div>
    );
}

type StatusFilter = 'all' | 'paid' | 'credit' | 'partial' | 'return';
type PeriodFilter = 'this_month' | 'last_month' | 'last_3_months' | 'all';

const PAGE_SIZE = 10;

function getInvoiceStatus(inv: SaleInvoiceSummary): StatusFilter {
    if (inv.isReturn) return 'return';
    if (inv.amountDue <= 0) return 'paid';
    if (inv.paymentMode === 'credit') return 'credit';
    return 'partial';
}

const STATUS_CONFIG: Record<StatusFilter, { label: string; classes: string }> = {
    paid:    { label: 'Paid',    classes: 'bg-green-100 text-green-700 border-green-200' },
    partial: { label: 'Partial', classes: 'bg-amber-100 text-amber-700 border-amber-200' },
    credit:  { label: 'Credit',  classes: 'bg-red-100 text-red-700 border-red-200' },
    return:  { label: 'Return',  classes: 'bg-slate-100 text-slate-600 border-slate-200' },
    all:     { label: 'All',     classes: '' },
};

function getPeriodStart(period: PeriodFilter): Date | null {
    const today = new Date();
    if (period === 'this_month') return startOfMonth(today);
    if (period === 'last_month') return startOfMonth(subMonths(today, 1));
    if (period === 'last_3_months') return startOfMonth(subMonths(today, 3));
    return null;
}

// ─── Expanded Item Row ─────────────────────────────────────────────────────────

function InvoiceItemsExpanded({ invoiceId }: { invoiceId: string }) {
    const { data, isLoading, isError } = useInvoiceItems(invoiceId);
    const items = data?.data ?? [];

    if (isLoading) {
        return (
            <div className="px-6 py-4">
                <div className="space-y-2">
                    {[0, 1].map((i) => (
                        <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                </div>
            </div>
        );
    }

    if (isError || items.length === 0) {
        return (
            <div className="px-6 py-4 flex items-center gap-2 text-slate-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                Could not load item details
            </div>
        );
    }

    return (
        <div className="px-6 py-4">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <Package className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {items.length} Product{items.length !== 1 ? 's' : ''} in this bill
                </span>
            </div>

            {/* Item cards */}
            <div className="space-y-2 ml-1">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className="flex items-start justify-between bg-white rounded-lg border border-slate-200 px-4 py-3 hover:border-slate-300 transition-colors"
                    >
                        {/* Left — product info */}
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-800 text-sm leading-tight">{item.productName}</p>
                            <div className="flex items-center gap-3 mt-1">
                                {item.batchNo && (
                                    <span className="text-xs text-slate-400 font-mono">Batch: {item.batchNo}</span>
                                )}
                                {item.expiryDate && (
                                    <span className="text-xs text-slate-400">
                                        Exp: {format(new Date(item.expiryDate), 'MMM yyyy')}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Middle — qty × rate */}
                        <div className="text-center px-6">
                            <p className="text-sm text-slate-700">
                                {formatQty(item.qtyStrips, item.qtyLoose, item.packSize ?? null)}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">× {formatINR(item.rate)}</p>
                        </div>

                        {/* Discount — only if > 0 */}
                        {item.discountPct > 0 && (
                            <div className="text-center px-4">
                                <p className="text-sm text-green-600 font-medium">-{item.discountPct}%</p>
                                <p className="text-xs text-slate-400 mt-0.5">discount</p>
                            </div>
                        )}

                        {/* Right — total */}
                        <div className="text-right pl-4">
                            <p className="font-semibold text-slate-900 text-sm">{formatINR(item.totalAmount)}</p>
                            {item.gstRate != null && item.gstRate > 0 && (
                                <p className="text-xs text-slate-400 mt-0.5">incl. {item.gstRate}% GST</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer total — only if 2+ items */}
            {items.length > 1 && (
                <div className="flex justify-end mt-2 pr-1">
                    <span className="text-xs text-slate-500">Bill Total:</span>
                    <span className="text-xs font-semibold text-slate-800 ml-2">
                        {formatINR(items.reduce((s, i) => s + i.totalAmount, 0))}
                    </span>
                </div>
            )}
        </div>
    );
}

// ─── Invoice History Section ───────────────────────────────────────────────────

function InvoiceHistory({ customerId }: { customerId: string }) {
    const { data, isLoading } = useCustomerInvoices(customerId);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [period, setPeriod] = useState<PeriodFilter>('this_month');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    const [selectedPrintInvoice, setSelectedPrintInvoice] = useState<SaleInvoice | null>(null);
    const [isPrintLoading, setIsPrintLoading] = useState<string | null>(null);

    const handlePrintInvoiceClick = async (invoiceId: string) => {
        try {
            setIsPrintLoading(invoiceId);
            const userOutletId = useAuthStore.getState().outlet?.id || '';
            const invoice = await salesApi.getById(invoiceId, userOutletId);
            setSelectedPrintInvoice({
                ...invoice,
                items: invoice.items || [],
            });
        } catch (error) {
            console.error('Failed to load invoice for printing:', error);
        } finally {
            setIsPrintLoading(null);
        }
    };

    const allInvoices: SaleInvoiceSummary[] = data?.data ?? [];

    // Summary cards (calculated from ALL invoices, not filtered)
    const totalBills = allInvoices.length;
    const totalBilled = allInvoices.reduce((s, inv) => s + inv.grandTotal, 0);
    const totalOutstanding = data?.analytics?.customerOutstanding ?? allInvoices.reduce((s, inv) => s + (inv.amountDue ?? 0), 0);

    // Period filter
    const periodStart = getPeriodStart(period);
    const periodEnd = period === 'last_month'
        ? startOfMonth(new Date())  // last month ends at start of this month
        : null;

    const periodInvoices = useMemo(() => {
        if (!periodStart) return allInvoices;
        return allInvoices.filter((inv) => {
            const d = new Date(inv.invoiceDate);
            if (periodEnd && d >= periodEnd) return false;
            return d >= periodStart;
        });
    }, [allInvoices, periodStart, periodEnd]);

    // Status filter
    const filtered = useMemo(() => {
        if (statusFilter === 'all') return periodInvoices;
        return periodInvoices.filter((inv) => getInvoiceStatus(inv) === statusFilter);
    }, [periodInvoices, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const resetPage = () => setPage(1);

    // Summary cards skeleton
    if (isLoading) {
        return (
            <div className="space-y-6 mt-6">
                <div className="grid grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
                <Skeleton className="h-64 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6 mt-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                    label="Total Bills"
                    value={String(totalBills)}
                    sub="All time"
                    color="text-blue-600"
                />
                <StatCard
                    label="Total Billed"
                    value={formatINR(totalBilled)}
                    sub="All invoices"
                    color="text-emerald-600"
                />
                <StatCard
                    label="Outstanding"
                    value={totalOutstanding > 0 ? formatINR(totalOutstanding) : '₹0'}
                    sub={totalOutstanding > 0 ? 'Unpaid amount' : 'All cleared'}
                    color={totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}
                />
            </div>

            {/* Invoice History Table */}
            <div>
                <h2 className="text-base font-semibold text-slate-800 mb-4">Invoice History</h2>

                {/* Filter bar */}
                <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        {(['all', 'paid', 'credit', 'partial', 'return'] as StatusFilter[]).map((s) => {
                            const isActive = statusFilter === s;
                            const count = s === 'all'
                                ? periodInvoices.length
                                : periodInvoices.filter((inv) => getInvoiceStatus(inv) === s).length;
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
                                        isActive ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground'
                                    )}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <Select value={period} onValueChange={(v) => { setPeriod(v as PeriodFilter); resetPage(); }}>
                        <SelectTrigger className="w-40 h-9 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="this_month">This Month</SelectItem>
                            <SelectItem value="last_month">Last Month</SelectItem>
                            <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Table */}
                <div className="rounded-xl border border-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 border-b border-border sticky top-0 z-10">
                                <tr>
                                    <th className="w-10" />
                                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Date</th>
                                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Invoice No</th>
                                    <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Items</th>
                                    <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Total</th>
                                    <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Paid</th>
                                    <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Due</th>
                                    <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                                    <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginated.length === 0 ? (
                                    <tr>
                                        <td colSpan={9}>
                                            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                                    <Receipt className="h-6 w-6" />
                                                </div>
                                                <div className="text-center">
                                                    {allInvoices.length === 0 ? (
                                                        <>
                                                            <p className="font-medium text-foreground">No invoices found for this customer</p>
                                                            <p className="text-sm mt-0.5">Bills created for this customer will appear here</p>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <p className="font-medium text-foreground">No invoices match the selected filters</p>
                                                            <button
                                                                onClick={() => { setStatusFilter('all'); setPeriod('all'); setPage(1); }}
                                                                className="text-sm mt-1 text-blue-600 hover:underline"
                                                            >
                                                                Clear Filters
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginated.map((inv) => {
                                        const invStatus = getInvoiceStatus(inv);
                                        const cfg = STATUS_CONFIG[invStatus];
                                        const isExpanded = expandedId === inv.id;

                                        return (
                                            <Fragment key={inv.id}>
                                                <tr
                                                    className={cn(
                                                        'cursor-pointer transition-colors hover:bg-slate-50/80 border-b border-slate-100',
                                                        isExpanded && 'bg-blue-50/30 border-l-2 border-l-blue-400'
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
                                                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                                        {inv.itemsCount} item{inv.itemsCount !== 1 ? 's' : ''}
                                                    </td>
                                                    <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground whitespace-nowrap">
                                                        {formatINR(inv.grandTotal)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                                        {formatINR(inv.amountPaid)}
                                                    </td>
                                                    <td className={cn(
                                                        'px-4 py-3 text-right tabular-nums whitespace-nowrap',
                                                        inv.amountDue > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'
                                                    )}>
                                                        {inv.amountDue > 0 ? formatINR(inv.amountDue) : '—'}
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
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-slate-500 hover:text-blue-600 gap-1.5 h-8 px-2"
                                                            disabled={isPrintLoading === inv.id}
                                                            onClick={async () => {
                                                                await handlePrintInvoiceClick(inv.id);
                                                            }}
                                                        >
                                                            {isPrintLoading === inv.id ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : (
                                                                <FileText className="w-3.5 h-3.5" />
                                                            )}
                                                            PDF
                                                        </Button>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan={9} className="px-0 py-0 bg-slate-50/60 border-b border-slate-200">
                                                            <InvoiceItemsExpanded invoiceId={inv.id} />
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground mt-4">
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
            </div>

            <InvoicePreviewModal
                isOpen={!!selectedPrintInvoice}
                onClose={() => setSelectedPrintInvoice(null)}
                invoice={selectedPrintInvoice}
            />
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
    const billingStore = useBillingStore();
    const router = useRouter();

    const { id } = useParams<{ id: string }>();
    const { data: customer, isLoading, isError } = useCustomerById(id);
    const setCustomer = useBillingStore((s) => s.setCustomer);
    const [editOpen, setEditOpen] = useState(false);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-48" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <Skeleton className="h-64 rounded-xl" />
            </div>
        );
    }

    if (isError || !customer) {
        return (
            <div className="text-center py-20 text-muted-foreground">
                <p className="text-lg font-medium">Customer not found</p>
                <Button variant="ghost" className="mt-4" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Go back
                </Button>
            </div>
        );
    }

    const creditUsedPct = customer.creditLimit > 0
        ? Math.min((customer.outstanding / customer.creditLimit) * 100, 100)
        : 0;

    return (
        <div className="space-y-6">
            {/* Back + header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
                        {customer.isChronic && (
                            <Badge className="bg-purple-100 text-purple-700 border-purple-200 gap-1">
                                <Heart className="w-3 h-3 fill-current" /> Chronic
                            </Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">Customer profile</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditOpen(true)}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit
                    </Button>
                    <Button onClick={() => { setCustomer(customer as any); router.push('/dashboard/billing'); }}>
                        <Receipt className="w-4 h-4 mr-2" /> Quick Bill
                    </Button>
                </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total Purchases"
                    value={formatCurrency(customer.totalPurchases)}
                    sub="Lifetime spend"
                    color="text-blue-600"
                />
                <StatCard
                    label="Outstanding"
                    value={customer.outstanding > 0 ? formatCurrency(customer.outstanding) : '₹0'}
                    sub={customer.outstanding > 0 ? 'Unpaid balance' : 'All clear'}
                    color={customer.outstanding > 0 ? 'text-red-600' : 'text-green-600'}
                />
                <StatCard
                    label="Credit Limit"
                    value={customer.creditLimit > 0 ? formatCurrency(customer.creditLimit) : 'No limit'}
                    sub={customer.creditLimit > 0 ? `${creditUsedPct.toFixed(0)}% used` : undefined}
                    color="text-amber-600"
                />
                <StatCard
                    label="Fixed Discount"
                    value={`${customer.fixedDiscount}%`}
                    sub="On all purchases"
                    color="text-emerald-600"
                />
            </div>

            {/* Credit bar */}
            {customer.creditLimit > 0 && customer.outstanding > 0 && (
                <div className="bg-white rounded-xl border p-4">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                        <span>Credit used: {formatCurrency(customer.outstanding)}</span>
                        <span>Limit: {formatCurrency(customer.creditLimit)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                            className={cn('h-full rounded-full transition-all',
                                creditUsedPct > 80 ? 'bg-red-500'
                                : creditUsedPct > 50 ? 'bg-amber-500'
                                : 'bg-green-500'
                            )}
                            style={{ width: `${creditUsedPct}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Profile details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Phone className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-semibold text-slate-700">Contact</span>
                        </div>
                        <DetailRow label="Phone" value={customer.phone} />
                        <DetailRow label="Address" value={customer.address} />
                        <DetailRow
                            label="Date of Birth"
                            value={customer.dob ? format(new Date(customer.dob), 'dd MMM yyyy') : null}
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-semibold text-slate-700">Business & Credit</span>
                        </div>
                        <DetailRow label="GSTIN" value={customer.gstin
                            ? <span className="font-mono text-xs">{customer.gstin}</span>
                            : null}
                        />
                        <DetailRow label="Credit Limit" value={customer.creditLimit > 0 ? formatCurrency(customer.creditLimit) : 'None'} />
                        <DetailRow label="Fixed Discount" value={`${customer.fixedDiscount}%`} />
                        <DetailRow
                            label="Status"
                            value={
                                <span className={cn(
                                    'text-xs font-medium px-2 py-0.5 rounded-full',
                                    customer.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                )}>
                                    {customer.isActive ? 'Active' : 'Inactive'}
                                </span>
                            }
                        />
                        <DetailRow
                            label="Registered on"
                            value={format(new Date(customer.createdAt), 'dd MMM yyyy')}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Invoice History */}
            <InvoiceHistory customerId={id} />

            {/* Edit form sheet */}
            <CustomerForm
                open={editOpen}
                onClose={() => setEditOpen(false)}
                customer={customer as Customer}
            />
        </div>
    );
}
