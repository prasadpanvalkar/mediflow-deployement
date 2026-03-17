'use client';

import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMonthlySummaries } from '@/hooks/useAttendance';
import { useStaffList } from '@/hooks/useStaff';
import { useOutletSettings } from '@/hooks/useOutletSettings';
import { AttendanceSummary } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { Button } from '@/components/ui/button';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();

interface Props {
    selectedMonth: number;
    selectedYear: number;
    onMonthChange: (m: number) => void;
    onYearChange: (y: number) => void;
}

function AttendancePctBadge({ pct }: { pct: number }) {
    const cls = pct >= 90
        ? 'bg-green-100 text-green-700'
        : pct >= 75
            ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700';
    return (
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', cls)}>
            {pct}%
        </span>
    );
}

function StaffSummaryCard({ summary, shiftStart }: { summary: AttendanceSummary; shiftStart: string }) {
    const { data: staffList = [] } = useStaffList();
    const staff = (staffList as any[]).find((s: any) => s.id === summary.staffId);
    const { totalWorkingDays, presentDays, lateDays, absentDays } = summary;

    const avgIsLate = (() => {
        const [sh, sm] = shiftStart.split(':').map(Number);
        const [ah, am] = summary.avgCheckInTime.split(':').map(Number);
        return (ah * 60 + am) > (sh * 60 + sm + 10);
    })();

    return (
        <Card className="bg-white rounded-2xl border">
            <CardContent className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                {summary.staffName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="font-semibold text-sm">{summary.staffName}</div>
                            {staff && <RoleBadge role={staff.role} size="sm" />}
                        </div>
                    </div>
                    <AttendancePctBadge pct={summary.attendancePct} />
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <Stat label="Working Days" value={summary.totalWorkingDays} />
                    <Stat label="Present" value={summary.presentDays} color="text-green-600" />
                    <Stat label="Absent" value={summary.absentDays} color="text-red-600" />
                    <Stat label="Late" value={summary.lateDays} color="text-amber-600" />
                    <Stat label="Half Days" value={summary.halfDays} color="text-purple-600" />
                    <Stat label="Hours" value={`${summary.totalHoursWorked}h`} />
                </div>

                {/* Stacked bar */}
                <div className="h-2 rounded-full overflow-hidden flex bg-slate-100">
                    {totalWorkingDays > 0 && (
                        <>
                            <div
                                className="bg-green-500 transition-all"
                                style={{ width: `${(presentDays / totalWorkingDays) * 100}%` }}
                            />
                            <div
                                className="bg-amber-400 transition-all"
                                style={{ width: `${(lateDays / totalWorkingDays) * 100}%` }}
                            />
                            <div
                                className="bg-red-400 transition-all"
                                style={{ width: `${(absentDays / totalWorkingDays) * 100}%` }}
                            />
                        </>
                    )}
                </div>

                {/* Avg check-in */}
                <div className="flex items-center gap-1.5 mt-3">
                    <Clock className={cn('w-3.5 h-3.5', avgIsLate ? 'text-amber-500' : 'text-green-500')} />
                    <span className="text-xs text-muted-foreground">
                        Avg check-in: {summary.avgCheckInTime}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
    return (
        <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={cn('text-lg font-bold', color ?? 'text-slate-900')}>{value}</div>
        </div>
    );
}

export function AttendanceSummaryTab({ selectedMonth, selectedYear, onMonthChange, onYearChange }: Props) {
    const { data: summaries = [], isLoading } = useMonthlySummaries(selectedMonth, selectedYear);
    const { data: outletSettings } = useOutletSettings();
    const shiftStart = outletSettings?.openingTime ?? '09:00';

    function prevMonth() {
        if (selectedMonth === 1) { onMonthChange(12); onYearChange(selectedYear - 1); }
        else onMonthChange(selectedMonth - 1);
    }

    function nextMonth() {
        if (selectedMonth === CURRENT_MONTH && selectedYear === CURRENT_YEAR) return;
        if (selectedMonth === 12) { onMonthChange(1); onYearChange(selectedYear + 1); }
        else onMonthChange(selectedMonth + 1);
    }

    const isFutureMonth = selectedYear > CURRENT_YEAR ||
        (selectedYear === CURRENT_YEAR && selectedMonth >= CURRENT_MONTH);

    const totals = summaries.reduce(
        (acc: any, s: any) => ({
            presentDays: acc.presentDays + s.presentDays,
            absentDays: acc.absentDays + s.absentDays,
            totalHours: acc.totalHours + s.totalHoursWorked,
        }),
        { presentDays: 0, absentDays: 0, totalHours: 0 }
    );
    const avgPct = summaries.length > 0
        ? Math.round(summaries.reduce((a: number, s: any) => a + s.attendancePct, 0) / summaries.length)
        : 0;

    return (
        <div className="space-y-4">
            {/* Month navigator */}
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
                    <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-semibold min-w-32 text-center">
                    {MONTHS[selectedMonth - 1]} {selectedYear}
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={nextMonth}
                    disabled={isFutureMonth}
                >
                    <ChevronRight className="w-4 h-4" />
                </Button>
            </div>

            {isLoading ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Loading summaries...</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {summaries.map((s: any) => (
                            <StaffSummaryCard key={s.staffId} summary={s} shiftStart={shiftStart} />
                        ))}
                    </div>

                    {/* Team totals */}
                    <div className="bg-slate-50 rounded-xl p-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{summaries.length} staff</span>
                        <span>Present days: <strong>{totals.presentDays}</strong></span>
                        <span>Absent days: <strong>{totals.absentDays}</strong></span>
                        <span>Total hours: <strong>{totals.totalHours.toFixed(1)}h</strong></span>
                        <span>Team avg attendance: <strong>{avgPct}%</strong></span>
                    </div>
                </>
            )}
        </div>
    );
}
