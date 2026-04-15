'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
    ArrowLeft, Search, X, Eye, ShoppingCart, Receipt,
    CreditCard, FileText, RefreshCw, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { voucherApi, purchasesApi } from '@/lib/apiClient';
import { LedgerStatement, LedgerTransaction, PurchaseInvoiceFull, Voucher } from '@/types';
import { cn } from '@/lib/utils';
import { PurchaseDetailModal } from '@/components/purchases/PurchaseDetailModal';
import { useOutletId } from '@/hooks/useOutletId';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INR = (n: number) =>
    '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SourceType = 'PURCHASE' | 'SALE' | 'VOUCHER' | 'RETURN' | 'CREDIT_PAYMENT' | 'PURCHASE_PAYMENT' | string;

function txTypeLabel(sourceType: SourceType, voucherType?: string): string {
    switch (sourceType) {
        case 'PURCHASE':         return 'Purchase';
        case 'SALE':             return 'Sale';
        case 'RETURN':           return 'Return';
        case 'CREDIT_PAYMENT':   return 'Receipt';
        case 'PURCHASE_PAYMENT': return 'Payment';
        case 'VOUCHER':
            if (voucherType === 'receipt') return 'Receipt';
            if (voucherType === 'payment') return 'Payment';
            if (voucherType === 'contra')  return 'Contra';
            return 'Journal';
        default: return voucherType ?? 'Entry';
    }
}

function txColor(sourceType: SourceType): string {
    switch (sourceType) {
        case 'PURCHASE':         return 'bg-purple-100 text-purple-700 border-purple-200';
        case 'SALE':             return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        case 'RETURN':           return 'bg-orange-100 text-orange-700 border-orange-200';
        case 'CREDIT_PAYMENT':
        case 'PURCHASE_PAYMENT': return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'VOUCHER':          return 'bg-slate-100 text-slate-600 border-slate-200';
        default:                 return 'bg-slate-100 text-slate-600 border-slate-200';
    }
}

function txIcon(sourceType: SourceType) {
    switch (sourceType) {
        case 'PURCHASE': return <ShoppingCart className="h-3 w-3" />;
        case 'SALE':     return <TrendingUp className="h-3 w-3" />;
        case 'RETURN':   return <RefreshCw className="h-3 w-3" />;
        case 'CREDIT_PAYMENT':
        case 'PURCHASE_PAYMENT': return <CreditCard className="h-3 w-3" />;
        case 'VOUCHER':  return <FileText className="h-3 w-3" />;
        default:         return <Minus className="h-3 w-3" />;
    }
}

// ─── Voucher Detail Modal ─────────────────────────────────────────────────────

function VoucherDetailModal({
    open,
    onOpenChange,
    voucherId,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    voucherId: string;
}) {
    const [data, setData] = useState<Voucher | null>(null);
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (!open || !voucherId) return;
        setLoading(true);
        voucherApi.getVoucherById(voucherId)
            .then(setData)
            .catch(() => {
                toast({ variant: 'destructive', title: 'Could not load voucher details' });
                setData(null);
            })
            .finally(() => setLoading(false));
    }, [open, voucherId]);

    const typeLabels: Record<string, string> = {
        receipt: 'Receipt', payment: 'Payment', contra: 'Contra', journal: 'Journal',
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-500" />
                        Voucher Details
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-12 text-slate-400">
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…
                    </div>
                ) : !data ? (
                    <p className="py-8 text-center text-sm text-slate-400">No data found.</p>
                ) : (
                    <div className="space-y-4 text-sm">
                        {/* Header info */}
                        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
                            <div>
                                <p className="text-xs text-slate-400 uppercase tracking-wide">Voucher No</p>
                                <p className="font-mono font-semibold text-slate-800">{data.voucherNo}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 uppercase tracking-wide">Type</p>
                                <Badge variant="outline" className="mt-0.5">
                                    {typeLabels[data.voucherType] ?? data.voucherType}
                                </Badge>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 uppercase tracking-wide">Date</p>
                                <p className="font-semibold">{format(new Date(data.date), 'dd MMM yyyy')}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 uppercase tracking-wide">Total</p>
                                <p className="font-semibold text-emerald-700">{INR(data.totalAmount)}</p>
                            </div>
                            {data.narration && (
                                <div className="col-span-2">
                                    <p className="text-xs text-slate-400 uppercase tracking-wide">Narration</p>
                                    <p className="text-slate-700">{data.narration}</p>
                                </div>
                            )}
                        </div>

                        {/* Lines */}
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Ledger Entries
                            </p>
                            <div className="overflow-hidden rounded-lg border">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-slate-500">Ledger</th>
                                            <th className="px-3 py-2 text-right font-medium text-slate-500">Dr</th>
                                            <th className="px-3 py-2 text-right font-medium text-slate-500">Cr</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {data.lines?.map((line, i) => (
                                            <tr key={i} className="hover:bg-slate-50/50">
                                                <td className="px-3 py-2 text-slate-700">
                                                    <div>{line.ledgerName}</div>
                                                    {line.description && (
                                                        <div className="text-slate-400">{line.description}</div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono">
                                                    {line.debit > 0 ? (
                                                        <span className="text-red-600 font-medium">{INR(line.debit)}</span>
                                                    ) : '—'}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono">
                                                    {line.credit > 0 ? (
                                                        <span className="text-emerald-600 font-medium">{INR(line.credit)}</span>
                                                    ) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LedgerStatementPage() {
    const { id } = useParams<{ id: string }>();
    const outletId = useOutletId();
    const { toast } = useToast();

    const [statement, setStatement] = useState<LedgerStatement | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Date filter — default: 1st of current FY to today
    const [from, setFrom] = useState(() => {
        const now = new Date();
        const fyStart = now.getMonth() >= 3
            ? `${now.getFullYear()}-04-01`
            : `${now.getFullYear() - 1}-04-01`;
        return fyStart;
    });
    const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));

    // Preview state
    const [previewPurchaseId, setPreviewPurchaseId] = useState<string | null>(null);
    const [previewPurchaseInvoice, setPreviewPurchaseInvoice] = useState<PurchaseInvoiceFull | null>(null);
    const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
    const [purchaseLoading, setPurchaseLoading] = useState(false);

    const [voucherModalOpen, setVoucherModalOpen] = useState(false);
    const [previewVoucherId, setPreviewVoucherId] = useState('');

    function load() {
        if (!id) return;
        setLoading(true);
        voucherApi
            .getLedgerStatement(id, from, to)
            .then(setStatement)
            .catch(() => toast({ variant: 'destructive', title: 'Failed to load statement' }))
            .finally(() => setLoading(false));
    }

    useEffect(() => { load(); }, [id]);

    // ── Filtered transactions ─────────────────────────────────────────────────
    const filtered = useMemo(() => {
        if (!statement) return [];
        const q = search.toLowerCase().trim();
        if (!q) return statement.transactions;
        return statement.transactions.filter((tx) =>
            tx.description?.toLowerCase().includes(q) ||
            tx.voucherNo?.toLowerCase().includes(q) ||
            tx.voucherType?.toLowerCase().includes(q) ||
            txTypeLabel(tx.sourceType, tx.voucherType).toLowerCase().includes(q)
        );
    }, [statement, search]);

    // ── Row click handler ─────────────────────────────────────────────────────
    async function handleRowClick(tx: LedgerTransaction) {
        if (!tx.sourceId) return;

        if (tx.sourceType === 'PURCHASE') {
            setPurchaseLoading(true);
            setPurchaseModalOpen(true);
            try {
                const inv = await purchasesApi.getById(tx.sourceId, outletId ?? undefined);
                setPreviewPurchaseInvoice(inv);
            } catch {
                toast({ variant: 'destructive', title: 'Could not load purchase invoice' });
                setPurchaseModalOpen(false);
            } finally {
                setPurchaseLoading(false);
            }
            return;
        }

        if (tx.sourceType === 'VOUCHER') {
            setPreviewVoucherId(tx.sourceId);
            setVoucherModalOpen(true);
            return;
        }

        // For SALE / RETURN etc — just show a toast for now (can extend)
        toast({ title: `${txTypeLabel(tx.sourceType)} — ${tx.description}` });
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const totalDebit  = statement?.transactions.reduce((s, t) => s + t.debit, 0)  ?? 0;
    const totalCredit = statement?.transactions.reduce((s, t) => s + t.credit, 0) ?? 0;

    return (
        <>
        <div className="space-y-5">
            {/* ── Breadcrumb header ── */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" asChild className="rounded-full">
                    <Link href="/dashboard/accounts/ledgers">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-slate-900">
                        {statement?.ledger.name ?? 'Ledger Statement'}
                    </h1>
                    {statement && (
                        <p className="text-sm text-slate-500">
                            {statement.ledger.groupName} · {statement.ledger.nature}
                        </p>
                    )}
                </div>
            </div>

            <Separator />

            {/* ── Filter bar ── */}
            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                    <Label className="text-xs text-slate-500">From</Label>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40 text-sm" />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs text-slate-500">To</Label>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40 text-sm" />
                </div>
                <Button onClick={load} disabled={loading} variant="outline" className="h-9">
                    {loading ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Apply Filter
                </Button>

                {/* Search */}
                <div className="relative ml-auto w-64">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                        className="h-9 pl-9 pr-8 text-sm"
                        placeholder="Search entries…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                    <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                    Loading statement…
                </div>
            ) : !statement ? null : (
                <>
                    {/* ── Summary Cards ── */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border bg-white p-4 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Opening Balance</p>
                            <p className="mt-1 text-xl font-bold text-slate-800">
                                {INR(statement.openingBalance)}
                            </p>
                        </div>
                        <div className="rounded-xl border bg-white p-4 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Transactions</p>
                            <div className="mt-1 flex items-baseline gap-3">
                                <p className="text-xl font-bold text-slate-800">{statement.transactions.length}</p>
                                {search && filtered.length !== statement.transactions.length && (
                                    <span className="text-sm text-slate-400">({filtered.length} shown)</span>
                                )}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-400">
                                Dr: {INR(totalDebit)} &nbsp;·&nbsp; Cr: {INR(totalCredit)}
                            </p>
                        </div>
                        <div className="rounded-xl border bg-white p-4 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Closing Balance</p>
                            <div className="mt-1 flex items-baseline gap-2">
                                <p className={cn(
                                    'text-xl font-bold',
                                    statement.closingBalance < 0 ? 'text-red-600' : 'text-slate-800'
                                )}>
                                    {INR(statement.closingBalance)}
                                </p>
                                <span className="text-sm font-medium text-slate-400">
                                    {statement.closingBalance >= 0
                                        ? statement.ledger.balanceType
                                        : (statement.ledger.balanceType === 'Dr' ? 'Cr' : 'Dr')}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ── Transactions Table ── */}
                    {filtered.length === 0 ? (
                        <div className="rounded-xl border bg-white py-16 text-center">
                            <Search className="mx-auto mb-3 h-8 w-8 text-slate-200" />
                            <p className="text-sm text-slate-400">
                                {search ? `No entries match "${search}"` : 'No transactions in this period'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-slate-50">
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Voucher</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Description</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Debit</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Credit</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Balance</th>
                                        <th className="w-10 px-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {/* Opening row */}
                                    <tr className="bg-slate-50/60">
                                        <td className="px-4 py-2.5 text-xs text-slate-400">—</td>
                                        <td className="px-4 py-2.5">
                                            <span className="inline-flex items-center gap-1 rounded border bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                                                Opening
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-slate-400" />
                                        <td className="px-4 py-2.5 text-xs text-slate-400" />
                                        <td className="px-4 py-2.5 text-right" />
                                        <td className="px-4 py-2.5 text-right" />
                                        <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-slate-700">
                                            {INR(statement.openingBalance)}
                                        </td>
                                        <td />
                                    </tr>

                                    {filtered.map((tx, i) => {
                                        const clickable = !!tx.sourceId;
                                        return (
                                            <tr
                                                key={i}
                                                onClick={() => clickable && handleRowClick(tx)}
                                                className={cn(
                                                    'group transition-colors',
                                                    clickable
                                                        ? 'cursor-pointer hover:bg-indigo-50/50'
                                                        : 'hover:bg-slate-50/60'
                                                )}
                                            >
                                                <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                                                    {format(new Date(tx.date), 'dd MMM yy')}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={cn(
                                                        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium',
                                                        txColor(tx.sourceType)
                                                    )}>
                                                        {txIcon(tx.sourceType)}
                                                        {txTypeLabel(tx.sourceType, tx.voucherType)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                                    {tx.voucherNo || '—'}
                                                </td>
                                                <td className="max-w-xs px-4 py-3 text-sm text-slate-700">
                                                    <span className="line-clamp-2">{tx.description || '—'}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-sm">
                                                    {tx.debit > 0
                                                        ? <span className="font-medium text-red-600">{INR(tx.debit)}</span>
                                                        : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-sm">
                                                    {tx.credit > 0
                                                        ? <span className="font-medium text-emerald-600">{INR(tx.credit)}</span>
                                                        : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-slate-800">
                                                    {INR(tx.balance)}
                                                </td>
                                                <td className="px-2 py-3 text-center">
                                                    {clickable && (
                                                        <span className="hidden group-hover:inline-flex items-center justify-center rounded-full p-1 text-indigo-400 hover:bg-indigo-100">
                                                            <Eye className="h-3.5 w-3.5" />
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>

                                {/* Footer totals */}
                                <tfoot className="border-t bg-slate-50">
                                    <tr>
                                        <td colSpan={4} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            Totals {search && `(${filtered.length} of ${statement.transactions.length})`}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-sm font-bold text-red-600">
                                            {INR(filtered.reduce((s, t) => s + t.debit, 0))}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-sm font-bold text-emerald-600">
                                            {INR(filtered.reduce((s, t) => s + t.credit, 0))}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-sm font-bold text-slate-800">
                                            {INR(statement.closingBalance)}
                                        </td>
                                        <td />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>

        {/* ── Purchase Invoice Preview Modal ── */}
        {purchaseLoading && purchaseModalOpen && (
            <Dialog open onOpenChange={() => setPurchaseModalOpen(false)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Loading…</DialogTitle></DialogHeader>
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
                    </div>
                </DialogContent>
            </Dialog>
        )}
        {!purchaseLoading && (
            <PurchaseDetailModal
                open={purchaseModalOpen}
                onOpenChange={setPurchaseModalOpen}
                invoice={previewPurchaseInvoice}
            />
        )}

        {/* ── Voucher Preview Modal ── */}
        <VoucherDetailModal
            open={voucherModalOpen}
            onOpenChange={setVoucherModalOpen}
            voucherId={previewVoucherId}
        />
        </>
    );
}
