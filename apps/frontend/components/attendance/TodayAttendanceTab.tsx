'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTodayAttendance, useMarkManualAttendance } from '@/hooks/useAttendance';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { useStaffList } from '@/hooks/useStaff';
import { AttendanceRecord, StaffMember } from '@/types';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Props {
    onMarkManual: () => void;
}

function StatusBadge({ record }: { record?: AttendanceRecord }) {
    if (!record || !record.checkInTime) {
        return (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-400">
                —
            </span>
        );
    }
    const status = record.status;
    const classMap: Record<string, string> = {
        present: 'bg-green-100 text-green-700',
        late: 'bg-amber-100 text-amber-700',
        absent: 'bg-red-100 text-red-700',
        half_day: 'bg-purple-100 text-purple-700',
        weekly_off: 'bg-slate-100 text-slate-500',
        holiday: 'bg-blue-100 text-blue-600',
    };
    const labelMap: Record<string, string> = {
        present: 'Present',
        late: `Late (${record.lateByMinutes ?? 0} min)`,
        absent: 'Absent',
        half_day: 'Half Day',
        weekly_off: 'Weekly Off',
        holiday: 'Holiday',
    };
    return (
        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', classMap[status] ?? 'bg-slate-100')}>
            {labelMap[status] ?? status}
        </span>
    );
}

function LiveHours({ record }: { record?: AttendanceRecord }) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        if (!record?.checkInTime || record.checkOutTime) return;
        const t = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(t);
    }, [record]);

    if (!record?.checkInTime) return <span className="text-slate-400">—</span>;
    if (record.checkOutTime) {
        return <span>{record.workingHours?.toFixed(1)}h</span>;
    }
    const [h, m] = record.checkInTime.split(':').map(Number);
    const liveHours = ((now.getHours() * 60 + now.getMinutes()) - (h * 60 + m)) / 60;
    return (
        <span className="text-green-600">{Math.max(0, liveHours).toFixed(1)}h (live)</span>
    );
}

export function TodayAttendanceTab({ onMarkManual }: Props) {
    const { data: todayRecords, isLoading } = useTodayAttendance();
    const { data: staffList = [] } = useStaffList();
    const { user } = useAuthStore();
    const { toast } = useToast();
    const markManual = useMarkManualAttendance();
    const DEFAULT_SHIFT_START = '09:00';
    const DEFAULT_SHIFT_END = '18:00';

    async function handleMarkAbsent(staff: StaffMember) {
        if (!confirm(`Mark ${staff.name} as absent today?`)) return;
        try {
            await markManual.mutateAsync({
                staffId: staff.id,
                date: format(new Date(), 'yyyy-MM-dd'),
                status: 'absent',
                markedBy: user?.id ?? '',
            });
            toast({ title: `Marked ${staff.name} as absent` });
        } catch {
            toast({ variant: 'destructive', title: 'Failed to mark attendance' });
        }
    }

    if (isLoading) {
        return (
            <Card>
                <CardContent className="py-12 flex justify-center">
                    <div className="text-muted-foreground text-sm">Loading...</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Staff</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Check In</TableHead>
                            <TableHead>Check Out</TableHead>
                            <TableHead>Hours</TableHead>
                            <TableHead>Shift</TableHead>
                            <PermissionGate permission="manage_staff">
                                <TableHead>Actions</TableHead>
                            </PermissionGate>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(staffList as any[]).map(staff => {
                            const record = todayRecords?.find((r: any) => r.staffId === staff.id);
                            const isCheckedIn = !!record?.checkInTime && !record.checkOutTime;
                            const shiftStart = DEFAULT_SHIFT_START;
                            const shiftEnd = DEFAULT_SHIFT_END;

                            return (
                                <TableRow key={staff.id}>
                                    {/* Staff */}
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <Avatar className="w-9 h-9">
                                                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                                        {staff.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                {isCheckedIn && (
                                                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-medium text-sm">{staff.name}</div>
                                                <RoleBadge role={staff.role} size="sm" />
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* Status */}
                                    <TableCell>
                                        <StatusBadge record={record} />
                                    </TableCell>

                                    {/* Check In */}
                                    <TableCell>
                                        {record?.checkInTime ? (
                                            <div>
                                                <span className="text-sm">{record.checkInTime.slice(0, 5)}</span>
                                                {record.isLate && (
                                                    <span className="ml-2 text-xs text-amber-600">Late</span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-slate-400">—</span>
                                        )}
                                    </TableCell>

                                    {/* Check Out */}
                                    <TableCell>
                                        {record?.checkOutTime ? (
                                            <span className="text-sm">{record.checkOutTime.slice(0, 5)}</span>
                                        ) : record?.checkInTime ? (
                                            <span className="text-xs text-green-600 animate-pulse">
                                                Still working...
                                            </span>
                                        ) : (
                                            <span className="text-slate-400">—</span>
                                        )}
                                    </TableCell>

                                    {/* Hours */}
                                    <TableCell className="text-sm">
                                        <LiveHours record={record} />
                                    </TableCell>

                                    {/* Shift */}
                                    <TableCell>
                                        <span className="text-xs text-muted-foreground">
                                            {shiftStart}–{shiftEnd}
                                        </span>
                                    </TableCell>

                                    {/* Actions */}
                                    <PermissionGate permission="manage_staff">
                                        <TableCell>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-xs h-7"
                                                    onClick={onMarkManual}
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-xs h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => handleMarkAbsent(staff)}
                                                    disabled={markManual.isPending}
                                                >
                                                    Mark Absent
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </PermissionGate>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
