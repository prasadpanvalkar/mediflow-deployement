'use client';

import { Heart, Eye, Receipt, IndianRupee, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomerList } from '@/hooks/useCustomers';
import { useBillingStore } from '@/store/billingStore';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/gst';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { CustomerFilters, CustomerFull } from '@/types';

interface CustomerTableProps {
    filters: CustomerFilters;
    onEdit?: (customer: CustomerFull) => void;
}

export default function CustomerTable({ filters, onEdit }: CustomerTableProps) {
    const { data, isLoading } = useCustomerList(filters);
    const setCustomer = useBillingStore((s) => s.setCustomer);
    const router = useRouter();

    if (isLoading) {
        return (
            <div className="space-y-2">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
        );
    }

    const customers = (data?.data ?? data ?? []) as CustomerFull[];

    return (
        <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Customer</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Address</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Purchases</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Outstanding</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">Credit Limit</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">Last Visit</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {customers.map((c) => (
                        <tr
                            key={c.id}
                            className={cn(
                                'border-b last:border-b-0 hover:bg-slate-50 cursor-pointer transition-colors',
                                c.isChronic && 'bg-purple-50/30'
                            )}
                            onClick={() => router.push(`/dashboard/customers/${c.id}`)}
                        >
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                        {c.name.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-medium text-slate-900">{c.name}</span>
                                            {c.isChronic && <Heart className="w-3 h-3 text-purple-500 fill-purple-500" />}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{c.phone}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs truncate max-w-[200px] hidden md:table-cell">
                                {c.address || '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(c.totalPurchases)}</td>
                            <td className="px-4 py-3 text-right">
                                {c.outstanding > 0
                                    ? <span className="text-red-600 font-semibold">{formatCurrency(c.outstanding)}</span>
                                    : <span className="text-green-600">—</span>
                                }
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">
                                {formatCurrency(c.creditLimit)}
                                {c.outstanding > 0 && c.creditLimit > 0 && (
                                    <div className="w-16 h-1 rounded-full bg-slate-100 overflow-hidden mt-1 ml-auto">
                                        <div
                                            className={cn('h-full rounded-full',
                                                (c.outstanding / c.creditLimit) > 0.8 ? 'bg-red-500'
                                                : (c.outstanding / c.creditLimit) > 0.5 ? 'bg-amber-500'
                                                : 'bg-green-500'
                                            )}
                                            style={{ width: `${Math.min((c.outstanding / c.creditLimit) * 100, 100)}%` }}
                                        />
                                    </div>
                                )}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden lg:table-cell">
                                {c.createdAt ? formatDistanceToNow(new Date(c.createdAt), { addSuffix: true }) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex gap-1 justify-end">
                                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2"
                                        onClick={() => router.push(`/dashboard/customers/${c.id}`)}>
                                        <Eye className="w-3 h-3" />
                                    </Button>
                                    {onEdit && (
                                        <Button variant="ghost" size="sm" className="h-7 text-xs px-2"
                                            onClick={() => onEdit(c)}>
                                            <Pencil className="w-3 h-3" />
                                        </Button>
                                    )}
                                    <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                                        onClick={() => { setCustomer(c); router.push('/dashboard/billing'); }}>
                                        <Receipt className="w-3 h-3" />
                                    </Button>
                                    {c.outstanding > 0 && (
                                        <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                                            onClick={() => router.push('/dashboard/credit')}>
                                            <IndianRupee className="w-3 h-3" />
                                        </Button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {customers.length === 0 && (
                <div className="py-16 text-center text-sm text-muted-foreground">No customers found</div>
            )}
        </div>
    );
}
