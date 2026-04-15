'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/lib/apiClient';
import { useOutletId } from '@/hooks/useOutletId';

export function useOutletSettings() {
    const outletId = useOutletId();
    const queryClient = useQueryClient();
    
    const query = useQuery({
        queryKey: ['outlet', 'settings', outletId],
        queryFn: async () => {
            const res = await settingsApi.getSettings(outletId);
            const data = res.data;
            return {
                ...data,
                landingCostIncludeGst: data.landingCostIncludeGst ?? data.landing_cost_include_gst ?? false,
                landingCostIncludeFreight: data.landingCostIncludeFreight ?? data.landing_cost_include_freight ?? false,
            } as {
                openingTime: string;
                closingTime: string;
                gracePeriodMinutes: number;
                defaultCreditDays: number;
                invoicePrefix: string;
                gstRegistered: boolean;
                printLogo: boolean;
                thermalPrint: boolean;
                printerWidth: number;
                lowStockAlertDays: number;
                expiryAlertDays: number;
                enableWhatsapp: boolean;
                whatsappApiKey: string | null;
                currencySymbol: string;
                landingCostIncludeGst: boolean;
                landingCostIncludeFreight: boolean;
                updatedAt: string;
            };
        },
        staleTime: 1000 * 60 * 15,
        enabled: !!outletId,
    });

    const updateSettings = async (patch: Record<string, any>) => {
        if (!outletId) return;
        await settingsApi.updateSettings(outletId, patch);
        await queryClient.invalidateQueries({ queryKey: ['outlet', 'settings', outletId] });
    };

    return {
        ...query,
        settings: query.data,
        updateSettings,
    };
}
