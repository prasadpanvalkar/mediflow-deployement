'use client';

import { format } from 'date-fns';
import { Download, FileText, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { PurchaseInvoiceFull } from '@/types';
import { cn } from '@/lib/utils';
import { getPurchaseStatus, STATUS_CONFIG } from '@/lib/purchaseUtils';
import { Separator } from '@/components/ui/separator';
import { usePurchaseById } from '@/hooks/usePurchases';

interface PurchaseDetailModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: PurchaseInvoiceFull | null;
}

const formatINR = (n: number | undefined) =>
    '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PurchaseDetailModal({ open, onOpenChange, invoice }: PurchaseDetailModalProps) {
    const { data: fullInvoiceRes, isLoading } = usePurchaseById(open && invoice ? invoice.id : '');
    
    if (!invoice) return null;

    const displayInvoice = fullInvoiceRes || invoice;
    const status = getPurchaseStatus(displayInvoice);
    const cfg = STATUS_CONFIG[status];

    const handlePrint = () => {
        window.print();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* Added max-w-4xl to accommodate detailed table */}
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 print:max-h-none print:overflow-visible print:p-0 print:border-none border-t-4 border-t-primary gap-0">
                
                {/* ── Screen header ── */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white border-b print:hidden">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Purchase Request</DialogTitle>
                            <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                                Invoice #{displayInvoice.invoiceNo}
                                <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium border uppercase tracking-widest', cfg.classes)}>
                                    {cfg.label}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handlePrint}>
                            <Printer className="w-4 h-4 mr-2" />
                            Print / PDF
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 ml-2" onClick={() => onOpenChange(false)}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                              {/* ── Screen UI Area ── */}
                <div className="p-8 print:hidden bg-white">
                    <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
                        {/* Left Details */}
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-muted-foreground font-medium mb-1 text-xs uppercase tracking-wide">Distributor</h3>
                                <p className="font-semibold text-lg text-foreground">{displayInvoice.distributor?.name || 'Unknown'}</p>
                                {displayInvoice.distributor?.gstin && <p className="text-muted-foreground">GSTIN: {displayInvoice.distributor.gstin}</p>}
                                {displayInvoice.distributor?.contactNumber && <p className="text-muted-foreground">Ph: {displayInvoice.distributor.contactNumber}</p>}
                            </div>
                            <div>
                                <h3 className="text-muted-foreground font-medium mb-1 text-xs uppercase tracking-wide">Invoice details</h3>
                                <div className="grid grid-cols-2 gap-2 mt-2 bg-slate-50 p-3 rounded-lg border">
                                    <div>
                                        <p className="text-muted-foreground text-xs">Invoice Date</p>
                                        <p className="font-medium">{format(new Date(displayInvoice.invoiceDate), 'dd MMM yyyy')}</p>
                                    </div>
                                    {displayInvoice.dueDate && (
                                        <div>
                                            <p className="text-muted-foreground text-xs">Due Date</p>
                                            <p className="font-medium">{format(new Date(displayInvoice.dueDate), 'dd MMM yyyy')}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right Details */}
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-muted-foreground font-medium mb-1 text-xs uppercase tracking-wide">Internal Notes</h3>
                                <div className="bg-slate-50 rounded-lg border p-3 min-h-[64px]">
                                    <p className="text-slate-700">
                                        Type: <span className="font-medium capitalize">{displayInvoice.purchaseType}</span>
                                    </p>
                                    {displayInvoice.purchaseOrderRef && (
                                        <p className="text-slate-700 mt-1">
                                            PO Ref: <span className="font-medium">{displayInvoice.purchaseOrderRef}</span>
                                        </p>
                                    )}
                                    {displayInvoice.notes && (
                                        <p className="text-slate-500 italic mt-2 text-xs">{displayInvoice.notes}</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1 bg-emerald-50 text-emerald-900 border border-emerald-100 rounded-lg p-3">
                                    <p className="text-emerald-700 text-xs font-medium uppercase mb-1">Amount Paid</p>
                                    <p className="font-bold text-lg">{formatINR(displayInvoice.amountPaid)}</p>
                                </div>
                                <div className="flex-1 bg-red-50 text-red-900 border border-red-100 rounded-lg p-3">
                                    <p className="text-red-700 text-xs font-medium uppercase mb-1">Outstanding</p>
                                    <p className="font-bold text-lg">{formatINR(displayInvoice.outstanding)}</p>
                                </div>
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
                                    <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase text-right">Exp</th>
                                    <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase text-right">Qty</th>
                                    <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase text-right">Rate</th>
                                    <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase text-right">Disc %</th>
                                    <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase text-right">GST %</th>
                                    <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y text-slate-700">
                                {isLoading && (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground animate-pulse">
                                            Loading items...
                                        </td>
                                    </tr>
                                )}
                                {!isLoading && displayInvoice.items?.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium text-slate-900">
                                            {item.product?.name ?? item.customProductName ?? '—'}
                                            {item.pkg > 1 && <span className="block text-[10px] text-muted-foreground mt-0.5">Pack of {item.pkg}</span>}
                                        </td>
                                        <td className="px-4 py-3 font-mono">{item.batchNo}</td>
                                        <td className="px-4 py-3 text-right">{item.expiryDate}</td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="font-medium">{item.qty}</span>
                                            {item.freeQty > 0 && <span className="block text-[10px] text-emerald-600 mt-0.5">+{item.freeQty} Free</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums">{formatINR(item.purchaseRate)}</td>
                                        <td className="px-4 py-3 text-right text-muted-foreground">
                                            {item.discountPct}%
                                            {item.cashDiscountPct > 0 && <span className="block text-[10px] text-red-500 mt-0.5">+{item.cashDiscountPct}% CD</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right text-muted-foreground">{item.gstRate}%</td>
                                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{formatINR(item.totalAmount)}</td>
                                    </tr>
                                ))}
                                {!isLoading && (!displayInvoice.items || displayInvoice.items.length === 0) && (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground italic">
                                            No items found for this invoice.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Totals ── */}
                    <div className="flex justify-end pt-2">
                        <div className="w-72 space-y-2 text-sm">
                            <div className="flex justify-between text-muted-foreground">
                                <span>Subtotal</span>
                                <span className="tabular-nums text-foreground font-medium">{formatINR(displayInvoice.subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Discount</span>
                                <span className="tabular-nums text-emerald-600 font-medium">−{formatINR(displayInvoice.discountAmount)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Taxable Amount</span>
                                <span className="tabular-nums text-foreground font-medium">{formatINR(displayInvoice.taxableAmount)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>GST Amount</span>
                                <span className="tabular-nums text-foreground font-medium">{formatINR(displayInvoice.gstAmount)}</span>
                            </div>
                            {displayInvoice.freight > 0 && (
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Freight Charges</span>
                                    <span className="tabular-nums text-foreground font-medium">{formatINR(displayInvoice.freight)}</span>
                                </div>
                            )}
                            <Separator className="my-2 bg-slate-200" />
                            <div className="flex justify-between items-center bg-slate-50 p-2 rounded text-base font-bold text-slate-900 border">
                                <span>Grand Total</span>
                                <span className="tabular-nums text-primary">{formatINR(displayInvoice.grandTotal)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Print Only Professional Layout ── */}
                <div className="hidden print:block w-full max-w-[210mm] mx-auto p-[10mm] bg-white text-black font-sans box-border" style={{ fontFamily: 'Arial, sans-serif' }}>
                    
                    {/* Header: Distributor Info & Invoice Metadata */}
                    <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                        <div className="w-1/2 pr-4">
                            <h2 className="text-xl font-bold uppercase tracking-wider mb-2">Purchase Invoice</h2>
                            <p className="font-bold text-base mb-1">{displayInvoice.distributor?.name || 'Unknown Distributor'}</p>
                            {displayInvoice.distributor?.address && <p className="text-sm whitespace-pre-wrap">{displayInvoice.distributor.address}</p>}
                            <div className="mt-2 text-sm">
                                {displayInvoice.distributor?.phone && <p>Ph: {displayInvoice.distributor.phone}</p>}
                                {displayInvoice.distributor?.gstin && <p>GSTIN: {displayInvoice.distributor.gstin}</p>}
                                {displayInvoice.distributor?.drugLicenseNo && <p>DL No: {displayInvoice.distributor.drugLicenseNo}</p>}
                            </div>
                        </div>

                        <div className="w-1/2 pl-4 text-right">
                            <table className="ml-auto text-sm w-full max-w-[250px]">
                                <tbody>
                                    <tr>
                                        <td className="text-slate-600 pb-1 w-1/2">Invoice No:</td>
                                        <td className="font-bold pb-1 text-right">{displayInvoice.invoiceNo}</td>
                                    </tr>
                                    <tr>
                                        <td className="text-slate-600 pb-1">Date:</td>
                                        <td className="font-bold pb-1 text-right">{format(new Date(displayInvoice.invoiceDate), 'dd MMM yyyy')}</td>
                                    </tr>
                                    {displayInvoice.dueDate && (
                                        <tr>
                                            <td className="text-slate-600 pb-1">Due Date:</td>
                                            <td className="font-bold pb-1 text-right">{format(new Date(displayInvoice.dueDate), 'dd MMM yyyy')}</td>
                                        </tr>
                                    )}
                                    <tr>
                                        <td className="text-slate-600">Type:</td>
                                        <td className="font-bold text-right capitalize">{displayInvoice.purchaseType}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Table */}
                    <table className="w-full text-sm mb-6 border-collapse">
                        <thead>
                            <tr className="bg-slate-100 text-slate-700 uppercase tracking-tight text-[11px]" style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact' }}>
                                <th className="border-b border-black p-2 text-left w-10">#</th>
                                <th className="border-b border-black p-2 text-left">Product Name</th>
                                <th className="border-b border-black p-2 text-left">HSN</th>
                                <th className="border-b border-black p-2 text-left">Batch</th>
                                <th className="border-b border-black p-2 text-center">Exp</th>
                                <th className="border-b border-black p-2 text-right">MRP</th>
                                <th className="border-b border-black p-2 text-right">Qty</th>
                                <th className="border-b border-black p-2 text-right">Rate</th>
                                <th className="border-b border-black p-2 text-right">Disc/GST</th>
                                <th className="border-b border-black p-2 text-right font-semibold">Total</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {!displayInvoice.items?.length && (
                                <tr><td colSpan={10} className="border-b border-gray-300 p-4 text-center">No items</td></tr>
                            )}
                            {displayInvoice.items?.map((item, idx) => (
                                <tr key={item.id || idx}>
                                    <td className="border-b border-gray-300 p-2 text-center text-slate-600">{idx + 1}</td>
                                    <td className="border-b border-gray-300 p-2 font-medium">
                                        {item.product?.name ?? item.customProductName ?? '—'}
                                        {item.pkg > 1 && <span className="text-[10px] text-slate-500 ml-1 block">Pk: {item.pkg}</span>}
                                    </td>
                                    <td className="border-b border-gray-300 p-2 whitespace-nowrap text-slate-700">{item.hsnCode || '-'}</td>
                                    <td className="border-b border-gray-300 p-2 whitespace-nowrap text-slate-700">{item.batchNo}</td>
                                    <td className="border-b border-gray-300 p-2 text-center whitespace-nowrap text-slate-700">{item.expiryDate}</td>
                                    <td className="border-b border-gray-300 p-2 text-right text-slate-700">{formatINR(item.mrp)}</td>
                                    <td className="border-b border-gray-300 p-2 text-right text-slate-700">
                                        {item.qty}
                                        {item.freeQty > 0 && <span className="block text-[10px] text-slate-500">+{item.freeQty} Free</span>}
                                    </td>
                                    <td className="border-b border-gray-300 p-2 text-right text-slate-700">{formatINR(item.purchaseRate)}</td>
                                    <td className="border-b border-gray-300 p-2 text-right text-slate-500">
                                        <div className="text-xs">{item.discountPct}% Disc</div>
                                        <div className="text-[10px] text-slate-400">{item.gstRate}% GST</div>
                                    </td>
                                    <td className="border-b border-gray-300 p-2 text-right font-bold text-slate-900">{formatINR(item.totalAmount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Totals Section */}
                    <div className="flex justify-end pr-0 mt-2">
                        <table className="text-sm w-full max-w-[300px] border-collapse">
                            <tbody>
                                <tr>
                                    <td className="p-2 w-[60%] text-slate-600">Subtotal</td>
                                    <td className="p-2 text-right w-[40%] font-medium">{formatINR(displayInvoice.subtotal)}</td>
                                </tr>
                                <tr>
                                    <td className="p-2 text-slate-600 border-t border-slate-200">Total Discount</td>
                                    <td className="p-2 text-right tabular-nums border-t border-slate-200 text-slate-700">{formatINR(displayInvoice.discountAmount)}</td>
                                </tr>
                                <tr>
                                    <td className="p-2 text-slate-600 border-t border-slate-200">Taxable Amount</td>
                                    <td className="p-2 text-right tabular-nums border-t border-slate-200">{formatINR(displayInvoice.taxableAmount)}</td>
                                </tr>
                                <tr>
                                    <td className="p-2 text-slate-600 border-t border-slate-200">Total GST</td>
                                    <td className="p-2 text-right tabular-nums border-t border-slate-200">{formatINR(displayInvoice.gstAmount)}</td>
                                </tr>
                                {displayInvoice.freight > 0 && (
                                    <tr>
                                        <td className="p-2 text-slate-600 border-t border-slate-200">Freight</td>
                                        <td className="p-2 text-right tabular-nums border-t border-slate-200">{formatINR(displayInvoice.freight)}</td>
                                    </tr>
                                )}
                                <tr className="bg-slate-100 font-bold text-base" style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact' }}>
                                    <td className="p-3 border-y-2 border-slate-300">Grand Total</td>
                                    <td className="p-3 text-right border-y-2 border-slate-300 text-slate-900">{formatINR(displayInvoice.grandTotal)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                </div>

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
