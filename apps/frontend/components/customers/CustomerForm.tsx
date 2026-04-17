'use client';

import { useState, useEffect } from 'react';
import { User, Phone, MapPin, CreditCard, Heart, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useCreateCustomer, useUpdateCustomer } from '@/hooks/useCustomers';
import { useOutletId } from '@/hooks/useOutletId';
import { Customer, INDIAN_STATES } from '@/types';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
    name: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    dob: string;
    gstin: string;
    isChronic: boolean;
    creditLimit: string;
    fixedDiscount: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const defaultForm = (): FormState => ({
    name: '',
    phone: '',
    address: '',
    city: '',
    state: 'Maharashtra',
    pincode: '',
    dob: '',
    gstin: '',
    isChronic: false,
    creditLimit: '0',
    fixedDiscount: '0',
});

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(form: FormState): FieldErrors {
    const errors: FieldErrors = {};

    if (!form.name.trim()) errors.name = 'Name is required';

    if (!form.phone.trim()) {
        errors.phone = 'Phone is required';
    } else if (!/^[6-9]\d{9}$/.test(form.phone.trim())) {
        errors.phone = 'Enter a valid 10-digit Indian mobile number';
    }

    if (form.gstin.trim() && !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstin.trim().toUpperCase())) {
        errors.gstin = 'Invalid GSTIN format (e.g. 27AABCA1234A1Z5)';
    }

    const cl = parseFloat(form.creditLimit);
    if (isNaN(cl) || cl < 0) errors.creditLimit = 'Must be 0 or more';

    const fd = parseFloat(form.fixedDiscount);
    if (isNaN(fd) || fd < 0 || fd > 100) errors.fixedDiscount = 'Must be between 0 and 100';

    return errors;
}

// ─── Inner form ───────────────────────────────────────────────────────────────

function CustomerFormFields({
    form,
    errors,
    onChange,
    onToggleChronic,
    isSaving,
    onSave,
    onCancel,
    title,
}: {
    form: FormState;
    errors: FieldErrors;
    onChange: (field: keyof FormState, value: string) => void;
    onToggleChronic: (val: boolean) => void;
    isSaving: boolean;
    onSave: () => void;
    onCancel: () => void;
    title: string;
}) {
    return (
        <Card className="border-blue-200 shadow-sm">
            <CardHeader className="pb-4 pt-5 px-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <User className="h-4 w-4" />
                        </div>
                        <CardTitle className="text-base">{title}</CardTitle>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-slate-600"
                        onClick={onCancel}
                        disabled={isSaving}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="px-6 py-5 space-y-6">

                {/* Basic Info */}
                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Basic Info</p>

                    <div className="space-y-1.5">
                        <Label className="text-sm">Name <span className="text-red-500">*</span></Label>
                        <Input
                            autoFocus
                            value={form.name}
                            onChange={(e) => onChange('name', e.target.value)}
                            placeholder="e.g. Ramesh Patel"
                            className={cn(errors.name && 'border-red-400')}
                        />
                        {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-sm">Phone <span className="text-red-500">*</span></Label>
                            <Input
                                type="tel"
                                value={form.phone}
                                onChange={(e) => onChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                                placeholder="98765 43210"
                                maxLength={10}
                                className={cn(errors.phone && 'border-red-400')}
                            />
                            {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Date of Birth</Label>
                            <Input
                                type="date"
                                value={form.dob}
                                onChange={(e) => onChange('dob', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-sm">GSTIN</Label>
                        <Input
                            value={form.gstin}
                            onChange={(e) => onChange('gstin', e.target.value.toUpperCase().slice(0, 15))}
                            placeholder="27AABCA1234A1Z5"
                            className={cn('font-mono text-xs', errors.gstin && 'border-red-400')}
                            maxLength={15}
                        />
                        {errors.gstin && <p className="text-xs text-red-500">{errors.gstin}</p>}
                    </div>

                    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                        <div className="flex items-center gap-2">
                            <Heart className="w-4 h-4 text-purple-500" />
                            <div>
                                <p className="text-sm font-medium">Chronic Patient</p>
                                <p className="text-xs text-muted-foreground">On regular medicines</p>
                            </div>
                        </div>
                        <Switch
                            checked={form.isChronic}
                            onCheckedChange={onToggleChronic}
                        />
                    </div>
                </div>

                <Separator />

                {/* Address */}
                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <MapPin className="w-3 h-3 inline mr-1" />Address
                    </p>

                    <div className="space-y-1.5">
                        <Label className="text-sm">Street / Area</Label>
                        <Input
                            value={form.address}
                            onChange={(e) => onChange('address', e.target.value)}
                            placeholder="Street, Colony, Area..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-sm">City</Label>
                            <Input
                                value={form.city}
                                onChange={(e) => onChange('city', e.target.value)}
                                placeholder="Mumbai"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">PIN Code</Label>
                            <Input
                                value={form.pincode}
                                onChange={(e) => onChange('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="400001"
                                maxLength={6}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-sm">State</Label>
                        <Select value={form.state} onValueChange={(v) => onChange('state', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                            <SelectContent>
                                {INDIAN_STATES.map((s) => (
                                    <SelectItem key={s.code} value={s.name}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <Separator />

                {/* Credit Settings */}
                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <CreditCard className="w-3 h-3 inline mr-1" />Credit Settings
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-sm">Credit Limit (₹)</Label>
                            <Input
                                type="number"
                                min={0}
                                step={500}
                                value={form.creditLimit}
                                onChange={(e) => onChange('creditLimit', e.target.value)}
                                placeholder="0"
                                className={cn(errors.creditLimit && 'border-red-400')}
                            />
                            {errors.creditLimit && <p className="text-xs text-red-500">{errors.creditLimit}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Fixed Discount (%)</Label>
                            <Input
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                value={form.fixedDiscount}
                                onChange={(e) => onChange('fixedDiscount', e.target.value)}
                                placeholder="0"
                                className={cn(errors.fixedDiscount && 'border-red-400')}
                            />
                            {errors.fixedDiscount && <p className="text-xs text-red-500">{errors.fixedDiscount}</p>}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button className="flex-1" onClick={onSave} disabled={isSaving}>
                        {isSaving ? (
                            <span className="flex items-center gap-2">
                                <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                Saving...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Save className="h-3.5 w-3.5" />
                                Save Customer
                            </span>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Public Sheet wrapper ─────────────────────────────────────────────────────

interface CustomerFormProps {
    open: boolean;
    onClose: () => void;
    customer?: Customer | null;
}

export default function CustomerForm({ open, onClose, customer }: CustomerFormProps) {
    const { toast } = useToast();
    const outletId = useOutletId();
    const createMutation = useCreateCustomer();
    const updateMutation = useUpdateCustomer(customer?.id ?? '');

    const [form, setForm] = useState<FormState>(defaultForm());
    const [errors, setErrors] = useState<FieldErrors>({});

    // Pre-fill form when editing
    useEffect(() => {
        if (open) {
            if (customer) {
                // Build full address from address field (may contain city/state inline)
                setForm({
                    name: customer.name,
                    phone: customer.phone,
                    address: customer.address ?? '',
                    city: '',
                    state: customer.state || 'Maharashtra',
                    pincode: '',
                    dob: customer.dob ?? '',
                    gstin: customer.gstin ?? '',
                    isChronic: customer.isChronic,
                    creditLimit: String(customer.creditLimit),
                    fixedDiscount: String(customer.fixedDiscount),
                });
            } else {
                setForm(defaultForm());
            }
            setErrors({});
        }
    }, [open, customer]);

    const onChange = (field: keyof FormState, value: string) => {
        setForm((p) => ({ ...p, [field]: value }));
        if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
    };

    const onToggleChronic = (val: boolean) => {
        setForm((p) => ({ ...p, isChronic: val }));
    };

    const buildAddress = () => {
        const parts = [form.address, form.city, form.state, form.pincode].filter(Boolean);
        return parts.join(', ') || null;
    };

    const handleSave = async () => {
        const errs = validate(form);
        if (Object.keys(errs).length > 0) {
            setErrors(errs);
            return;
        }

        const payload = {
            outletId,
            name: form.name.trim(),
            phone: form.phone.trim(),
            address: buildAddress() ?? undefined,
            state: form.state || undefined,
            dob: form.dob || undefined,
            gstin: form.gstin.trim().toUpperCase() || undefined,
            isChronic: form.isChronic,
            creditLimit: parseFloat(form.creditLimit) || 0,
            fixedDiscount: parseFloat(form.fixedDiscount) || 0,
        };

        try {
            if (customer) {
                await updateMutation.mutateAsync(payload);
                toast({ title: 'Customer updated' });
            } else {
                await createMutation.mutateAsync(payload);
                toast({ title: 'Customer added' });
            }
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Something went wrong';
            toast({ variant: 'destructive', title: 'Error', description: msg });
        }
    };

    const isSaving = createMutation.isPending || updateMutation.isPending;

    return (
        <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
            <SheetContent side="right" className="w-full sm:w-[480px] p-0 overflow-y-auto">
                <SheetHeader className="sr-only">
                    <SheetTitle>{customer ? 'Edit Customer' : 'Add Customer'}</SheetTitle>
                </SheetHeader>
                <CustomerFormFields
                    form={form}
                    errors={errors}
                    onChange={onChange}
                    onToggleChronic={onToggleChronic}
                    isSaving={isSaving}
                    onSave={handleSave}
                    onCancel={onClose}
                    title={customer ? 'Edit Customer' : 'Add Customer'}
                />
            </SheetContent>
        </Sheet>
    );
}
