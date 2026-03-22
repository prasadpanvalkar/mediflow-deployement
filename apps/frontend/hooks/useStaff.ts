'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '@/lib/apiClient';
import { useOutletId } from '@/hooks/useOutletId';
import { toast } from 'sonner';

export function useStaffList() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['staff', 'list', outletId],
        queryFn: () => staffApi.list(outletId),
        staleTime: 1000 * 60 * 10,
        enabled: !!outletId,
    });
}

export function useCreateStaff() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: any) => staffApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['staff'] });
            toast.success('Staff member created successfully');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to create staff');
        },
    });
}

export function useUpdateStaff() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) =>
            staffApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['staff'] });
            toast.success('Staff member updated successfully');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to update staff');
        },
    });
}

export function useDeleteStaff() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => staffApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['staff'] });
            toast.success('Staff member deactivated');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to deactivate staff');
        },
    });
}

// ✅ FIXED — matches apiClient: (staffId, startDate, endDate)
export function useStaffPerformance(id: string, from: string, to: string) {
    return useQuery({
        queryKey: ['staff', 'performance', id, from, to],
        queryFn: () => staffApi.getPerformance(id, from, to),
        enabled: !!id,
    });
}

// ✅ FIXED — matches apiClient: (outletId) only
export function useStaffLeaderboard(from: string, to: string) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['staff', 'leaderboard', outletId, from, to],
        queryFn: () => staffApi.getLeaderboard(outletId, from, to),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}
