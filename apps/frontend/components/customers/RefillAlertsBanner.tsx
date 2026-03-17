'use client';

import { ChevronDown, ChevronUp, RefreshCw, Pill, MessageCircle, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRefillAlerts } from '@/hooks/useCustomers';
import { useAuthStore } from '@/store/authStore';
import { useBillingStore } from '@/store/billingStore';
import { useRouter } from 'next/navigation';
import { WHATSAPP_TEMPLATES, openWhatsApp } from '@/lib/whatsapp';
import { cn } from '@/lib/utils';

interface RefillAlertsBannerProps {
    isExpanded: boolean;
    onToggle: () => void;
}

export default function RefillAlertsBanner({ isExpanded, onToggle }: RefillAlertsBannerProps) {
    const { data: alerts } = useRefillAlerts();
    const outlet = useAuthStore((s) => s.outlet);
    const setCustomer = useBillingStore((s) => s.setCustomer);
    const router = useRouter();

    if (!alerts || alerts.length === 0) return null;

    const overdueCount = alerts.filter((a: any) => a.daysOverdue > 0).length;

    const handleQuickBill = (alert: any) => {
        setCustomer(alert.customer);
        router.push('/dashboard/billing');
    };

    const handleWhatsApp = (alert: any) => {
        const medicineList = alert.medicines.map((m: any) => m.name).join(', ');
        const msg = encodeURIComponent(
            `Dear ${alert.customer.name},\n\nYour monthly medicines (${medicineList}) are due for refill.\n\nPlease visit ${outlet?.name || 'Apollo Medical Store'} at your earliest convenience.\n\nThank you!`
        );
        openWhatsApp(alert.customer.phone, msg);
    };

    return (
        <Collapsible open={isExpanded} onOpenChange={onToggle}>
            <CollapsibleTrigger asChild>
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-purple-100 transition-colors">
                    <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-purple-500" />
                        <span className="text-sm font-medium text-purple-800">
                            {alerts.length} chronic {alerts.length === 1 ? 'patient' : 'patients'} due for refill
                        </span>
                        {overdueCount > 0 && (
                            <span className="text-sm font-medium text-red-600 ml-1">
                                (+{overdueCount} overdue)
                            </span>
                        )}
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-purple-500" /> : <ChevronDown className="w-4 h-4 text-purple-500" />}
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="mt-2 space-y-2">
                    {alerts.map((alert: any) => (
                        <div
                            key={alert.customer.id}
                            className="bg-white rounded-lg border px-4 py-3 flex items-center justify-between gap-4"
                        >
                            {/* Patient info */}
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-sm flex-shrink-0">
                                    {alert.customer.name.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-900">{alert.customer.name}</div>
                                    <div className="text-xs text-muted-foreground">{alert.customer.phone}</div>
                                    <div className="text-xs text-purple-600">
                                        {alert.customer.chronicConditions?.join(' · ')}
                                    </div>
                                </div>
                            </div>

                            {/* Medicines */}
                            <div className="hidden md:flex flex-col gap-1 flex-shrink-0">
                                {alert.medicines.map((m: any) => (
                                    <div key={m.productId} className="flex items-center gap-1 text-xs text-slate-600">
                                        <Pill className="w-3 h-3" />
                                        <span>{m.name}</span>
                                        <span className="text-muted-foreground">× {m.qty}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Due badge + actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={cn(
                                    'text-xs font-medium px-2 py-1 rounded-full',
                                    alert.daysOverdue > 0
                                        ? 'bg-red-100 text-red-700'
                                        : alert.daysOverdue === 0
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-blue-100 text-blue-700'
                                )}>
                                    {alert.daysOverdue > 0
                                        ? `${alert.daysOverdue}d overdue`
                                        : alert.daysOverdue === 0
                                        ? 'Due today'
                                        : `Due in ${Math.abs(alert.daysOverdue)}d`
                                    }
                                </span>
                                <Button size="sm" className="h-7 text-xs" onClick={() => handleQuickBill(alert)}>
                                    <Receipt className="w-3 h-3 mr-1" />
                                    Quick Bill
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs border-green-300 text-green-600 hover:bg-green-50" onClick={() => handleWhatsApp(alert)}>
                                    <MessageCircle className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
