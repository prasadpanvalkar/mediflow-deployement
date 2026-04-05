'use client';

import React, { forwardRef } from 'react';
import { format } from 'date-fns';
import { SaleInvoice } from '@/types';
import { useAuthStore } from '@/store/authStore';

interface InvoiceThermalProps {
    invoice: SaleInvoice;
}

export const InvoiceThermal = forwardRef<HTMLDivElement, InvoiceThermalProps>(({ invoice }, ref) => {
    const { outlet, user } = useAuthStore();
    
    return (
        <div ref={ref} className="bg-white text-black w-[80mm] mx-auto p-4 font-mono text-[11px] leading-snug print:m-0 print:p-2 shadow max-w-[80mm]">
            
            <div className="text-center mb-4">
                <h1 className="font-bold text-[14px] uppercase">{outlet?.name || 'MediFlow Pharmacy'}</h1>
                <p>{outlet?.address || '123 Health St, City'}</p>
                <p>Ph: {outlet?.phone || '+91 0000000000'}</p>
                <p>GSTIN: {outlet?.gstin || '27XXXXX0000X1ZX'}</p>
            </div>

            <div className="border-t border-b border-black border-dashed py-2 mb-3">
                <div className="flex justify-between">
                    <span>INV: {invoice.invoiceNo ?? '—'}</span>
                    <span>{invoice.createdAt ? format(new Date(invoice.createdAt), 'dd.MM.yy') : '—'}</span>
                </div>
                <div className="flex justify-between mt-1">
                    <span>Staff: {user?.name?.split(' ')[0] || 'Admin'}</span>
                    <span>{invoice.createdAt ? format(new Date(invoice.createdAt), 'hh:mm a') : '—'}</span>
                </div>
            </div>

            <table className="w-full text-left table-fixed">
                <thead>
                    <tr className="border-b border-black">
                        <th className="w-[45%] py-1">Item</th>
                        <th className="w-[15%] py-1 text-center">Qty</th>
                        <th className="w-[20%] py-1 text-right">Rate</th>
                        <th className="w-[20%] py-1 text-right">Amt</th>
                    </tr>
                </thead>
                <tbody>
                    {(invoice.items ?? []).map((item, index) => {
                        const totalQty = (item.qtyStrips ?? 0) + (item.qtyLoose ?? 0);
                        const amt = totalQty * (item.rate ?? 0) * (1 - (item.discountPct ?? 0) / 100);
                        return (
                            <React.Fragment key={index}>
                                <tr>
                                    <td colSpan={4} className="pt-2 font-bold truncate">
                                        {item.productId || `Item ${index+1}`} ({(item.batchId || 'B').slice(0, 5)})
                                    </td>
                                </tr>
                                <tr>
                                    <td></td>
                                    <td className="text-center">{totalQty}</td>
                                    <td className="text-right">{(item.rate ?? 0).toFixed(2)}</td>
                                    <td className="text-right">{amt.toFixed(2)}</td>
                                </tr>
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>

            <div className="border-t border-black border-dashed mt-3 pt-2">
                <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{(invoice.subtotal ?? 0).toFixed(2)}</span>
                </div>
                {(invoice.discountAmount ?? 0) > 0 && (
                    <div className="flex justify-between font-bold">
                        <span>Discount:</span>
                        <span>-{(invoice.discountAmount ?? 0).toFixed(2)}</span>
                    </div>
                )}
                <div className="flex justify-between">
                    <span>Taxable:</span>
                    <span>{(invoice.taxableAmount ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span>CGST+SGST:</span>
                    <span>{((invoice.cgst ?? 0) + (invoice.sgst ?? 0)).toFixed(2)}</span>
                </div>
                {(invoice.roundOff ?? 0) !== 0 && (
                    <div className="flex justify-between">
                        <span>Round Off:</span>
                        <span>{(invoice.roundOff ?? 0).toFixed(2)}</span>
                    </div>
                )}
            </div>

            <div className="border-t border-b border-black py-2 mt-2 font-bold text-[14px]">
                <div className="flex justify-between">
                    <span>GRAND TOTAL:</span>
                    <span>Rs.{(invoice.grandTotal ?? 0).toFixed(2)}</span>
                </div>
            </div>

            <div className="mt-2 mb-4">
                <div className="flex justify-between">
                    <span>Paid ({invoice.paymentMode ?? 'cash'}):</span>
                    <span>{(invoice.amountPaid ?? 0).toFixed(2)}</span>
                </div>
                {(invoice.amountPaid ?? 0) > (invoice.grandTotal ?? 0) && (
                    <div className="flex justify-between font-bold">
                        <span>Change:</span>
                        <span>{((invoice.amountPaid ?? 0) - (invoice.grandTotal ?? 0)).toFixed(2)}</span>
                    </div>
                )}
            </div>

            <div className="text-center mt-6">
                <p>*** Thank You / Get Well Soon ***</p>
                <p className="mt-4">Software by MediFlow</p>
            </div>
            
            {/* Some thermal printers need empty space at the end to cut cleanly */}
            <div className="h-10"></div>
        </div>
    );
});
InvoiceThermal.displayName = 'InvoiceThermal';
