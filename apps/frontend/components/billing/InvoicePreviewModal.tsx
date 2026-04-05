'use client';

import React, { useRef } from 'react';
import { Printer, Download, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SaleInvoice } from '@/types';
import { useSettingsStore } from '@/store/settingsStore';
import { InvoicePreview } from './InvoicePreview';
import { InvoiceThermal } from './InvoiceThermal';

interface InvoicePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: SaleInvoice | null;
    onNewBill?: () => void;
}

export function InvoicePreviewModal({ isOpen, onClose, invoice, onNewBill }: InvoicePreviewModalProps) {
    const { printerType } = useSettingsStore();
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
        if (typeof window !== 'undefined') {
            window.print();
        }
    };

    if (!invoice) return null;

    const isThermal = printerType?.startsWith('thermal');

    return (
        <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="invoice-print-container max-w-4xl max-h-[95vh] flex flex-col p-0 overflow-hidden print:max-h-none print:overflow-visible print:border-none bg-slate-100/50 print:bg-white text-black">
                <style dangerouslySetInnerHTML={{ __html: `
                    @media print {
                        @page {
                            size: ${!isThermal ? 'auto' : printerType === 'thermal_80mm' ? '80mm auto' : '57mm auto'};
                            margin: 0mm;
                        }
                        body {
                            -webkit-print-color-adjust: exact;
                        }
                        body * { visibility: hidden; }
                        .invoice-print-container, .invoice-print-container * { visibility: visible; }
                        .invoice-print-container {
                            position: absolute !important;
                            left: 0 !important;
                            top: 0 !important;
                            margin: 0 !important;
                            width: 100% !important;
                            max-width: none !important;
                            transform: none !important;
                            box-shadow: none !important;
                        }
                        .invoice-print-container .print\\:hidden, .invoice-print-container .print\\:hidden * { 
                            display: none !important; 
                        }
                    }
                `}} />
                
                <DialogHeader className="px-6 py-4 bg-white border-b border-slate-200 flex flex-row items-center justify-between shrink-0 print:hidden">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle>Invoice {invoice.invoiceNo}</DialogTitle>
                            <p className="text-xs text-slate-500 mt-0.5">Preview generated for {isThermal ? 'Thermal Receipt' : 'A4 Paper'}</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => {}}>
                            <Download className="w-4 h-4 mr-2" /> PDF
                        </Button>
                        <Button size="sm" onClick={handlePrint}>
                            <Printer className="w-4 h-4 mr-2" /> Print
                        </Button>
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 p-6 flex flex-col overflow-y-auto print:overflow-visible print:p-0 bg-slate-100/50 print:bg-white text-black">
                    <div className="mx-auto bg-white shadow-xl min-h-[500px] print:shadow-none print:m-0">
                        {isThermal ? (
                            <InvoiceThermal ref={printRef} invoice={invoice} />
                        ) : (
                            <InvoicePreview ref={printRef} invoice={invoice} />
                        )}
                    </div>
                </ScrollArea>

                <DialogFooter className="px-6 py-4 bg-white border-t border-slate-200 shrink-0 sm:justify-between items-center print:hidden">
                    <p className="text-xs text-slate-500 hidden sm:block">Press <kbd className="bg-slate-100 border px-1 rounded-sm">Ctrl+P</kbd> to quick print</p>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Button type="button" variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
                            Close Preview
                        </Button>
                        {onNewBill && (
                            <Button type="button" onClick={() => { onClose(); onNewBill(); }} className="flex-1 sm:flex-none">
                                Start New Bill
                            </Button>
                        )}
                    </div>
                </DialogFooter>

            </DialogContent>
        </Dialog>
    );
}
