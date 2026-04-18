'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Plus, Trash2, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useOutletId } from '@/hooks/useOutletId';
import { voucherApi, distributorsApi } from '@/lib/apiClient';
import { Distributor } from '@/types';

interface ItemRow {
    id: string;
    batchId: string;
    productName: string;
    qty: string;
    rate: string;
    gstRate: string;
    total: number;
    maxQty?: number;
}

function newItem(): ItemRow {
    return { id: Math.random().toString(36).slice(2), batchId: '', productName: '', qty: '', rate: '', gstRate: '12', total: 0 };
}

function calcTotal(qty: string, rate: string, gstRate: string) {
    const q = parseFloat(qty) || 0;
    const r = parseFloat(rate) || 0;
    const g = parseFloat(gstRate) || 0;
    const base = q * r;
    return base + (base * g) / 100;
}

export default function NewDebitNotePage() {
    const outletId = useOutletId();
    const router = useRouter();
    const { toast } = useToast();

    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [distributors, setDistributors] = useState<Distributor[]>([]);
    const [distributorId, setDistributorId] = useState('');
    const [reason, setReason] = useState('');
    const [items, setItems] = useState<ItemRow[]>([newItem()]);
    const [saving, setSaving] = useState(false);

    // Invoice search state
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoiceResults, setInvoiceResults] = useState<any[]>([]);
    const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!outletId) return;
        distributorsApi.list(outletId).then(setDistributors).catch(() => {});
    }, [outletId]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowInvoiceDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    async function handleInvoiceSearch(q: string) {
        setInvoiceSearch(q);
        if (!q.trim() || !outletId) {
            setInvoiceResults([]);
            setShowInvoiceDropdown(false);
            return;
        }
        setSearchLoading(true);
        try {
            const results = await voucherApi.searchPurchaseInvoices(outletId, q);
            setInvoiceResults(results);
            setShowInvoiceDropdown(results.length > 0);
        } catch {
            setInvoiceResults([]);
        } finally {
            setSearchLoading(false);
        }
    }

    function handleSelectInvoice(inv: any) {
        setDistributorId(inv.distributorId);
        setInvoiceSearch(`${inv.invoiceNo} — ${inv.distributorName}`);
        setShowInvoiceDropdown(false);
        if (inv.items && inv.items.length > 0) {
            setItems(inv.items.map((item: any) => {
                const maxAllowed = item.availableQty !== undefined 
                    ? Math.min(Number(item.qty), Number(item.availableQty)) 
                    : Number(item.qty);
                    
                return {
                    id: Math.random().toString(36).slice(2),
                    batchId: item.batchId || '',
                    productName: item.productName,
                    qty: String(maxAllowed),
                    rate: String(item.rate),
                    gstRate: String(item.gstRate),
                    maxQty: maxAllowed,
                    total: calcTotal(String(maxAllowed), String(item.rate), String(item.gstRate)),
                };
            }));
        }
    }

    function updateItem(id: string, field: keyof ItemRow, value: string) {
        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;
                const updated = { ...item, [field]: value };
                // Enforce max qty from original invoice
                if (field === 'qty' && item.maxQty !== undefined) {
                    const entered = parseFloat(value) || 0;
                    if (entered > item.maxQty) updated.qty = String(item.maxQty);
                }
                updated.total = calcTotal(
                    field === 'qty' ? updated.qty : updated.qty,
                    field === 'rate' ? value : updated.rate,
                    field === 'gstRate' ? value : updated.gstRate
                );
                return updated;
            })
        );
    }

    const subtotal = items.reduce((s, i) => {
        const q = parseFloat(i.qty) || 0;
        const r = parseFloat(i.rate) || 0;
        return s + q * r;
    }, 0);
    const gstAmount = items.reduce((s, i) => {
        const base = (parseFloat(i.qty) || 0) * (parseFloat(i.rate) || 0);
        return s + base * ((parseFloat(i.gstRate) || 0) / 100);
    }, 0);
    const totalAmount = subtotal + gstAmount;

    async function handleSave() {
        if (!outletId || !distributorId) {
            toast({ variant: 'destructive', title: 'Select a distributor' });
            return;
        }
        if (!reason.trim()) {
            toast({ variant: 'destructive', title: 'Enter a reason' });
            return;
        }
        const validItems = items.filter((i) => i.productName && i.qty && i.rate);
        if (validItems.length === 0) {
            toast({ variant: 'destructive', title: 'Add at least one item' });
            return;
        }

        setSaving(true);
        try {
            await voucherApi.createDebitNote({
                outletId,
                date,
                distributor_id: distributorId,
                reason,
                subtotal,
                gst_amount: gstAmount,
                total_amount: totalAmount,
                items: validItems.map((i) => ({
                    batch_id: i.batchId || '00000000-0000-0000-0000-000000000000',
                    product_name: i.productName,
                    qty: parseFloat(i.qty),
                    rate: parseFloat(i.rate),
                    gst_rate: parseFloat(i.gstRate) || 0,
                    total: i.total,
                })),
            });
            toast({ title: 'Debit note created', description: 'Stock has been restored' });
            router.push('/dashboard/accounts/purchase-returns');
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to save', description: err?.detail || String(err) });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/dashboard/accounts/purchase-returns">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-xl font-bold">New Purchase Return</h1>
                    <p className="text-sm text-muted-foreground">Create a debit note to return goods to supplier</p>
                </div>
            </div>

            <Separator />

            {/* Invoice Search */}
            <div className="space-y-1.5" ref={dropdownRef}>
                <Label>Search Original Purchase Invoice (optional)</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder="Search Purchase Invoice No. or Distributor name..."
                        value={invoiceSearch}
                        onChange={(e) => handleInvoiceSearch(e.target.value)}
                        onFocus={() => invoiceResults.length > 0 && setShowInvoiceDropdown(true)}
                    />
                    {searchLoading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {showInvoiceDropdown && invoiceResults.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg max-h-60 overflow-y-auto">
                            {invoiceResults.map((inv: any) => (
                                <button
                                    key={inv.id}
                                    type="button"
                                    onClick={() => handleSelectInvoice(inv)}
                                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-0"
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className="font-medium text-sm">{inv.invoiceNo}</span>
                                            <span className="text-xs text-muted-foreground ml-2">{inv.distributorName}</span>
                                        </div>
                                        <div className="text-right text-xs text-muted-foreground">
                                            <div>{inv.date}</div>
                                            <div className="font-medium text-slate-700">₹{inv.grandTotal?.toFixed(2)}</div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label>Distributor / Supplier</Label>
                    <select
                        value={distributorId}
                        onChange={(e) => setDistributorId(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                        <option value="">Select distributor...</option>
                        {distributors.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Items Table */}
            <div className="space-y-2">
                <Label>Items</Label>
                <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product Name</th>
                                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Qty</th>
                                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-24">Rate ₹</th>
                                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">GST %</th>
                                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Total ₹</th>
                                <th className="px-3 py-2 w-10" />
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.map((item) => (
                                <tr key={item.id}>
                                    <td className="px-2 py-1">
                                        <Input
                                            placeholder="Product name"
                                            value={item.productName}
                                            onChange={(e) => updateItem(item.id, 'productName', e.target.value)}
                                            className="border-0 shadow-none focus-visible:ring-0"
                                        />
                                    </td>
                                    <td className="px-2 py-1">
                                        <Input
                                            type="number" min="0" step="1"
                                            placeholder={item.maxQty ? `max ${item.maxQty}` : '0'}
                                            value={item.qty}
                                            onChange={(e) => updateItem(item.id, 'qty', e.target.value)}
                                            className="text-right border-0 shadow-none focus-visible:ring-0"
                                        />
                                    </td>
                                    <td className="px-2 py-1">
                                        <Input
                                            type="number" min="0" step="0.01" placeholder="0.00"
                                            value={item.rate}
                                            onChange={(e) => updateItem(item.id, 'rate', e.target.value)}
                                            className="text-right border-0 shadow-none focus-visible:ring-0"
                                        />
                                    </td>
                                    <td className="px-2 py-1">
                                        <Input
                                            type="number" min="0" step="1" placeholder="0"
                                            value={item.gstRate}
                                            onChange={(e) => updateItem(item.id, 'gstRate', e.target.value)}
                                            className="text-right border-0 shadow-none focus-visible:ring-0"
                                        />
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium">
                                        ₹{item.total.toFixed(2)}
                                    </td>
                                    <td className="px-2 py-1">
                                        <button
                                            type="button"
                                            onClick={() => setItems((p) => p.filter((i) => i.id !== item.id))}
                                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <button
                    type="button"
                    onClick={() => setItems((p) => [...p, newItem()])}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                    <Plus className="h-3.5 w-3.5" /> Add item
                </button>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
                <Label>Reason for Return</Label>
                <Textarea
                    rows={2}
                    placeholder="e.g. Damaged packaging, expired batch, wrong product..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-muted/30 p-4 space-y-2 text-sm max-w-xs ml-auto">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">GST</span>
                    <span>₹{gstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-base border-t pt-2">
                    <span>Total</span>
                    <span>₹{totalAmount.toFixed(2)}</span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save &amp; Return Stock
                </Button>
                <Button variant="outline" asChild disabled={saving}>
                    <Link href="/dashboard/accounts/purchase-returns">Cancel</Link>
                </Button>
            </div>
        </div>
    );
}
