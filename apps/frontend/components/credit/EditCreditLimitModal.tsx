'use client';

import { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreditAccounts, useUpdateCreditLimit } from '@/hooks/useCredit';
import { formatCurrency } from '@/lib/gst';

interface EditCreditLimitModalProps {
    isOpen: boolean;
    accountId: string | null;
    onClose: () => void;
}

const PRESETS = [500, 1000, 2000, 5000, 10000];

export default function EditCreditLimitModal({ isOpen, accountId, onClose }: EditCreditLimitModalProps) {
    const { data: accounts } = useCreditAccounts();
    const mutation = useUpdateCreditLimit();
    const safeAccounts = Array.isArray(accounts) ? accounts : (accounts as any)?.data ?? [];
    const account = safeAccounts.find((a: any) => a.id === accountId);

    const [newLimit, setNewLimit] = useState<string>('');
    const [error, setError] = useState('');

    const outstanding = account?.totalOutstanding ?? 0;
    const currentLimit = account?.creditLimit ?? 0;
    const numLimit = parseFloat(newLimit) || 0;

    const handleOpen = () => {
        setNewLimit(String(currentLimit));
        setError('');
    };

    const handleSubmit = async () => {
        if (numLimit < outstanding) {
            setError(`Cannot set limit below current outstanding ${formatCurrency(outstanding)}`);
            return;
        }
        await mutation.mutateAsync({ accountId: accountId!, newLimit: numLimit });
        onClose();
    };

    if (!account) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); else handleOpen(); }}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-primary" />
                        <div>
                            <div>Edit Credit Limit</div>
                            <div className="text-sm font-normal text-muted-foreground">{account.customer.name}</div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Current Limit</span>
                            <span className="font-semibold">{formatCurrency(currentLimit)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Outstanding</span>
                            <span className="font-semibold text-red-600">{formatCurrency(outstanding)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Available</span>
                            <span className="font-semibold text-green-600">{formatCurrency(Math.max(currentLimit - outstanding, 0))}</span>
                        </div>
                    </div>

                    <div>
                        <Label>New Credit Limit</Label>
                        <div className="relative mt-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                            <Input
                                type="number"
                                value={newLimit}
                                onChange={(e) => { setNewLimit(e.target.value); setError(''); }}
                                className="pl-8"
                                min={0}
                                step={100}
                            />
                        </div>
                        {error && <div className="text-sm text-red-600 mt-1">{error}</div>}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        {PRESETS.map(p => (
                            <Button key={p} variant="outline" size="sm" className="text-xs" onClick={() => setNewLimit(String(p))}>
                                ₹{p.toLocaleString('en-IN')}
                            </Button>
                        ))}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={mutation.isPending}>
                        {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Limit'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
