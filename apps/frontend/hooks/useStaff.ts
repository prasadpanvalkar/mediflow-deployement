'use client';

import { useQuery } from '@tanstack/react-query';
import { staffApi } from '@/lib/apiClient';
import { useOutletId } from '@/hooks/useOutletId';

/**
 * Fetch all active staff members for the current outlet.
 * Replaces the old `mockStaff` array used in attendance components.
 */
export function useStaffList() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['staff', 'list', outletId],
        queryFn: () => staffApi.list(outletId),
        staleTime: 1000 * 60 * 10, // 10 minutes — staff roster doesn't change often
        enabled: !!outletId,
    });
}
