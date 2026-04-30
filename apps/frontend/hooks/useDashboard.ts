'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { format } from 'date-fns';
import { DateRangeFilter } from '@/types';

export function useDashboardKPI(dateRange?: DateRangeFilter) {
  const { outlet } = useAuthStore();
  const { selectedOutletId } = useSettingsStore();
  const outletId = selectedOutletId ?? outlet?.id ?? '';
  
  const today = format(new Date(), 'yyyy-MM-dd');
  const startDate = dateRange?.from;
  const endDate = dateRange?.to;

  return useQuery({
    queryKey: ['dashboard', 'kpi', outletId, startDate || today, endDate || today],
    queryFn: () => dashboardApi.getDailySummary(outletId, today, startDate, endDate),
    enabled: !!outletId,
    staleTime: 1000 * 60 * 2,   // refresh every 2 min
    refetchInterval: 1000 * 60 * 2,
  });
}

export function useDashboardAlerts(dateRange?: DateRangeFilter) {
  const { outlet } = useAuthStore();
  const { selectedOutletId } = useSettingsStore();
  const outletId = selectedOutletId ?? outlet?.id ?? '';
  
  const today = format(new Date(), 'yyyy-MM-dd');
  const startDate = dateRange?.from;
  const endDate = dateRange?.to;

  // Share the same queryKey as useDashboardKPI so React Query returns
  // the cached result — no second network request is made.
  return useQuery({
    queryKey: ['dashboard', 'kpi', outletId, startDate || today, endDate || today],
    queryFn: () => dashboardApi.getDailySummary(outletId, today, startDate, endDate),
    enabled: !!outletId,
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
    select: (data: any) => data?.alerts || {},
  });
}
