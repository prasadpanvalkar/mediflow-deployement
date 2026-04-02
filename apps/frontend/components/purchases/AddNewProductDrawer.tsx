'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { productsApi } from '@/lib/apiClient';
import { CreateProductPayload, ProductSearchResult } from '@/types';
import { SCHEDULE_TYPE_OPTIONS } from '@/constants/scheduleTypes';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialName: string;
    onSuccess: (product: ProductSearchResult) => void;
}

interface FormState {
    name: string;
    composition: string;
    manufacturer: string;
    hsnCode: string;
    gstRate: string;
    packSize: string;
    packUnit: string;
    scheduleType: string;
    mrp: string;
    saleRate: string;
}

interface FieldErrors {
    name?: string;
    hsnCode?: string;
    gstRate?: string;
    packSize?: string;
    packUnit?: string;
    scheduleType?: string;
    mrp?: string;
    saleRate?: string;
}

const PACK_UNITS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Drops', 'Powder', 'Strip', 'Piece'];
const GST_RATES = ['0', '5', '12', '18'];

const emptyForm = (name = ''): FormState => ({
    name,
    composition: '',
    manufacturer: '',
    hsnCode: '',
    gstRate: '',
    packSize: '1',
    packUnit: '',
    scheduleType: '',
    mrp: '',
    saleRate: '',
});

export function AddNewProductDrawer({ open, onOpenChange, initialName, onSuccess }: Props) {
    const [form, setForm] = useState<FormState>(emptyForm(initialName));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [serverError, setServerError] = useState('');
    const [saving, setSaving] = useState(false);

    // Reset form when drawer opens with a new initialName
    useEffect(() => {
        if (open) {
            setForm(emptyForm(initialName));
            setErrors({});
            setServerError('');
        }
    }, [open, initialName]);

    const set = (field: keyof FormState, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (errors[field as keyof FieldErrors]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    const validate = (): boolean => {
        const errs: FieldErrors = {};
        if (!form.name.trim()) errs.name = 'Product name is required';
        if (!form.hsnCode.trim()) errs.hsnCode = 'HSN code is required';
        if (form.gstRate === '') errs.gstRate = 'GST rate is required';
        const packSize = parseInt(form.packSize);
        if (!packSize || packSize < 1) errs.packSize = 'Pack size must be ≥ 1';
        if (!form.packUnit) errs.packUnit = 'Pack unit is required';
        if (!form.scheduleType) errs.scheduleType = 'Schedule type is required';
        const mrp = parseFloat(form.mrp);
        if (!mrp || mrp <= 0) errs.mrp = 'MRP must be > 0';
        const saleRate = parseFloat(form.saleRate);
        if (!saleRate || saleRate <= 0) errs.saleRate = 'Sale rate must be > 0';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) return;
        setSaving(true);
        setServerError('');
        try {
            const payload: CreateProductPayload = {
                name: form.name.trim(),
                composition: form.composition.trim() || undefined,
                manufacturer: form.manufacturer.trim() || undefined,
                hsnCode: form.hsnCode.trim(),
                gstRate: parseFloat(form.gstRate),
                packSize: parseInt(form.packSize),
                packUnit: form.packUnit,
                scheduleType: form.scheduleType,
                mrp: parseFloat(form.mrp),
                saleRate: parseFloat(form.saleRate),
            };
            const product = await productsApi.create(payload);
            onSuccess(product);
            onOpenChange(false);
        } catch (err: unknown) {
            if (err instanceof Error) {
                // Try to parse backend field errors
                try {
                    const body = JSON.parse(err.message);
                    if (body?.errors) {
                        const fieldErrs: FieldErrors = {};
                        for (const [k, v] of Object.entries(body.errors)) {
                            fieldErrs[k as keyof FieldErrors] = String(v);
                        }
                        setErrors(fieldErrs);
                        return;
                    }
                } catch {
                    // not JSON
                }
                setServerError(err.message || 'Failed to create product');
            } else {
                setServerError('Failed to create product');
            }
        } finally {
            setSaving(false);
        }
    };

    const fieldCls = (err?: string) =>
        `h-9 text-sm ${err ? 'border-red-400 focus-visible:ring-red-300' : ''}`;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-[420px] flex-col gap-0 p-0 sm:max-w-[420px]">
                <SheetHeader className="border-b px-5 py-4">
                    <SheetTitle className="text-base">Add New Product</SheetTitle>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                    <div className="space-y-4">
                        {serverError && (
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {serverError}
                            </div>
                        )}

                        {/* Product Name */}
                        <div className="space-y-1">
                            <Label className="text-xs font-medium">
                                Product Name <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                className={fieldCls(errors.name)}
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                placeholder="e.g. Dolo 650"
                            />
                            {errors.name && <p className="text-[11px] text-red-500">{errors.name}</p>}
                        </div>

                        {/* Composition */}
                        <div className="space-y-1">
                            <Label className="text-xs font-medium">Composition</Label>
                            <Input
                                className="h-9 text-sm"
                                value={form.composition}
                                onChange={(e) => set('composition', e.target.value)}
                                placeholder="e.g. Paracetamol 650mg"
                            />
                        </div>

                        {/* Manufacturer */}
                        <div className="space-y-1">
                            <Label className="text-xs font-medium">Manufacturer</Label>
                            <Input
                                className="h-9 text-sm"
                                value={form.manufacturer}
                                onChange={(e) => set('manufacturer', e.target.value)}
                                placeholder="e.g. Micro Labs Ltd"
                            />
                        </div>

                        {/* HSN Code */}
                        <div className="space-y-1">
                            <Label className="text-xs font-medium">
                                HSN Code <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                className={fieldCls(errors.hsnCode)}
                                value={form.hsnCode}
                                onChange={(e) => set('hsnCode', e.target.value.slice(0, 8))}
                                placeholder="e.g. 30049099"
                                maxLength={8}
                            />
                            {errors.hsnCode && <p className="text-[11px] text-red-500">{errors.hsnCode}</p>}
                        </div>

                        {/* GST % */}
                        <div className="space-y-1">
                            <Label className="text-xs font-medium">
                                GST % <span className="text-red-500">*</span>
                            </Label>
                            <Select value={form.gstRate} onValueChange={(v) => set('gstRate', v)}>
                                <SelectTrigger className={`h-9 text-sm ${errors.gstRate ? 'border-red-400' : ''}`}>
                                    <SelectValue placeholder="Select GST rate" />
                                </SelectTrigger>
                                <SelectContent>
                                    {GST_RATES.map((r) => (
                                        <SelectItem key={r} value={r}>{r}%</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.gstRate && <p className="text-[11px] text-red-500">{errors.gstRate}</p>}
                        </div>

                        {/* Pack Size + Pack Unit — side by side */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs font-medium">
                                    Pack Size <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    type="number"
                                    min={1}
                                    className={fieldCls(errors.packSize)}
                                    value={form.packSize}
                                    onChange={(e) => set('packSize', e.target.value)}
                                    placeholder="e.g. 15"
                                />
                                {errors.packSize && <p className="text-[11px] text-red-500">{errors.packSize}</p>}
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-medium">
                                    Pack Unit <span className="text-red-500">*</span>
                                </Label>
                                <Select value={form.packUnit} onValueChange={(v) => set('packUnit', v)}>
                                    <SelectTrigger className={`h-9 text-sm ${errors.packUnit ? 'border-red-400' : ''}`}>
                                        <SelectValue placeholder="Unit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PACK_UNITS.map((u) => (
                                            <SelectItem key={u} value={u}>{u}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {errors.packUnit && <p className="text-[11px] text-red-500">{errors.packUnit}</p>}
                            </div>
                        </div>

                        {/* Schedule Type */}
                        <div className="space-y-1">
                            <Label className="text-xs font-medium">
                                Schedule Type <span className="text-red-500">*</span>
                            </Label>
                            <Select value={form.scheduleType} onValueChange={(v) => set('scheduleType', v)}>
                                <SelectTrigger className={`h-9 text-sm ${errors.scheduleType ? 'border-red-400' : ''}`}>
                                    <SelectValue placeholder="Select schedule" />
                                </SelectTrigger>
                                <SelectContent>
                                    {SCHEDULE_TYPE_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.scheduleType && <p className="text-[11px] text-red-500">{errors.scheduleType}</p>}
                        </div>

                        {/* MRP */}
                        <div className="space-y-1">
                            <Label className="text-xs font-medium">
                                MRP (₹) <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                type="number"
                                min={0}
                                step="0.01"
                                className={fieldCls(errors.mrp)}
                                value={form.mrp}
                                onChange={(e) => set('mrp', e.target.value)}
                                placeholder="0.00"
                            />
                            {errors.mrp && <p className="text-[11px] text-red-500">{errors.mrp}</p>}
                        </div>

                        {/* Sale Rate */}
                        <div className="space-y-1">
                            <Label className="text-xs font-medium">
                                Sale Rate (₹) <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                type="number"
                                min={0}
                                step="0.01"
                                className={fieldCls(errors.saleRate)}
                                value={form.saleRate}
                                onChange={(e) => set('saleRate', e.target.value)}
                                placeholder="0.00"
                            />
                            {errors.saleRate && (
                                <p className="text-[11px] text-red-500">{errors.saleRate}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving…' : 'Save & Add to Row'}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
