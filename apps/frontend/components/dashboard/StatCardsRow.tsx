'use client';

import { useRouter } from 'next/navigation';
import { IndianRupee, Banknote, Receipt, CreditCard, RotateCcw } from 'lucide-react';
import { DashboardKPI } from '@/types';
import { formatCurrency } from '@/lib/gst';
import { StatCard } from './StatCard';

interface StatCardsRowProps {
  kpi?: DashboardKPI;
  isLoading?: boolean;
}

export default function StatCardsRow({ kpi, isLoading }: StatCardsRowProps) {
  const router = useRouter();

  // If loading or no data yet, render loading skeletons
  if (isLoading || !kpi) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="..." value="..." icon={IndianRupee} iconBg="bg-slate-100" iconColor="text-slate-400" isLoading />
        <StatCard title="..." value="..." icon={Banknote} iconBg="bg-slate-100" iconColor="text-slate-400" isLoading />
        <StatCard title="..." value="..." icon={Receipt} iconBg="bg-slate-100" iconColor="text-slate-400" isLoading />
        <StatCard title="..." value="..." icon={CreditCard} iconBg="bg-slate-100" iconColor="text-slate-400" isLoading />
        <StatCard title="..." value="..." icon={RotateCcw} iconBg="bg-slate-100" iconColor="text-slate-400" isLoading />
      </div>
    );
  }

  const avgBill = kpi.totalBills > 0 ? (kpi.totalSales / kpi.totalBills) : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {/* 1. Total Sales */}
      <StatCard
        title="Today's Sales"
        value={formatCurrency(kpi.totalSales)}
        subtitle={`${kpi.totalBills} bills created`}
        icon={IndianRupee}
        iconBg="bg-blue-100"
        iconColor="text-blue-600"
        trend={{ value: 12, direction: 'up', label: 'vs yesterday' }}
      />

      {/* 2. Cash Collected */}
      <StatCard
        title="Cash Collected"
        value={formatCurrency(kpi.cashCollected)}
        subtitle={`UPI: ${formatCurrency(kpi.upiCollected)}`}
        icon={Banknote}
        iconBg="bg-green-100"
        iconColor="text-green-600"
        trend={{ value: 8, direction: 'up', label: 'vs yesterday' }}
      />

      {/* 3. Bills Count */}
      <StatCard
        title="Bills Today"
        value={String(kpi.totalBills)}
        subtitle={`Avg: ${formatCurrency(avgBill)}/bill`}
        icon={Receipt}
        iconBg="bg-violet-100"
        iconColor="text-violet-600"
      />

      {/* 4. Credit Given */}
      <StatCard
        title="Credit Given"
        value={formatCurrency(kpi.creditGiven)}
        subtitle="Tap to view ledger"
        icon={CreditCard}
        iconBg="bg-amber-100"
        iconColor="text-amber-600"
        trend={{ value: 5, direction: 'down', label: 'vs yesterday' }}
        onClick={() => router.push('/dashboard/credit')}
      />

      {/* 5. Sales Returns */}
      <StatCard
        title="Sales Returns"
        value={formatCurrency(kpi.salesReturnAmount ?? 0)}
        subtitle={`${kpi.salesReturnCount ?? 0} returns`}
        icon={RotateCcw}
        iconBg="bg-rose-100"
        iconColor="text-rose-600"
        onClick={() => router.push('/sales-returns')}
      />
    </div>
  );
}
