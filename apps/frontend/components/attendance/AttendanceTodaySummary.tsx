'use client';

import { UserCheck, LogOut, Clock, UserX } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useTodayAttendance } from '@/hooks/useAttendance';
import { useStaffList } from '@/hooks/useStaff';
import { cn } from '@/lib/utils';

interface StatCardProps {
    label: string;
    value: string | number;
    subtitle: string;
    icon: React.ElementType;
    iconBg: string;
    valueColor?: string;
}

function StatCard({ label, value, subtitle, icon: Icon, iconBg, valueColor }: StatCardProps) {
    return (
        <Card>
            <CardContent className="p-4 flex items-center gap-4">
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
                    <Icon className="w-6 h-6" />
                </div>
                <div>
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                        {label}
                    </div>
                    <div className={cn('text-2xl font-bold', valueColor ?? 'text-slate-900')}>
                        {value}
                    </div>
                    <div className="text-xs text-muted-foreground">{subtitle}</div>
                </div>
            </CardContent>
        </Card>
    );
}

export function AttendanceTodaySummary() {
    const { data: todayRecords } = useTodayAttendance();
    const { data: staffList = [] } = useStaffList();
    const totalStaff = staffList.length;

    const presentCount = todayRecords?.filter(
        (r: any) => r.checkInTime && (r.status === 'present' || r.status === 'late')
    ).length ?? 0;

    const checkedOutCount = todayRecords?.filter((r: any) => !!r.checkOutTime).length ?? 0;

    const lateCount = todayRecords?.filter((r: any) => r.isLate).length ?? 0;

    const notMarkedCount = totalStaff - presentCount;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
                label="Present Today"
                value={presentCount}
                subtitle={`of ${totalStaff} staff`}
                icon={UserCheck}
                iconBg="bg-green-100 text-green-700"
            />
            <StatCard
                label="Checked Out"
                value={checkedOutCount}
                subtitle="Completed shift"
                icon={LogOut}
                iconBg="bg-blue-100 text-blue-700"
            />
            <StatCard
                label="Late Arrivals"
                value={lateCount}
                subtitle="Arrived late"
                icon={Clock}
                iconBg="bg-amber-100 text-amber-700"
                valueColor={lateCount > 0 ? 'text-amber-600' : undefined}
            />
            <StatCard
                label="Not Marked"
                value={notMarkedCount}
                subtitle="Not checked in"
                icon={UserX}
                iconBg="bg-red-100 text-red-700"
                valueColor={notMarkedCount > 0 ? 'text-red-600' : undefined}
            />
        </div>
    );
}
