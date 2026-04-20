'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { format } from 'date-fns';

export function useDashboardKPI() {
  const { outlet } = useAuthStore();
  const { selectedOutletId } = useSettingsStore();
  const outletId = selectedOutletId ?? outlet?.id ?? '';
  const today = format(new Date(), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['dashboard', 'kpi', outletId, today],
    queryFn: () => dashboardApi.getDailySummary(outletId, today),
    enabled: !!outletId,
    staleTime: 1000 * 60 * 2,   // refresh every 2 min
    refetchInterval: 1000 * 60 * 2,
  });
}

export function useDashboardAlerts() {
  const { outlet } = useAuthStore();
  const { selectedOutletId } = useSettingsStore();
  const outletId = selectedOutletId ?? outlet?.id ?? '';
  const today = format(new Date(), 'yyyy-MM-dd');

  // Share the same queryKey as useDashboardKPI so React Query returns
  // the cached result — no second network request is made.
  return useQuery({
    queryKey: ['dashboard', 'kpi', outletId, today],
    queryFn: () => dashboardApi.getDailySummary(outletId, today),
    enabled: !!outletId,
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 2,
    select: (data: any) => data?.alerts || {},
  });
}
