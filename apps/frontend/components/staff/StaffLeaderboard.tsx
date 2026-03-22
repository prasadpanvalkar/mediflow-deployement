'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Medal, Award } from 'lucide-react';
import { useStaffLeaderboard } from '@/hooks/useStaff';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const BADGE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
    gold:   { icon: Trophy, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
    silver: { icon: Medal,  color: 'text-slate-500',  bg: 'bg-slate-50 border-slate-200' },
    bronze: { icon: Award,  color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
};

export function StaffLeaderboard() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString().split('T')[0];
    const lastDay = today.toISOString().split('T')[0];

    const [from, setFrom] = useState(firstDay);
    const [to, setTo] = useState(lastDay);

    const { data, isLoading } = useStaffLeaderboard(from, to);
    const leaderboard = Array.isArray(data) ? data : [];

    return (
        <div className="space-y-4">
            {/* Date Filter */}
            <Card>
                <CardContent className="pt-4">
                    <div className="flex gap-4 items-end">
                        <div className="space-y-1">
                            <Label>From</Label>
                            <Input
                                type="date"
                                value={from}
                                onChange={(e) => setFrom(e.target.value)}
                                className="w-40"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>To</Label>
                            <Input
                                type="date"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                className="w-40"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Leaderboard */}
            {isLoading ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        Loading leaderboard...
                    </CardContent>
                </Card>
            ) : leaderboard.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        No sales data for this period
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {leaderboard.map((s: any) => {
                        const badge = BADGE_CONFIG[s.badge];
                        const BadgeIcon = badge?.icon;

                        return (
                            <Card
                                key={s.staffId}
                                className={`border ${badge ? badge.bg : 'bg-white'}`}
                            >
                                <CardContent className="py-4">
                                    <div className="flex items-center gap-4">
                                        {/* Rank */}
                                        <div className="w-10 text-center">
                                            {badge ? (
                                                <BadgeIcon className={`w-7 h-7 mx-auto ${badge.color}`} />
                                            ) : (
                                                <span className="text-lg font-bold text-muted-foreground">
                                                    #{s.rank}
                                                </span>
                                            )}
                                        </div>

                                        {/* Name + Role */}
                                        <div className="flex-1">
                                            <p className="font-semibold text-slate-900">{s.staffName}</p>
                                            <p className="text-xs text-muted-foreground capitalize">
                                                {s.role?.replace('_', ' ')}
                                            </p>
                                        </div>

                                        {/* Stats */}
                                        <div className="text-right space-y-0.5">
                                            <p className="font-bold text-slate-900">
                                                ₹{Number(s.totalSalesAmount ?? 0).toLocaleString('en-IN')}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {s.totalInvoices} invoices
                                            </p>
                                        </div>

                                        {/* Avg Invoice */}
                                        <div className="text-right space-y-0.5 hidden sm:block">
                                            <p className="text-sm font-medium text-slate-700">
                                                ₹{Number(s.avgInvoiceValue ?? 0).toLocaleString('en-IN')}
                                            </p>
                                            <p className="text-xs text-muted-foreground">avg/invoice</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
