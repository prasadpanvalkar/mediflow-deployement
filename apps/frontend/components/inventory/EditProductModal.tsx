'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { productsApi } from '@/lib/apiClient';
import { MasterProduct } from '@/types';
import {
    Package, Pill, Barcode, Thermometer, AlertTriangle,
    RotateCcw, IndianRupee, ReceiptText, FlaskConical,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHEDULE_OPTIONS = [
    { value: 'OTC',        label: 'OTC / General' },
    { value: 'G',          label: 'Schedule G' },
    { value: 'H',          label: 'Schedule H' },
    { value: 'H1',         label: 'Schedule H1' },
    { value: 'X',          label: 'Schedule X' },
    { value: 'C',          label: 'Schedule C (Biological)' },
    { value: 'Narcotic',   label: 'Narcotic (NDPS)' },
    { value: 'Ayurvedic',  label: 'Ayurvedic / Herbal' },
    { value: 'Surgical',   label: 'Surgical / Device' },
    { value: 'Cosmetic',   label: 'Cosmetic' },
    { value: 'Veterinary', label: 'Veterinary' },
];

const PACK_TYPE_OPTIONS = [
    'strip', 'bottle', 'vial', 'box', 'blister', 'tube', 'packet', 'other',
];

const GST_RATES = [0, 5, 12, 18, 28];

// ─── Form type ────────────────────────────────────────────────────────────────

interface FormValues {
    name: string;
    composition: string;
    manufacturer: string;
    hsnCode: string;
    gstRate: number;
    packSize: number;
    packUnit: string;
    packType: string;
    scheduleType: string;
    mrp: number;
    saleRate: number;
    barcode: string;
    minQty: number;
    reorderQty: number;
    isFridge: boolean;
    isDiscontinued: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EditProductModalProps {
    product: MasterProduct | null;
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onSaved?: (updated: MasterProduct) => void;
}

export function EditProductModal({
    product,
    open,
    onOpenChange,
    onSaved,
}: EditProductModalProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [saving, setSaving] = useState(false);
    const [apiErrors, setApiErrors] = useState<Record<string, string>>({});

    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors, isDirty },
    } = useForm<FormValues>();

    // Populate form when product changes
    useEffect(() => {
        if (product) {
            reset({
                name:          product.name,
                composition:   product.composition,
                manufacturer:  product.manufacturer,
                hsnCode:       product.hsnCode ?? '',
                gstRate:       product.gstRate ?? 0,
                packSize:      product.packSize ?? 1,
                packUnit:      product.packUnit ?? '',
                packType:      product.packType ?? 'strip',
                scheduleType:  product.scheduleType ?? 'OTC',
                mrp:           product.mrp ?? 0,
                saleRate:      product.saleRate ?? 0,
                barcode:       product.barcode ?? '',
                minQty:        product.minQty ?? 10,
                reorderQty:    product.reorderQty ?? 50,
                isFridge:      product.isFridge ?? false,
                isDiscontinued: product.isDiscontinued ?? false,
            });
            setApiErrors({});
        }
    }, [product, reset]);

    const onSubmit = async (values: FormValues) => {
        if (!product) return;
        setSaving(true);
        setApiErrors({});
        try {
            const updated = await productsApi.update(product.id, {
                name:           values.name,
                composition:    values.composition,
                manufacturer:   values.manufacturer,
                hsnCode:        values.hsnCode,
                gstRate:        Number(values.gstRate),
                packSize:       Number(values.packSize),
                packUnit:       values.packUnit,
                packType:       values.packType,
                scheduleType:   values.scheduleType as any,
                mrp:            Number(values.mrp),
                saleRate:       Number(values.saleRate),
                barcode:        values.barcode || undefined,
                minQty:         Number(values.minQty),
                reorderQty:     Number(values.reorderQty),
                isFridge:       values.isFridge,
                isDiscontinued: values.isDiscontinued,
            });
            // Invalidate all inventory + product queries
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['stock-list'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            toast({ title: 'Product updated', description: `${updated.name} saved successfully.` });
            onSaved?.(updated);
            onOpenChange(false);
        } catch (err: any) {
            const body = await err?.response?.json?.().catch(() => null) ?? null;
            if (body?.errors) {
                setApiErrors(body.errors);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Update failed',
                    description: err?.message ?? 'Unknown error',
                });
            }
        } finally {
            setSaving(false);
        }
    };

    if (!product) return null;

    const fieldErr = (key: keyof FormValues) =>
        errors[key]?.message ?? apiErrors[key] ?? '';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-indigo-100 p-2">
                            <Package className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold text-slate-800">
                                Edit Product
                            </DialogTitle>
                            <p className="text-sm text-slate-500 mt-0.5 font-mono truncate max-w-md">
                                {product.name}
                            </p>
                        </div>
                        <div className="ml-auto flex gap-2">
                            {product.isFridge && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 text-xs">
                                    <Thermometer className="h-3 w-3 mr-1" /> Cold Chain
                                </Badge>
                            )}
                            {product.isDiscontinued && (
                                <Badge variant="outline" className="bg-red-50 text-red-500 border-red-200 text-xs">
                                    Discontinued
                                </Badge>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)}>
                    <ScrollArea className="max-h-[70vh]">
                        <div className="px-6 py-5 space-y-6">

                            {/* ── Section: Basic Info ── */}
                            <Section icon={<Pill className="h-4 w-4 text-indigo-500" />} title="Basic Information">
                                <div className="grid grid-cols-2 gap-4">
                                    <Field label="Product Name *" error={fieldErr('name')} className="col-span-2">
                                        <Input
                                            {...register('name', { required: 'Name is required' })}
                                            placeholder="e.g. Paracetamol 500mg"
                                        />
                                    </Field>
                                    <Field label="Composition" error={fieldErr('composition')} className="col-span-2">
                                        <Input {...register('composition')} placeholder="e.g. Paracetamol IP 500mg" />
                                    </Field>
                                    <Field label="Manufacturer" error={fieldErr('manufacturer')}>
                                        <Input {...register('manufacturer')} placeholder="e.g. Sun Pharma" />
                                    </Field>
                                    <Field label="Schedule / Drug Type" error={fieldErr('scheduleType')}>
                                        <Controller
                                            name="scheduleType"
                                            control={control}
                                            render={({ field }) => (
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {SCHEDULE_OPTIONS.map(o => (
                                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </Field>
                                </div>
                            </Section>

                            <Separator />

                            {/* ── Section: Packaging ── */}
                            <Section icon={<Package className="h-4 w-4 text-emerald-500" />} title="Packaging">
                                <div className="grid grid-cols-3 gap-4">
                                    <Field label="Pack Size *" error={fieldErr('packSize')}
                                        hint="Units per pack (e.g. 10 tablets/strip)">
                                        <Input
                                            type="number"
                                            min={1}
                                            {...register('packSize', { required: true, min: 1, valueAsNumber: true })}
                                        />
                                    </Field>
                                    <Field label="Pack Unit *" error={fieldErr('packUnit')}
                                        hint="tablet, capsule, ml, etc.">
                                        <Input {...register('packUnit', { required: 'Required' })} placeholder="tablet" />
                                    </Field>
                                    <Field label="Pack Type" error={fieldErr('packType')}>
                                        <Controller
                                            name="packType"
                                            control={control}
                                            render={({ field }) => (
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {PACK_TYPE_OPTIONS.map(o => (
                                                            <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </Field>
                                </div>
                            </Section>

                            <Separator />

                            {/* ── Section: Pricing & GST ── */}
                            <Section icon={<IndianRupee className="h-4 w-4 text-amber-500" />} title="Pricing & Taxes">
                                <div className="grid grid-cols-3 gap-4">
                                    <Field label="MRP (₹)" error={fieldErr('mrp')}>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min={0}
                                            {...register('mrp', { valueAsNumber: true, min: 0 })}
                                        />
                                    </Field>
                                    <Field label="Default Sale Rate (₹)" error={fieldErr('saleRate')}>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min={0}
                                            {...register('saleRate', { valueAsNumber: true, min: 0 })}
                                        />
                                    </Field>
                                    <Field label="GST Rate (%)" error={fieldErr('gstRate')}>
                                        <Controller
                                            name="gstRate"
                                            control={control}
                                            render={({ field }) => (
                                                <Select
                                                    value={String(field.value)}
                                                    onValueChange={(v) => field.onChange(Number(v))}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {GST_RATES.map(r => (
                                                            <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </Field>
                                    <Field label="HSN Code *" error={fieldErr('hsnCode')}>
                                        <Input {...register('hsnCode', { required: 'Required' })} placeholder="3004" />
                                    </Field>
                                </div>
                            </Section>

                            <Separator />

                            {/* ── Section: Stock Management ── */}
                            <Section icon={<RotateCcw className="h-4 w-4 text-blue-500" />} title="Stock Management">
                                <div className="grid grid-cols-2 gap-4">
                                    <Field label="Low Stock Alert (strips)" error={fieldErr('minQty')}
                                        hint="Alert triggers below this qty">
                                        <Input
                                            type="number"
                                            min={0}
                                            {...register('minQty', { valueAsNumber: true, min: 0 })}
                                        />
                                    </Field>
                                    <Field label="Reorder Quantity (strips)" error={fieldErr('reorderQty')}
                                        hint="Suggested quantity to reorder">
                                        <Input
                                            type="number"
                                            min={0}
                                            {...register('reorderQty', { valueAsNumber: true, min: 0 })}
                                        />
                                    </Field>
                                </div>
                            </Section>

                            <Separator />

                            {/* ── Section: Identification ── */}
                            <Section icon={<Barcode className="h-4 w-4 text-slate-500" />} title="Identification">
                                <Field label="Barcode" error={fieldErr('barcode')} hint="Leave blank to clear">
                                    <Input {...register('barcode')} placeholder="Scan or enter barcode" />
                                </Field>
                                {apiErrors.barcode && (
                                    <p className="text-xs text-red-500 mt-1">{apiErrors.barcode}</p>
                                )}
                            </Section>

                            <Separator />

                            {/* ── Section: Flags ── */}
                            <Section icon={<AlertTriangle className="h-4 w-4 text-orange-500" />} title="Product Flags">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex items-center justify-between rounded-lg border p-3">
                                        <div>
                                            <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                                <Thermometer className="h-3.5 w-3.5 text-blue-500" />
                                                Cold Storage Required
                                            </p>
                                            <p className="text-xs text-slate-400 mt-0.5">Requires refrigeration (2–8°C)</p>
                                        </div>
                                        <Controller
                                            name="isFridge"
                                            control={control}
                                            render={({ field }) => (
                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                            )}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/30 p-3">
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">Discontinued</p>
                                            <p className="text-xs text-slate-400 mt-0.5">Hides from purchase/sale forms</p>
                                        </div>
                                        <Controller
                                            name="isDiscontinued"
                                            control={control}
                                            render={({ field }) => (
                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                            )}
                                        />
                                    </div>
                                </div>
                            </Section>

                        </div>
                    </ScrollArea>

                    <DialogFooter className="border-t px-6 py-4 bg-slate-50/80">
                        <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={saving || !isDirty}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-32"
                        >
                            {saving ? (
                                <span className="flex items-center gap-2">
                                    <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                                    Saving…
                                </span>
                            ) : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Section({
    icon, title, children,
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                {icon}
                <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</span>
            </div>
            {children}
        </div>
    );
}

function Field({
    label, children, error, hint, className,
}: {
    label: string;
    children: React.ReactNode;
    error?: string;
    hint?: string;
    className?: string;
}) {
    return (
        <div className={className}>
            <Label className="text-xs font-medium text-slate-600 mb-1.5 block">{label}</Label>
            {children}
            {hint && !error && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
            {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
        </div>
    );
}
