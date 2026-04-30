'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletId } from '@/hooks/useOutletId';
import { salesApi } from '@/lib/apiClient';
import { SaleInvoiceSummary, SaleItemDetail, SaleInvoice, PaginatedResponse } from '@/types';

export function useCustomerInvoices(customerId: string) {
    const outletId = useOutletId();
    return useQuery<PaginatedResponse<SaleInvoiceSummary>>({
        queryKey: ['sales', 'customer', customerId, outletId],
        queryFn: () => salesApi.listByCustomer(outletId, customerId),
        enabled: !!customerId && !!outletId,
        staleTime: 60_000,
    });
}

export function useInvoiceItems(invoiceId: string | null) {
    return useQuery<{ data: SaleItemDetail[] }>({
        queryKey: ['sale-items', invoiceId],
        queryFn: () => salesApi.getItems(invoiceId!),
        enabled: !!invoiceId,
        staleTime: 300_000,
    });
}

export interface SalesFilters {
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
    search?: string;
}

export function useSalesList(filters?: SalesFilters) {
    const outletId = useOutletId();
    return useQuery<PaginatedResponse<SaleInvoice>>({
        queryKey: ['sales', 'list', outletId, filters],
        queryFn: () => salesApi.list(outletId, {
            page: filters?.page ?? 1,
            pageSize: filters?.pageSize ?? 50,
            startDate: filters?.startDate,
            endDate: filters?.endDate,
            search: filters?.search,
        }),
        enabled: !!outletId,
        staleTime: 30_000,
    });
}

export function useSaleById(saleId: string | null) {
    const outletId = useOutletId();
    return useQuery<SaleInvoice>({
        queryKey: ['sales', 'detail', saleId, outletId],
        queryFn: () => salesApi.getById(saleId!, outletId),
        enabled: !!saleId && !!outletId,
        staleTime: 60_000,
    });
}

export function useUpdateSale() {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: any }) => salesApi.update(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
    });
}

