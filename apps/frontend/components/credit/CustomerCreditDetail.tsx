'use client';

import { X, Phone, IndianRupee, MessageCircle, ArrowUpRight, ArrowDownLeft, FileText, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCreditTransactions, useCreditAccounts } from '@/hooks/useCredit';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface CustomerCreditDetailProps {
    accountId: string;
    onClose: () => void;
    onPayClick: () => void;
    onEditLimit: () => void;
    onWhatsAppClick?: () => void;
}

export default function CustomerCreditDetail({
    accountId,
    onClose,
    onPayClick,
    onEditLimit,
    onWhatsAppClick,
}: CustomerCreditDetailProps) {
    const { data: accounts } = useCreditAccounts();
    const { data: transactions, isLoading: txLoading } = useCreditTransactions(accountId);

    const account = accounts?.find((a: any) => a.id === accountId);
    if (!account) return null;

    const customer = account.customer;

    return (
        <div className="bg-white rounded-xl border shadow-sm flex flex-col h-[calc(100vh-220px)] sticky top-6">
            {/* Header */}
            <div className="border-b px-5 py-4 flex justify-between items-start">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {customer.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-slate-900">{customer.name}</h3>
                            {customer.isChronic && (
                                <span className="bg-purple-100 text-purple-700 text-[10px] font-medium px-2 py-0.5 rounded-full">
                                    Chronic
                                </span>
                            )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            +91 {customer.phone.slice(0, 5)} {customer.phone.slice(5)}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={onEditLimit}>Edit Credit Limit</DropdownMenuItem>
                            <DropdownMenuItem>View Bill History</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Summary strip */}
            <div className="bg-slate-50 border-b px-5 py-3">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Outstanding</div>
                        <div className={cn('text-lg font-bold', account.totalOutstanding > 0 ? 'text-red-600' : 'text-green-600')}>
                            {formatCurrency(account.totalOutstanding)}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Bought</div>
                        <div className="text-lg font-bold text-slate-900">{formatCurrency(customer.totalPurchases)}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Credit Limit</div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">{formatCurrency(account.creditLimit)}</span>
                            <button onClick={onEditLimit} className="text-[10px] text-primary hover:underline">Edit</button>
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Member Since</div>
                        <div className="text-sm font-semibold text-slate-900">
                            {format(new Date(account.createdAt), 'MMM yyyy')}
                        </div>
                    </div>
                </div>
            </div>

            {/* Action buttons */}
            <div className="px-5 py-3 flex gap-2 border-b">
                <Button className="flex-1 h-9" onClick={onPayClick}>
                    <IndianRupee className="w-4 h-4 mr-1" />
                    Record Payment
                </Button>
                {onWhatsAppClick && (
                    <Button variant="outline" className="flex-1 h-9 border-green-300 text-green-600 hover:bg-green-50" onClick={onWhatsAppClick}>
                        <MessageCircle className="w-4 h-4 mr-1" />
                        WhatsApp
                    </Button>
                )}
                <Button variant="outline" size="sm" className="h-9 px-3" asChild>
                    <a href={`tel:${customer.phone}`}>
                        <Phone className="w-4 h-4" />
                    </a>
                </Button>
            </div>

            {/* Transaction Ledger */}
            <div className="px-5 py-4 flex-1 overflow-y-auto">
                <h4 className="text-sm font-semibold text-slate-900 mb-1">Transaction History</h4>
                <p className="text-[10px] text-muted-foreground mb-4">Showing all credit activity</p>

                {txLoading ? (
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <Skeleton key={i} className="h-14 rounded-lg" />
                        ))}
                    </div>
                ) : transactions && transactions.length > 0 ? (
                    <div className="space-y-0">
                        {transactions.map((tx: any, idx: number) => (
                            <div key={tx.id} className="flex items-start gap-3 py-3 border-b last:border-b-0 relative">
                                {/* Timeline line */}
                                {idx < transactions.length - 1 && (
                                    <div className="absolute left-4 top-11 bottom-0 w-0.5 bg-slate-100" />
                                )}
                                {/* Icon */}
                                <div className={cn(
                                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10',
                                    tx.type === 'debit' ? 'bg-red-100' : 'bg-green-100'
                                )}>
                                    {tx.type === 'debit'
                                        ? <ArrowUpRight className="w-4 h-4 text-red-600" />
                                        : <ArrowDownLeft className="w-4 h-4 text-green-600" />
                                    }
                                </div>
                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-slate-900">
                                        {tx.type === 'debit' ? `Purchase — ${tx.invoiceId || 'N/A'}` : 'Payment Received'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {format(new Date(tx.createdAt), 'dd MMM yyyy, h:mm a')}
                                    </div>
                                    {tx.description && tx.type === 'credit' && (
                                        <div className="text-xs text-slate-500 italic mt-0.5">{tx.description}</div>
                                    )}
                                </div>
                                {/* Amount */}
                                <div className="text-right ml-auto flex-shrink-0">
                                    <div className={cn('font-semibold text-sm', tx.type === 'debit' ? 'text-red-600' : 'text-green-600')}>
                                        {tx.type === 'debit' ? '+' : '-'}{formatCurrency(tx.amount)}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        Bal: {formatCurrency(tx.balanceAfter)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                        <FileText className="w-10 h-10 text-slate-200 mb-2" />
                        <span className="text-sm text-slate-400">No transactions yet</span>
                    </div>
                )}
            </div>
        </div>
    );
}
