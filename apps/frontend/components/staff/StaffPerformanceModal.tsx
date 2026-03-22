'use client';

import { useState } from 'react';
import {
    Dialog, DialogContent,
    DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IndianRupee, ShoppingBag, TrendingDown, BarChart3 } from 'lucide-react';
import { useStaffPerformance } from '@/hooks/useStaff';

interface Props {
    staff: any;
    open: boolean;
    onClose: () => void;
}

export function StaffPerformanceModal({ staff, open, onClose }: Props) {
    const today = new Date().toISOString().split('T')[0];
    const firstDay = new Date(
        new Date().getFullYear(),
        new Date().getMonth(), 1
    ).toISOString().split('T')[0];

    const [from, setFrom] = useState(firstDay);
    const [to, setTo] = useState(today);

    const { data, isLoading } = useStaffPerformance(staff?.id, from, to);
    const perf = data?.data;

    const kpis = [
        {
            label: 'Total Sales',
            value: `₹${Number(perf?.totalSalesAmount ?? 0).toLocaleString('en-IN')}`,
            icon: IndianRupee,
            color: 'text-green-600 bg-green-50',
        },
        {
            label: 'Invoices',
            value: perf?.totalInvoices ?? 0,
            icon: ShoppingBag,
            color: 'text-blue-600 bg-blue-50',
        },
        {
            label: 'Avg Invoice',
            value: `₹${Number(perf?.avgInvoiceValue ?? 0).toLocaleString('en-IN')}`,
            icon: BarChart3,
            color: 'text-purple-600 bg-purple-50',
        },
        {
            label: 'Discount Given',
            value: `₹${Number(perf?.totalDiscountGiven ?? 0).toLocaleString('en-IN')}`,
            icon: TrendingDown,
            color: 'text-orange-600 bg-orange-50',
        },
    ];

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        📊 {staff?.name} — Performance
                    </DialogTitle>
                </DialogHeader>

                {/* Date Range */}
                <div className="flex gap-3">
                    <div className="space-y-1 flex-1">
                        <Label>From</Label>
                        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1 flex-1">
                        <Label>To</Label>
                        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </div>
                </div>

                {isLoading ? (
                    <p className="text-center py-8 text-muted-foreground">Loading...</p>
                ) : (
                    <>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 gap-3">
                            {kpis.map(({ label, value, icon: Icon, color }) => (
                                <Card key={label}>
                                    <CardContent className="pt-4 pb-3">
                                        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center mb-2`}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <p className="text-xl font-bold text-slate-900">{value}</p>
                                        <p className="text-xs text-muted-foreground">{label}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Top Products */}
                        {perf?.topProducts?.length > 0 && (
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-2">Top Products Sold</p>
                                <div className="space-y-2">
                                    {perf.topProducts.slice(0, 5).map((p: any, i: number) => (
                                        <div key={i} className="flex justify-between items-center text-sm py-1 border-b last:border-0">
                                            <span className="text-slate-700">{p.productName}</span>
                                            <span className="text-slate-500 text-xs">
                                                {p.qty} units · ₹{Number(p.totalAmount).toLocaleString('en-IN')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Payment Mode Breakdown */}
                        {perf?.salesByPaymentMode && (
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-2">Sales by Payment Mode</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(perf.salesByPaymentMode).map(([mode, amount]: any) => (
                                        <div key={mode} className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-2 text-sm">
                                            <span className="capitalize text-slate-600">{mode}</span>
                                            <span className="font-medium">₹{Number(amount).toLocaleString('en-IN')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
