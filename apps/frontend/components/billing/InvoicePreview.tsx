'use client';

import React, { forwardRef } from 'react';
import { format } from 'date-fns';
import { SaleInvoice } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatQty } from '@/lib/utils';
import { SCHEDULE_MARKERS } from '@/constants/scheduleTypes';

interface InvoicePreviewProps {
    invoice: SaleInvoice;
}

// ─── Amount in words (Indian format) ──────────────────────────────────────────

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function toWords(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
    if (n < 1000) return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + toWords(n % 100) : '');
    if (n < 100000) return toWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + toWords(n % 1000) : '');
    if (n < 10000000) return toWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + toWords(n % 100000) : '');
    return toWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + toWords(n % 10000000) : '');
}

function amountInWords(amount: number): string {
    const intPart = Math.floor(amount);
    const decPart = Math.round((amount - intPart) * 100);
    let words = toWords(intPart) || 'Zero';
    if (decPart > 0) words += ' and ' + toWords(decPart) + ' Paise';
    return 'Rs. ' + words + ' Only';
}

function fmtAmt(n: number) {
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtExpiry(dateStr: string) {
    try { return format(new Date(dateStr), 'M/yy'); } catch { return dateStr; }
}

function abbrevMfg(manufacturer?: string) {
    if (!manufacturer) return '—';
    return manufacturer.substring(0, 5).toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export const InvoicePreview = forwardRef<HTMLDivElement, InvoicePreviewProps>(({ invoice }, ref) => {
    const { outlet } = useAuthStore();
    const settings = useSettingsStore();

    // Settings store (user-saved) takes priority over login-time outlet data
    const outletName = settings.outletName || outlet?.name || 'PHARMACY';
    const outletAddress = settings.outletAddress || outlet?.address || '';
    const outletCity = settings.outletCity || outlet?.city || '';
    const outletPhone = settings.outletPhone || outlet?.phone || '';
    const outletGstin = settings.outletGstin || outlet?.gstin || '';
    const outletDrugLicenseNo = settings.outletDrugLicenseNo || outlet?.drugLicenseNo || '';
    const outletLogoUrl = settings.outletLogoUrl || outlet?.logoUrl;
    const invoiceFooter = settings.invoiceFooter || outlet?.invoiceFooter || 'Wish You Speedy Recovery';

    const customer = (invoice as any).customer;
    const customerName = invoice.patientName || customer?.name || 'Cash Customer';
    const customerPhone = customer?.phone || '—';
    const customerAddress = invoice.patientAddress || customer?.address || '—';

    const invoiceDate = invoice.invoiceDate || invoice.createdAt;
    const subtotalMRP = invoice.subtotal;
    const discountAmt = invoice.discountAmount;
    const grandTotal = invoice.grandTotal;

    // Padding to minimum 8 rows
    const items = invoice.items || [];
    const padRows = Math.max(0, 8 - items.length);

    return (
        <div
            ref={ref}
            className="bg-white text-slate-900 font-sans text-[11px] leading-tight w-full max-w-2xl print:max-w-none print:w-full mx-auto p-4 border border-slate-400 print:p-3 print:shadow-none print:border-black"
            style={{ fontFamily: 'Arial, sans-serif' }}
        >
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

            <div className="border-t border-b border-slate-800 py-0.5 mb-2" />

            {/* ── SECTION 2: PATIENT + BILL INFO ── */}
            <div className="border border-slate-400 mb-2">
                <div className="grid grid-cols-2 gap-0">
                    {/* Left column */}
                    <div className="border-r border-slate-300 px-2 py-1 space-y-0.5">
                        <p><span className="font-semibold">Patient Name :</span> {customerName}</p>
                        <p><span className="font-semibold">Registration No :</span></p>
                        <p><span className="font-semibold">Address :</span> {customerAddress}</p>
                    </div>
                    {/* Right column */}
                    <div className="px-2 py-1 space-y-0.5">
                        <p><span className="font-semibold">Bill No :</span> {invoice.invoiceNo}</p>
                        <p>
                            <span className="font-semibold">Bill Date :</span>{' '}
                            {format(new Date(invoiceDate), 'dd-MM-yyyy')}
                            <span className="font-semibold ml-2">TIME:</span>{' '}
                            {format(new Date(invoiceDate), 'hh:mm a')}
                        </p>
                        <p><span className="font-semibold">Mobile :</span> {customerPhone}</p>
                    </div>
                </div>
                {/* Doctor row */}
                <div className="border-t border-slate-300 grid grid-cols-2 px-2 py-1">
                    <p className="text-[10px]">
                        <span className="font-semibold">Doctor Name :</span>{' '}
                        {invoice.doctorName ? (
                            <>
                                <span className="uppercase">{invoice.doctorName}</span>
                                {invoice.doctorDegree && <span className="ml-1">({invoice.doctorDegree})</span>}
                                {invoice.doctorSpecialty && <span className="ml-2">• {invoice.doctorSpecialty}</span>}
                                {invoice.doctorRegNo && invoice.doctorRegNo !== 'NA' && invoice.doctorRegNo !== 'N/A' && (
                                    <span className="ml-3 font-semibold text-slate-700">REG. NO: {invoice.doctorRegNo}</span>
                                )}
                            </>
                        ) : '—'}
                    </p>
                    <p className="text-[10px] text-right">
                        <span className="font-semibold">ABHA No.:</span>
                    </p>
                </div>
                {/* Salesman */}
                <div className="border-t border-slate-300 px-2 py-0.5 text-right">
                    <span className="font-semibold">Sales Man :</span>{' '}
                    {invoice.billedByName || '—'}
                </div>
            </div>

            {/* ── SECTION 3: ITEMS TABLE ── */}
            <table className="w-full border-collapse border border-slate-400 mb-2 text-[10px]">
                <thead>
                    <tr className="bg-slate-100 border-b border-slate-400">
                        <th className="border-r border-slate-300 px-1 py-1 text-center w-[4%]">SN.</th>
                        <th className="border-r border-slate-300 px-1 py-1 text-left w-[30%] font-bold">PRODUCT NAME</th>
                        <th className="border-r border-slate-300 px-1 py-1 text-center w-[8%]">MFG</th>
                        <th className="border-r border-slate-300 px-1 py-1 text-center w-[12%]">Batch No.</th>
                        <th className="border-r border-slate-300 px-1 py-1 text-center w-[8%]">Expiry</th>
                        <th className="border-r border-slate-300 px-1 py-1 text-center w-[8%]">Qty</th>
                        <th className="border-r border-slate-300 px-1 py-1 text-right w-[10%]">MRP</th>
                        <th className="px-1 py-1 text-right w-[12%]">Amount</th>
                    </tr>
                    <tr className="border-b border-slate-300 bg-slate-50">
                        <td colSpan={8} className="px-2 py-0.5 font-semibold text-[9px] text-slate-600">
                            SUPPLIED ITEMS ======&gt;
                        </td>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, i) => {
                        const scheduleMarker = SCHEDULE_MARKERS[item.scheduleType ?? ''] ?? '';
                        const isScheduled = !!scheduleMarker;
                        const qtyDisplay = item.qtyStrips > 0
                            ? `${item.qtyStrips * item.packSize}`
                            : `${item.qtyLoose}`;
                        const lineTotal = item.totalAmount ?? (item.rate * item.totalQty * (1 - item.discountPct / 100));

                        return (
                            <tr key={item.batchId} className="border-b border-slate-200">
                                <td className="border-r border-slate-200 px-1 py-0.5 text-center">{i + 1}</td>
                                <td className="border-r border-slate-200 px-1 py-0.5 uppercase font-medium">
                                    {isScheduled && <span className="text-slate-500 mr-0.5">{scheduleMarker}</span>}
                                    {item.name}
                                </td>
                                <td className="border-r border-slate-200 px-1 py-0.5 text-center">{abbrevMfg(item.manufacturer)}</td>
                                <td className="border-r border-slate-200 px-1 py-0.5 text-center font-mono">{item.batchNo}</td>
                                <td className="border-r border-slate-200 px-1 py-0.5 text-center">{fmtExpiry(item.expiryDate)}</td>
                                <td className="border-r border-slate-200 px-1 py-0.5 text-center">{qtyDisplay}</td>
                                <td className="border-r border-slate-200 px-1 py-0.5 text-right">{fmtAmt(item.mrp)}</td>
                                <td className="px-1 py-0.5 text-right">{fmtAmt(lineTotal)}</td>
                            </tr>
                        );
                    })}
                    {/* Padding rows */}
                    {Array.from({ length: padRows }).map((_, i) => (
                        <tr key={`pad-${i}`} className="border-b border-slate-100">
                            <td className="border-r border-slate-100 px-1 py-2" />
                            <td className="border-r border-slate-100 px-1 py-2" />
                            <td className="border-r border-slate-100 px-1 py-2" />
                            <td className="border-r border-slate-100 px-1 py-2" />
                            <td className="border-r border-slate-100 px-1 py-2" />
                            <td className="border-r border-slate-100 px-1 py-2" />
                            <td className="border-r border-slate-100 px-1 py-2" />
                            <td className="px-1 py-2" />
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ── SECTION 4 + 5: AMOUNT WORDS + TOTALS ── */}
            <div className="border border-slate-400 mb-2">
                <div className="grid grid-cols-2">
                    {/* Left: Amount in words */}
                    <div className="border-r border-slate-300 px-2 py-1.5">
                        <p className="font-semibold text-[10px]">
                            RUPEES : <span className="font-normal">{amountInWords(grandTotal)}</span>
                        </p>
                    </div>
                    {/* Right: Totals */}
                    <div className="px-2 py-1">
                        <div className="flex justify-between">
                            <span>GROSS :</span>
                            <span className="font-medium">{fmtAmt(subtotalMRP)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Dis :</span>
                            <span className="font-medium">{fmtAmt(discountAmt)}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-400 mt-0.5 pt-0.5">
                            <span className="font-bold">Amount :</span>
                            <span className="font-bold text-[12px]">{fmtAmt(grandTotal)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── SECTION 6: FOOTER ── */}
            <div className="border border-slate-400 mb-1">
                <div className="grid grid-cols-2">
                    {/* Left: D.L.No + GST */}
                    <div className="border-r border-slate-300 px-2 py-1.5 text-[10px]">
                        <p><span className="font-semibold">D.L.No.:-</span> {outletDrugLicenseNo || '—'}</p>
                        <p className="mt-0.5">
                            <span className="font-semibold">TIME :</span>{' '}
                            {format(new Date(invoiceDate), 'hh:mm a')}
                        </p>
                    </div>
                    {/* Right: Pharmacist signature */}
                    <div className="px-2 py-1.5 text-right">
                        <div className="h-8" />
                        <p className="font-semibold text-[10px]">PHARMACIST SIGNATURE</p>
                    </div>
                </div>
            </div>

            {/* GST No + footer message */}
            <div className="flex items-center justify-between text-[9px] text-slate-500 mt-1">
                {outletGstin && <p><span className="font-semibold">GST No.:-</span> {outletGstin}</p>}
                <p className="text-center flex-1 italic">
                    {invoiceFooter}
                </p>
            </div>
        </div>
    );
});
InvoicePreview.displayName = 'InvoicePreview';
