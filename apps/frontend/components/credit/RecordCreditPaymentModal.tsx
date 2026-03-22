'use client';

import { useState } from 'react';
import { IndianRupee, Loader2, Banknote, Smartphone, CreditCard, FileCheck, MessageCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useCreditAccounts, useRecordCreditPayment } from '@/hooks/useCredit';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { WHATSAPP_TEMPLATES, openWhatsApp } from '@/lib/whatsapp';
import { format } from 'date-fns';

interface RecordCreditPaymentModalProps {
    isOpen: boolean;
    accountId: string | null;
    onClose: () => void;
}

const PAYMENT_MODES = [
    { key: 'cash', label: 'Cash', icon: Banknote },
    { key: 'upi', label: 'UPI', icon: Smartphone },
    { key: 'card', label: 'Card', icon: CreditCard },
    { key: 'cheque', label: 'Cheque', icon: FileCheck },
] as const;

export default function RecordCreditPaymentModal({ isOpen, accountId, onClose }: RecordCreditPaymentModalProps) {
    const { data: accounts } = useCreditAccounts();
    const mutation = useRecordCreditPayment();
    const outlet = useAuthStore((s) => s.outlet);

    const safeAccounts = Array.isArray(accounts) ? accounts : (accounts as any)?.data ?? [];
    const account = safeAccounts.find((a: any) => a.id === accountId);
    const customer = account?.customer;
    const outstanding = account?.totalOutstanding ?? 0;

    const [amount, setAmount] = useState<string>('');
    const [mode, setMode] = useState<string>('cash');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [sendWhatsApp, setSendWhatsApp] = useState(true);
    const [error, setError] = useState('');

    const numAmount = parseFloat(amount) || 0;
    const remaining = outstanding - numAmount;

    const handleOpen = () => {
        setAmount(String(outstanding));
        setMode('cash');
        setReference('');
        setNotes('');
        setSendWhatsApp(!!customer?.phone);
        setError('');
    };

    const handleSubmit = async () => {
        if (numAmount <= 0) { setError('Amount must be > 0'); return; }
        if (numAmount > outstanding) { setError(`Amount exceeds outstanding ${formatCurrency(outstanding)}`); return; }

        try {
            await mutation.mutateAsync({
                accountId: accountId!,
                payload: {
                    amount: numAmount,
                    mode: mode as any,
                    reference: reference || undefined,
                    notes: notes || undefined,
                    paymentDate: format(new Date(), 'yyyy-MM-dd'),
                },
            });

            if (sendWhatsApp && customer?.phone) {
                const msg = WHATSAPP_TEMPLATES.paymentReceipt(
                    customer.name,
                    numAmount,
                    remaining,
                    outlet?.name || 'Apollo Medical Store'
                );
                openWhatsApp(customer.phone, msg);
            }

            onClose();
        } catch (err: any) {
            setError(err?.error?.message || 'Failed to record payment');
        }
    };

    if (!account || !customer) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); else handleOpen(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                            <IndianRupee className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                            <div>Record Payment</div>
                            <div className="text-sm font-normal text-muted-foreground">{customer.name}</div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Outstanding display */}
                    <div className="bg-slate-50 rounded-xl p-4">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Total Outstanding</span>
                            <span className="text-2xl font-bold text-red-600">{formatCurrency(outstanding)}</span>
                        </div>
                        <div className="mt-2">
                            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-red-500 transition-all"
                                    style={{ width: `${Math.min((outstanding / (account.creditLimit || 1)) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Amount */}
                    <div>
                        <Label>Payment Amount</Label>
                        <div className="relative mt-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">₹</span>
                            <Input
                                type="number"
                                value={amount}
                                onChange={(e) => { setAmount(e.target.value); setError(''); }}
                                className="pl-8 h-14 text-xl font-bold"
                                min={1}
                                max={outstanding}
                            />
                        </div>
                        <div className="flex gap-2 mt-2">
                            <Button variant="outline" size="sm" className="text-xs" onClick={() => setAmount(String(outstanding))}>
                                Full: {formatCurrency(outstanding)}
                            </Button>
                            {[500, 1000, 2000].filter(v => v <= outstanding).map(v => (
                                <Button key={v} variant="outline" size="sm" className="text-xs" onClick={() => setAmount(String(v))}>
                                    ₹{v}
                                </Button>
                            ))}
                        </div>
                        {numAmount > 0 && (
                            <div className={cn('text-sm mt-2', remaining === 0 ? 'text-green-600' : 'text-amber-600')}>
                                {remaining === 0
                                    ? '✓ Fully cleared!'
                                    : `₹${remaining.toLocaleString('en-IN')} still remaining`
                                }
                            </div>
                        )}
                        {error && <div className="text-sm text-red-600 mt-1">{error}</div>}
                    </div>

                    {/* Payment mode */}
                    <div>
                        <Label>Payment Mode</Label>
                        <div className="grid grid-cols-4 gap-2 mt-1">
                            {PAYMENT_MODES.map(pm => {
                                const Icon = pm.icon;
                                return (
                                    <button
                                        key={pm.key}
                                        onClick={() => setMode(pm.key)}
                                        className={cn(
                                            'rounded-lg border p-3 text-center transition-colors',
                                            mode === pm.key ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'
                                        )}
                                    >
                                        <Icon className={cn('w-5 h-5 mx-auto mb-1', mode === pm.key ? 'text-primary' : 'text-slate-500')} />
                                        <div className={cn('text-xs font-medium', mode === pm.key ? 'text-primary' : 'text-slate-600')}>{pm.label}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Reference */}
                    {mode !== 'cash' && (
                        <div>
                            <Label>{mode === 'cheque' ? 'Cheque No' : 'UPI / Card Ref'}</Label>
                            <Input
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                                placeholder={mode === 'cheque' ? 'Cheque number' : 'Transaction reference'}
                                className="mt-1"
                            />
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <Label>Notes (optional)</Label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="e.g. Paid via PhonePe for February dues"
                            rows={2}
                            className="mt-1"
                        />
                    </div>

                    {/* WhatsApp receipt toggle */}
                    {customer.phone && (
                        <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2 text-sm">
                                <MessageCircle className="w-4 h-4 text-green-600" />
                                Send receipt on WhatsApp
                            </Label>
                            <Switch checked={sendWhatsApp} onCheckedChange={setSendWhatsApp} />
                        </div>
                    )}
                    {sendWhatsApp && customer.phone && numAmount > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
                            Dear {customer.name}, we have received your payment of {formatCurrency(numAmount)}.
                            Remaining balance: {formatCurrency(remaining)}. Thank you! — {outlet?.name || 'Apollo Medical Store'}
                        </div>
                    )}
                </div>

                <DialogFooter className="mt-2">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={mutation.isPending || numAmount <= 0}>
                        {mutation.isPending ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Recording...</>
                        ) : (
                            <>Record Payment {numAmount > 0 ? formatCurrency(numAmount) : ''}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
