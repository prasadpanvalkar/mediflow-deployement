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
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 print:max-h-none print:overflow-visible print:p-0 print:border-none border-t-4 border-t-red-500 gap-0">
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
                        {/* We use an established A4 invoice structure designed specifically for paper */}
                        <div className="hidden print:block bg-white text-black p-8 max-w-[210mm] mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
                            {/* Professional Print Header */}
                            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="bg-slate-800 text-white p-3 rounded-lg" style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact' }}>
                                        <Building2 className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h1 className="text-3xl font-black text-slate-900 tracking-tight m-0 uppercase">Mediflow Pharmacy</h1>
                                        <p className="text-slate-600 text-sm mt-1">123 Health Avenue, Medical District</p>
                                        <p className="text-slate-600 text-sm">Cityville, State 12345 • Ph: +1 234 567 8900</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <h2 className="text-3xl font-bold text-slate-300 uppercase tracking-widest mb-2" style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact' }}>RETURN</h2>
                                    <p className="text-lg font-bold text-slate-800 mb-1">#{data.returnNo}</p>
                                    <p className="text-sm text-slate-500 font-medium">Date: {format(new Date(data.returnDate), 'dd MMM yyyy')}</p>
                                </div>
                            </div>

                            {/* Two-column info structure for print */}
                            <div className="flex justify-between items-start mb-8 gap-12">
                                <div className="flex-1">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-200 pb-1">Customer Details</h3>
                                    <p className="font-bold text-lg text-slate-900 mb-1">{data.customerName || 'Walk-in Customer'}</p>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-200 pb-1">Return Information</h3>
                                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                                        <p className="text-slate-500">Original Invoice:</p>
                                        <p className="font-semibold text-slate-900 text-right">{data.originalInvoiceNo}</p>
                                        <p className="text-slate-500">Refund Mode:</p>
                                        <p className="font-semibold text-slate-900 text-right">{REFUND_MODE_LABELS[data.refundMode] || data.refundMode}</p>
                                        {data.reason && (
                                            <>
                                                <p className="text-slate-500">Reason:</p>
                                                <p className="font-semibold text-slate-900 text-right">{data.reason}</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Clean Print Table */}
                            <div className="mb-6">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100/80 border-y-2 border-slate-300" style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact' }}>
                                            <th className="py-3 px-2 font-bold text-slate-800 uppercase text-xs tracking-wider">Item Details</th>
                                            <th className="py-3 px-2 font-bold text-slate-800 uppercase text-xs tracking-wider">Batch</th>
                                            <th className="py-3 px-2 font-bold text-slate-800 uppercase text-xs tracking-wider text-right">Qty Ret</th>
                                            <th className="py-3 px-2 font-bold text-slate-800 uppercase text-xs tracking-wider text-right">Rate</th>
                                            <th className="py-3 px-2 font-bold text-slate-800 uppercase text-xs tracking-wider text-right">Refund</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 border-b-2 border-slate-300">
                                        {data.items?.map((item: any, idx: number) => (
                                            <tr key={idx}>
                                                <td className="py-3 px-2 font-semibold text-slate-900">{item.productName}</td>
                                                <td className="py-3 px-2 text-slate-600 font-mono text-xs">{item.batchNo}</td>
                                                <td className="py-3 px-2 text-right font-semibold">{item.qtyReturned}</td>
                                                <td className="py-3 px-2 text-right text-slate-700">{formatINR(item.returnRate)}</td>
                                                <td className="py-3 px-2 text-right font-bold text-slate-900">{formatINR(item.totalAmount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Print Totals Section */}
                            <div className="flex justify-end pt-4">
                                <div className="w-72 bg-slate-50 p-4 rounded-lg border border-slate-200" style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact' }}>
                                    <div className="flex justify-between items-center text-lg font-black text-slate-900 pt-2">
                                        <span className="uppercase text-sm">Total Refund</span>
                                        <span>{formatINR(data.totalAmount)}</span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Print Footer */}
                            <div className="mt-16 pt-8 border-t border-slate-200 text-center text-slate-500 text-xs">
                                <p>Thank you for choosing Mediflow Pharmacy.</p>
                                <p className="mt-1">This is a computer generated document and requires no signature.</p>
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* Built-in Print Overrides */}
                <style dangerouslySetInnerHTML={{ __html: `
                    @media print {
                        body * {
                            visibility: hidden;
                        }
                        [role="dialog"], [role="dialog"] * {
                            visibility: visible;
                        }
                        [role="dialog"] {
                            position: absolute;
                            left: 0;
                            top: 0;
                            margin: 0;
                            padding: 0;
                            top: 0;
                            width: 100%;
                            max-width: none !important;
                            transform: none !important;
                            box-shadow: none !important;
                            overflow: visible !important;
                            transform: none !important;
                        }
                    }
                ` }} />
            </DialogContent>
        </Dialog>
    );
}
