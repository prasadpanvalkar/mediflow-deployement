'use client';

import { Heart, RefreshCw, ArrowRight, Receipt, UserSearch, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomerList } from '@/hooks/useCustomers';
import { useBillingStore } from '@/store/billingStore';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/gst';
import { differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { CustomerFilters, CustomerFull } from '@/types';

const AVATAR_COLORS = [
    'from-blue-400 to-blue-600',
    'from-purple-400 to-purple-600',
    'from-emerald-400 to-emerald-600',
    'from-amber-400 to-amber-600',
    'from-rose-400 to-rose-600',
    'from-cyan-400 to-cyan-600',
    'from-indigo-400 to-indigo-600',
    'from-teal-400 to-teal-600',
];

function getAvatarColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
    const parts = name.split(' ');
    return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
}

interface CustomerGridProps {
    filters: CustomerFilters;
    onEdit?: (customer: CustomerFull) => void;
}

export default function CustomerGrid({ filters, onEdit }: CustomerGridProps) {
    const { data, isLoading } = useCustomerList(filters);
    const setCustomer = useBillingStore((s) => s.setCustomer);
    const router = useRouter();

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-[260px] rounded-2xl" />)}
            </div>
        );
    }

    const customers = (data?.data ?? data ?? []) as CustomerFull[];

    if (customers.length === 0) {
        return (
            <Card className="rounded-2xl border-dashed border-2 border-slate-200">
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <UserSearch className="w-16 h-16 text-slate-200 mb-4" />
                    <h3 className="text-sm font-medium text-slate-500">No customers found</h3>
                    <p className="text-xs text-muted-foreground mt-1">Try clearing your filters</p>
                </div>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {customers.map((customer) => {
                const refillDays = customer.nextRefillDue
                    ? differenceInDays(new Date(), new Date(customer.nextRefillDue))
                    : null;

                return (
                    <Card
                        key={customer.id}
                        className="bg-white rounded-2xl border p-5 hover:shadow-lg cursor-pointer transition-shadow"
                        onClick={() => router.push(`/dashboard/customers/${customer.id}`)}
                    >
                        {/* Top row */}
                        <div className="flex items-start justify-between">
                            <div className={cn('w-12 h-12 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-lg', getAvatarColor(customer.name))}>
                                {getInitials(customer.name)}
                            </div>
                            {customer.isChronic && (
                                <span className="bg-purple-100 text-purple-700 text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Heart className="w-3 h-3" /> Chronic
                                </span>
                            )}
                        </div>

                        {/* Name + Contact */}
                        <div className="mt-3">
                            <div className="text-base font-bold text-slate-900">{customer.name}</div>
                            <div className="text-sm text-muted-foreground">
                                {customer.phone.slice(0, 5)} {customer.phone.slice(5)}
                            </div>
                            {customer.address && (
                                <div className="text-xs text-slate-400 truncate max-w-full mt-0.5">{customer.address}</div>
                            )}
                        </div>

                        {/* Chronic conditions */}
                        {customer.isChronic && customer.chronicConditions?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {customer.chronicConditions.map((c) => (
                                    <span key={c} className="bg-purple-50 text-purple-700 text-[10px] px-2 py-0.5 rounded-full">{c}</span>
                                ))}
                            </div>
                        )}

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t">
                            <div>
                                <div className="text-[10px] text-muted-foreground">Total Spent</div>
                                <div className="text-sm font-semibold">{formatCurrency(customer.totalPurchases)}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-muted-foreground">Outstanding</div>
                                <div className={cn('text-sm font-semibold', customer.outstanding > 0 ? 'text-red-600' : 'text-green-600')}>
                                    {customer.outstanding > 0 ? formatCurrency(customer.outstanding) : '₹0'}
                                </div>
                            </div>
                        </div>

                        {/* Refill indicator */}
                        {customer.isChronic && refillDays !== null && (
                            <div className="mt-2 border-t pt-2">
                                <div className={cn('flex items-center gap-1 text-xs',
                                    refillDays > 0 ? 'text-red-600'
                                    : refillDays === 0 ? 'text-amber-600'
                                    : 'text-slate-500'
                                )}>
                                    <RefreshCw className="w-3 h-3" />
                                    {refillDays > 0 ? `Refill ${refillDays} days overdue`
                                     : refillDays === 0 ? 'Refill due today'
                                     : `Next refill: ${new Date(customer.nextRefillDue!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                                    }
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="flex-1 text-xs h-8"
                                onClick={() => router.push(`/dashboard/customers/${customer.id}`)}>
                                <ArrowRight className="w-3 h-3 mr-1" /> View
                            </Button>
                            {onEdit && (
                                <Button variant="ghost" size="sm" className="text-xs h-8 px-2"
                                    onClick={() => onEdit(customer)}>
                                    <Pencil className="w-3 h-3" />
                                </Button>
                            )}
                            <Button variant="outline" size="sm" className="flex-1 text-xs h-8"
                                onClick={() => { setCustomer(customer); router.push('/dashboard/billing'); }}>
                                <Receipt className="w-3 h-3 mr-1" /> Quick Bill
                            </Button>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}
