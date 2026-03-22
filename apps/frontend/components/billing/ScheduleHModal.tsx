'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldAlert, ImagePlus, X } from 'lucide-react';
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

interface ScheduleHModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: ScheduleHData) => void;
    isMandatory: boolean;
}

export function ScheduleHModal({ isOpen, onClose, onSubmit, isMandatory }: ScheduleHModalProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const form = useForm<ScheduleHData>({
        resolver: zodResolver(scheduleHSchema) as any,
        defaultValues: {
            patientName: '',
            patientAge: 0,
            patientAddress: '',
            doctorName: '',
            doctorRegNo: '',
            prescriptionNo: `RX-${Date.now().toString().slice(-6)}`,
        },
    });

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
    };

    const handleRemoveFile = () => {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }
        setPreviewUrl(null);
    };

    const handleFormSubmit = (data: ScheduleHData) => {
        onSubmit(data);
    };

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open && !isMandatory) onClose();
            }}
        >
            <DialogContent
                data-testid="schedule-h-modal"
                className="max-w-xl max-h-[90vh] overflow-y-auto"
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
                                    ? "Required for Schedule H1/X/Narcotic drugs"
                                    : "Add for Schedule H compliance (recommended)"}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6 mt-4">
                        
                        {/* Doctor Details Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">Doctor Details</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="doctorName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Doctor Name *</FormLabel>
                                            <FormControl>
                                                <Input data-testid="sh-doctor-name" placeholder="Dr. Smith" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="doctorRegNo"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Registration No. *</FormLabel>
                                            <FormControl>
                                                <Input data-testid="sh-doctor-regno" placeholder="MH/12345" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>

                        {/* Patient Details Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-slate-900 border-b pb-2">Patient Details</h3>
                            <div className="grid grid-cols-3 gap-4">
                                <FormField
                                    control={form.control}
                                    name="patientName"
                                    render={({ field }) => (
                                        <FormItem className="col-span-2">
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
                                    name="patientAge"
                                    render={({ field }) => (
                                        <FormItem>
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
    );
}
