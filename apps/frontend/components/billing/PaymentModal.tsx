'use client';

import React, { useState, useEffect } from 'react';
import { 
    Receipt, Loader2, Banknote, Smartphone, 
    CreditCard, BookOpen, GitMerge, AlertCircle
} from 'lucide-react';
import { 
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { BillTotals, PaymentSplit, Customer } from '@/types';
import { useBillingStore } from '@/store/billingStore';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (payment: PaymentSplit) => void;
    totals: BillTotals;
    isLoading: boolean;
    customer?: Customer | null;
}

type TabType = 'cash' | 'upi' | 'card' | 'credit' | 'split';

export function PaymentModal({ isOpen, onClose, onConfirm, totals, isLoading, customer }: PaymentModalProps) {
    const { grandTotal } = totals;
    const [activeTab, setActiveTab] = useState<TabType>('cash');

    // === CASH STATE ===
    const [cashTendered, setCashTendered] = useState<number>(Math.ceil(grandTotal));
    const cashChange = cashTendered - grandTotal;

    // === UPI STATE ===
    const [upiRef, setUpiRef] = useState('');
    const [upiConfirmed, setUpiConfirmed] = useState(false);

    // === CARD STATE ===
    const [cardLast4, setCardLast4] = useState('');
    const [cardType, setCardType] = useState('Visa');

    // === CREDIT STATE ===
    const [creditGiven, setCreditGiven] = useState<number>(grandTotal);
    const [sendReminder, setSendReminder] = useState(true);

    // === SPLIT STATE ===
    const [splitCash, setSplitCash] = useState(0);
    const [splitUpi, setSplitUpi] = useState(0);
    const [splitCard, setSplitCard] = useState(0);
    const [splitCredit, setSplitCredit] = useState(0);

    const splitTotal = splitCash + splitUpi + splitCard + splitCredit;
    const splitDiff = splitTotal - grandTotal;
    const isSplitBalanced = Math.abs(splitDiff) < 0.01; // Floating point safe

    // Reset when opened
    useEffect(() => {
        if (isOpen) {
            setCashTendered(Math.ceil(grandTotal));
            setUpiConfirmed(false);
            setCreditGiven(grandTotal);
            setSplitCash(0);
            setSplitUpi(0);
            setSplitCard(0);
            setSplitCredit(0);
            setActiveTab('cash');
        }
    }, [isOpen, grandTotal]);

    // Handle Confirm
    const handleConfirm = () => {
        const payment: PaymentSplit = {
            method: activeTab === 'split' ? 'split' : activeTab,
            amount: grandTotal, 
            cashTendered: 0,
            cashReturned: 0,
            upiRef: '',
            cardLast4: '',
            cardType: '',
            creditGiven: 0,
            splitBreakdown: undefined
        };

        if (activeTab === 'cash') {
            payment.cashTendered = cashTendered;
            payment.cashReturned = Math.max(0, cashChange);
        } else if (activeTab === 'upi') {
            payment.upiRef = upiRef;
        } else if (activeTab === 'card') {
            payment.cardLast4 = cardLast4;
            payment.cardType = cardType;
        } else if (activeTab === 'credit') {
            payment.creditGiven = creditGiven;
        } else if (activeTab === 'split') {
            payment.splitBreakdown = {
                cash: splitCash,
                upi: splitUpi,
                card: splitCard,
                credit: splitCredit
            };
            payment.cashTendered = splitCash;
            payment.creditGiven = splitCredit;
        }

        onConfirm(payment);
    };

    // Disabled Logic
    let isConfirmDisabled = isLoading;
    if (activeTab === 'cash' && cashTendered < grandTotal) isConfirmDisabled = true;
    if (activeTab === 'upi' && !upiConfirmed) isConfirmDisabled = true;
    if (activeTab === 'credit' && (!customer || creditGiven <= 0)) isConfirmDisabled = true;
    if (activeTab === 'split' && !isSplitBalanced) isConfirmDisabled = true;

    // Listen for Enter key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && isOpen && !isConfirmDisabled) {
                e.preventDefault();
                handleConfirm();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isConfirmDisabled, activeTab, cashTendered, upiConfirmed, splitTotal]); // internal deps mapping

    return (
        <Dialog open={isOpen} onOpenChange={(v) => !isLoading && !v && onClose()}>
            <DialogContent data-testid="payment-modal" className="max-w-md" onInteractOutside={e => isLoading && e.preventDefault()}>
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Receipt className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle>Collect Payment</DialogTitle>
                            <DialogDescription className="mt-1">
                                <span className="text-3xl font-bold text-slate-900 block">₹{grandTotal.toFixed(2)}</span>
                                <span className="text-sm">for {totals.itemCount} items</span>
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="w-full mt-4">
                    <TabsList className="grid w-full grid-cols-5 bg-slate-100/50 p-1 mb-6 h-12">
                        <TabsTrigger value="cash" className="data-[state=active]:bg-primary data-[state=active]:text-white h-full"><Banknote className="w-4 h-4" /></TabsTrigger>
                        <TabsTrigger value="upi" className="data-[state=active]:bg-primary data-[state=active]:text-white h-full"><Smartphone className="w-4 h-4" /></TabsTrigger>
                        <TabsTrigger value="card" className="data-[state=active]:bg-primary data-[state=active]:text-white h-full"><CreditCard className="w-4 h-4" /></TabsTrigger>
                        <TabsTrigger value="credit" className="data-[state=active]:bg-primary data-[state=active]:text-white h-full"><BookOpen className="w-4 h-4" /></TabsTrigger>
                        <TabsTrigger value="split" className="data-[state=active]:bg-primary data-[state=active]:text-white h-full"><GitMerge className="w-4 h-4" /></TabsTrigger>
                    </TabsList>

                    {/* --- CASH TAB --- */}
                    <TabsContent value="cash" className="space-y-4 outline-none">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Amount Tendered</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-medium text-slate-500">₹</span>
                                <Input
                                    data-testid="payment-cash-input"
                                    type="number"
                                    className="pl-8 h-14 text-xl font-medium"
                                    value={cashTendered || ''}
                                    onChange={(e) => setCashTendered(Number(e.target.value))}
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 pb-2">
                            {[50, 100, 200, 500, 1000, 2000].map(amt => (
                                <button
                                    key={amt}
                                    type="button"
                                    onClick={() => setCashTendered(amt)}
                                    className={`flex-1 rounded border py-2 text-sm font-medium transition-colors ${
                                        grandTotal > amt ? 'opacity-40 hover:opacity-100 bg-slate-50 text-slate-400' : 'bg-white hover:border-primary hover:text-primary'
                                    }`}
                                >
                                    ₹{amt}
                                </button>
                            ))}
                        </div>

                        {cashChange >= 0 ? (
                            <div className="bg-green-50/80 border border-green-100 text-green-700 rounded-lg p-3 flex justify-between items-center">
                                <span className="font-medium">Return Change:</span>
                                <span className="text-lg font-bold">₹{cashChange.toFixed(2)}</span>
                            </div>
                        ) : (
                            <div className="bg-red-50/80 border border-red-100 text-red-600 rounded-lg p-3 flex justify-between items-center">
                                <span className="font-medium">Short by:</span>
                                <span className="text-lg font-bold">₹{Math.abs(cashChange).toFixed(2)}</span>
                            </div>
                        )}
                    </TabsContent>

                    {/* --- UPI TAB --- */}
                    <TabsContent value="upi" className="space-y-6 outline-none">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">UPI Amount</label>
                            <Input readOnly value={`₹${grandTotal.toFixed(2)}`} className="bg-slate-50 font-medium" />
                        </div>
                        
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Reference ID (Optional)</label>
                            <Input
                                data-testid="payment-upi-input"
                                placeholder="e.g. 123456789012"
                                value={upiRef}
                                onChange={e => setUpiRef(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-colors">
                            <div>
                                <h4 className="font-medium text-sm text-slate-900">Payment received</h4>
                                <p className="text-xs text-slate-500 mt-0.5">Confirm customer has paid via app</p>
                            </div>
                            <Switch data-testid="payment-upi-toggle" checked={upiConfirmed} onCheckedChange={setUpiConfirmed} />
                        </div>
                    </TabsContent>

                    {/* --- CARD TAB --- */}
                    <TabsContent value="card" className="space-y-4 outline-none">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Card Amount</label>
                            <Input readOnly value={`₹${grandTotal.toFixed(2)}`} className="bg-slate-50 font-medium" />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Card Type</label>
                                <Select value={cardType} onValueChange={setCardType}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Visa">Visa</SelectItem>
                                        <SelectItem value="Mastercard">Mastercard</SelectItem>
                                        <SelectItem value="Rupay">Rupay</SelectItem>
                                        <SelectItem value="Amex">Amex</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Last 4 Digits</label>
                                <Input 
                                    placeholder="XXXX" 
                                    maxLength={4} 
                                    value={cardLast4}
                                    onChange={e => setCardLast4(e.target.value.replace(/\D/g, ''))}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    {/* --- CREDIT TAB --- */}
                    <TabsContent value="credit" className="space-y-4 outline-none">
                        {!customer ? (
                            <div className="text-center py-6">
                                <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                                <h3 className="text-sm font-medium text-slate-900 mb-1">No Customer Selected</h3>
                                <p className="text-xs text-muted-foreground mb-4 max-w-[200px] mx-auto">
                                    Please select a customer to record credit/udhari.
                                </p>
                                <Button variant="outline" onClick={onClose}>Close & Select Customer</Button>
                            </div>
                        ) : (
                            <>
                                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="font-medium text-slate-900">{customer.name}</p>
                                            <p className="text-xs text-slate-500">{customer.phone}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 mt-3 text-sm">
                                        <div>
                                            <p className="text-xs text-slate-500">Outstanding</p>
                                            <p className="font-semibold text-amber-600">₹{customer.outstanding?.toFixed(2) || '0.00'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500">Limit</p>
                                            <p className="font-medium text-slate-700">₹{customer.creditLimit?.toFixed(2) || '0.00'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">New Credit Amount</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium text-slate-500">₹</span>
                                        <Input 
                                            type="number" 
                                            className="pl-7" 
                                            value={creditGiven || ''}
                                            onChange={(e) => setCreditGiven(Number(e.target.value))}
                                        />
                                    </div>
                                </div>

                                {customer.creditLimit && ((customer.outstanding || 0) + creditGiven > customer.creditLimit) && (
                                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>Exceeds credit limit by ₹{((customer.outstanding || 0) + creditGiven - customer.creditLimit).toFixed(2)}. Override requires manager approval.</span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between mt-4">
                                    <label className="text-sm cursor-pointer select-none font-medium">Send WhatsApp Reminder</label>
                                    <Switch checked={sendReminder} onCheckedChange={setSendReminder} />
                                </div>
                            </>
                        )}
                    </TabsContent>

                    {/* --- SPLIT TAB --- */}
                    <TabsContent value="split" className="space-y-4 outline-none">
                        <div className="space-y-3">
                            {[
                                { label: 'Cash', icon: Banknote, val: splitCash, set: setSplitCash },
                                { label: 'UPI', icon: Smartphone, val: splitUpi, set: setSplitUpi },
                                { label: 'Card', icon: CreditCard, val: splitCard, set: setSplitCard },
                                { label: 'Credit', icon: BookOpen, val: splitCredit, set: setSplitCredit, hidden: !customer },
                            ].map((mode) => !mode.hidden && (
                                <div key={mode.label} className="flex items-center gap-3">
                                    <div className="w-24 flex items-center gap-2 text-sm text-slate-600 font-medium">
                                        <mode.icon className="w-4 h-4" /> {mode.label}
                                    </div>
                                    <div className="relative flex-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                                        <Input 
                                            type="number" 
                                            className="pl-7 h-9 text-right" 
                                            value={mode.val || ''}
                                            onChange={e => mode.set(Number(e.target.value))}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="pt-2 border-t mt-4 flex items-center justify-between">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-xs"
                                onClick={() => {
                                    const rem = Math.max(0, grandTotal - splitUpi - splitCard - splitCredit);
                                    setSplitCash(Number(rem.toFixed(2)));
                                }}
                            >
                                Fill Cash
                            </Button>
                            
                            <div className="text-right">
                                {isSplitBalanced ? (
                                    <span className="text-green-600 font-semibold text-sm">✓ Balanced</span>
                                ) : splitDiff < 0 ? (
                                    <span className="text-amber-500 font-medium text-sm">Remaining: ₹{Math.abs(splitDiff).toFixed(2)}</span>
                                ) : (
                                    <span className="text-red-500 font-medium text-sm">Over by: ₹{splitDiff.toFixed(2)}</span>
                                )}
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

                {/* --- UNIVERSAL SUMMARY ROW --- */}
                <div className="bg-slate-50 rounded-xl p-4 mt-6 border border-slate-100/60">
                    <div className="space-y-1.5 text-xs text-slate-500">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span className="font-medium text-slate-900">₹{totals.subtotal.toFixed(2)}</span>
                        </div>
                        {totals.discountAmount > 0 && (
                            <div className="flex justify-between text-green-600">
                                <span>Discount</span>
                                <span>-₹{totals.discountAmount.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span>Taxable</span>
                            <span className="font-medium text-slate-900">₹{totals.taxableAmount.toFixed(2)}</span>
                        </div>
                        {(totals.cgst + totals.sgst) > 0 && (
                            <div className="flex justify-between">
                                <span>GST</span>
                                <span className="font-medium text-slate-900">+₹{(totals.cgst + totals.sgst).toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                    <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between items-center">
                        <span className="font-semibold text-slate-900">Grand Total</span>
                        <span className="font-bold text-lg text-slate-900">₹{grandTotal.toFixed(2)}</span>
                    </div>
                </div>

                <DialogFooter className="mt-4 sm:flex-col sm:space-x-0 gap-2">
                    <Button
                        data-testid="payment-confirm-btn"
                        size="lg"
                        className="w-full h-12 text-sm font-semibold"
                        disabled={isConfirmDisabled}
                        onClick={handleConfirm}
                    >
                        {isLoading ? (
                            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Saving...</>
                        ) : (
                            `Confirm & Save Bill ₹${grandTotal.toFixed(2)}`
                        )}
                    </Button>
                    <p className="text-center text-[10px] text-muted-foreground mt-2">
                        Press <kbd className="bg-slate-100 border px-1 rounded-sm mx-1 font-sans">Enter</kbd> to confirm.
                    </p>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
