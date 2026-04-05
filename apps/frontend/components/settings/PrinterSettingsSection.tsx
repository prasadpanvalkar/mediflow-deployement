'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Printer, FileText, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useSettingsStore } from '@/store/settingsStore';
import { useToast } from '@/hooks/use-toast';
import { printerSettingsSchema, type PrinterSettingsFormValues } from '@/lib/validations/settings';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingsToggleRow } from './SettingsToggleRow';
import { cn } from '@/lib/utils';

const COPY_OPTIONS = [1, 2, 3] as const;

interface PrinterSettingsSectionProps {
    onDirty: () => void;
    onSaved: () => void;
    discardKey?: number;
}

export function PrinterSettingsSection({ onDirty, onSaved, discardKey }: PrinterSettingsSectionProps) {
    const store = useSettingsStore();
    const { toast } = useToast();
    const [previewMode, setPreviewMode] = useState<'a4' | 'thermal'>('a4');

    const getDefaults = (): PrinterSettingsFormValues => ({
        printerType: store.printerType,
        thermalWidth: store.thermalWidth,
        autoPrintAfterBill: store.autoPrintAfterBill,
        printCopies: store.printCopies,
        showMRPOnInvoice: store.showMRPOnInvoice,
        showBatchOnInvoice: store.showBatchOnInvoice,
        showDoctorOnInvoice: store.showDoctorOnInvoice,
    });

    const { handleSubmit, watch, setValue, reset, formState: { isDirty } } =
        useForm<PrinterSettingsFormValues>({
            resolver: zodResolver(printerSettingsSchema),
            defaultValues: getDefaults(),
        });

    useEffect(() => {
        if (discardKey !== undefined) reset(getDefaults());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [discardKey]);

    useEffect(() => {
        if (isDirty) onDirty();
    }, [isDirty, onDirty]);

    const printerType = watch('printerType');
    const thermalWidth = watch('thermalWidth');
    const showMRP = watch('showMRPOnInvoice');
    const showBatch = watch('showBatchOnInvoice');
    const showDoctor = watch('showDoctorOnInvoice');
    const autoPrint = watch('autoPrintAfterBill');
    const printCopies = watch('printCopies');

    function onSubmit(data: PrinterSettingsFormValues) {
        store.updatePrinterSettings(data);
        toast({ title: 'Printer settings saved' });
        onSaved();
        reset(data);
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <SettingsSectionHeader
                icon={<Printer />}
                title="Printing Settings"
                description="Configure invoice printing for your printer type."
            />

            {/* Printer Type */}
            <div className="space-y-3">
                <Label>Printer Type</Label>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            setValue('printerType', 'a4', { shouldDirty: true });
                            setPreviewMode('a4');
                        }}
                        className={cn(
                            'border-2 rounded-xl p-5 text-left transition-colors',
                            printerType === 'a4'
                                ? 'border-primary bg-primary/5'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                        )}
                    >
                        <FileText className="w-8 h-8 text-blue-500 mb-2" />
                        <p className="text-sm font-semibold text-slate-900">A4 / Letter</p>
                        <p className="text-xs text-muted-foreground mt-1">Standard inkjet or laser printer</p>
                        <p className="text-xs text-muted-foreground">210mm × 297mm</p>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setValue('printerType', 'thermal', { shouldDirty: true });
                            setPreviewMode('thermal');
                        }}
                        className={cn(
                            'border-2 rounded-xl p-5 text-left transition-colors',
                            printerType === 'thermal'
                                ? 'border-primary bg-primary/5'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                        )}
                    >
                        <ReceiptText className="w-8 h-8 text-green-500 mb-2" />
                        <p className="text-sm font-semibold text-slate-900">Thermal / POS</p>
                        <p className="text-xs text-muted-foreground mt-1">58mm or 80mm roll paper</p>
                        <p className="text-xs text-muted-foreground">Commonly used in pharmacies</p>
                    </button>
                </div>

                {printerType === 'thermal' && (
                    <div className="flex gap-3 ml-1">
                        {(['58mm', '80mm'] as const).map((w) => (
                            <label key={w} className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={thermalWidth === w}
                                    onChange={() => setValue('thermalWidth', w, { shouldDirty: true })}
                                    className="accent-primary"
                                />
                                <span className="text-sm text-slate-700">{w}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {/* Print Options */}
            <div className="rounded-xl border bg-white divide-y px-4">
                <SettingsToggleRow
                    label="Auto-print after saving bill"
                    description="Automatically opens print dialog after each bill is saved"
                    checked={autoPrint}
                    onCheckedChange={(v) => setValue('autoPrintAfterBill', v, { shouldDirty: true })}
                    className="border-b-0"
                />
                <SettingsToggleRow
                    label="Show MRP on invoice"
                    description="Prints MRP column in invoice items"
                    checked={showMRP}
                    onCheckedChange={(v) => setValue('showMRPOnInvoice', v, { shouldDirty: true })}
                    className="border-b-0"
                />
                <SettingsToggleRow
                    label="Show batch number on invoice"
                    checked={showBatch}
                    onCheckedChange={(v) => setValue('showBatchOnInvoice', v, { shouldDirty: true })}
                    className="border-b-0"
                />
                <SettingsToggleRow
                    label="Show doctor details on invoice"
                    description="When Schedule H drugs are billed"
                    checked={showDoctor}
                    onCheckedChange={(v) => setValue('showDoctorOnInvoice', v, { shouldDirty: true })}
                    className="border-b-0"
                />
            </div>

            {/* Print Copies */}
            <div className="space-y-2">
                <Label>Number of copies to print</Label>
                <div className="flex gap-2">
                    {COPY_OPTIONS.map((n) => (
                        <button
                            key={n}
                            type="button"
                            onClick={() => setValue('printCopies', n, { shouldDirty: true })}
                            className={cn(
                                'w-10 h-10 rounded-lg border text-sm font-medium transition-colors',
                                printCopies === n
                                    ? 'border-primary bg-primary text-white'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            )}
                        >
                            {n}
                        </button>
                    ))}
                </div>
            </div>

            {/* Live Invoice Preview */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Preview</p>
                    <div className="flex gap-1 ml-2">
                        <button
                            type="button"
                            onClick={() => setPreviewMode('a4')}
                            className={cn(
                                'text-xs px-2 py-1 rounded border transition-colors',
                                previewMode === 'a4'
                                    ? 'bg-primary text-white border-primary'
                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            )}
                        >
                            Preview A4
                        </button>
                        <button
                            type="button"
                            onClick={() => setPreviewMode('thermal')}
                            className={cn(
                                'text-xs px-2 py-1 rounded border transition-colors',
                                previewMode === 'thermal'
                                    ? 'bg-primary text-white border-primary'
                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            )}
                        >
                            Preview Thermal
                        </button>
                    </div>
                </div>

                {previewMode === 'a4' ? (
                    <div className="border rounded-xl overflow-hidden bg-white max-w-sm">
                        <div className="transform scale-[0.55] origin-top-left w-[182%]">
                            <div className="p-8 font-mono text-xs">
                                <div className="text-center border-b pb-3 mb-3">
                                    <p className="text-lg font-bold">Your Pharmacy Name</p>
                                    <p className="text-xs text-slate-500">Your Address, City — PINCODE</p>
                                    <p className="text-xs text-slate-500">GSTIN: — | Ph: —</p>
                                </div>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left py-1">Product</th>
                                            <th className="text-right py-1">Qty</th>
                                            {showMRP && <th className="text-right py-1">MRP</th>}
                                            <th className="text-right py-1">Rate</th>
                                            <th className="text-right py-1">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-b">
                                            <td className="py-1">
                                                <p>Metformin 500mg</p>
                                                {showBatch && <p className="text-slate-400">Batch: B2401</p>}
                                            </td>
                                            <td className="text-right py-1">2</td>
                                            {showMRP && <td className="text-right py-1">38.00</td>}
                                            <td className="text-right py-1">32.00</td>
                                            <td className="text-right py-1">64.00</td>
                                        </tr>
                                    </tbody>
                                </table>
                                {showDoctor && (
                                    <div className="mt-2 text-xs text-slate-500 border-t pt-2">
                                        <p>Dr. Ramesh Patil | Reg. MH-12345</p>
                                    </div>
                                )}
                                <div className="border-t mt-3 pt-2 text-right text-xs">
                                    <p className="font-bold">Grand Total: ₹64.00</p>
                                </div>
                                <p className="text-center text-xs text-slate-400 mt-4">Thank you for your purchase!</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="border rounded-xl overflow-hidden bg-white max-w-[200px]">
                        <div className="transform scale-[0.7] origin-top-left w-[143%]">
                            <div className="p-4 font-mono text-xs text-center">
                                <p className="font-bold text-sm">MediFlow</p>
                                <p className="text-[10px] text-slate-500">Mumbai 400001</p>
                                <div className="border-t border-dashed my-2" />
                                <div className="text-left space-y-1">
                                    <div className="flex justify-between">
                                        <span>Metformin 500mg</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-slate-500">
                                        <span>2 × 32.00</span>
                                        {showMRP && <span>MRP:38</span>}
                                    </div>
                                    {showBatch && <p className="text-[10px] text-slate-400">Batch: B2401</p>}
                                </div>
                                <div className="border-t border-dashed my-2" />
                                <div className="flex justify-between font-bold text-[11px]">
                                    <span>TOTAL</span>
                                    <span>₹64.00</span>
                                </div>
                                <p className="text-[9px] text-slate-400 mt-2">Thank you!</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Test Print */}
            <div className="flex items-center gap-3">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.print()}
                >
                    <Printer className="w-4 h-4 mr-2" />
                    Print Test Invoice
                </Button>
                <Button type="submit">
                    Save Printer Settings
                </Button>
            </div>
        </form>
    );
}
