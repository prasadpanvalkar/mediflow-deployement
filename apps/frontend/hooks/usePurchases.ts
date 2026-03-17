import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchasesApi, distributorsApi } from '@/lib/apiClient';
import { CreatePurchasePayload } from '@/types';
import { useAuthStore } from '@/store/authStore';

export function usePurchasesList(filters?: any) {
    const outletId = useAuthStore((s) => s.user?.outletId);
    return useQuery({
        queryKey: ['purchases', outletId, filters],
        queryFn: () => purchasesApi.list(outletId!, filters),
        staleTime: 1000 * 60 * 2,
        enabled: !!outletId,
    });
}

// Keep backward compat alias
export const usePurchaseList = usePurchasesList;

export function usePurchaseById(id: string) {
    return useQuery({
        queryKey: ['purchases', id],
        queryFn: () => purchasesApi.getById(id),
        enabled: !!id,
    });
}

export function useCreatePurchase() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreatePurchasePayload) =>
            purchasesApi.createPurchase(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
        },
    });
}

export function useRecordPayment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ purchaseId, amount }: { purchaseId: string; amount: number }) =>
            purchasesApi.recordPayment({ purchaseId, amount }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            queryClient.invalidateQueries({ queryKey: ['distributors'] });
        },
    });
}

export function useDistributors() {
    const outletId = useAuthStore((s) => s.user?.outletId);
    return useQuery({
        queryKey: ['distributors', outletId],
        queryFn: () => distributorsApi.list(outletId!),
        staleTime: 1000 * 60 * 10,
        enabled: !!outletId,
    });
}

// Keep backward compat alias
export const useDistributorList = useDistributors;

export function useCreateDistributor() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: any) => distributorsApi.create(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['distributors'] });
        },
    });
}

export function useUpdateDistributor() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: any }) =>
            distributorsApi.update(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['distributors'] });
        },
    });
}
