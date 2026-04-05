'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { FileText, Printer, X, ArrowDownLeft, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { salesApi } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

interface SaleReturnDetailModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    returnId: string | null;
}

const formatINR = (n: number | undefined) =>
    '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const REFUND_MODE_LABELS: Record<string, string> = {
    cash: 'Cash Refund',
    upi: 'UPI Refund',
    credit_note: 'Credit Note',
};

export function SaleReturnDetailModal({ open, onOpenChange, returnId }: SaleReturnDetailModalProps) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const { outlet } = useAuthStore();
    const settings = useSettingsStore();

    useEffect(() => {
        if (!open || !returnId) {
            setData(null);
            return;
        }

        let isMounted = true;
        setLoading(true);

        salesApi.getReturnById(returnId)
            .then((res) => {
                if (isMounted) {
                    setData(res.data);
                }
            })
            .catch((err) => {
                console.error("Failed to load return details", err);
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => { isMounted = false; };
    }, [returnId, open]);

    const handlePrint = () => {
        window.print();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="invoice-print-container max-w-4xl max-h-[90vh] overflow-y-auto p-0 print:max-h-none print:overflow-visible print:p-0 print:border-none border-t-4 border-t-red-500 gap-0">
                
                {/* ── Print Styles ── */}
                <style dangerouslySetInnerHTML={{ __html: `
                    @media print {
                        @page { size: auto; margin: 0mm; }
                        body { -webkit-print-color-adjust: exact; }
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

                {/* ── Screen header ── */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white border-b print:hidden">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                            <ArrowDownLeft className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Sale Return Details</DialogTitle>
                            <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                                Return #{data?.returnNo || '...'}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handlePrint} disabled={!data}>
                            <Printer className="w-4 h-4 mr-2" />
                            Print / PDF
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 ml-2" onClick={() => onOpenChange(false)}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-muted-foreground animate-pulse">
                        Loading return details...
                    </div>
                ) : data ? (
                    <div className="bg-white">
                        {/* ── Screen View (Hidden when printing) ── */}
                        <div className="p-8 print:hidden">
                            <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
                                {/* Left Details */}
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-muted-foreground font-medium mb-1 text-xs uppercase tracking-wide">Customer Info</h3>
                                        <p className="font-semibold text-lg text-foreground">{data.customerName || 'Walk-in Customer'}</p>
                                    </div>
                                    <div className="bg-slate-50 border rounded-lg p-3">
                                        <h3 className="text-muted-foreground font-medium mb-2 text-xs uppercase tracking-wide">Return details</h3>
                                        <div className="grid grid-cols-2 gap-y-3">
                                            <div>
                                                <p className="text-muted-foreground text-xs">Return Date</p>
                                                <p className="font-medium">{format(new Date(data.returnDate), 'dd MMM yyyy')}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground text-xs">Original Bill</p>
                                                <p className="font-medium font-mono">{data.originalInvoiceNo}</p>
                                            </div>
                                        </div>
                                        {data.reason && (
                                            <div className="mt-3 pt-3 border-t">
                                                <p className="text-muted-foreground text-xs">Reason</p>
                                                <p className="text-slate-700 italic">{data.reason}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Details */}
                                <div className="space-y-4 flex flex-col justify-end">
                                    <div className="bg-slate-50 text-slate-900 border border-slate-200 rounded-lg p-4">
                                        <p className="text-slate-500 text-xs font-medium uppercase mb-1">Total Refund Amount</p>
                                        <p className="font-bold text-2xl">{formatINR(data.totalAmount)}</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Refunded via <span className="font-medium text-slate-700">{REFUND_MODE_LABELS[data.refundMode] || data.refundMode}</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* ── Table ── */}
                            <div className="rounded border bg-white overflow-hidden mb-6">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-muted/50 border-b">
                                        <tr>
                                            <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase">Product Name</th>
                                            <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase">Batch</th>
                                            <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase text-right">Qty Ret</th>
                                            <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase text-right">Rate</th>
                                            <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase text-right">Refund Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y text-slate-700">
                                        {data.items?.map((item: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 font-medium text-slate-900">{item.productName}</td>
                                                <td className="px-4 py-3 font-mono text-muted-foreground">{item.batchNo}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className="font-semibold">{item.qtyReturned}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums">{formatINR(item.returnRate)}</td>
                                                <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{formatINR(item.totalAmount)}</td>
                                            </tr>
                                        ))}
                                        {(!data.items || data.items.length === 0) && (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground italic">
                                                    No items found for this return.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* ── Print Content Area (Hidden on screen, visible only when printing) ── */}
                        {/* professional A4 invoice structure */}
                        <div className="hidden print:block w-full max-w-none mx-auto p-4 bg-white text-black font-sans box-border" style={{ fontFamily: 'Arial, sans-serif' }}>
                            {(() => {
                                const outletName = settings.outletName || outlet?.name || 'PHARMACY';
                                const outletAddress = settings.outletAddress || outlet?.address || '';
                                const outletCity = settings.outletCity || outlet?.city || '';
                                const outletPhone = settings.outletPhone || outlet?.phone || '';
                                const outletLogoUrl = settings.outletLogoUrl || outlet?.logoUrl;
                                const outletGstin = settings.outletGstin || outlet?.gstin || '';
                                const outletDrugLicenseNo = settings.outletDrugLicenseNo || outlet?.drugLicenseNo || '';

                                return (
                                    <div className="bg-white text-slate-900 font-sans text-[11px] leading-tight w-full max-w-2xl print:max-w-none print:w-full mx-auto p-4 border border-slate-400 print:p-3 print:shadow-none print:border-black box-border">
                                        <div className="text-center mb-2 flex flex-col justify-center items-center">
                                            {outletLogoUrl && (
                                                <img src={outletLogoUrl} alt="Logo" className="h-12 object-contain mx-auto mb-1" />
                                            )}
                                            <h1 className="text-base font-bold uppercase tracking-wide leading-tight">
                                                {outletName}
                                            </h1>
                                            <p className="text-[10px] mt-0.5">
                                                {outletAddress} {outletCity && `, ${outletCity}`}
                                            </p>
                                            {outletPhone && <p className="text-[10px]">Ph: {outletPhone}</p>}
                                            {outletGstin && <p className="text-[10px] text-slate-500">GSTIN: {outletGstin}</p>}
                                            {outletDrugLicenseNo && <p className="text-[10px] text-slate-500">D.L.No.: {outletDrugLicenseNo}</p>}
                                        </div>

                                        <div className="text-center font-bold text-xs uppercase border-y border-black py-1 mb-2">
                                            SALE RETURN NOTE
                                        </div>

                                        <div className="flex justify-between items-start mb-3 border-b border-black pb-2">
                                            <div className="w-1/2 pr-2">
                                                <p><span className="font-semibold">Return No:</span> <span className="font-bold">{data.returnNo}</span></p>
                                                <p><span className="font-semibold">Return Date:</span> {format(new Date(data.returnDate), 'dd MMM yyyy')}</p>
                                                <p><span className="font-semibold">Original Invoice:</span> {data.originalInvoiceNo}</p>
                                            </div>
                                            <div className="w-1/2 pl-2">
                                                <p><span className="font-semibold">Customer:</span> {data.customerName || 'Walk-in Customer'}</p>
                                                <p><span className="font-semibold">Refund Mode:</span> {REFUND_MODE_LABELS[data.refundMode] || data.refundMode}</p>
                                                {data.reason && <p><span className="font-semibold">Reason:</span> {data.reason}</p>}
                                            </div>
                                        </div>

                                        <table className="w-full text-left border-collapse mb-2 border border-black">
                                            <thead>
                                                <tr className="border-b border-black">
                                                    <th className="py-1 px-1 border-r border-black font-semibold text-[10px] w-8 text-center">#</th>
                                                    <th className="py-1 px-1 border-r border-black font-semibold text-[10px]">Item</th>
                                                    <th className="py-1 px-1 border-r border-black font-semibold text-[10px] w-16">Batch</th>
                                                    <th className="py-1 px-1 border-r border-black font-semibold text-[10px] w-12 text-right">Ret Qty</th>
                                                    <th className="py-1 px-1 border-r border-black font-semibold text-[10px] w-16 text-right">Rate</th>
                                                    <th className="py-1 px-1 font-semibold text-[10px] w-16 text-right">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.items?.map((item: any, idx: number) => (
                                                    <tr key={idx} className="border-b border-gray-300 last:border-b-black">
                                                        <td className="py-1 px-1 border-r border-black text-center">{idx + 1}</td>
                                                        <td className="py-1 px-1 border-r border-black">{item.productName}</td>
                                                        <td className="py-1 px-1 border-r border-black">{item.batchNo}</td>
                                                        <td className="py-1 px-1 border-r border-black text-right font-medium">{item.qtyReturned}</td>
                                                        <td className="py-1 px-1 border-r border-black text-right">{formatINR(item.returnRate)}</td>
                                                        <td className="py-1 px-1 text-right font-medium">{formatINR(item.totalAmount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        <div className="flex justify-end border-b border-black pb-2 mb-2">
                                            <div className="w-1/3 min-w-[150px]">
                                                <div className="flex justify-between font-bold text-xs pt-1 border-t border-black border-dashed mt-1">
                                                    <span>Total Refund</span>
                                                    <span>{formatINR(data.totalAmount)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-8 flex justify-between items-end">
                                            <div className="text-[10px] text-gray-600">
                                                <p>Goods once sold cannot be taken back without original bill.</p>
                                            </div>
                                            <div className="text-center">
                                                <div className="border-t border-black w-32 mb-1"></div>
                                                <p className="font-semibold text-[10px]">Authorized Signatory</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                ) : null}

            </DialogContent>
        </Dialog>
    );
}
