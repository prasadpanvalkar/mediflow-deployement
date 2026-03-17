'use client';

import { useQuery } from '@tanstack/react-query';
import { useOutletId } from './useOutletId';
import { inventoryApi } from '@/lib/apiClient';
import { StockFilters } from '@/types';

export function useStockList(filters: StockFilters) {
    const outletId = useOutletId();

    return useQuery({
        queryKey: ['inventory', 'stock', outletId, filters],
        queryFn: () => inventoryApi.getStock(outletId, filters),
        staleTime: 1000 * 60 * 3,
    });
}

export function useProductBatches(productId: string | null) {
    const outletId = useOutletId();

    return useQuery({
        queryKey: ['inventory', 'batches', productId, outletId],
        queryFn: () => inventoryApi.getBatches(productId!, outletId),
        enabled: !!productId,
    });
}

export function useExpiryReport(daysAhead: number = 90) {
    const outletId = useOutletId();

    return useQuery({
        queryKey: ['inventory', 'expiry', outletId, daysAhead],
        queryFn: () => inventoryApi.getExpiryReport(outletId),
        staleTime: 1000 * 60 * 10,
    });
}

export function useLowStockReport() {
    const outletId = useOutletId();

    return useQuery({
        queryKey: ['inventory', 'lowstock', outletId],
        queryFn: () => inventoryApi.getLowStock(outletId),
        staleTime: 1000 * 60 * 5,
    });
}
