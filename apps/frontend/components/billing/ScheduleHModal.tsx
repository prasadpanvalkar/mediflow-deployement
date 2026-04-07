'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldAlert, ImagePlus, X, Search, Stethoscope, Plus, Loader2 } from 'lucide-react';
import { scheduleHSchema, type ScheduleHData } from '@/lib/validations/billing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { useDoctorSearch, useCreateDoctor } from '@/hooks/useCustomers';
import { useDebounce } from '@/hooks/useDebounce';
import { useBillingStore } from '@/store/billingStore';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { voucherApi } from '@/lib/apiClient';
import { Doctor } from '@/types';
import { useOutletId } from '@/hooks/useOutletId';

interface ScheduleHModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: ScheduleHData) => void;
    isMandatory: boolean;
}

export function ScheduleHModal({ isOpen, onClose, onSubmit, isMandatory }: ScheduleHModalProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // ── Patient search state ─────────────────────────────────────────────────
    const outletId = useOutletId();
    const [patientQuery, setPatientQuery] = useState('');
    const [showPatientResults, setShowPatientResults] = useState(false);
    const debouncedPatientQuery = useDebounce(patientQuery, 300);
    const { setCustomerLedger } = useBillingStore();
    
    const { data: patientResults = [], isLoading: isPatientSearching } = useQuery({
        queryKey: ['ledgers', outletId, 'Sundry Debtors', debouncedPatientQuery],
        queryFn: () => voucherApi.getLedgers(outletId, { group: 'Sundry Debtors', search: debouncedPatientQuery }),
        enabled: !!outletId && debouncedPatientQuery.length >= 2,
        staleTime: 60_000,
    });

    // ── Doctor search state ──────────────────────────────────────────────────
    const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
    const [doctorQuery, setDoctorQuery] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newDoctorName, setNewDoctorName] = useState('');
    const [newDoctorRegNo, setNewDoctorRegNo] = useState('');
    const [newDoctorDegree, setNewDoctorDegree] = useState('');
    const [newDoctorHospital, setNewDoctorHospital] = useState('');
    const [newDoctorAddress, setNewDoctorAddress] = useState('');
    const [newDoctorSpecialty, setNewDoctorSpecialty] = useState('');
    const [newDoctorQualification, setNewDoctorQualification] = useState('');

    const debouncedQuery = useDebounce(doctorQuery, 300);
    const { data: doctorResults = [], isLoading: isDoctorSearching } = useDoctorSearch(debouncedQuery);
    const createDoctorMutation = useCreateDoctor();
    const { setDoctor } = useBillingStore();
    const { toast } = useToast();

    const form = useForm<ScheduleHData>({
        resolver: zodResolver(scheduleHSchema) as any,
        defaultValues: {
            patientName: '',
            patientPhone: '',
            patientAge: 0,
            patientAddress: '',
            doctorName: '',
            doctorRegNo: '',
            prescriptionNo: `RX-${Date.now().toString().slice(-6)}`,
        },
    });

    const handleDoctorSelect = (doctor: Doctor) => {
        setSelectedDoctor(doctor);
        setDoctor(doctor);
        form.setValue('doctorName', doctor.name, { shouldValidate: true });
        form.setValue('doctorRegNo', doctor.regNo || 'N/A', { shouldValidate: true });
        setDoctorQuery('');
    };

    const handleDoctorClear = () => {
        setSelectedDoctor(null);
        setDoctor(null);
        form.setValue('doctorName', '');
        form.setValue('doctorRegNo', '');
    };

    const handleCreateDoctor = async () => {
        if (!newDoctorName.trim() || !newDoctorRegNo.trim()) return;
        try {
            const doctor = await createDoctorMutation.mutateAsync({
                name: newDoctorName.trim(),
                registrationNo: newDoctorRegNo.trim(),
                degree: newDoctorDegree.trim(),
                hospitalName: newDoctorHospital.trim(),
                address: newDoctorAddress.trim(),
                specialty: newDoctorSpecialty.trim(),
                qualification: newDoctorQualification.trim(),
            });
            handleDoctorSelect(doctor);
            setShowCreateForm(false);
            // Reset fields
            setNewDoctorName('');
            setNewDoctorRegNo('');
            setNewDoctorDegree('');
            setNewDoctorHospital('');
            setNewDoctorAddress('');
            setNewDoctorSpecialty('');
            setNewDoctorQualification('');
            toast({ title: `${doctor.name} added` });
        } catch {
            toast({ variant: 'destructive', title: 'Failed to create doctor' });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setPreviewUrl(URL.createObjectURL(file));
    };

    const handleRemoveFile = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
    };

    const handleFormSubmit = (data: ScheduleHData) => {
        onSubmit(data);
    };

    const showSearchResults = debouncedQuery.length >= 2;

    return (
        <>
            <Dialog
                open={isOpen}
                onOpenChange={(open) => {
                    if (!open) onClose();
                }}
            >
            <DialogContent
                data-testid="schedule-h-modal"
                className="max-w-2xl max-h-[95vh] overflow-y-auto"
                onInteractOutside={(e) => {
                    if (isMandatory) e.preventDefault();
                }}
            >
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <ShieldAlert className={`w-6 h-6 ${isMandatory ? 'text-red-500' : 'text-amber-500'}`} />
                        <div>
                            <DialogTitle>Schedule Drug Details</DialogTitle>
                            <DialogDescription>
                                {isMandatory
                                    ? "Required for Schedule H1/X/C/Narcotic drugs"
                                    : "Required for Schedule G/H drugs"}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6 mt-4">

                        {/* Hidden RHF fields — set programmatically when doctor is selected */}
                        <input type="hidden" {...form.register('doctorName')} />
                        <input type="hidden" {...form.register('doctorRegNo')} />

                        {/* Doctor Details Section */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">Doctor Details</h3>

                            {selectedDoctor ? (
                                /* Selected doctor badge */
                                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
                                    <Stethoscope className="w-5 h-5 text-blue-600 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-2">
                                            <p className="text-sm font-semibold text-slate-800 leading-tight">{selectedDoctor.name}</p>
                                            {selectedDoctor.degree && <span className="text-xs text-slate-500 font-normal">({selectedDoctor.degree})</span>}
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {[
                                                selectedDoctor.regNo && `Reg: ${selectedDoctor.regNo}`,
                                                selectedDoctor.specialty || (selectedDoctor as any).specialization,
                                                selectedDoctor.hospitalName
                                            ].filter(Boolean).join(' • ')}
                                        </p>
                                    </div>
                                    <button type="button" onClick={handleDoctorClear} className="text-slate-400 hover:text-red-500 transition-colors p-0.5">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : showCreateForm ? (
                                /* Inline create form - Expanded */
                                <div className="space-y-4 border border-slate-200 rounded-lg p-5 bg-slate-50/50">
                                    <div className="flex justify-between items-center">
                                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">New Doctor Details</p>
                                        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-slate-400 hover:text-slate-600"
                                            onClick={() => { setShowCreateForm(false); setNewDoctorName(''); setNewDoctorRegNo(''); }}>
                                            <X className="w-3 h-3 mr-1" /> Close
                                        </Button>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-slate-600">Full Name *</label>
                                            <Input
                                                value={newDoctorName}
                                                onChange={e => setNewDoctorName(e.target.value)}
                                                placeholder="Dr. Name"
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-slate-600">Reg. No. *</label>
                                            <Input
                                                value={newDoctorRegNo}
                                                onChange={e => setNewDoctorRegNo(e.target.value)}
                                                placeholder="MH/12345"
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-slate-600">Degree</label>
                                            <Input
                                                value={newDoctorDegree}
                                                onChange={e => setNewDoctorDegree(e.target.value)}
                                                placeholder="MBBS, MD"
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-slate-600">Specialties</label>
                                            <Input
                                                value={newDoctorSpecialty}
                                                onChange={e => setNewDoctorSpecialty(e.target.value)}
                                                placeholder="Cardiology"
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-slate-600">Hospital Name</label>
                                            <Input
                                                value={newDoctorHospital}
                                                onChange={e => setNewDoctorHospital(e.target.value)}
                                                placeholder="City Hospital"
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-slate-600">Qualification</label>
                                            <Input
                                                value={newDoctorQualification}
                                                onChange={e => setNewDoctorQualification(e.target.value)}
                                                placeholder="FCPS, DGO"
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                        <div className="col-span-2 space-y-1">
                                            <label className="text-xs font-medium text-slate-600">Hospital Address</label>
                                            <Input
                                                value={newDoctorAddress}
                                                onChange={e => setNewDoctorAddress(e.target.value)}
                                                placeholder="Full hospital address"
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-2 justify-end pt-2">
                                        <Button type="button" size="sm" className="px-6"
                                            disabled={!newDoctorName.trim() || !newDoctorRegNo.trim() || createDoctorMutation.isPending}
                                            onClick={handleCreateDoctor}>
                                            {createDoctorMutation.isPending
                                                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Saving…</>
                                                : 'Save & Select Doctor'}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                /* Search input + results */
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2.5 bg-white focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                                        <Search className="w-4 h-4 text-slate-400 shrink-0" />
                                        <input
                                            value={doctorQuery}
                                            onChange={e => setDoctorQuery(e.target.value)}
                                            placeholder="Search doctor by name or reg no…"
                                            className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400"
                                            autoComplete="off"
                                        />
                                        {doctorQuery && (
                                            <button type="button" onClick={() => setDoctorQuery('')} className="text-slate-400 hover:text-slate-600">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>

                                    {showSearchResults && (
                                        <div className="border border-slate-200 rounded-lg bg-white divide-y max-h-44 overflow-y-auto shadow-sm">
                                            {isDoctorSearching ? (
                                                <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-500">
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    Searching…
                                                </div>
                                            ) : (
                                                <>
                                                    {doctorResults.map((doc: Doctor) => (
                                                        <button key={doc.id} type="button"
                                                            onClick={() => handleDoctorSelect(doc)}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors">
                                                            <Stethoscope className="w-4 h-4 text-slate-400 shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
                                                                <p className="text-xs text-slate-500">
                                                                    {[doc.regNo && `Reg: ${doc.regNo}`, doc.qualification].filter(Boolean).join(' • ')}
                                                                </p>
                                                            </div>
                                                            <span className="text-xs text-primary font-medium shrink-0">Select</span>
                                                        </button>
                                                    ))}
                                                    <button type="button"
                                                        onClick={() => { setShowCreateForm(true); setNewDoctorName(doctorQuery); setDoctorQuery(''); }}
                                                        className="w-full flex items-center gap-2 px-3 py-2.5 text-primary hover:bg-blue-50 text-sm font-medium transition-colors">
                                                        <Plus className="w-4 h-4" />
                                                        {doctorResults.length === 0
                                                            ? `No results — Create "${doctorQuery}"`
                                                            : `Add "${doctorQuery}" as new doctor`}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {form.formState.errors.doctorName && !selectedDoctor && (
                                        <p className="text-xs text-red-500">Doctor is required</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Patient Details Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">Patient Details</h3>

                            {/* Patient quick-fill search */}
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-500">Quick-fill from existing customer</label>
                                <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <input
                                        value={patientQuery}
                                        onChange={e => { setPatientQuery(e.target.value); setShowPatientResults(true); }}
                                        onFocus={() => setShowPatientResults(true)}
                                        placeholder="Search patient by name or phone…"
                                        className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400"
                                        autoComplete="off"
                                    />
                                    {patientQuery && (
                                        <button type="button" onClick={() => { setPatientQuery(''); setShowPatientResults(false); }} className="text-slate-400 hover:text-slate-600">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                {showPatientResults && debouncedPatientQuery.length >= 2 && (
                                    <div className="border border-slate-200 rounded-lg bg-white divide-y max-h-36 overflow-y-auto shadow-sm">
                                        {isPatientSearching ? (
                                            <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
                                            </div>
                                        ) : (
                                            <>
                                                {patientResults.map((c: any) => (
                                                    <button key={c.id} type="button"
                                                        onClick={() => {
                                                            form.setValue('patientName', c.name, { shouldValidate: true });
                                                            form.setValue('patientPhone', c.phone || '', { shouldValidate: true });
                                                            form.setValue('patientAddress', c.address || '', { shouldValidate: true });
                                                            setCustomerLedger(c);
                                                            setPatientQuery('');
                                                            setShowPatientResults(false);
                                                            // Also auto-select the patient for the invoice
                                                            setCustomerLedger(c);
                                                        }}
                                                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left transition-colors">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                                                            <p className="text-xs text-slate-500">{c.phone}{c.address ? ` • ${c.address}` : ''}</p>
                                                        </div>
                                                        <span className="text-xs text-primary font-medium shrink-0">Fill</span>
                                                    </button>
                                                ))}
                                                <button type="button"
                                                    onClick={() => {
                                                        if (/^\d{5,}$/.test(patientQuery)) {
                                                            form.setValue('patientPhone', patientQuery, { shouldValidate: true });
                                                        } else {
                                                            form.setValue('patientName', patientQuery, { shouldValidate: true });
                                                        }
                                                        setPatientQuery('');
                                                        setShowPatientResults(false);
                                                    }}
                                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-primary hover:bg-blue-50 text-sm font-medium transition-colors">
                                                    <Plus className="w-4 h-4" />
                                                    {patientResults.length === 0
                                                        ? `No customer found — Create "${patientQuery}"`
                                                        : `Fill "${patientQuery}" as new patient`}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField
                                    control={form.control}
                                    name="patientName"
                                    render={({ field }) => (
                                        <FormItem className="col-span-1">
                                            <FormLabel>Patient Name *</FormLabel>
                                            <FormControl>
                                                <Input data-testid="sh-patient-name" placeholder="John Doe" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="patientPhone"
                                    render={({ field }) => (
                                        <FormItem className="col-span-1">
                                            <FormLabel>Mobile No</FormLabel>
                                            <FormControl>
                                                <Input data-testid="sh-patient-phone" placeholder="9876543210" {...field} value={field.value || ''} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="patientAge"
                                    render={({ field }) => (
                                        <FormItem className="col-span-1">
                                            <FormLabel>Age *</FormLabel>
                                            <FormControl>
                                                <Input data-testid="sh-patient-age" type="number" min={1} max={120} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="patientAddress"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Patient Address *</FormLabel>
                                        <FormControl>
                                            <Textarea data-testid="sh-patient-address" rows={2} placeholder="Full address" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="prescriptionNo"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Prescription No.</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Image Upload Section */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">Prescription Image (Optional)</h3>
                            {!previewUrl ? (
                                <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-primary hover:bg-slate-50 transition relative overflow-hidden group">
                                    <input
                                        type="file"
                                        accept="image/jpeg, image/png"
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                        onChange={handleFileChange}
                                    />
                                    <ImagePlus className="w-8 h-8 mx-auto text-slate-400 group-hover:text-primary mb-2" />
                                    <p className="text-sm font-medium text-slate-700">Drop prescription image here</p>
                                    <p className="text-xs text-muted-foreground mt-1">or click to browse. JPG, PNG up to 5MB</p>
                                </div>
                            ) : (
                                <div className="relative border rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center p-2 h-40 group">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={previewUrl} alt="Prescription preview" className="object-contain h-full w-full rounded-lg" />
                                    <button
                                        type="button"
                                        onClick={handleRemoveFile}
                                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 shadow-md transform opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="border-t pt-4 mt-6">
                            {isMandatory ? (
                                <>
                                    <div className="flex-1 text-xs text-muted-foreground self-center">
                                        Step 1 of 2 &mdash; Doctor Details
                                    </div>
                                    <Button type="button" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={onClose}>
                                        Cancel Bill
                                    </Button>
                                    <Button data-testid="sh-submit-btn" type="submit" className="bg-primary">
                                        Save &amp; Continue
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button type="button" variant="ghost" onClick={onClose}>
                                        Skip for now
                                    </Button>
                                    <Button data-testid="sh-submit-btn" type="submit" className="bg-primary">
                                        Save Doctor Details
                                    </Button>
                                </>
                            )}
                        </DialogFooter>

                    </form>
                </Form>
            </DialogContent>
        </Dialog>
        
        </>
    );
}
