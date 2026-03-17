'use client';

import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '@/lib/apiClient';
import { useOutletId } from '@/hooks/useOutletId';

export function useOutletSettings() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['outlet', 'settings', outletId],
        queryFn: async () => {
            const res = await settingsApi.getSettings(outletId);
            return res.data as {
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
                updatedAt: string;
            };
        },
        staleTime: 1000 * 60 * 15,
        enabled: !!outletId,
    });
}
