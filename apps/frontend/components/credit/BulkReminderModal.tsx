'use client';

import { useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useCreditAccounts } from '@/hooks/useCredit';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency } from '@/lib/gst';
import { WHATSAPP_TEMPLATES, openWhatsApp } from '@/lib/whatsapp';
import { differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface BulkReminderModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function BulkReminderModal({ isOpen, onClose }: BulkReminderModalProps) {
    const { data: accounts } = useCreditAccounts({ status: 'overdue' });
    const outlet = useAuthStore((s) => s.outlet);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [sent, setSent] = useState(false);

    const overdueAccounts = Array.isArray(accounts) ? accounts : (accounts as any)?.data ?? [];

    const handleOpen = () => {
        setSelected(new Set(overdueAccounts.map((a: any) => a.id)));
        setSent(false);
    };

    const toggleAccount = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
    };

    const toggleAll = () => {
        if (selected.size === overdueAccounts.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(overdueAccounts.map((a: any) => a.id)));
        }
    };

    const handleSend = () => {
        overdueAccounts
            .filter((a: any) => selected.has(a.id))
            .forEach((account: any) => {
                const daysOverdue = account.lastTransactionDate
                    ? differenceInDays(new Date(), new Date(account.lastTransactionDate))
                    : undefined;
                const msg = WHATSAPP_TEMPLATES.paymentReminder(
                    account.customer.name,
                    account.totalOutstanding,
                    outlet?.name || 'Apollo Medical Store',
                    daysOverdue
                );
                openWhatsApp(account.customer.phone, msg);
            });
        setSent(true);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); else handleOpen(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-green-600" />
                        Send WhatsApp Reminders
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">Send reminders to all overdue customers</p>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Select all toggle */}
                    <div className="flex items-center justify-between">
                        <button onClick={toggleAll} className="text-sm text-primary hover:underline">
                            {selected.size === overdueAccounts.length ? 'Deselect All' : 'Select All'}
                        </button>
                        <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                    </div>

                    {/* Customer list */}
                    <div className="max-h-[300px] overflow-y-auto space-y-2">
                        {overdueAccounts.map((account: any) => {
                            const daysOverdue = account.lastTransactionDate
                                ? differenceInDays(new Date(), new Date(account.lastTransactionDate))
                                : 0;
                            return (
                                <div
                                    key={account.id}
                                    className={cn(
                                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                                        selected.has(account.id) ? 'border-green-300 bg-green-50' : 'border-slate-200'
                                    )}
                                    onClick={() => toggleAccount(account.id)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.has(account.id)}
                                        readOnly
                                        className="w-4 h-4 rounded text-green-600"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium">{account.customer.name}</div>
                                        <div className="text-xs text-muted-foreground">{account.customer.phone}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-semibold text-red-600">{formatCurrency(account.totalOutstanding)}</div>
                                        <div className="text-[10px] text-muted-foreground">{daysOverdue} days overdue</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {overdueAccounts.length === 0 && (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                            No overdue accounts found
                        </div>
                    )}

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                        ⚠️ Your browser may block multiple tabs. Allow popups for this site.
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button
                        onClick={handleSend}
                        disabled={selected.size === 0 || sent}
                        className="bg-green-600 hover:bg-green-700 text-white"
                    >
                        {sent ? '✓ Sent!' : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                Send {selected.size} {selected.size === 1 ? 'Reminder' : 'Reminders'}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
