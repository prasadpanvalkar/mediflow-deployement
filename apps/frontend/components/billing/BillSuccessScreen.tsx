'use client';

import React from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Printer, MessageCircle, Plus, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SaleInvoice } from '@/types';
import { useAuthStore } from '@/store/authStore';

interface BillSuccessScreenProps {
    invoice: SaleInvoice;
    onNewBill: () => void;
    onPrint: () => void;
    onViewInvoice: () => void;
}

export function BillSuccessScreen({ invoice, onNewBill, onPrint, onViewInvoice }: BillSuccessScreenProps) {
    const { user } = useAuthStore();

    return (
        <div data-testid="invoice-success" className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center px-4 animate-in fade-in zoom-in-95 duration-500">

            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6 shadow-sm">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>

            <h2 className="text-2xl font-bold text-slate-900">
                Bill Saved Successfully!
            </h2>

            <div className="bg-slate-100 rounded-xl px-6 py-4 mt-6 w-full border border-slate-200">
                <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold mb-1">Invoice Number</p>
                <div data-testid="invoice-number" className="font-mono text-2xl font-bold text-slate-900">
                    {invoice.invoiceNo}
                </div>
                
                <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col gap-1">
                    <p className="text-slate-700 font-medium">
                        ₹{Number(invoice.grandTotal).toFixed(2)} &mdash; <span className="uppercase text-slate-500">{invoice.paymentMode}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                        {format(new Date(invoice.createdAt), 'hh:mm a, dd MMM yyyy')}
                    </p>
                </div>
            </div>

            <div className="mt-8 space-y-3 w-full">
                <Button 
                    className="w-full h-12 text-base font-semibold shadow-sm"
                    onClick={onPrint}
                >
                    <Printer className="w-5 h-5 mr-2" />
                    Print Invoice
                </Button>

                <Button 
                    variant="outline" 
                    className="w-full h-12 text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700"
                    onClick={() => {}} // Future feature
                >
                    <MessageCircle className="w-5 h-5 mr-2" />
                    WhatsApp Invoice
                </Button>

                <Button 
                    variant="ghost" 
                    className="w-full h-12 text-slate-600 hover:bg-slate-100"
                    onClick={onNewBill}
                >
                    <Plus className="w-5 h-5 mr-2" />
                    New Bill
                </Button>

                <button 
                    onClick={onViewInvoice}
                    className="mt-6 text-sm font-medium text-primary hover:underline flex items-center justify-center mx-auto"
                >
                    <FileText className="w-4 h-4 mr-1" /> View Full Invoice &rarr;
                </button>
            </div>

            <p className="mt-8 text-xs text-slate-400">
                Billed by {user?.name || 'Staff'}
            </p>
        </div>
    );
}
