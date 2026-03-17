'use client';

import { useState } from 'react';
import { Search, MessageCircle, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useCreditAccounts } from '@/hooks/useCredit';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { CreditAccount, CreditStatus } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface CreditAccountsListProps {
    activeFilter: CreditStatus | 'all';
    searchQuery: string;
    selectedAccountId: string | null;
    onSelect: (id: string) => void;
    onPayClick: (id: string) => void;
    onFilterChange: (filter: CreditStatus | 'all') => void;
    onSearchChange: (query: string) => void;
    onWhatsAppClick?: (account: CreditAccount) => void;
}

const STATUS_CONFIG: Record<string, { label: string; borderColor: string; badgeBg: string; badgeText: string }> = {
    active: { label: 'Active', borderColor: 'border-l-blue-400', badgeBg: 'bg-blue-100', badgeText: 'text-blue-700' },
    partial: { label: 'Partial', borderColor: 'border-l-amber-400', badgeBg: 'bg-amber-100', badgeText: 'text-amber-700' },
    overdue: { label: 'Overdue', borderColor: 'border-l-red-500', badgeBg: 'bg-red-100', badgeText: 'text-red-700' },
    cleared: { label: 'Cleared', borderColor: 'border-l-green-400', badgeBg: 'bg-green-100', badgeText: 'text-green-700' },
};

const FILTERS: { key: CreditStatus | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'active', label: 'Active' },
    { key: 'partial', label: 'Partial' },
    { key: 'cleared', label: 'Cleared' },
];

export default function CreditAccountsList({
    activeFilter,
    searchQuery,
    selectedAccountId,
    onSelect,
    onPayClick,
    onFilterChange,
    onSearchChange,
    onWhatsAppClick,
}: CreditAccountsListProps) {
    const filters: any = {};
    if (activeFilter !== 'all') filters.status = activeFilter;
    if (searchQuery) filters.search = searchQuery;

    const { data: accounts, isLoading } = useCreditAccounts(filters);

    return (
        <div className="space-y-4">
            {/* Filter + Search */}
            <div className="flex gap-3 flex-wrap items-center">
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search name or phone..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <div className="flex gap-1.5">
                    {FILTERS.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => onFilterChange(f.key)}
                            className={cn(
                                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                                activeFilter === f.key
                                    ? 'bg-primary text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Account Cards */}
            {isLoading ? (
                <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-[130px] rounded-xl" />
                    ))}
                </div>
            ) : accounts && accounts.length > 0 ? (
                <div className="space-y-3">
                    {accounts.map((account: any) => {
                        const status = STATUS_CONFIG[account.status] || STATUS_CONFIG.active;
                        const utilization = account.creditLimit > 0
                            ? (account.totalOutstanding / account.creditLimit) * 100
                            : 0;
                        const utilizationColor =
                            utilization > 80 ? 'bg-red-500'
                            : utilization > 50 ? 'bg-amber-500'
                            : 'bg-green-500';
                        const isSelected = selectedAccountId === account.id;

                        return (
                            <Card
                                key={account.id}
                                className={cn(
                                    'rounded-xl border-l-4 p-4 cursor-pointer transition-all hover:shadow-md',
                                    status.borderColor,
                                    isSelected && 'border-primary ring-2 ring-primary/20'
                                )}
                                onClick={() => onSelect(account.id)}
                            >
                                {/* Row 1: Customer info */}
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                            {account.customer.name.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-slate-900">
                                                    {account.customer.name}
                                                </span>
                                                {account.customer.isChronic && (
                                                    <span className="bg-purple-100 text-purple-700 text-[10px] font-medium px-2 py-0.5 rounded-full">
                                                        Chronic
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                +91 {account.customer.phone.slice(0, 5)} {account.customer.phone.slice(5)}
                                            </div>
                                        </div>
                                    </div>
                                    <span className={cn('text-[10px] font-medium px-2 py-1 rounded-full', status.badgeBg, status.badgeText)}>
                                        {status.label}
                                    </span>
                                </div>

                                {/* Row 2: Balance */}
                                <div className="flex justify-between items-end mt-3">
                                    <div>
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Outstanding</div>
                                        <div className={cn(
                                            'text-xl font-bold',
                                            account.status === 'overdue' ? 'text-red-600' : 'text-slate-900'
                                        )}>
                                            {formatCurrency(account.totalOutstanding)}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                            of {formatCurrency(account.creditLimit)} limit
                                        </div>
                                        <div className="w-32 mt-1">
                                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                <div
                                                    className={cn('h-full rounded-full transition-all', utilizationColor)}
                                                    style={{ width: `${Math.min(utilization, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        {account.lastTransactionDate && (
                                            <span className="text-[10px] text-muted-foreground">
                                                Last: {formatDistanceToNow(new Date(account.lastTransactionDate), { addSuffix: true })}
                                            </span>
                                        )}
                                        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                            <Button
                                                size="sm"
                                                className="h-7 text-xs px-3"
                                                onClick={() => onPayClick(account.id)}
                                            >
                                                Pay
                                            </Button>
                                            {onWhatsAppClick && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs px-2 border-green-300 text-green-600 hover:bg-green-50"
                                                    onClick={() => onWhatsAppClick(account)}
                                                >
                                                    <MessageCircle className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Row 3: Overdue notice */}
                                {account.status === 'overdue' && account.lastTransactionDate && (
                                    <div className="bg-red-50 rounded-lg px-3 py-1.5 mt-2 flex items-center gap-2">
                                        <Clock className="w-3 h-3 text-red-500" />
                                        <span className="text-xs text-red-600">
                                            Overdue since {new Date(account.lastTransactionDate).toLocaleDateString('en-IN', {
                                                day: 'numeric', month: 'short', year: 'numeric'
                                            })}
                                        </span>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-sm font-medium text-slate-500">
                        {activeFilter === 'all' && !searchQuery
                            ? 'All customers are paid up!'
                            : activeFilter === 'overdue'
                            ? 'No overdue accounts'
                            : 'No credit accounts found'}
                    </h3>
                </div>
            )}
        </div>
    );
}
