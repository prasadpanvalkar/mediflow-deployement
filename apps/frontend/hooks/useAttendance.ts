'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceApi } from '@/lib/apiClient';
import { KioskCheckPayload, MonthlyAttendanceFilter, AttendanceStatus } from '@/types';
import { useOutletId } from '@/hooks/useOutletId';

export function useTodayAttendance() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['attendance', 'today', outletId],
        queryFn: () => attendanceApi.getTodayRecords(outletId),
        staleTime: 1000 * 60,
        refetchInterval: 1000 * 60,
        enabled: !!outletId,
    });
}

export function useMonthlyAttendance(filter: MonthlyAttendanceFilter) {
    return useQuery({
        queryKey: ['attendance', 'monthly', filter],
        queryFn: () => attendanceApi.getMonthlyRecords(filter.outletId, filter.staffId ?? '', `${filter.year}-${String(filter.month).padStart(2, '0')}`),
        staleTime: 1000 * 60 * 5,
        enabled: !!filter.outletId,
    });
}

export function useMonthlySummaries(month: number, year: number) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['attendance', 'summary', outletId, month, year],
        queryFn: () => attendanceApi.getMonthlySummaries(outletId, '', `${year}-${String(month).padStart(2, '0')}`),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}

export function useKioskCheckIn() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: KioskCheckPayload) => attendanceApi.checkIn(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['attendance'] });
        },
    });
}

export function useKioskCheckOut() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: KioskCheckPayload) => attendanceApi.checkOut(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['attendance'] });
        },
    });
}

export function useMarkManualAttendance() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: {
            staffId: string;
            date: string;
            status: AttendanceStatus;
            checkInTime?: string;
            checkOutTime?: string;
            notes?: string;
            markedBy: string;
        }) => attendanceApi.markManual(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['attendance'] });
        },
    });
}
