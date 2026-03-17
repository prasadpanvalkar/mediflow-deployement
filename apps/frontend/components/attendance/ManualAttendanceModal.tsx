'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { ClipboardEdit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMarkManualAttendance } from '@/hooks/useAttendance';
import { useStaffList } from '@/hooks/useStaff';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { manualAttendanceSchema, ManualAttendanceFormValues } from '@/lib/validations/attendance';
import { AttendanceStatus } from '@/types';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    prefillStaffId?: string;
    prefillDate?: string;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
    { value: 'present', label: 'Present' },
    { value: 'late', label: 'Late' },
    { value: 'absent', label: 'Absent' },
    { value: 'half_day', label: 'Half Day' },
    { value: 'weekly_off', label: 'Weekly Off' },
    { value: 'holiday', label: 'Holiday' },
];

export function ManualAttendanceModal({ isOpen, onClose, prefillStaffId, prefillDate }: Props) {
    const { user } = useAuthStore();
    const { toast } = useToast();
    const markManual = useMarkManualAttendance();
    const { data: staffList = [] } = useStaffList();

    const today = format(new Date(), 'yyyy-MM-dd');

    const {
        register,
        handleSubmit,
        control,
        watch,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<ManualAttendanceFormValues>({
        resolver: zodResolver(manualAttendanceSchema),
        defaultValues: {
            staffId: prefillStaffId ?? '',
            date: prefillDate ?? today,
            status: 'present',
            checkInTime: '',
            checkOutTime: '',
            notes: '',
        },
    });

    useEffect(() => {
        if (isOpen) {
            reset({
                staffId: prefillStaffId ?? '',
                date: prefillDate ?? today,
                status: 'present',
                checkInTime: '',
                checkOutTime: '',
                notes: '',
            });
        }
    }, [isOpen, prefillStaffId, prefillDate]);

    const watchedStatus = watch('status');
    const watchedStaffId = watch('staffId');
    const watchedDate = watch('date');
    const showTimePickers = watchedStatus === 'present' || watchedStatus === 'late' || watchedStatus === 'half_day';

    const selectedStaff = staffList.find((s: any) => s.id === watchedStaffId);

    // Check if there's an existing record for this staff+date (for warning)
    const hasExistingRecord = !!watchedStaffId && !!watchedDate;

    async function onSubmit(data: ManualAttendanceFormValues) {
        try {
            await markManual.mutateAsync({
                staffId: data.staffId,
                date: data.date,
                status: data.status,
                checkInTime: data.checkInTime || undefined,
                checkOutTime: data.checkOutTime || undefined,
                notes: data.notes || undefined,
                markedBy: user?.id ?? '',
            });
            const staffName = staffList.find((s: any) => s.id === data.staffId)?.name ?? 'Staff';
            toast({ title: `Attendance marked for ${staffName}` });
            onClose();
        } catch (err: any) {
            toast({ variant: 'destructive', title: err?.error?.message ?? 'Failed to save attendance' });
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <ClipboardEdit className="w-5 h-5 text-primary" />
                        <DialogTitle>Mark Attendance</DialogTitle>
                    </div>
                    <DialogDescription>
                        Manually override attendance record
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {/* Staff */}
                    <div className="space-y-1.5">
                        <Label>Staff *</Label>
                        <Controller
                            name="staffId"
                            control={control}
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger className={cn(errors.staffId && 'border-red-500')}>
                                        <SelectValue placeholder="Select staff member" />
                                    </SelectTrigger>
                                    <SelectContent>
                                            {staffList.map((s: any) => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                        {errors.staffId && (
                            <p className="text-xs text-red-500">{errors.staffId.message}</p>
                        )}
                    </div>

                    {/* Date */}
                    <div className="space-y-1.5">
                        <Label>Date *</Label>
                        <Input
                            type="date"
                            max={today}
                            {...register('date')}
                            className={cn(errors.date && 'border-red-500')}
                        />
                        {errors.date && (
                            <p className="text-xs text-red-500">{errors.date.message}</p>
                        )}
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                        <Label>Status *</Label>
                        <Controller
                            name="status"
                            control={control}
                            render={({ field }) => (
                                <RadioGroup
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    className="grid grid-cols-3 gap-2"
                                >
                                    {STATUS_OPTIONS.map(opt => (
                                        <div key={opt.value} className="flex items-center space-x-2">
                                            <RadioGroupItem value={opt.value} id={`status-${opt.value}`} />
                                            <Label htmlFor={`status-${opt.value}`} className="text-sm font-normal cursor-pointer">
                                                {opt.label}
                                            </Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            )}
                        />
                    </div>

                    {/* Times */}
                    {showTimePickers && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Check In</Label>
                                <Input type="time" {...register('checkInTime')} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Check Out</Label>
                                <Input type="time" {...register('checkOutTime')} />
                                {errors.checkOutTime && (
                                    <p className="text-xs text-red-500">{errors.checkOutTime.message}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    <div className="space-y-1.5">
                        <Label>Notes</Label>
                        <Textarea
                            {...register('notes')}
                            placeholder="Optional notes..."
                            rows={2}
                            className="resize-none"
                        />
                    </div>

                    {/* Warning for existing record */}
                    {hasExistingRecord && selectedStaff && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                            This will override the existing record for{' '}
                            <strong>{selectedStaff.name}</strong> on{' '}
                            <strong>{watchedDate}</strong>.
                        </div>
                    )}

                    <div className="flex gap-3 justify-end pt-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting || markManual.isPending}>
                            Save Attendance
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
