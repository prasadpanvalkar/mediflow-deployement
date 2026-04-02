'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, ImagePlus, X, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { outletSettingsSchema, type OutletSettingsFormValues } from '@/lib/validations/settings';
import { INDIAN_STATES } from '@/types';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { cn } from '@/lib/utils';

const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

interface OutletSettingsSectionProps {
    onDirty: () => void;
    onSaved: () => void;
    discardKey?: number;
}

export function OutletSettingsSection({ onDirty, onSaved, discardKey }: OutletSettingsSectionProps) {
    const store = useSettingsStore();
    const { outlet, setOutlet } = useAuthStore();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(store.outletLogoUrl);

    const getDefaults = (): OutletSettingsFormValues => ({
        outletName: store.outletName || outlet?.name || '',
        outletAddress: store.outletAddress || outlet?.address || '',
        outletCity: store.outletCity || outlet?.city || '',
        outletState: store.outletState || outlet?.state || 'Maharashtra',
        outletPincode: store.outletPincode || outlet?.pincode || '',
        outletPhone: store.outletPhone || outlet?.phone || '',
        outletEmail: store.outletEmail || '',
        outletGstin: store.outletGstin || outlet?.gstin || '',
        outletDrugLicenseNo: store.outletDrugLicenseNo || outlet?.drugLicenseNo || '',
        invoiceFooter: store.invoiceFooter,
        invoiceHeader: store.invoiceHeader,
    });

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        reset,
        formState: { errors, isDirty },
    } = useForm<OutletSettingsFormValues>({
        resolver: zodResolver(outletSettingsSchema),
        defaultValues: getDefaults(),
    });

    // Re-initialize when discard is triggered
    useEffect(() => {
        if (discardKey !== undefined) {
            reset(getDefaults());
            setLogoPreview(store.outletLogoUrl);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [discardKey]);

    useEffect(() => {
        if (isDirty) onDirty();
    }, [isDirty, onDirty]);

    const gstinValue = watch('outletGstin');
    const footerValue = watch('invoiceFooter') || '';
    const nameValue = watch('outletName');
    const addressValue = watch('outletAddress');
    const cityValue = watch('outletCity');

    const gstinValid = gstinValue ? GSTIN_REGEX.test(gstinValue) : null;

    function handleLogoFile(file: File) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            setLogoPreview(result);
            store.updateOutletSettings({ outletLogoUrl: result });
            onDirty();
        };
        reader.readAsDataURL(file);
    }

    function onSubmit(data: OutletSettingsFormValues) {
        store.updateOutletSettings({ ...data, outletLogoUrl: logoPreview });
        // Also update authStore.outlet so invoice preview shows the new details immediately
        if (outlet) {
            setOutlet({
                ...outlet,
                name: data.outletName,
                address: data.outletAddress,
                city: data.outletCity,
                state: data.outletState,
                pincode: data.outletPincode,
                phone: data.outletPhone,
                gstin: data.outletGstin,
                drugLicenseNo: data.outletDrugLicenseNo,
                invoiceFooter: data.invoiceFooter,
                logoUrl: logoPreview ?? outlet.logoUrl,
            });
        }
        toast({ title: 'Outlet settings saved' });
        onSaved();
        reset(data);
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <SettingsSectionHeader
                icon={<Building2 />}
                title="Outlet Profile"
                description="Your pharmacy's legal and contact information. This appears on all invoices and reports."
            />

            {/* Logo Upload */}
            <div className="space-y-2">
                <Label className="text-sm font-medium">Pharmacy Logo</Label>
                {logoPreview ? (
                    <div className="flex items-center gap-4">
                        <img
                            src={logoPreview}
                            alt="Pharmacy logo"
                            className="w-20 h-20 object-contain rounded-lg border bg-white p-1"
                        />
                        <div className="flex flex-col gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Change Logo
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                    setLogoPreview(null);
                                    store.updateOutletSettings({ outletLogoUrl: null });
                                    onDirty();
                                }}
                            >
                                <X className="w-4 h-4 mr-1" />
                                Remove Logo
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div
                        className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center cursor-pointer hover:border-primary hover:bg-blue-50 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files[0];
                            if (file) handleLogoFile(file);
                        }}
                    >
                        <ImagePlus className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-600">Drop pharmacy logo here</p>
                        <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                        <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 2MB · Recommended: 200×200px</p>
                    </div>
                )}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoFile(file);
                    }}
                />
            </div>

            {/* Pharmacy Details */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <Label htmlFor="outletName">Pharmacy Name <span className="text-red-500">*</span></Label>
                    <Input id="outletName" {...register('outletName')} />
                    {errors.outletName && (
                        <p className="text-xs text-red-500">{errors.outletName.message}</p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="outletPhone">Phone <span className="text-red-500">*</span></Label>
                    <Input id="outletPhone" {...register('outletPhone')} maxLength={10} />
                    {errors.outletPhone && (
                        <p className="text-xs text-red-500">{errors.outletPhone.message}</p>
                    )}
                </div>

                <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="outletEmail">Email</Label>
                    <Input id="outletEmail" type="email" {...register('outletEmail')} />
                    {errors.outletEmail && (
                        <p className="text-xs text-red-500">{errors.outletEmail.message}</p>
                    )}
                </div>

                <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="outletAddress">Address <span className="text-red-500">*</span></Label>
                    <Textarea id="outletAddress" rows={2} {...register('outletAddress')} />
                    {errors.outletAddress && (
                        <p className="text-xs text-red-500">{errors.outletAddress.message}</p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="outletCity">City <span className="text-red-500">*</span></Label>
                    <Input id="outletCity" {...register('outletCity')} />
                    {errors.outletCity && (
                        <p className="text-xs text-red-500">{errors.outletCity.message}</p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="outletState">State <span className="text-red-500">*</span></Label>
                    <Select
                        value={watch('outletState')}
                        onValueChange={(val) => setValue('outletState', val, { shouldDirty: true })}
                    >
                        <SelectTrigger id="outletState">
                            <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                            {INDIAN_STATES.map((s) => (
                                <SelectItem key={s.code} value={s.name}>{s.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {errors.outletState && (
                        <p className="text-xs text-red-500">{errors.outletState.message}</p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="outletPincode">Pincode <span className="text-red-500">*</span></Label>
                    <Input id="outletPincode" {...register('outletPincode')} maxLength={6} />
                    {errors.outletPincode && (
                        <p className="text-xs text-red-500">{errors.outletPincode.message}</p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="outletDrugLicenseNo">Drug License No <span className="text-red-500">*</span></Label>
                    <Input
                        id="outletDrugLicenseNo"
                        {...register('outletDrugLicenseNo')}
                        placeholder="MH/AHM/D/001/2024"
                    />
                    {errors.outletDrugLicenseNo && (
                        <p className="text-xs text-red-500">{errors.outletDrugLicenseNo.message}</p>
                    )}
                </div>

                <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="outletGstin">GSTIN</Label>
                    <div className="relative">
                        <Input
                            id="outletGstin"
                            {...register('outletGstin')}
                            placeholder="27AABCS1234C1Z7"
                            className={cn(
                                'uppercase pr-8',
                                gstinValue && (gstinValid ? 'border-green-500 focus-visible:ring-green-500' : 'border-red-400 focus-visible:ring-red-400')
                            )}
                            onChange={(e) => {
                                setValue('outletGstin', e.target.value.toUpperCase(), { shouldDirty: true });
                            }}
                        />
                        {gstinValue && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2">
                                {gstinValid
                                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    : <XCircle className="w-4 h-4 text-red-400" />
                                }
                            </span>
                        )}
                    </div>
                    {gstinValue && !gstinValid && (
                        <p className="text-xs text-red-500">Invalid GSTIN format</p>
                    )}
                    <p className="text-xs text-muted-foreground">Format: 27AABCS1234C7Z5</p>
                </div>
            </div>

            {/* Invoice Customization */}
            <div className="space-y-4">
                <Separator />
                <p className="text-sm font-semibold text-slate-700">Invoice Customization</p>

                <div className="space-y-1.5">
                    <Label htmlFor="invoiceHeader">Invoice Header Line</Label>
                    <Input
                        id="invoiceHeader"
                        {...register('invoiceHeader')}
                        placeholder="e.g. 'Est. 2015 · Trusted by 5000+ families'"
                    />
                    <p className="text-xs text-muted-foreground">Appears below pharmacy name on invoice</p>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="invoiceFooter">Invoice Footer Message</Label>
                    <Textarea
                        id="invoiceFooter"
                        rows={2}
                        {...register('invoiceFooter')}
                        placeholder="e.g. 'Thank you for your purchase! Get well soon.'"
                        maxLength={120}
                    />
                    <div className="flex justify-between">
                        <p className="text-xs text-muted-foreground">Appears at bottom of every invoice</p>
                        <p className="text-xs text-muted-foreground">{footerValue.length}/120</p>
                    </div>
                </div>
            </div>

            {/* Live Invoice Preview */}
            <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Preview</p>
                <div className="border rounded-xl overflow-hidden bg-white">
                    <div className="transform scale-75 origin-top-left w-[133%]">
                        <div className="p-6 text-xs font-mono min-h-[160px]">
                            <div className="text-center border-b pb-3 mb-3">
                                {logoPreview && (
                                    <img src={logoPreview} alt="logo" className="w-12 h-12 object-contain mx-auto mb-1" />
                                )}
                                <p className="text-sm font-bold">{nameValue || 'Pharmacy Name'}</p>
                                {watch('invoiceHeader') && (
                                    <p className="text-xs text-slate-500">{watch('invoiceHeader')}</p>
                                )}
                                <p className="text-xs text-slate-500">{addressValue}{cityValue ? `, ${cityValue}` : ''}</p>
                            </div>
                            <div className="h-8 bg-slate-50 rounded mb-3 flex items-center justify-center text-slate-300 text-xs">
                                ··· invoice items ···
                            </div>
                            {footerValue && (
                                <p className="text-center text-xs text-slate-500 border-t pt-2">{footerValue}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <Button type="submit" className="w-full sm:w-auto">
                Save Outlet Settings
            </Button>
        </form>
    );
}
