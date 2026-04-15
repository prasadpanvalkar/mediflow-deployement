'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, addDays, differenceInDays } from 'date-fns';
import { Plus, AlertTriangle, Save, X, FileText, Truck, Calculator, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// Note: Select still used for Purchase Type / Godown dropdowns
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useCreatePurchase } from '@/hooks/usePurchases';
import { LedgerPicker } from '@/components/accounts/LedgerPicker';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { PurchaseItemRow } from './PurchaseItemRow';
import { AddNewProductDrawer } from './AddNewProductDrawer';
import { PurchaseItemFormData, ProductSearchResult, Ledger } from '@/types';
import { useOutletId } from '@/hooks/useOutletId';

// ─── Schema ───────────────────────────────────────────────────────────────────

const itemSchema = z.object({
    productId:       z.string().optional().default(''),
    isCustom:        z.boolean().default(false),
    productName:     z.string().min(1, 'Product name required'),
    hsnCode:         z.string().optional().default(''),
    batchNo:         z.string().min(1, 'Batch required'),
    expiryDate:      z.string().min(1, 'Expiry required'),
    pkg:             z.number().min(1, 'Pkg ≥ 1'),
    qty:             z.number().positive('Qty must be > 0'),
    freeQty:         z.number().min(0),
    purchaseRate:    z.number().positive('Rate must be > 0'),
    discountPct:     z.number().min(0).max(100),
    cashDiscountPct: z.number().min(0).max(100),
    gstRate:         z.number().min(0),
    cess:            z.number().min(0),
    mrp:             z.number().positive('MRP required'),
    ptr:             z.number().min(0),
    pts:             z.number().min(0),
    saleRate:        z.number().positive('Sale rate required'),
});

const schema = z.object({
    partyLedgerId:    z.string().min(1, 'Select a party ledger'),
    purchaseType:     z.enum(['credit', 'cash']),
    invoiceNo:        z.string().min(1, 'Invoice No required'),
    invoiceDate:      z.string(),
    dueDate:          z.string().optional(),
    purchaseOrderRef: z.string().optional(),
    godown:           z.string().optional(),
    freight:          z.number().min(0),
    notes:            z.string().optional(),
    items:            z.array(itemSchema).min(1, 'Add at least one item'),
});

type FormData = z.infer<typeof schema>;

// ─── Constants ────────────────────────────────────────────────────────────────

const GODOWNS   = [
    { value: 'main',         label: 'Main Store' },
    { value: 'cold_storage', label: 'Cold Storage' },
    { value: 'secondary',    label: 'Secondary Store' },
];
const today      = format(new Date(), 'yyyy-MM-dd');
const defaultDue = format(addDays(new Date(), 30), 'yyyy-MM-dd');

export const emptyItem = (): PurchaseItemFormData => ({
    productId: '', productName: '', isCustom: false, hsnCode: '',
    batchNo: '', expiryDate: '',
    pkg: 1, packUnitLabel: '', qty: 0, freeQty: 0,
    purchaseRate: 0, freightPerUnit: 0, otherCostPerUnit: 0, discountPct: 0, cashDiscountPct: 0,
    gstRate: 12, cess: 0,
    mrp: 0, ptr: 0, pts: 0, saleRate: 0,
});

// ─── Helper ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isNearExpiry = (exp: string) =>
    exp ? differenceInDays(new Date(exp), new Date()) < 90 : false;

// ─── Component ───────────────────────────────────────────────────────────────

export function NewPurchaseForm({ onSuccess }: { onSuccess: () => void }) {
    const { toast }   = useToast();
    const outletId    = useOutletId();
    const outlet      = useAuthStore((s) => s.outlet);
    const user        = useAuthStore((s) => s.user);
    const gstType     = useSettingsStore((s) => s.gstType);

    // M5: scope the draft key to this outlet+user so drafts never bleed between
    // staff members or tenants sharing the same browser.
    const draftKey = outlet?.id && user?.id
        ? `purchase_form_draft_${outlet.id}_${user.id}`
        : null;
    const createPurchase = useCreatePurchase();
    const [partyLedger, setPartyLedger] = useState<Ledger | null>(null);

    const [items,             setItems]             = useState<PurchaseItemFormData[]>([emptyItem()]);
    const [hasDraft,          setHasDraft]          = useState(false);
    const [ledgerAdjustment,  setLedgerAdjustment]   = useState<number>(0);
    const [adjustmentSign,    setAdjustmentSign]     = useState<'-' | '+'>('-');
    const [ledgerNote,        setLedgerNote]         = useState<string>('');

    // ── Add-product drawer state ───────────────────────────────────────────────
    const [drawerOpen,        setDrawerOpen]        = useState(false);
    const [drawerInitialName, setDrawerInitialName] = useState('');
    const [activeDrawerRow,   setActiveDrawerRow]   = useState(0);

    const handleOpenAddProduct = (rowIndex: number, name: string) => {
        setActiveDrawerRow(rowIndex);
        setDrawerInitialName(name);
        setDrawerOpen(true);
    };

    const handleSelectProduct = (rowIndex: number, product: ProductSearchResult) => {
        const firstBatch = product.batches?.[0];
        const mrp      = firstBatch?.mrp      ?? product.mrp      ?? 0;
        const saleRate = firstBatch?.saleRate  ?? product.saleRate ?? 0;
        const gstRate  = product.gstRate ?? 0;
        setItems((prev) => prev.map((item, i) => {
            if (i !== rowIndex) return item;
            const newPkg = typeof product.packSize === 'number' && product.packSize > 0 ? product.packSize : 1;
            return {
                ...item,
                productId:   product.id,
                productName: product.name,
                isCustom:    false,
                hsnCode:     product.hsnCode ?? item.hsnCode,
                pkg:         newPkg,
                packUnitLabel: product.packUnit || '',
                gstRate,
                mrp,
                saleRate,
            };
        }));
    };

    const handleProductCreated = (product: ProductSearchResult) => {
        handleSelectProduct(activeDrawerRow, product);
        toast({ title: 'Product added successfully' });
    };

    const {
        register, handleSubmit, setValue, setError,
        watch, reset,
        formState: { errors, isSubmitting, isDirty },
    } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            purchaseType: 'credit',
            invoiceDate:  today,
            dueDate:      defaultDue,
            freight:      0,
            items:        [emptyItem()],
        },
    });

    const watchedPurchaseType = watch('purchaseType');
    const watchedFreight      = watch('freight') ?? 0;

    // ── Draft ────────────────────────────────────────────────────────────────

    useEffect(() => {
        try { if (draftKey && localStorage.getItem(draftKey)) setHasDraft(true); } catch { /* ignore */ }
    }, [draftKey]);

    const restoreDraft = () => {
        if (!draftKey) return;
        try {
            const raw = localStorage.getItem(draftKey);
            if (!raw) return;
            const { formValues, savedItems } = JSON.parse(raw);
            reset(formValues);
            setItems(savedItems);
            setHasDraft(false);
            toast({ title: 'Draft restored ✓' });
        } catch { localStorage.removeItem(draftKey); }
    };

    const saveDraft = useCallback(() => {
        if (!draftKey) return;
        try {
            localStorage.setItem(draftKey, JSON.stringify({ formValues: watch(), savedItems: items }));
            toast({ title: 'Draft saved' });
        } catch { /* ignore */ }
    }, [draftKey, watch, items, toast]);

    // Auto-save every 30 s while dirty
    useEffect(() => {
        if (!isDirty || !draftKey) return;
        const id = setInterval(() => {
            try {
                localStorage.setItem(draftKey, JSON.stringify({ formValues: watch(), savedItems: items }));
            } catch { /* ignore */ }
        }, 30_000);
        return () => clearInterval(id);
    }, [isDirty, draftKey, items, watch]);

    // ── Item handlers ────────────────────────────────────────────────────────

    const handleItemChange = (index: number, field: keyof PurchaseItemFormData, value: string | number) => {
        setItems((prev) => {
            const next = prev.map((item, i) => i === index ? { ...item, [field]: value } : item);
            setValue('items', next);
            return next;
        });
    };

    const handleAddItem = () => {
        setItems((prev) => { const next = [...prev, emptyItem()]; setValue('items', next); return next; });
    };

    const handleRemoveItem = (index: number) => {
        setItems((prev) => {
            const next   = prev.filter((_, i) => i !== index);
            const result = next.length ? next : [emptyItem()];
            setValue('items', result);
            return result;
        });
    };

    // ── Live totals ──────────────────────────────────────────────────────────

    const getEffPkg = (val: any) => typeof val === 'number' && val > 0 ? val : 1;

    const goodsValue     = items.reduce((s, it) => s + it.qty * it.purchaseRate, 0);
    const totalTradeDisc = items.reduce((s, it) => s + it.qty * it.purchaseRate * (it.discountPct / 100), 0);
    const totalCashDisc  = items.reduce((s, it) => {
        const afterTrade = it.qty * it.purchaseRate * (1 - it.discountPct / 100);
        return s + afterTrade * (it.cashDiscountPct / 100);
    }, 0);
    const taxableValue   = goodsValue - totalTradeDisc - totalCashDisc;
    const totalGST       = items.reduce((s, it) => {
        const base = it.qty * it.purchaseRate * (1 - it.discountPct / 100) * (1 - it.cashDiscountPct / 100);
        return s + base * (it.gstRate / 100);
    }, 0);
    const totalCess      = items.reduce((s, it) => {
        const base = it.qty * it.purchaseRate * (1 - it.discountPct / 100) * (1 - it.cashDiscountPct / 100);
        return s + base * (it.cess / 100);
    }, 0);

    const sgst      = gstType === 'intrastate' ? totalGST / 2 : 0;
    const cgst      = gstType === 'intrastate' ? totalGST / 2 : 0;
    const igst      = gstType === 'interstate' ? totalGST     : 0;
    const freight   = Number(watchedFreight) || 0;
    const preRound     = taxableValue + totalGST + totalCess + freight;
    const roundOff     = Math.round(preRound) - preRound;
    const computedTotal = preRound + roundOff;
    
    // + sign means addition (increase bill -> negative payload required for backend minus)
    // - sign means deduction (reduce bill -> positive payload required for backend minus)
    const effectiveAdjustment = ledgerAdjustment * (adjustmentSign === '-' ? 1 : -1);
    const netPayable   = computedTotal - effectiveAdjustment;

    const totalUnits       = items.reduce((s, it) => s + it.qty * getEffPkg(it.pkg), 0);
    const nearExpiryCount  = items.filter((it) => it.expiryDate && isNearExpiry(it.expiryDate)).length;

    // ── Submit ───────────────────────────────────────────────────────────────

    const onSubmit = async (data: FormData) => {
        try {
            const payload = {
                outletId,
                partyLedgerId:    data.partyLedgerId,
                purchaseType:     data.purchaseType,
                invoiceNo:        data.invoiceNo,
                invoiceDate:      data.invoiceDate,
                dueDate:          data.purchaseType === 'credit' ? data.dueDate : undefined,
                purchaseOrderRef: data.purchaseOrderRef,
                godown:           data.godown,
                freight,
                notes:            data.notes,
                subtotal:         parseFloat(goodsValue.toFixed(2)),
                discountAmount:   parseFloat((totalTradeDisc + totalCashDisc).toFixed(2)),
                taxableAmount:    parseFloat(taxableValue.toFixed(2)),
                gstAmount:        parseFloat(totalGST.toFixed(2)),
                cessAmount:       parseFloat(totalCess.toFixed(2)),
                roundOff:          parseFloat(roundOff.toFixed(2)),
                ledgerAdjustment:  parseFloat(effectiveAdjustment.toFixed(2)),
                ledgerNote:        ledgerNote || undefined,
                grandTotal:        parseFloat(netPayable.toFixed(2)),
                items: items.map((it) => {
                    const effPkg     = typeof it.pkg === 'number' && it.pkg > 0 ? it.pkg : 1;
                    const effQty     = it.qty * effPkg;
                    const base       = it.qty * it.purchaseRate * (1 - it.discountPct / 100) * (1 - it.cashDiscountPct / 100);
                    const gstAmount  = base * (it.gstRate / 100);
                    const cessAmount = base * (it.cess / 100);
                    return {
                        masterProductId:   it.isCustom ? null : it.productId,
                        customProductName: it.isCustom ? it.productName : null,
                        isCustomProduct:   it.isCustom ?? false,
                        hsnCode:         it.hsnCode,
                        batchNo:         it.batchNo,
                        expiryDate:      it.expiryDate,
                        pkg:             effPkg,
                        qty:             it.qty,
                        actualQty:       (it.qty + it.freeQty) * effPkg,
                        freeQty:         it.freeQty,
                        purchaseRate:    it.purchaseRate,
                        freightPerUnit:  it.freightPerUnit,
                        otherCostPerUnit: it.otherCostPerUnit,
                        discountPct:     it.discountPct,
                        cashDiscountPct: it.cashDiscountPct,
                        gstRate:         it.gstRate,
                        cess:            it.cess,
                        mrp:             it.mrp,
                        ptr:             it.ptr,
                        pts:             it.pts,
                        saleRate:        it.saleRate,
                        taxableAmount:   parseFloat(base.toFixed(2)),
                        gstAmount:       parseFloat(gstAmount.toFixed(2)),
                        cessAmount:      parseFloat(cessAmount.toFixed(2)),
                        totalAmount:     parseFloat((base + gstAmount + cessAmount).toFixed(2)),
                    };
                }),
            };

            await createPurchase.mutateAsync(payload);
            if (draftKey) localStorage.removeItem(draftKey);
            toast({
                title:       'Purchase saved ✓',
                description: `Invoice ${data.invoiceNo} — ${items.length} item${items.length !== 1 ? 's' : ''}, ${totalUnits} units added to stock.`,
            });
            onSuccess();
        } catch (err: any) {
            const code = err?.error?.code;
            if (code === 'DUPLICATE_INVOICE') {
                setError('invoiceNo', { message: err.error.message });
            } else if (code === 'EMPTY_ITEMS') {
                toast({ variant: 'destructive', title: 'Add at least one item' });
            } else {
                toast({ variant: 'destructive', title: err?.error?.message ?? 'Failed to save purchase' });
            }
        }
    };

    // ─── JSX ─────────────────────────────────────────────────────────────────

    return (
        <>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

            {/* ── Draft banner ────────────────────────────────────────── */}
            {hasDraft && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <FileText className="h-4 w-4 shrink-0 text-amber-600" />
                    <p className="flex-1 text-sm text-amber-800">
                        You have an unsaved draft from a previous session.
                    </p>
                    <Button
                        type="button" size="sm" variant="outline"
                        className="h-7 border-amber-300 text-amber-700 hover:bg-amber-100"
                        onClick={restoreDraft}
                    >
                        Restore
                    </Button>
                    <Button
                        type="button" size="sm" variant="ghost"
                        className="h-7 text-amber-500 hover:text-amber-700"
                        onClick={() => { if (draftKey) localStorage.removeItem(draftKey); setHasDraft(false); }}
                    >
                        Discard
                    </Button>
                </div>
            )}

            {/* ── Near-expiry warning ──────────────────────────────────── */}
            {nearExpiryCount > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500" />
                    <p className="text-sm text-orange-700">
                        <span className="font-semibold">{nearExpiryCount} item{nearExpiryCount > 1 ? 's' : ''}</span> expiring within 90 days — verify with distributor before accepting.
                    </p>
                </div>
            )}

            {/* ── Section A: Invoice Details ───────────────────────────── */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {/* Section header */}
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                    <FileText className="h-4 w-4 text-slate-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Invoice Details
                    </h3>
                </div>

                <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">

                    {/* Party (Sundry Creditor ledger) */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">
                            Party <span className="text-red-500">*</span>
                        </Label>
                        <LedgerPicker
                            group="Sundry Creditors"
                            value={partyLedger}
                            onChange={(l) => {
                                setPartyLedger(l);
                                setValue('partyLedgerId', l?.id ?? '', { shouldValidate: true });
                            }}
                            placeholder="Select party ledger..."
                            className={errors.partyLedgerId ? 'ring-1 ring-red-400 rounded-md' : ''}
                        />
                        {errors.partyLedgerId && (
                            <p className="text-xs text-red-500">{errors.partyLedgerId.message}</p>
                        )}
                    </div>

                    {/* Purchase Type */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">
                            Purchase Type <span className="text-red-500">*</span>
                        </Label>
                        <Select
                            defaultValue="credit"
                            onValueChange={(v) => {
                                setValue('purchaseType', v as 'cash' | 'credit');
                                if (v === 'cash') setValue('dueDate', undefined);
                                else              setValue('dueDate', defaultDue);
                            }}
                        >
                            <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="credit">
                                    <span className="flex items-center gap-2">
                                        Credit
                                        <Badge variant="outline" className="text-[10px] py-0">30 days</Badge>
                                    </span>
                                </SelectItem>
                                <SelectItem value="cash">Cash</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Invoice No */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">
                            Invoice No <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            className={`h-9 text-sm ${errors.invoiceNo ? 'border-red-400' : ''}`}
                            {...register('invoiceNo')}
                            placeholder="e.g. AJD-2026-0123"
                        />
                        {errors.invoiceNo && (
                            <p className="text-xs text-red-500">{errors.invoiceNo.message}</p>
                        )}
                    </div>

                    {/* Invoice Date */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">Invoice Date</Label>
                        <Input className="h-9 text-sm" type="date" {...register('invoiceDate')} />
                    </div>

                    {/* Due Date — hidden for cash */}
                    {watchedPurchaseType !== 'cash' && (
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-slate-600">Due Date</Label>
                            <Input className="h-9 text-sm" type="date" {...register('dueDate')} />
                        </div>
                    )}

                    {/* PO Reference */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">
                            PO Reference
                            <span className="ml-1 font-normal text-slate-400">(optional)</span>
                        </Label>
                        <Input
                            className="h-9 text-sm"
                            {...register('purchaseOrderRef')}
                            placeholder="e.g. PO-2026-009"
                        />
                    </div>

                    {/* Godown */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">Godown / Location</Label>
                        <Select defaultValue="main" onValueChange={(v) => setValue('godown', v)}>
                            <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {GODOWNS.map((g) => (
                                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5 md:col-span-3">
                        <Label className="text-xs font-medium text-slate-600">Notes</Label>
                        <Textarea
                            className="resize-none text-sm"
                            {...register('notes')}
                            rows={2}
                            placeholder="Optional notes about this invoice..."
                        />
                    </div>
                </div>
            </div>

            {/* ── Section B: Items ─────────────────────────────────────── */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
                    <div className="flex items-center gap-2">
                        <Boxes className="h-4 w-4 text-slate-500" />
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Items</h3>
                        <Badge variant="secondary" className="text-[11px]">
                            {items.length} row{items.length !== 1 ? 's' : ''}
                        </Badge>
                        {totalUnits > 0 && (
                            <Badge variant="outline" className="text-[11px] text-slate-500">
                                {totalUnits.toLocaleString('en-IN')} units
                            </Badge>
                        )}
                    </div>
                    <Button
                        type="button" variant="outline" size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={handleAddItem}
                    >
                        <Plus className="h-3 w-3" /> Add Item
                    </Button>
                </div>

                {errors.items && typeof errors.items.message === 'string' && (
                    <p className="mx-5 mt-3 text-xs text-red-500">{errors.items.message}</p>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1280px] text-xs">
                        <thead className="border-b border-slate-100 bg-slate-50/80">
                            <tr>
                                <th className="w-6 px-2 py-2.5 text-center font-medium text-slate-400">#</th>
                                <th className="px-2 py-2.5 text-left font-medium text-slate-500">Product</th>
                                <th className="px-2 py-2.5 text-left font-medium text-slate-500">HSN</th>
                                <th className="px-2 py-2.5 text-left font-medium text-slate-500">Batch</th>
                                <th className="px-2 py-2.5 text-left font-medium text-slate-500">Expiry</th>
                                <th className="px-2 py-2.5 text-right font-medium text-slate-500">Pkg</th>
                                <th className="px-2 py-2.5 text-right font-medium text-slate-500">Qty</th>
                                <th className="px-2 py-2.5 text-right font-medium text-slate-500">Free</th>
                                <th className="px-2 py-2.5 text-right font-medium text-slate-500">Rate</th>
                                <th className="px-2 py-2.5 text-right font-medium text-slate-500">Disc%</th>
                                <th className="px-2 py-2.5 text-right font-medium text-slate-500">GST%</th>
                                <th className="px-2 py-2.5 text-right font-medium text-slate-500">MRP</th>
                                <th className="px-2 py-2.5 text-right font-medium text-slate-500">Sale Rate</th>
                                <th className="px-2 py-2.5 text-right font-medium text-slate-500">Amount</th>
                                <th className="w-7" title="Expand PTR / PTS / CD / Cess" />
                                <th className="w-7" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.map((item, idx) => (
                                <PurchaseItemRow
                                    key={idx}
                                    index={idx}
                                    value={item}
                                    onChange={handleItemChange}
                                    onRemove={handleRemoveItem}
                                    onSelectProduct={handleSelectProduct}
                                    onOpenAddProduct={handleOpenAddProduct}
                                    outletId={outletId}
                                    errors={(errors.items as any)?.[idx]}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Section C: Additional Charges ────────────────────────── */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                    <Truck className="h-4 w-4 text-slate-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Additional Charges
                    </h3>
                </div>
                <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">Freight / Transport (₹)</Label>
                        <Input
                            type="number" step="0.01" min="0"
                            className="h-9 text-sm"
                            placeholder="0.00"
                            {...register('freight', { valueAsNumber: true })}
                        />
                    </div>
                </div>
            </div>

            {/* ── Section D: Ledger Adjustment ────────────────────────── */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-semibold text-slate-700">Ledger Adjustment</p>
                        <p className="text-xs text-slate-400">
                            Apply credit from distributor account (return, advance, write-off)
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select 
                            className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
                            value={adjustmentSign}
                            onChange={(e) => {
                                setAdjustmentSign(e.target.value as '-' | '+');
                                // optionally re-evaluate cap if they switch from + to - 
                                if (e.target.value === '-') setLedgerAdjustment((prev) => Math.min(prev, computedTotal));
                            }}
                        >
                            <option value="-">&minus; (Subtract)</option>
                            <option value="+">+ (Add)</option>
                        </select>
                        <span className="text-sm font-medium text-slate-600">₹</span>
                        <input
                            type="number"
                            min={0}
                            // Only cap at computedTotal if it's a deduction ('-')
                            max={adjustmentSign === '-' ? computedTotal : undefined}
                            step="0.01"
                            className="w-36 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-right text-base font-mono shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="0.00"
                            value={ledgerAdjustment || ''}
                            onChange={(e) => {
                                const val = Math.max(0, parseFloat(e.target.value) || 0);
                                if (adjustmentSign === '-') {
                                    setLedgerAdjustment(Math.min(val, computedTotal));
                                } else {
                                    setLedgerAdjustment(val);
                                }
                            }}
                        />
                    </div>
                </div>

                {ledgerAdjustment > 0 && (
                    <div className="mt-2">
                        <input
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 focus:border-blue-400 focus:outline-none"
                            placeholder="Reason (e.g. Return CN-2024-45, Advance payment)"
                            value={ledgerNote}
                            onChange={(e) => setLedgerNote(e.target.value)}
                        />
                    </div>
                )}
            </div>

            {/* ── Section E: Bill Summary ──────────────────────────────── */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                    <Calculator className="h-4 w-4 text-slate-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Bill Summary
                    </h3>
                </div>
                <div className="flex justify-end p-5">
                    <div className="w-80 space-y-1.5 text-sm">

                        <div className="flex justify-between text-slate-600">
                            <span>Goods Value</span>
                            <span className="font-mono">{fmt(goodsValue)}</span>
                        </div>

                        {totalTradeDisc > 0 && (
                            <div className="flex justify-between text-slate-500">
                                <span>Trade Discount</span>
                                <span className="font-mono text-red-500">−{fmt(totalTradeDisc)}</span>
                            </div>
                        )}

                        {totalCashDisc > 0 && (
                            <div className="flex justify-between text-slate-500">
                                <span>Cash Discount</span>
                                <span className="font-mono text-red-500">−{fmt(totalCashDisc)}</span>
                            </div>
                        )}

                        <div className="flex justify-between text-slate-700 font-medium">
                            <span>Taxable Value</span>
                            <span className="font-mono">{fmt(taxableValue)}</span>
                        </div>

                        <Separator className="my-1" />

                        {gstType === 'intrastate' ? (
                            <>
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>SGST</span>
                                    <span className="font-mono">{fmt(sgst)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>CGST</span>
                                    <span className="font-mono">{fmt(cgst)}</span>
                                </div>
                            </>
                        ) : (
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>IGST</span>
                                <span className="font-mono">{fmt(igst)}</span>
                            </div>
                        )}

                        {totalCess > 0 && (
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>Cess</span>
                                <span className="font-mono">{fmt(totalCess)}</span>
                            </div>
                        )}

                        {freight > 0 && (
                            <div className="flex justify-between text-slate-500">
                                <span>Freight</span>
                                <span className="font-mono">{fmt(freight)}</span>
                            </div>
                        )}

                        <div className="flex justify-between text-xs text-slate-400">
                            <span>Round Off</span>
                            <span className="font-mono">
                                {roundOff >= 0 ? '+' : ''}{fmt(roundOff)}
                            </span>
                        </div>

                        {ledgerAdjustment > 0 && (
                            <div className={`flex justify-between border-t border-dashed border-slate-200 pt-1 text-sm ${adjustmentSign === '-' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                <span>Ledger Adjustment</span>
                                <span className="font-mono">
                                    {adjustmentSign === '-' ? '−' : '+'} ₹{ledgerAdjustment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        )}

                        <Separator />

                        <div className="flex items-baseline justify-between pt-1">
                            <span className="text-sm font-bold text-slate-800">NET PAYABLE</span>
                            <span className="font-mono text-2xl font-bold text-slate-900">
                                {fmt(netPayable)}
                            </span>
                        </div>

                        {watchedPurchaseType === 'credit' && (
                            <p className="text-right text-[11px] text-slate-400">
                                Due: {watch('dueDate') ?? '—'}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Action bar ───────────────────────────────────────────── */}
            <div className="flex items-center justify-between pb-2">
                <Button
                    type="button" variant="ghost" size="sm"
                    className="gap-1.5 text-slate-500 hover:text-slate-700"
                    onClick={saveDraft}
                >
                    <Save className="h-3.5 w-3.5" /> Save Draft
                </Button>

                <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={onSuccess}>
                        <X className="mr-1 h-4 w-4" /> Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="min-w-[140px] gap-2"
                    >
                        {isSubmitting ? 'Saving...' : 'Save Purchase'}
                    </Button>
                </div>
            </div>

        </form>

        <AddNewProductDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            initialName={drawerInitialName}
            onSuccess={handleProductCreated}
        />
        </>
    );
}
