'use client';

import { format } from 'date-fns';
import { FileText, Printer, X } from 'lucide-react';
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
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

interface PurchaseDetailModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: PurchaseInvoiceFull | null;
}

const formatINR = (n: number | undefined) =>
    '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PurchaseDetailModal({ open, onOpenChange, invoice }: PurchaseDetailModalProps) {
    const { data: fullInvoiceRes, isLoading } = usePurchaseById(open && invoice ? invoice.id : '');
    const { outlet } = useAuthStore();
    const settings = useSettingsStore();

    if (!invoice) return null;

    const displayInvoice = fullInvoiceRes || invoice;
    const status = getPurchaseStatus(displayInvoice);
    const cfg = STATUS_CONFIG[status];

    const handlePrint = () => {
        window.print();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="invoice-print-container max-w-4xl max-h-[90vh] overflow-y-auto p-0 print:max-h-none print:overflow-visible print:p-0 print:border-none border-t-4 border-t-primary gap-0">
                
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

                {/* ── Screen-only Header ── */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white border-b print:hidden">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Purchase Invoice</DialogTitle>
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
                </div>

                {/* ── Screen UI Content ── */}
                <div className="p-8 print:hidden bg-white">
                    <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
                        {/* Left Details */}
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-muted-foreground font-medium mb-1 text-xs uppercase tracking-wide">Distributor</h3>
                                <p className="font-semibold text-lg text-foreground">{displayInvoice.distributor?.name || 'Unknown'}</p>
                                {displayInvoice.distributor?.gstin && <p className="text-muted-foreground">GSTIN: {displayInvoice.distributor.gstin}</p>}
                                {displayInvoice.distributor?.phone && <p className="text-muted-foreground">Ph: {displayInvoice.distributor.phone}</p>}
                            </div>
                            <div>
                                <h3 className="text-muted-foreground font-medium mb-1 text-xs uppercase tracking-wide">Invoice Details</h3>
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

                    {/* ── Items Table ── */}
                    <div className="rounded border bg-white overflow-hidden mb-6">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-muted/50 border-b">
                                <tr>
                                    <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase">#</th>
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
                                        <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground animate-pulse">
                                            Loading items...
                                        </td>
                                    </tr>
                                )}
                                {!isLoading && displayInvoice.items?.map((item, idx) => (
                                    <tr key={item.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-muted-foreground text-center">{idx + 1}</td>
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
                                        <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground italic">
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

                {/* ── Print-Only Professional Invoice ── */}
                <div className="hidden print:block w-full max-w-none mx-auto p-4 bg-white text-black font-sans box-border" style={{ fontFamily: 'Arial, sans-serif' }}>

                    {/* PRINT LOGIC: Compute Outlet / Settings */}
                    {(() => {
                        const outletName = settings.outletName || outlet?.name || 'PHARMACY';
                        const outletAddress = settings.outletAddress || outlet?.address || '';
                        const outletCity = settings.outletCity || outlet?.city || '';
                        const outletPhone = settings.outletPhone || outlet?.phone || '';
                        const outletGstin = settings.outletGstin || outlet?.gstin || '';
                        const outletDrugLicenseNo = settings.outletDrugLicenseNo || outlet?.drugLicenseNo || '';
                        const outletLogoUrl = settings.outletLogoUrl || outlet?.logoUrl;
                        return (
                            <div className="bg-white text-slate-900 font-sans text-[11px] leading-tight w-full max-w-2xl print:max-w-none print:w-full mx-auto p-4 border border-slate-400 print:p-3 print:shadow-none print:border-black box-border" style={{ fontFamily: 'Arial, sans-serif' }}>
                                
                                {/* ── SECTION 1: OUTLET HEADER ── */}
                                <div className="text-center mb-2">
                                    {outletLogoUrl && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={outletLogoUrl} alt="Logo" className="h-12 object-contain mx-auto mb-1" />
                                    )}
                                    <h1 className="text-base font-bold uppercase tracking-wide leading-tight">
                                        {outletName}
                                    </h1>
                                    <p className="text-[10px] text-slate-600 mt-0.5">
                                        {outletAddress}{outletCity ? `, ${outletCity}` : ''}
                                        {outletPhone ? `   Phone: ${outletPhone}` : ''}
                                    </p>
                                    {outletGstin && (
                                        <p className="text-[10px] text-slate-500">GSTIN: {outletGstin}</p>
                                    )}
                                </div>
                                
                                <div className="border-t border-b border-slate-800 py-0.5 mb-2 text-center font-bold text-sm">
                                    PURCHASE INVOICE RECORD
                                </div>
                                
                                {/* ── SECTION 2: DISTRIBUTOR & INVOICE INFO ── */}
                                <div className="border border-slate-400 mb-2">
                                    <div className="grid grid-cols-2 gap-0">
                                        <div className="border-r border-slate-300 px-2 py-1 space-y-0.5">
                                            <p className="font-semibold text-slate-500 text-[9px] mb-1">FROM (DISTRIBUTOR)</p>
                                            <p><span className="font-semibold">Name :</span> {displayInvoice.distributor?.name || 'Unknown'}</p>
                                            <p className="whitespace-pre-wrap"><span className="font-semibold">Address :</span> {displayInvoice.distributor?.address || '—'}</p>
                                            {displayInvoice.distributor?.gstin && <p><span className="font-semibold">GSTIN :</span> {displayInvoice.distributor.gstin}</p>}
                                            {displayInvoice.distributor?.drugLicenseNo && <p><span className="font-semibold">DL No :</span> {displayInvoice.distributor.drugLicenseNo}</p>}
                                        </div>
                                        <div className="px-2 py-1 space-y-0.5">
                                            <p><span className="font-semibold">Invoice No :</span> {displayInvoice.invoiceNo}</p>
                                            <p>
                                                <span className="font-semibold">Invoice Date :</span>{' '}
                                                {format(new Date(displayInvoice.invoiceDate), 'dd-MM-yyyy')}
                                            </p>
                                            {displayInvoice.dueDate && (
                                                <p>
                                                    <span className="font-semibold">Due Date :</span>{' '}
                                                    {format(new Date(displayInvoice.dueDate), 'dd-MM-yyyy')}
                                                </p>
                                            )}
                                            <p><span className="font-semibold">Type :</span> <span className="capitalize">{displayInvoice.purchaseType}</span></p>
                                            <p><span className="font-semibold">Status :</span> <span className="uppercase">{cfg.label}</span></p>
                                            {displayInvoice.purchaseOrderRef && (
                                                <p><span className="font-semibold">PO Ref:</span> {displayInvoice.purchaseOrderRef}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* ── SECTION 3: ITEMS TABLE ── */}
                                <table className="w-full border-collapse border border-slate-400 mb-2 text-[10px]">
                                    <thead>
                                        <tr className="bg-slate-100 border-b border-slate-400">
                                            <th className="border-r border-slate-300 px-1 py-1 text-center w-[4%]">#</th>
                                            <th className="border-r border-slate-300 px-1 py-1 text-left w-[25%] font-bold">PRODUCT NAME</th>
                                            <th className="border-r border-slate-300 px-1 py-1 text-center w-[12%]">Batch</th>
                                            <th className="border-r border-slate-300 px-1 py-1 text-center w-[8%]">Exp</th>
                                            <th className="border-r border-slate-300 px-1 py-1 text-right w-[8%]">MRP</th>
                                            <th className="border-r border-slate-300 px-1 py-1 text-right w-[8%]">Qty</th>
                                            <th className="border-r border-slate-300 px-1 py-1 text-right w-[8%]">Rate</th>
                                            <th className="border-r border-slate-300 px-1 py-1 text-right w-[15%]">Disc/GST</th>
                                            <th className="px-1 py-1 text-right w-[12%]">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {!displayInvoice.items?.length && (
                                            <tr><td colSpan={9} className="px-2 py-4 text-center text-slate-500 italic">No items found.</td></tr>
                                        )}
                                        {displayInvoice.items?.map((item, idx) => (
                                            <tr key={item.id || idx} className="border-b border-slate-200">
                                                <td className="border-r border-slate-200 px-1 py-0.5 text-center">{idx + 1}</td>
                                                <td className="border-r border-slate-200 px-1 py-0.5 uppercase font-medium">
                                                    {item.product?.name ?? item.customProductName ?? '—'}
                                                    {item.pkg > 1 && <span className="text-[9px] text-slate-500 ml-1">Pk: {item.pkg}</span>}
                                                </td>
                                                <td className="border-r border-slate-200 px-1 py-0.5 text-center font-mono">{item.batchNo}</td>
                                                <td className="border-r border-slate-200 px-1 py-0.5 text-center">{item.expiryDate}</td>
                                                <td className="border-r border-slate-200 px-1 py-0.5 text-right">{formatINR(item.mrp)}</td>
                                                <td className="border-r border-slate-200 px-1 py-0.5 text-right">
                                                    {item.qty}
                                                    {item.freeQty > 0 && <span className="block text-[9px] text-slate-400">+{item.freeQty} Free</span>}
                                                </td>
                                                <td className="border-r border-slate-200 px-1 py-0.5 text-right">{formatINR(item.purchaseRate)}</td>
                                                <td className="border-r border-slate-200 px-1 py-0.5 text-right text-slate-600">
                                                    <span className="whitespace-nowrap">{item.discountPct}% Dis</span>
                                                    <br />
                                                    <span className="whitespace-nowrap">{item.gstRate}% GST</span>
                                                </td>
                                                <td className="px-1 py-0.5 text-right font-semibold">{formatINR(item.totalAmount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* ── SECTION 4: OUTSTANDING & TOTALS ── */}
                                <div className="border border-slate-400 mb-2">
                                    <div className="grid grid-cols-2">
                                        <div className="border-r border-slate-300 px-2 py-1.5 space-y-1">
                                            <p className="font-semibold text-[10px]">PAYMENT STATUS</p>
                                            <p><span className="text-slate-600">Amount Paid : </span><span className="font-semibold text-emerald-700">{formatINR(displayInvoice.amountPaid)}</span></p>
                                            <p><span className="text-slate-600">Outstanding : </span><span className="font-semibold text-red-700">{formatINR(displayInvoice.outstanding)}</span></p>
                                            {displayInvoice.notes && (
                                                <p className="mt-2 text-slate-600 italic text-[9px]">Note: {displayInvoice.notes}</p>
                                            )}
                                        </div>
                                        <div className="px-2 py-1">
                                            <div className="flex justify-between">
                                                <span>Subtotal :</span>
                                                <span className="font-medium">{formatINR(displayInvoice.subtotal)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Discount :</span>
                                                <span className="font-medium">{formatINR(displayInvoice.discountAmount)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Taxable :</span>
                                                <span className="font-medium">{formatINR(displayInvoice.taxableAmount)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>GST Amount :</span>
                                                <span className="font-medium">{formatINR(displayInvoice.gstAmount)}</span>
                                            </div>
                                            {displayInvoice.freight > 0 && (
                                                <div className="flex justify-between">
                                                    <span>Freight :</span>
                                                    <span className="font-medium">{formatINR(displayInvoice.freight)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between border-t border-slate-400 mt-0.5 pt-0.5">
                                                <span className="font-bold">Grand Total :</span>
                                                <span className="font-bold text-[12px] text-primary">{formatINR(displayInvoice.grandTotal)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* ── SECTION 5: FOOTER ── */}
                                <div className="border-t border-slate-300 pt-2 mt-2 text-center text-[10px] text-slate-500">
                                    <p>This is a computer generated purchase invoice. No signature required.</p>
                                </div>

                            </div>
                        );
                    })()}
                </div>

            </DialogContent>
        </Dialog>
    );
}
