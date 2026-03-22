'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useCreateStaff, useUpdateStaff } from '@/hooks/useStaff';

const ROLES = [
    { value: 'admin', label: 'Admin' },
    { value: 'manager', label: 'Manager' },
    { value: 'billing_staff', label: 'Billing Staff' },
    { value: 'view_only', label: 'View Only' },
];

interface StaffFormModalProps {
    open: boolean;
    onClose: () => void;
    editingStaff?: any;
}

export function StaffFormModal({ open, onClose, editingStaff }: StaffFormModalProps) {
    const isEdit = !!editingStaff;
    const createMutation = useCreateStaff();
    const updateMutation = useUpdateStaff();

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
        useForm({
            defaultValues: {
                name: '',
                role: 'billing_staff',
                phone: '',
                email: '',
                pin: '',
                joinDate: new Date().toISOString().split('T')[0],
                salary: '',
                maxDiscount: 0,
                canEditRate: false,
                canViewPurchaseRates: false,
                canCreatePurchases: false,
                canAccessReports: false,
            }
        });

    // Pre-fill when editing
    useEffect(() => {
        if (editingStaff) {
            reset({
                name: editingStaff.name,
                role: editingStaff.role,
                phone: editingStaff.phone ?? '',
                email: editingStaff.email ?? '',
                pin: '',
                joinDate: editingStaff.joinDate ?? '',
                salary: editingStaff.salary ?? '',
                maxDiscount: editingStaff.maxDiscount ?? 0,
                canEditRate: editingStaff.canEditRate ?? false,
                canViewPurchaseRates: editingStaff.canViewPurchaseRates ?? false,
                canCreatePurchases: editingStaff.canCreatePurchases ?? false,
                canAccessReports: editingStaff.canAccessReports ?? false,
            });
        } else {
            reset();
        }
    }, [editingStaff, reset]);

    const onSubmit = (data: any) => {
        // Remove empty PIN on edit (only hash if changed)
        if (isEdit && !data.pin) delete data.pin;

        if (isEdit) {
            updateMutation.mutate(
                { id: editingStaff.id, data },
                { onSuccess: onClose }
            );
        } else {
            createMutation.mutate(data, { onSuccess: onClose });
        }
    };

    const isPending = createMutation.isPending || updateMutation.isPending;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? `Edit — ${editingStaff?.name}` : 'Add New Staff Member'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

                    {/* Basic Info */}
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Basic Information
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1 col-span-2">
                                <Label>Full Name *</Label>
                                <Input
                                    {...register('name', { required: 'Name is required' })}
                                    placeholder="e.g. Ravi Kumar"
                                />
                                {errors.name && (
                                    <p className="text-xs text-red-500">{errors.name.message as string}</p>
                                )}
                            </div>

                            <div className="space-y-1">
                                <Label>Role *</Label>
                                <Select
                                    defaultValue={watch('role')}
                                    onValueChange={(v) => setValue('role', v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ROLES.map(r => (
                                            <SelectItem key={r.value} value={r.value}>
                                                {r.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <Label>Phone *</Label>
                                <Input
                                    {...register('phone', { required: 'Phone is required' })}
                                    placeholder="9876543210"
                                    maxLength={10}
                                />
                                {errors.phone && (
                                    <p className="text-xs text-red-500">{errors.phone.message as string}</p>
                                )}
                            </div>

                            <div className="space-y-1 col-span-2">
                                <Label>Email</Label>
                                <Input
                                    {...register('email')}
                                    type="email"
                                    placeholder="ravi@pharmacy.com"
                                />
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Security */}
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Security
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>{isEdit ? 'New PIN (leave blank to keep)' : 'Billing PIN *'}</Label>
                                <Input
                                    {...register('pin', {
                                        required: isEdit ? false : 'PIN is required',
                                        minLength: { value: 4, message: 'PIN must be 4 digits' },
                                        maxLength: { value: 6, message: 'PIN max 6 digits' },
                                        pattern: { value: /^\d+$/, message: 'PIN must be numeric' }
                                    })}
                                    type="password"
                                    placeholder="4-6 digit PIN"
                                    maxLength={6}
                                />
                                {errors.pin && (
                                    <p className="text-xs text-red-500">{errors.pin.message as string}</p>
                                )}
                            </div>

                            <div className="space-y-1">
                                <Label>Max Discount Allowed (%)</Label>
                                <Input
                                    {...register('maxDiscount', { min: 0, max: 100 })}
                                    type="number"
                                    placeholder="0"
                                    min={0}
                                    max={100}
                                />
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Employment */}
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Employment Details
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>Join Date</Label>
                                <Input
                                    {...register('joinDate')}
                                    type="date"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label>Monthly Salary (₹)</Label>
                                <Input
                                    {...register('salary')}
                                    type="number"
                                    placeholder="25000"
                                />
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Permissions */}
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Permissions
                        </p>

                        <div className="space-y-3">
                            {[
                                { key: 'canEditRate', label: 'Can Edit Sale Rate', desc: 'Override MRP during billing' },
                                { key: 'canViewPurchaseRates', label: 'Can View Purchase Rates', desc: 'See cost price in inventory' },
                                { key: 'canCreatePurchases', label: 'Can Create Purchases', desc: 'Add new GRN / purchase invoices' },
                                { key: 'canAccessReports', label: 'Can Access Reports', desc: 'View sales, GST, stock reports' },
                            ].map(({ key, label, desc }) => (
                                <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                                    <div>
                                        <p className="text-sm font-medium">{label}</p>
                                        <p className="text-xs text-muted-foreground">{desc}</p>
                                    </div>
                                    <Switch
                                        checked={watch(key as any)}
                                        onCheckedChange={(v) => setValue(key as any, v)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending
                                ? (isEdit ? 'Saving...' : 'Creating...')
                                : (isEdit ? 'Save Changes' : 'Create Staff Member')
                            }
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
