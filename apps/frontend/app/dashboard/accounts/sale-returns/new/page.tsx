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
import { voucherApi, customersApi } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

interface ItemRow {
    id: string;
    saleItemId?: string;
    batchId: string;
    productName: string;
    qtyStrips: string;
    qtyLoose: string;
    packSize: number;
    rate: string;
    gstRate: string;
    total: number;
    maxTotalUnits?: number;
}

function newItem(): ItemRow {
    return { id: Math.random().toString(36).slice(2), batchId: '', productName: '', qtyStrips: '0', qtyLoose: '0', packSize: 1, rate: '', gstRate: '12', total: 0 };
}

function calcTotal(qtyStrips: string, qtyLoose: string, rate: string, packSize: number) {
    const qs = parseFloat(qtyStrips) || 0;
    const ql = parseFloat(qtyLoose) || 0;
    const r = parseFloat(rate) || 0;
    const ps = packSize || 1;
    // Rate is inclusive of GST in Sales
    const totalFractionalStrips = qs + (ql / ps);
    return totalFractionalStrips * r;
}

export default function NewCreditNotePage() {
    const outletId = useOutletId();
    const router = useRouter();
    const { toast } = useToast();

    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [customers, setCustomers] = useState<any[]>([]);
    const [customerId, setCustomerId] = useState('');
    const [reason, setReason] = useState('');
    const [refundMode, setRefundMode] = useState<'cash' | 'adjust'>('cash');
    const [items, setItems] = useState<ItemRow[]>([newItem()]);
    const [saving, setSaving] = useState(false);
    const [originalSaleId, setOriginalSaleId] = useState('');
    
    // Invoice search state
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoiceResults, setInvoiceResults] = useState<any[]>([]);
    const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!outletId) return;
        customersApi.list(outletId).then(setCustomers).catch(() => {});
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
            const results = await voucherApi.searchSaleInvoices(outletId, q);
            setInvoiceResults(results);
            setShowInvoiceDropdown(results.length > 0);
        } catch {
            setInvoiceResults([]);
        } finally {
            setSearchLoading(false);
        }
    }

    function handleSelectInvoice(inv: any) {
        if (inv.customerId) setCustomerId(inv.customerId);
        setOriginalSaleId(inv.id);
        setInvoiceSearch(`${inv.invoiceNo} — ${inv.customerName}`);
        setShowInvoiceDropdown(false);
        if (inv.items && inv.items.length > 0) {
            setItems(inv.items.map((item: any) => ({
                id: Math.random().toString(36).slice(2),
                // THE FIX: Properly extract the batch ID from the API response
                saleItemId: item.id,
                batchId: item.batchId || item.batch_id || item.batch?.id || '', 
                productName: item.productName,
                qtyStrips: String(item.qtyStrips || 0),
                qtyLoose: String(item.qtyLoose || 0),
                packSize: item.packSize || 1,
                rate: String(item.rate),
                gstRate: String(item.gstRate),
                maxTotalUnits: (item.qtyStrips || 0) * (item.packSize || 1) + (item.qtyLoose || 0),
                total: calcTotal(String(item.qtyStrips || 0), String(item.qtyLoose || 0), String(item.rate), item.packSize || 1),
            })));
        }
    }

    function updateItem(id: string, field: keyof ItemRow, value: string) {
        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;
                const updated = { ...item, [field]: value };
                
                // Enforce max total units limit
                if (item.maxTotalUnits !== undefined && (field === 'qtyStrips' || field === 'qtyLoose')) {
                    const enteredStrips = parseFloat(field === 'qtyStrips' ? value : updated.qtyStrips) || 0;
                    const enteredLoose = parseFloat(field === 'qtyLoose' ? value : updated.qtyLoose) || 0;
                    const totalUnitsEntered = enteredStrips * updated.packSize + enteredLoose;
                    
                    if (totalUnitsEntered > item.maxTotalUnits) {
                        toast({ variant: 'destructive', title: 'Exceeds original invoice quantity!' });
                        return item; // Revert strictly
                    }
                }
                
                updated.total = calcTotal(
                    updated.qtyStrips,
                    updated.qtyLoose,
                    field === 'rate' ? value : updated.rate,
                    updated.packSize
                );
                return updated;
            })
        );
    }

    const totalAmount = items.reduce((s, i) => {
        const qs = parseFloat(i.qtyStrips) || 0;
        const ql = parseFloat(i.qtyLoose) || 0;
        const r = parseFloat(i.rate) || 0;
        const ps = i.packSize || 1;
        const totalFractionalStrips = qs + (ql / ps);
        return s + (totalFractionalStrips * r);
    }, 0);

    const gstAmount = items.reduce((s, i) => {
        const qs = parseFloat(i.qtyStrips) || 0;
        const ql = parseFloat(i.qtyLoose) || 0;
        const r = parseFloat(i.rate) || 0;
        const g = parseFloat(i.gstRate) || 0;
        const ps = i.packSize || 1;
        const totalFractionalStrips = qs + (ql / ps);
        const totalIncGst = totalFractionalStrips * r;
        const base = g > 0 ? (totalIncGst * 100) / (100 + g) : totalIncGst;
        return s + (totalIncGst - base);
    }, 0);

    const subtotal = totalAmount - gstAmount;

    async function handleSave() {
        if (!outletId) return;
        
        // Safety check: Ensure an invoice was actually selected
        if (!originalSaleId) {
            toast({ variant: 'destructive', title: 'Please search and select an original invoice' });
            return;
        }

        if (!reason.trim()) {
            toast({ variant: 'destructive', title: 'Enter a reason for return' });
            return;
        }
        
        const validItems = items.filter((i) => i.productName && (parseFloat(i.qtyStrips) > 0 || parseFloat(i.qtyLoose) > 0) && i.rate);
        if (validItems.length === 0) {
            toast({ variant: 'destructive', title: 'Add at least one item with quantity' });
            return;
        }

        setSaving(true);
        try {
            // Build the exact payload for the Strip Builder
            const payload = {
                outletId: outletId,
                originalSaleId: originalSaleId, 
                returnDate: date,          
                refundMode: refundMode,    
                reason: reason,
                items: validItems.map((i) => {
                    const totalUnits = (parseFloat(i.qtyStrips) || 0) * (i.packSize || 1) + (parseFloat(i.qtyLoose) || 0);
                    return {
                        saleItemId: i.saleItemId, 
                        batchId: i.batchId,       
                        qtyReturned: totalUnits, // Sends total units
                        returnRate: parseFloat(i.rate),
                    };
                }),
            };

            // MAGIC HAPPENS HERE: We use your app's built-in API tool!
            await voucherApi.createSalesReturn(payload);

            toast({ title: 'Return Successful', description: 'Stock has been built and restored to the shelf!' });
            router.push('/dashboard/accounts/sale-returns');
            
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to save', description: err?.response?.data?.detail || err.message || String(err) });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/dashboard/accounts/sale-returns">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-xl font-bold">New Sale Return</h1>
                    <p className="text-sm text-muted-foreground">Create a credit note to accept returned goods from customer</p>
                </div>
            </div>

            <Separator />

            {/* Invoice Search */}
            <div className="space-y-1.5" ref={dropdownRef}>
                <Label>Search Original Sale Invoice (optional)</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder="Search Sale Invoice No. or Customer name..."
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
                                            <span className="text-xs text-muted-foreground ml-2">{inv.customerName}</span>
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
                    <Label>Customer <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <select
                        value={customerId}
                        onChange={(e) => setCustomerId(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                        <option value="">Walk-in / Anonymous</option>
                        {customers.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Items Table */}
            <div className="space-y-2">
                <Label>Items Being Returned</Label>
                <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product Name</th>
                                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Strips</th>
                                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Loose</th>
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
                                            placeholder="Strips"
                                            value={item.qtyStrips}
                                            onChange={(e) => updateItem(item.id, 'qtyStrips', e.target.value)}
                                            className="text-right border-0 shadow-none focus-visible:ring-0"
                                        />
                                    </td>
                                    <td className="px-2 py-1">
                                        <Input
                                            type="number" min="0" step="1"
                                            placeholder="Loose"
                                            value={item.qtyLoose}
                                            onChange={(e) => updateItem(item.id, 'qtyLoose', e.target.value)}
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
                    placeholder="e.g. Wrong product dispensed, customer returned unused medicine..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />
            </div>

            {/* Refund Mode */}
            <div className="space-y-1.5">
                <Label>Refund Mode</Label>
                <div className="flex gap-3">
                    {[
                        { value: 'cash', label: 'Cash Refund' },
                        { value: 'adjust', label: 'Adjust Against Outstanding' },
                    ].map((m) => (
                        <button
                            key={m.value}
                            type="button"
                            onClick={() => setRefundMode(m.value as any)}
                            className={cn(
                                'flex-1 rounded-md border py-2 text-sm font-medium transition-colors',
                                refundMode === m.value
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:border-primary/30'
                            )}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
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
                    <Link href="/dashboard/accounts/sale-returns">Cancel</Link>
                </Button>
            </div>
        </div>
    );
}
