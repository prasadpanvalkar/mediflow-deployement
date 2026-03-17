import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsApi } from '@/lib/apiClient';
import { CreatePaymentPayload, CreateReceiptPayload, CreateExpensePayload } from '@/types';
import { useAuthStore } from '@/store/authStore';

// ─── Outstanding ──────────────────────────────────────────────────────────────

export function useDistributorOutstanding() {
    const outletId = useAuthStore((s) => s.user?.outletId ?? '');
    return useQuery({
        queryKey: ['outstanding', 'distributors', outletId],
        queryFn: () => accountsApi.getDistributorOutstanding(outletId),
        staleTime: 1000 * 60 * 2,
        enabled: !!outletId,
    });
}

export function useCustomerOutstanding() {
    const outletId = useAuthStore((s) => s.user?.outletId ?? '');
    return useQuery({
        queryKey: ['outstanding', 'customers', outletId],
        queryFn: () => accountsApi.getCustomerOutstanding(outletId),
        staleTime: 1000 * 60 * 2,
        enabled: !!outletId,
    });
}

export function useUnpaidInvoices(distributorId: string) {
    return useQuery({
        queryKey: ['unpaid-invoices', distributorId],
        queryFn: () => accountsApi.getUnpaidInvoices(distributorId),
        staleTime: 1000 * 60 * 2,
        enabled: !!distributorId,
    });
}

export function useCustomerUnpaidInvoices(customerId: string) {
    return useQuery({
        queryKey: ['customer-unpaid-invoices', customerId],
        queryFn: () => accountsApi.getCustomerUnpaidInvoices(customerId).then(res => res.data),
        staleTime: 1000 * 60 * 2,
        enabled: !!customerId,
    });
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export function useCreatePayment() {
    const queryClient = useQueryClient();
    const outletId = useAuthStore((s) => s.user?.outletId ?? '');
    const userId   = useAuthStore((s) => s.user?.id ?? '');
    return useMutation({
        mutationFn: (payload: CreatePaymentPayload) =>
            accountsApi.createPayment({ ...payload, outletId, userId }),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['outstanding', 'distributors'] });
            queryClient.invalidateQueries({ queryKey: ['unpaid-invoices', variables.distributorId] });
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['ledger', 'distributor'] });
        },
    });
}

export function usePaymentHistory(distributorId?: string) {
    const outletId = useAuthStore((s) => s.user?.outletId ?? '');
    return useQuery({
        queryKey: ['payments', outletId, distributorId],
        queryFn: () => accountsApi.getPayments(outletId, distributorId),
        staleTime: 1000 * 60 * 2,
        enabled: !!outletId,
    });
}

// ─── Receipts ─────────────────────────────────────────────────────────────────

export function useCreateReceipt() {
    const queryClient = useQueryClient();
    const outletId = useAuthStore((s) => s.user?.outletId ?? '');
    const userId   = useAuthStore((s) => s.user?.id ?? '');
    return useMutation({
        mutationFn: (payload: CreateReceiptPayload) =>
            accountsApi.createReceipt({ ...payload, outletId, userId }),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['outstanding', 'customers'] });
            queryClient.invalidateQueries({ queryKey: ['receipts'] });
            queryClient.invalidateQueries({ queryKey: ['ledger', 'customer', variables.customerId] });
        },
    });
}

export function useReceiptHistory(customerId?: string) {
    const outletId = useAuthStore((s) => s.user?.outletId ?? '');
    return useQuery({
        queryKey: ['receipts', outletId, customerId],
        queryFn: () => accountsApi.getReceipts(outletId, customerId),
        staleTime: 1000 * 60 * 2,
        enabled: !!outletId,
    });
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export function useExpenses(filters: { from?: string; to?: string; head?: string } = {}) {
    const outletId = useAuthStore((s) => s.user?.outletId ?? '');
    return useQuery({
        queryKey: ['expenses', outletId, filters],
        queryFn: () => accountsApi.getExpenses(outletId, filters),
        staleTime: 1000 * 60 * 2,
        enabled: !!outletId,
    });
}

export function useCreateExpense() {
    const queryClient = useQueryClient();
    const outletId = useAuthStore((s) => s.user?.outletId ?? '');
    const userId   = useAuthStore((s) => s.user?.id ?? '');
    return useMutation({
        mutationFn: (payload: CreateExpensePayload) =>
            accountsApi.createExpense({ ...payload, outletId, userId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
        },
    });
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export function useDistributorLedger(distributorId: string) {
    return useQuery({
        queryKey: ['ledger', 'distributor', distributorId],
        queryFn: () => accountsApi.getDistributorLedger(distributorId),
        staleTime: 1000 * 60 * 2,
        enabled: !!distributorId,
    });
}

export function useCustomerLedger(customerId: string) {
    return useQuery({
        queryKey: ['ledger', 'customer', customerId],
        queryFn: () => accountsApi.getCustomerLedger(customerId),
        staleTime: 1000 * 60 * 2,
        enabled: !!customerId,
    });
}
