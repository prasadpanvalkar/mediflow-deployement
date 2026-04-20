'use client';

import { Users, Heart, IndianRupee, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useCustomerList, useRefillAlerts } from '@/hooks/useCustomers';
import { useCreditAgingSummary } from '@/hooks/useCredit';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';

interface CustomerStatCardsProps {
    onFilterChronic?: () => void;
    onFilterOutstanding?: () => void;
    onShowRefills?: () => void;
}

export default function CustomerStatCards({ onFilterChronic, onFilterOutstanding, onShowRefills }: CustomerStatCardsProps) {
    const { data: allData } = useCustomerList();
    const { data: chronicData } = useCustomerList({ isChronic: true });
    const { data: outstandingData } = useCustomerList({ hasOutstanding: true });
    const { data: refillAlerts } = useRefillAlerts();

    const total = allData?.pagination?.totalRecords ?? allData?.data?.length ?? 0;
    const chronicCount = chronicData?.pagination?.totalRecords ?? chronicData?.data?.length ?? 0;
    const outstandingList = outstandingData?.data || [];
    const outstandingCount = outstandingData?.pagination?.totalRecords ?? outstandingList.length;
    const outstandingAmount = outstandingList.reduce((s: number, c: any) => s + (c.outstanding || 0), 0);
    const refillList = Array.isArray(refillAlerts) ? refillAlerts : (refillAlerts as any)?.data ?? [];
    const refillCount = refillList.length;
    const hasOverdue = refillList.some((a: any) => a.daysOverdue > 0);

    const cards = [
        {
            title: 'Total Customers',
            value: String(total),
            subtitle: 'Registered patients',
            icon: Users,
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
        },
        {
            title: 'Chronic Patients',
            value: String(chronicCount),
            subtitle: 'On regular medicines',
            icon: Heart,
            iconBg: 'bg-purple-100',
            iconColor: 'text-purple-600',
            onClick: onFilterChronic,
        },
        {
            title: 'Outstanding',
            value: formatCurrency(outstandingAmount),
            subtitle: `${outstandingCount} customers with dues`,
            icon: IndianRupee,
            iconBg: 'bg-amber-100',
            iconColor: 'text-amber-600',
            onClick: onFilterOutstanding,
        },
        {
            title: 'Refills Due',
            value: `${refillCount} due`,
            subtitle: 'Chronic medicine refills',
            icon: RefreshCw,
            iconBg: 'bg-green-100',
            iconColor: 'text-green-600',
            onClick: onShowRefills,
            pulse: hasOverdue,
        },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card) => {
                const Icon = card.icon;
                return (
                    <Card
                        key={card.title}
                        className={cn(
                            'rounded-xl p-4 cursor-pointer transition-all hover:shadow-md',
                            card.pulse && 'animate-pulse'
                        )}
                        onClick={card.onClick}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', card.iconBg)}>
                                <Icon className={cn('w-5 h-5', card.iconColor)} />
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-slate-900">{card.value}</div>
                        <div className="text-xs text-muted-foreground mt-1">{card.subtitle}</div>
                    </Card>
                );
            })}
        </div>
    );
}
