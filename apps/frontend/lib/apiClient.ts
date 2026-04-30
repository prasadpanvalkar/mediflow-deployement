import {
    AuthResponse,
    ProductSearchResult,
    SaleInvoice,
    PaginatedResponse,
    CreditAccount,
    DashboardKPI,
    DashboardAlerts,
    CreatePurchasePayload,
    PurchaseInvoiceFull,
    DistributorLedgerEntry,
    AttendanceRecord,
} from '../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL!; // Required — set NEXT_PUBLIC_API_URL in .env

let authToken: string | null = null;

function getStoredToken(): string | null {
    if (authToken) return authToken;
    if (typeof document === 'undefined') return null;
    // Use substring to avoid splitting on '=' inside the JWT value itself
    const row = document.cookie.split('; ').find(r => r.startsWith('access_token='));
    return row ? row.substring('access_token='.length) : null;
}

function getHeaders(includeAuth = true): HeadersInit {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (includeAuth) {
        const token = getStoredToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

function handle401() {
    authToken = null;
    if (typeof document !== 'undefined') {
        document.cookie = 'access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    }
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
    }
}

async function assertOk(response: Response): Promise<void> {
    if (response.ok) return;
    if (response.status === 401) handle401();
    throw await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
}

// Helper to set auth token (called after login)
export function setAuthToken(token: string) {
    authToken = token;
}

// Helper to clear auth token (called on logout)
export function clearAuthToken() {
    authToken = null;
}

// Real API implementations for endpoints we've built
const realAuthApi = {
    login: async (phone: string, password: string): Promise<AuthResponse> => {
        const response = await fetch(`${API_URL}/auth/login/`, {
            method: 'POST',
            headers: getHeaders(false),
            body: JSON.stringify({ phone, password }),
        });
        await assertOk(response);
        const data = await response.json();
        authToken = data.access;
        const u = data.user;
        return {
            access: data.access,
            refresh: data.refresh,
            user: {
                id: u.id,
                name: u.name,
                phone: u.phone,
                role: u.role,
                maxDiscount: u.maxDiscount,
                canEditRate: u.canEditRate,
                canViewPurchaseRates: u.canViewPurchaseRates,
                canCreatePurchases: u.canCreatePurchases,
                canAccessReports: u.canAccessReports,
                outletId: u.outletId,
                organizationId: u.organizationId ?? undefined,
                isSuperAdmin: u.isSuperAdmin ?? false,
                outlet: {
                    ...u.outlet,
                    id: u.outlet.id,
                    name: u.outlet.name,
                    city: u.outlet.city,
                    state: u.outlet.state,
                } as any,
            },
        };
    },
    logout: async (): Promise<void> => {
        authToken = null;
    },
    switchOutlet: async (outletId: string): Promise<{ access: string; refresh: string; user: any }> => {
        const response = await fetch(`${API_URL}/auth/switch-outlet/`, {
            method: 'POST',
            headers: getHeaders(true),
            body: JSON.stringify({ outletId }),
        });
        await assertOk(response);
        const data = await response.json();
        authToken = data.access;
        const u = data.user;
        return {
            access: data.access,
            refresh: data.refresh,
            user: {
                id: u.id,
                name: u.name,
                phone: u.phone,
                role: u.role,
                maxDiscount: u.maxDiscount,
                canEditRate: u.canEditRate,
                canViewPurchaseRates: u.canViewPurchaseRates,
                canCreatePurchases: u.canCreatePurchases,
                canAccessReports: u.canAccessReports,
                outletId: u.outletId,
                organizationId: u.organizationId ?? undefined,
                isSuperAdmin: u.isSuperAdmin ?? false,
                outlet: {
                    ...u.outlet,
                    id: u.outlet.id,
                    name: u.outlet.name,
                    city: u.outlet.city,
                    state: u.outlet.state,
                } as any,
            },
        };
    },
    refresh: async (refreshToken: string): Promise<{ access: string }> => {
        const response = await fetch(`${API_URL}/auth/refresh/`, {
            method: 'POST',
            headers: getHeaders(false),
            body: JSON.stringify({ refresh: refreshToken }),
        });
        await assertOk(response);
        const data = await response.json();
        authToken = data.access;
        return { access: data.access };
    },
    me: async (): Promise<any> => {
        const response = await fetch(`${API_URL}/auth/me/`, {
            headers: getHeaders(true),
        });
        await assertOk(response);
        const data = await response.json();
        return {
            id: data.id,
            name: data.name,
            phone: data.phone,
            role: data.role,
            maxDiscount: data.maxDiscount,
            canEditRate: data.canEditRate,
            canViewPurchaseRates: data.canViewPurchaseRates,
            canCreatePurchases: data.canCreatePurchases,
            canAccessReports: data.canAccessReports,
            outletId: data.outletId,
            organizationId: data.organizationId ?? undefined,
            isSuperAdmin: data.isSuperAdmin ?? false,
            outlet: data.outlet,
        };
    },
    changePin: async (currentPin: string, newPin: string) => {
        const response = await fetch(`${API_URL}/auth/me/pin/`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify({ currentPin, newPin }),
        });
        await assertOk(response);
        return response.json();
    }
};

const realSettingsApi = {
    getSettings: async (outletId: string) => {
        const response = await fetch(`${API_URL}/outlet/settings/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    updateSettings: async (outletId: string, payload: any) => {
        const response = await fetch(`${API_URL}/outlet/settings/`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify({ ...payload, outletId }),
        });
        await assertOk(response);
        return response.json();
    }
};

const realProductsApi = {
    search: async (q: string, outletId: string): Promise<ProductSearchResult[]> => {
        const response = await fetch(
            `${API_URL}/products/search/?q=${encodeURIComponent(q)}&outletId=${outletId}`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        const data = await response.json();
        return (data.data || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            composition: item.composition,
            manufacturer: item.manufacturer,
            category: item.category,
            drugType: item.drugType,
            scheduleType: item.scheduleType,
            hsnCode: item.hsnCode,
            gstRate: item.gstRate,
            packSize: item.packSize,
            packUnit: item.packUnit,
            packType: item.packType,
            barcode: item.barcode,
            isFridge: item.isFridge,
            isDiscontinued: item.isDiscontinued,
            imageUrl: item.imageUrl,
            mrp: item.mrp ?? 0,
            saleRate: item.saleRate ?? 0,
            outletProductId: item.outletProductId,
            totalStock: item.totalStock,
            nearestExpiry: item.nearestExpiry,
            isLowStock: item.isLowStock,
            batches: item.batches || [],
        }));
    },
    create: async (payload: import('@/types').CreateProductPayload): Promise<ProductSearchResult> => {
        const response = await fetch(`${API_URL}/products/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        const item = await response.json();
        return {
            id: item.id,
            name: item.name,
            composition: item.composition ?? '',
            manufacturer: item.manufacturer ?? '',
            category: item.category ?? '',
            drugType: item.drugType ?? 'allopathy',
            scheduleType: item.scheduleType ?? 'OTC',
            hsnCode: item.hsnCode,
            gstRate: item.gstRate,
            packSize: item.packSize,
            packUnit: item.packUnit,
            packType: item.packType ?? 'strip',
            isFridge: item.isFridge ?? false,
            isDiscontinued: item.isDiscontinued ?? false,
            mrp: item.mrp ?? 0,
            saleRate: item.saleRate ?? 0,
            outletProductId: item.outletProductId ?? item.id,
            totalStock: 0,
            nearestExpiry: '2099-12-31',
            isLowStock: false,
            batches: [],
        };
    },
    getStock: async (productId: string, outletId: string) => {
        const response = await fetch(
            `${API_URL}/inventory/?outletId=${outletId}&search=${productId}`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        const data = await response.json();
        return Array.isArray(data) ? data : (data.data || []);
    },
    update: async (productId: string, payload: Partial<import('@/types').MasterProduct>): Promise<import('@/types').MasterProduct> => {
        const response = await fetch(`${API_URL}/products/${productId}/`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        const item = await response.json();
        return {
            id: item.id,
            name: item.name,
            composition: item.composition ?? '',
            manufacturer: item.manufacturer ?? '',
            category: item.category ?? '',
            drugType: item.drugType ?? 'allopathy',
            scheduleType: item.scheduleType ?? 'OTC',
            hsnCode: item.hsnCode ?? '',
            gstRate: item.gstRate ?? 0,
            packSize: item.packSize ?? 1,
            packUnit: item.packUnit ?? '',
            packType: item.packType ?? 'strip',
            barcode: item.barcode,
            isFridge: item.isFridge ?? false,
            isDiscontinued: item.isDiscontinued ?? false,
            imageUrl: item.imageUrl,
            mrp: item.mrp ?? 0,
            saleRate: item.saleRate ?? 0,
            minQty: item.minQty,
            reorderQty: item.reorderQty,
        };
    },
};

const realInventoryApi = {
    getStock: async (outletId: string, filters?: any) => {
        let url = `${API_URL}/inventory/?outletId=${outletId}`;
        if (filters?.search) url += `&search=${encodeURIComponent(filters.search)}`;
        if (filters?.scheduleType) url += `&scheduleType=${filters.scheduleType}`;
        if (filters?.lowStock) url += `&lowStock=true`;
        if (filters?.expiringSoon) url += `&expiringSoon=true`;
        if (filters?.sortBy) url += `&sortBy=${filters.sortBy}`;
        if (filters?.order) url += `&order=${filters.order}`;
        if (filters?.page) url += `&page=${filters.page}`;
        if (filters?.pageSize) url += `&pageSize=${filters.pageSize}`;

        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getBatches: async (productId: string, outletId: string) => {
        const response = await fetch(
            `${API_URL}/inventory/?outletId=${outletId}&search=${productId}`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        const data = await response.json();
        return Array.isArray(data) ? data : (data.data || []);
    },
    getExpiryReport: async (outletId: string) => {
        const response = await fetch(
            `${API_URL}/inventory/?outletId=${outletId}&expiringSoon=true`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        return response.json();
    },
    getLowStock: async (outletId: string) => {
        const response = await fetch(
            `${API_URL}/inventory/?outletId=${outletId}&lowStock=true`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        return response.json();
    },
    getAlerts: async (outletId: string) => {
        let url = `${API_URL}/inventory/alerts/`;
        if (outletId) url += `?outletId=${outletId}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    adjustStock: async (payload: any) => {
        const response = await fetch(`${API_URL}/inventory/adjust/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                batchId: payload.batchId,
                type: payload.type,
                qty: payload.qty,
                reason: payload.reason,
                pin: payload.pin,
                outletId: payload.outletId,
            }),
        });
        await assertOk(response);
        return response.json();
    }
};

const realSalesApi = {
    create: async (payload: any): Promise<SaleInvoice> => {
        const response = await fetch(`${API_URL}/sales/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        const data = await response.json();
        return {
            ...data,
            items: data.items ?? data.sale_items ?? data.saleItems ?? [],
        };
    },
    update: async (id: string, payload: any): Promise<SaleInvoice> => {
        const response = await fetch(`${API_URL}/sales/${id}/`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        const data = await response.json();
        return {
            ...data,
            items: data.items ?? data.sale_items ?? data.saleItems ?? [],
        };
    },
    list: async (outletId: string, params?: any): Promise<PaginatedResponse<SaleInvoice>> => {
        let url = `${API_URL}/sales/?outletId=${outletId}`;
        if (params?.page) url += `&page=${params.page}`;
        if (params?.pageSize) url += `&pageSize=${params.pageSize}`;
        if (params?.startDate) url += `&startDate=${params.startDate}`;
        if (params?.endDate) url += `&endDate=${params.endDate}`;
        if (params?.search) url += `&search=${encodeURIComponent(params.search)}`;

        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getById: async (id: string, outletId?: string): Promise<SaleInvoice> => {
        const url = outletId ? `${API_URL}/sales/${id}/?outletId=${outletId}` : `${API_URL}/sales/${id}/`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getPdf: async (id: string, outletId?: string): Promise<any> => {
        let url = `${API_URL}/sales/${id}/print/`;
        if (outletId) url += `?outletId=${outletId}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    createReturn: async (payload: any): Promise<any> => {
        const response = await fetch(`${API_URL}/sales/return/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    listByCustomer: async (outletId: string, customerId: string): Promise<any> => {
        const url = `${API_URL}/sales/?outletId=${outletId}&customerId=${customerId}&pageSize=200&ordering=-invoice_date`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getItems: async (invoiceId: string): Promise<any> => {
        const response = await fetch(`${API_URL}/sales/${invoiceId}/items/`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getSalesReturns: async (outletId: string, filters?: any): Promise<any> => {
        let url = `${API_URL}/sales/returns/?outletId=${outletId}`;
        if (filters?.from) url += `&from=${filters.from}`;
        if (filters?.to) url += `&to=${filters.to}`;
        if (filters?.customerId) url += `&customerId=${filters.customerId}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getReturnById: async (id: string): Promise<any> => {
        const response = await fetch(`${API_URL}/sales/returns/${id}/`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getReturnPdf: async (id: string): Promise<any> => {
        const response = await fetch(`${API_URL}/sales/returns/${id}/print/`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    }
};

const realCreditApi = {
    getAccountsList: async (outletId: string, filters?: any) => {
        const response = await fetch(`${API_URL}/credit/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    list: async (outletId: string) => {
        const response = await fetch(`${API_URL}/credit/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        const data = await response.json();
        return data.data || [];
    },
    getTransactions: async (accountId: string) => {
        const response = await fetch(`${API_URL}/credit/${accountId}/transactions/`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    getLedger: async (accountId: string) => {
        const response = await fetch(`${API_URL}/credit/${accountId}/ledger/`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    recordPayment: async (payload: any): Promise<CreditAccount> => {
        const response = await fetch(`${API_URL}/credit/payment/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                credit_account_id: payload.creditAccountId,
                amount: payload.amount,
                mode: payload.mode,
                payment_date: payload.paymentDate,
            }),
        });
        await assertOk(response);
        return response.json();
    },
    updateCreditLimit: async (customerId: string, newLimit: number, outletId?: string) => {
        const body: any = { creditLimit: newLimit };
        if (outletId) body.outletId = outletId;
        const response = await fetch(`${API_URL}/credit/${customerId}/limit/`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify(body),
        });
        await assertOk(response);
        return response.json();
    },
    getAgingSummary: async (outletId: string) => {
        const response = await fetch(`${API_URL}/credit/?outletId=${outletId}&pageSize=500`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        const data = await response.json();
        const accounts: any[] = data.data ?? [];

        const today = new Date();
        const result = {
            current:     { count: 0, amount: 0 },
            days30to60:  { count: 0, amount: 0 },
            days60to90:  { count: 0, amount: 0 },
            over90:      { count: 0, amount: 0 },
            totalOverdue:      { count: 0, amount: 0 },
            totalOutstanding:  { count: 0, amount: 0 },
        };

        for (const acc of accounts) {
            const outstanding = acc.totalOutstanding ?? 0;
            if (outstanding <= 0) continue;

            let days = 0;
            if (acc.lastTransactionDate) {
                days = Math.floor(
                    (today.getTime() - new Date(acc.lastTransactionDate).getTime()) /
                    (1000 * 60 * 60 * 24)
                );
            }

            const bucket =
                days <= 30 ? 'current' :
                days <= 60 ? 'days30to60' :
                days <= 90 ? 'days60to90' :
                'over90';

            result[bucket].count++;
            result[bucket].amount += outstanding;
            result.totalOutstanding.count++;
            result.totalOutstanding.amount += outstanding;
            if (bucket !== 'current') {
                result.totalOverdue.count++;
                result.totalOverdue.amount += outstanding;
            }
        }

        return result;
    },
    sendReminder: async (accountId: string, payload?: { channel?: string; message?: string }) => {
        const response = await fetch(`${API_URL}/credit/${accountId}/reminder/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload || {}),
        });
        await assertOk(response);
        return response.json();
    }
};

const realDashboardApi = {
    getDailySummary: async (outletId: string, date: string, startDate?: string, endDate?: string): Promise<DashboardKPI> => {
        let url = `${API_URL}/dashboard/daily/?outletId=${outletId}`;
        if (startDate && endDate) {
            url += `&startDate=${startDate}&endDate=${endDate}`;
        } else {
            url += `&date=${date}`;
        }
        const response = await fetch(
            url,
            { headers: getHeaders() }
        );
        await assertOk(response);
        const data = await response.json();
        // Backend sends totalQty/totalRevenue; type expects qty/revenue
        if (Array.isArray(data.topSellingItems)) {
            data.topSellingItems = data.topSellingItems.map((item: any) => ({
                ...item,
                qty:     item.qty     ?? item.totalQty     ?? 0,
                revenue: item.revenue ?? item.totalRevenue ?? 0,
            }));
        }
        return data;
    },
    getAlerts: async (outletId: string): Promise<DashboardAlerts> => {
        const response = await fetch(
            `${API_URL}/dashboard/daily/?outletId=${outletId}&date=${new Date().toISOString().split('T')[0]}`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        const data = await response.json();
        return data.alerts || {};
    }
};

const realStaffApi = {
    list: async (outletId: string) => {
        const response = await fetch(`${API_URL}/staff/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        const json = await response.json();
        // Backend returns plain array; normalise so callers always get an array
        return Array.isArray(json) ? json : (json?.data ?? []);
    },
    lookupByPin: async (pin: string, outletId: string) => {
        const response = await fetch(`${API_URL}/staff/lookup-by-pin/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ pin, outletId }),
        });
        await assertOk(response);
        return response.json();
    },
    getPerformance: async (staffId: string, startDate: string, endDate: string) => {
        const params = new URLSearchParams({ startDate, endDate });
        const response = await fetch(`${API_URL}/staff/${staffId}/performance/?${params}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    getLeaderboard: async (outletId: string, from?: string, to?: string) => {
        let url = `${API_URL}/staff/leaderboard/?outletId=${outletId}`;
        if (from) url += `&from=${from}`;
        if (to) url += `&to=${to}`;
        const response = await fetch(url, {
            headers: getHeaders(),
        });
        await assertOk(response);
        const json = await response.json();
        // Backend returns { success: true, data: [] }; normalise to plain array
        return Array.isArray(json) ? json : (json?.data ?? []);
    },
    create: async (payload: any) => {
        const response = await fetch(`${API_URL}/staff/create/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    update: async (staffId: string, payload: any) => {
        const response = await fetch(`${API_URL}/staff/${staffId}/`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    delete: async (staffId: string) => {
        const response = await fetch(`${API_URL}/staff/${staffId}/`, {
            method: 'DELETE',
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    }
};

const realPurchasesApi = {
    list: async (outletId: string, filters?: any): Promise<PaginatedResponse<PurchaseInvoiceFull>> => {
        let url = `${API_URL}/purchases/?outletId=${outletId}`;
        if (filters?.distributorId) url += `&distributorId=${filters.distributorId}`;
        if (filters?.startDate) url += `&startDate=${filters.startDate}`;
        if (filters?.endDate) url += `&endDate=${filters.endDate}`;
        if (filters?.page) url += `&page=${filters.page}`;
        if (filters?.pageSize) url += `&pageSize=${filters.pageSize}`;

        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getById: async (id: string, outletId?: string): Promise<PurchaseInvoiceFull> => {
        const query = outletId ? `?outletId=${outletId}` : '';
        const response = await fetch(`${API_URL}/purchases/${id}/${query}`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    create: async (payload: CreatePurchasePayload): Promise<PurchaseInvoiceFull> => {
        const response = await fetch(`${API_URL}/purchases/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                outletId: payload.outletId,
                partyLedgerId: payload.partyLedgerId,
                invoiceNo: payload.invoiceNo,
                invoiceDate: payload.invoiceDate,
                dueDate: payload.dueDate,
                purchaseType: payload.purchaseType,
                purchaseOrderRef: payload.purchaseOrderRef,
                godown: payload.godown,
                notes: payload.notes,
                items: payload.items,
                subtotal: payload.subtotal,
                discountAmount: payload.discountAmount,
                taxableAmount: payload.taxableAmount,
                gstAmount: payload.gstAmount,
                cessAmount: payload.cessAmount,
                freight: payload.freight,
                roundOff: payload.roundOff,
                ledgerAdjustment: payload.ledgerAdjustment,
                ledgerNote: payload.ledgerNote,
                grandTotal: payload.grandTotal,
            }),
        });
        await assertOk(response);
        return response.json();
    },
    update: async (id: string, payload: CreatePurchasePayload): Promise<PurchaseInvoiceFull> => {
        const response = await fetch(`${API_URL}/purchases/${id}/`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    createPurchase: async (payload: any): Promise<PurchaseInvoiceFull> => {
        return realPurchasesApi.create(payload);
    },
    recordPayment: async (payload: any) => {
        const response = await fetch(`${API_URL}/purchases/payments/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                distributorId: payload.distributorId,
                date: payload.date,
                totalAmount: payload.totalAmount,
                paymentMode: payload.paymentMode,
                referenceNo: payload.referenceNo,
                notes: payload.notes,
                allocations: payload.allocations,
                outletId: payload.outletId,
            }),
        });
        await assertOk(response);
        return response.json();
    }
};

const realDistributorsApi = {
    list: async (outletId: string): Promise<any[]> => {
        const response = await fetch(`${API_URL}/purchases/distributors/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        const data = await response.json();
        return Array.isArray(data) ? data : (data.data || []);
    },
    getById: async (id: string) => {
        const response = await fetch(`${API_URL}/purchases/distributors/${id}/`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    getLedger: async (distributorId: string): Promise<any> => {
        const response = await fetch(
            `${API_URL}/purchases/distributors/${distributorId}/ledger/`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        const data = await response.json();
        // Backend returns { distributor, entries: [...], openingBalance, closingBalance }
        return data;
    },
    create: async (payload: any) => {
        const response = await fetch(`${API_URL}/purchases/distributors/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                outletId: payload.outletId,
                name: payload.name,
                gstin: payload.gstin,
                drugLicenseNo: payload.drugLicenseNo,
                phone: payload.phone,
                email: payload.email,
                address: payload.address,
                city: payload.city,
                state: payload.state,
                creditDays: payload.creditDays,
                openingBalance: payload.openingBalance,
                balanceType: payload.balanceType,
            }),
        });
        await assertOk(response);
        return response.json();
    },
    update: async (id: string, payload: any) => {
        const response = await fetch(`${API_URL}/purchases/distributors/${id}/`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    }
};

const realCustomersApi = {
    list: async (outletId: string, filters?: any): Promise<any> => {
        let url = `${API_URL}/customers/?outletId=${outletId}`;
        if (filters?.search) url += `&search=${encodeURIComponent(filters.search)}`;
        if (filters?.isChronic !== undefined) url += `&isChronic=${filters.isChronic}`;
        if (filters?.hasOutstanding !== undefined) url += `&hasOutstanding=${filters.hasOutstanding}`;
        if (filters?.page) url += `&page=${filters.page}`;
        if (filters?.pageSize) url += `&pageSize=${filters.pageSize}`;

        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        const data = await response.json();
        // Return the full paginated response so callers can access pagination.totalRecords
        return data;
    },
    getById: async (id: string) => {
        const response = await fetch(`${API_URL}/customers/${id}/`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getPurchaseHistory: async (customerId: string, outletId?: string) => {
        let url = `${API_URL}/customers/${customerId}/purchase-history/`;
        if (outletId) url += `?outletId=${outletId}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getRefillAlerts: async (outletId: string) => {
        const response = await fetch(`${API_URL}/customers/refill-alerts/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    getChronicMedicines: async (customerId: string) => {
        const response = await fetch(`${API_URL}/customers/${customerId}/chronic-medicines/`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    create: async (payload: any) => {
        const response = await fetch(`${API_URL}/customers/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                outletId: payload.outletId,
                name: payload.name,
                phone: payload.phone,
                address: payload.address || null,
                dob: payload.dob || null,
                gstin: payload.gstin || null,
                isChronic: payload.isChronic ?? false,
                fixedDiscount: payload.fixedDiscount ?? 0,
                creditLimit: payload.creditLimit ?? 0,
            }),
        });
        await assertOk(response);
        return response.json();
    },
    update: async (id: string, payload: any) => {
        const response = await fetch(`${API_URL}/customers/${id}/`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({
                outletId: payload.outletId,
                name: payload.name,
                phone: payload.phone,
                address: payload.address || null,
                dob: payload.dob || null,
                gstin: payload.gstin || null,
                isChronic: payload.isChronic ?? false,
                fixedDiscount: payload.fixedDiscount ?? 0,
                creditLimit: payload.creditLimit ?? 0,
            }),
        });
        await assertOk(response);
        return response.json();
    },
    getDoctors: async (outletId: string) => {
        const response = await fetch(`${API_URL}/doctors/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    createDoctor: async (payload: any) => {
        const response = await fetch(`${API_URL}/doctors/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    }
};

const realAttendanceApi = {
    getMonthlyRecords: async (outletId: string, staffId: string, month: string) => {
        let url = `${API_URL}/attendance/?outletId=${outletId}&month=${month}`;
        if (staffId) url += `&staffId=${staffId}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getTodayRecords: async (outletId: string) => {
        const response = await fetch(`${API_URL}/attendance/today/?outletId=${outletId}`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getMonthlySummaries: async (outletId: string, _staffId: string, month: string) => {
        const response = await fetch(`${API_URL}/attendance/summary/?outletId=${outletId}&month=${month}`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    checkIn: async (payload: any): Promise<AttendanceRecord> => {
        const response = await fetch(`${API_URL}/attendance/check-in/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                outletId: payload.outletId,
                staffId: payload.staffId,
                type: payload.type,
                photoBase64: payload.photoBase64 ?? null,
            }),
        });
        await assertOk(response);
        return response.json();
    },
    checkOut: async (payload: any): Promise<AttendanceRecord> => {
        const response = await fetch(`${API_URL}/attendance/check-in/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                outletId: payload.outletId,
                staffId: payload.staffId,
                type: 'check_out',
                photoBase64: payload.photoBase64 ?? null,
            }),
        });
        await assertOk(response);
        return response.json();
    },
    markManual: async (payload: any) => {
        const response = await fetch(`${API_URL}/attendance/manual/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    }
};

const realReportsApi = {
    getSalesReport: async (outletId: string, filters: any) => {
        // If filters has date range, fetch reports for each day in range
        // Otherwise, just fetch for today
        const dates: string[] = [];
        if (filters?.from && filters?.to) {
            const currentDate = new Date(filters.from);
            const endDate = new Date(filters.to);
            while (currentDate <= endDate) {
                dates.push(currentDate.toISOString().split('T')[0]);
                currentDate.setDate(currentDate.getDate() + 1);
            }
        } else {
            dates.push(new Date().toISOString().split('T')[0]);
        }

        // Fetch report for each date and aggregate
        const allRows: any[] = [];
        const allChartData: any[] = [];

        for (const date of dates) {
            const response = await fetch(
                `${API_URL}/reports/sales/daily/?outletId=${outletId}&date=${date}`,
                { headers: getHeaders() }
            );
            await assertOk(response);
            const data = await response.json();
            if (data.rows) allRows.push(...data.rows);
            if (data.chartData) allChartData.push(...data.chartData);
        }

        // Calculate summary from aggregated rows
        const totalSales = allRows.reduce((sum: number, row: any) => sum + (row.totalSales || 0), 0);
        const totalBills = allRows.reduce((sum: number, row: any) => sum + (row.invoiceCount || 0), 0);
        const totalDiscount = allRows.reduce((sum: number, row: any) => sum + (row.totalDiscount || 0), 0);
        const totalTax = allRows.reduce((sum: number, row: any) => sum + (row.totalTax || 0), 0);

        return {
            rows: allRows,
            summary: [
                { label: 'Total Sales', value: `₹${totalSales.toLocaleString()}`, change: 0, trend: 'neutral' },
                { label: 'Total Bills', value: totalBills.toString(), change: 0, trend: 'neutral' },
                { label: 'Avg Bill Value', value: `₹${totalBills > 0 ? (totalSales / totalBills).toFixed(0) : 0}`, change: 0, trend: 'neutral' },
                { label: 'GST Collected', value: `₹${totalTax.toLocaleString()}`, change: 0, trend: 'neutral' },
                { label: 'Total Discount', value: `₹${totalDiscount.toLocaleString()}`, change: 0, trend: 'neutral' },
            ],
            chartData: allChartData,
        };
    },
    getGSTReport: async (outletId: string, filters: any) => {
        const params = new URLSearchParams({
            outletId,
            from: filters.from,
            to: filters.to,
        });
        const response = await fetch(`${API_URL}/reports/gst/gstr1/?${params}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    getStockValuation: async (outletId: string) => {
        const response = await fetch(`${API_URL}/reports/inventory/valuation/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    getSalesSummary: async (outletId: string, filters?: any) => {
        let url = `${API_URL}/reports/sales/summary/?outletId=${outletId}`;
        if (filters?.from) url += `&from=${filters.from}`;
        if (filters?.to) url += `&to=${filters.to}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getGSTR2Report: async (outletId: string, filters: any) => {
        const params = new URLSearchParams({ outletId, from: filters.from, to: filters.to });
        const response = await fetch(`${API_URL}/reports/gst/gstr2/?${params}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    getGSTR3BReport: async (outletId: string, month: string) => {
        const response = await fetch(`${API_URL}/reports/gst/gstr3b/?outletId=${outletId}&month=${month}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    getExpiryReport: async (outletId: string, filters?: any) => {
        let url = `${API_URL}/reports/expiry/?outletId=${outletId}`;
        if (filters?.days) url += `&days=${filters.days}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getInventoryMovement: async (outletId: string, filters: any) => {
        const params = new URLSearchParams({ outletId, from: filters.from, to: filters.to });
        if (filters?.productId) params.set('productId', filters.productId);
        const response = await fetch(`${API_URL}/reports/inventory/movement/?${params}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    getStaffReport: async (outletId: string, filters: any) => {
        const params = new URLSearchParams({ outletId, from: filters.from, to: filters.to });
        const response = await fetch(`${API_URL}/reports/staff/performance/?${params}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
    },
    getPurchaseReport: async (outletId: string, filters: any) => {
        // No dedicated endpoint yet — delegate to purchases list
        const params = new URLSearchParams({ outletId, startDate: filters.from, endDate: filters.to });
        const response = await fetch(`${API_URL}/purchases/?${params}`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getBalanceSheet: async (outletId: string) => {
        const response = await fetch(`${API_URL}/reports/balance-sheet/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        const data = await response.json();
        return data.data;
    },
    reconcileGSTR2A: async (payload: { gstin: string; from: string; to: string }) => {
        const response = await fetch(`${API_URL}/reports/gstr2a/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        const data = await response.json();
        return data.data;
    },
};

const realAccountsApi = {
    getDistributorOutstanding: async (outletId: string) => {
        const response = await fetch(`${API_URL}/outstanding/distributors/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        const data = await response.json();
        const raw: any[] = data.data ?? (Array.isArray(data) ? data : []);
        return raw.map((d: any) => ({
            distributorId:    d.distributorId,
            name:             d.distributorName ?? d.name ?? '',
            gstin:            d.gstin,
            phone:            d.phone,
            totalBills:       d.invoiceCount ?? d.totalBills ?? 0,
            paidBills:        d.paidBills ?? 0,
            overdueBills:     d.overdueBills ?? 0,
            totalOutstanding: d.totalOutstanding ?? 0,
            overdueAmount:    d.overdueAmount ?? 0,
            oldestDueDate:    d.oldestDueDate,
        }));
    },
    getCustomerOutstanding: async (outletId: string) => {
        const response = await fetch(`${API_URL}/outstanding/customers/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        const data = await response.json();
        const raw: any[] = data.data ?? (Array.isArray(data) ? data : []);
        return raw.map((c: any) => ({
            customerId:       c.customerId,
            name:             c.customerName ?? c.name ?? '',
            phone:            c.phone,
            totalBills:       c.totalBills ?? 0,
            totalOutstanding: c.totalOutstanding ?? 0,
            overdueAmount:    c.overdueAmount ?? 0,
        }));
    },
    getUnpaidInvoices: async (distributorId: string, outletId?: string) => {
        let url = `${API_URL}/purchases/distributors/${distributorId}/outstanding/`;
        if (outletId) url += `?outletId=${outletId}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    createPayment: async (payload: any) => {
        const response = await fetch(`${API_URL}/purchases/payments/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    getPayments: async (outletId: string, filters?: any) => {
        let url = `${API_URL}/purchases/payments/?outletId=${outletId}`;
        if (filters?.distributorId) url += `&distributorId=${filters.distributorId}`;
        if (filters?.from) url += `&from=${filters.from}`;
        if (filters?.to) url += `&to=${filters.to}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    createReceipt: async (payload: any) => {
        const response = await fetch(`${API_URL}/receipts/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    getReceipts: async (outletId: string, filters?: any) => {
        let url = `${API_URL}/receipts/?outletId=${outletId}`;
        if (filters?.customerId) url += `&customerId=${filters.customerId}`;
        if (filters?.from) url += `&from=${filters.from}`;
        if (filters?.to) url += `&to=${filters.to}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getExpenses: async (outletId: string, filters?: any) => {
        let url = `${API_URL}/expenses/?outletId=${outletId}`;
        if (filters?.from) url += `&from=${filters.from}`;
        if (filters?.to) url += `&to=${filters.to}`;
        if (filters?.head) url += `&head=${filters.head}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        const json = await response.json();
        // Backend returns { success: true, data: [...], meta: {...} }; normalise to array
        return Array.isArray(json) ? json : (json?.data ?? []);
    },
    createExpense: async (payload: any) => {
        const response = await fetch(`${API_URL}/expenses/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    getDistributorLedger: async (distributorId: string) => {
        return realDistributorsApi.getLedger(distributorId);
    },
    getCustomerLedger: async (customerId: string, outletId?: string, filters?: any) => {
        let url = `${API_URL}/customers/${customerId}/ledger/`;
        const params: string[] = [];
        if (outletId) params.push(`outletId=${outletId}`);
        if (filters?.from) params.push(`from=${filters.from}`);
        if (filters?.to) params.push(`to=${filters.to}`);
        if (params.length > 0) url += '?' + params.join('&');
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getCustomerUnpaidInvoices: async (customerId: string) => {
        const url = `${API_URL}/customers/${customerId}/outstanding/`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getTrialBalance: async (outletId: string, filters?: { from?: string; to?: string }) => {
        let url = `${API_URL}/trial-balance/?outlet_id=${outletId}`;
        if (filters?.from) url += `&from_date=${filters.from}`;
        if (filters?.to) url += `&to_date=${filters.to}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getGSTSummary: async (outletId: string, month?: string) => {
        let url = `${API_URL}/gst-summary/?outlet_id=${outletId}`;
        if (month) url += `&month=${month}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getBalanceSheet: async (outletId: string, params?: {
        as_on_date?: string;
        stock_valuation?: string;
        stock_scope?: string;
        show_opening?: boolean;
    }) => {
        let url = `${API_URL}/balance-sheet/?outlet_id=${outletId}`;
        if (params?.as_on_date) url += `&as_on_date=${params.as_on_date}`;
        if (params?.stock_valuation) url += `&stock_valuation=${params.stock_valuation}`;
        if (params?.stock_scope) url += `&stock_scope=${params.stock_scope}`;
        if (params?.show_opening) url += `&show_opening=true`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getProfitLoss: async (outletId: string, params?: {
        from_date?: string;
        to_date?: string;
        stock_valuation?: string;
        stock_scope?: string;
    }) => {
        let url = `${API_URL}/profit-loss/?outlet_id=${outletId}`;
        if (params?.from_date) url += `&from_date=${params.from_date}`;
        if (params?.to_date) url += `&to_date=${params.to_date}`;
        if (params?.stock_valuation) url += `&stock_valuation=${params.stock_valuation}`;
        if (params?.stock_scope) url += `&stock_scope=${params.stock_scope}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
};

const realChainApi = {
    listOrganizations: async () => {
        const response = await fetch(`${API_URL}/organizations/`, { headers: getHeaders() });
        await assertOk(response);
        const data = await response.json();
        return data.data;
    },
    getOrganization: async (id: string) => {
        const response = await fetch(`${API_URL}/organizations/${id}/`, { headers: getHeaders() });
        await assertOk(response);
        const data = await response.json();
        return data.data;
    },
    getChainDashboard: async (orgId: string, from?: string, to?: string) => {
        let url = `${API_URL}/organizations/dashboard/?orgId=${orgId}`;
        if (from) url += `&from=${from}`;
        if (to) url += `&to=${to}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        const data = await response.json();
        return data.data;
    },
    createOutlet: async (orgId: string, data: any) => {
        const response = await fetch(`${API_URL}/organizations/${orgId}/outlets/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(data),
        });
        await assertOk(response);
        const res = await response.json();
        return res.data;
    },
    getOrgOutlets: async (orgId: string) => {
        const response = await fetch(`${API_URL}/organizations/${orgId}/outlets/`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        const data = await response.json();
        return data.data || data || [];
    },
};

const realVoucherApi = {
    getLedgerGroups: async (outletId: string) => {
        const response = await fetch(`${API_URL}/ledger-groups/?outletId=${outletId}`, { headers: getHeaders() });
        await assertOk(response);
        const data = await response.json();
        return data.data || [];
    },
    getLedgers: async (outletId: string, params?: { type?: string; voucherType?: string; search?: string; group?: string }) => {
        let url = `${API_URL}/ledgers/?outletId=${outletId}`;
        if (params?.type) url += `&type=${params.type}`;
        if (params?.voucherType) url += `&voucherType=${params.voucherType}`;
        if (params?.search) url += `&search=${encodeURIComponent(params.search)}`;
        if (params?.group) url += `&group=${encodeURIComponent(params.group)}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        const data = await response.json();
        return data.data || [];
    },
    getLedgerStatement: async (ledgerId: string, from?: string, to?: string) => {
        let url = `${API_URL}/ledgers/${ledgerId}/statement/`;
        const params: string[] = [];
        if (from) params.push(`from=${from}`);
        if (to) params.push(`to=${to}`);
        if (params.length) url += '?' + params.join('&');
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    syncLedgers: async (outletId: string) => {
        const response = await fetch(`${API_URL}/ledgers/sync/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ outletId }),
        });
        await assertOk(response);
        return response.json();
    },
    getNextVoucherNo: async (outletId: string, type: string) => {
        const response = await fetch(`${API_URL}/ledgers/next-no/?outletId=${outletId}&type=${type}`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getVouchers: async (outletId: string, type?: string) => {
        let url = `${API_URL}/vouchers/?outletId=${outletId}`;
        if (type) url += `&type=${type}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        const data = await response.json();
        return data.data || [];
    },
    getVoucherById: async (id: string): Promise<any> => {
        const response = await fetch(`${API_URL}/vouchers/${id}/`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    createVoucher: async (payload: any) => {
        const response = await fetch(`${API_URL}/vouchers/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    getDebitNotes: async (outletId: string) => {
        const response = await fetch(`${API_URL}/debit-notes/?outletId=${outletId}`, { headers: getHeaders() });
        await assertOk(response);
        const data = await response.json();
        return data.data || [];
    },
    createDebitNote: async (payload: any) => {
        const response = await fetch(`${API_URL}/debit-notes/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    getCreditNotes: async (outletId: string) => {
        const response = await fetch(`${API_URL}/credit-notes/?outletId=${outletId}`, { headers: getHeaders() });
        await assertOk(response);
        const data = await response.json();
        return data.data || [];
    },
    createCreditNote: async (payload: any) => {
        const response = await fetch(`${API_URL}/credit-notes/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    createLedger: async (payload: any) => {
        const response = await fetch(`${API_URL}/ledgers/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    updateLedger: async (ledgerId: string, payload: any) => {
        const response = await fetch(`${API_URL}/ledgers/${ledgerId}/`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    createLedgerGroup: async (payload: { outletId: string; name: string; nature: string; parentId?: string }) => {
        const response = await fetch(`${API_URL}/ledger-groups/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
    searchPurchaseInvoices: async (outletId: string, q: string) => {
        const response = await fetch(
            `${API_URL}/purchases/invoices/search/?outletId=${encodeURIComponent(outletId)}&q=${encodeURIComponent(q)}`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        const data = await response.json();
        return data.data || [];
    },
    searchSaleInvoices: async (outletId: string, q: string) => {
        const response = await fetch(
            `${API_URL}/sales/invoices/search/?outletId=${encodeURIComponent(outletId)}&q=${encodeURIComponent(q)}`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        const data = await response.json();
        return data.data || [];
    },
    getLedgerOutstanding: async (ledgerId: string) => {
        const response = await fetch(`${API_URL}/ledgers/${ledgerId}/outstanding/`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getPendingBills: async (outletId: string, ledgerId: string) => {
        const response = await fetch(
            `${API_URL}/ledgers/${ledgerId}/pending-bills/?outletId=${outletId}`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        const data = await response.json();
        return data.data || [];
    },
    createSalesReturn: async (payload: any) => {
        const response = await fetch(`${API_URL}/sales/return/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        return response.json();
    },
};

const realDoctorsApi = {
    search: async (outletId: string, search?: string): Promise<any[]> => {
        let url = `${API_URL}/doctors/?outletId=${outletId}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        const data = await response.json();
        return (data.data || []).map((d: any) => ({
            id: d.id,
            name: d.name,
            regNo: d.registrationNo ?? d.regNo ?? '',
            degree: d.degree ?? '',
            qualification: d.qualification ?? '',
            specialty: d.specialty ?? d.specialization ?? '',
            hospitalName: d.hospitalName ?? '',
            address: d.address ?? '',
            phone: d.phone ?? '',
            outletId,
            isActive: true,
        }));
    },
    create: async (payload: { 
        name: string; 
        registrationNo: string; 
        outletId: string; 
        qualification?: string; 
        phone?: string;
        degree?: string;
        hospitalName?: string;
        address?: string;
        specialty?: string;
    }): Promise<any> => {
        const response = await fetch(`${API_URL}/doctors/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        await assertOk(response);
        const data = await response.json();
        const d = data.data;
        return {
            id: d.id,
            name: d.name,
            specialty: d.specialization ?? '',
            phone: d.phone ?? '',
            outletId: payload.outletId,
            isActive: true,
        };
    },
};

export const authApi = realAuthApi;
export const productsApi = realProductsApi;
export const salesApi = realSalesApi;
export const creditApi = realCreditApi;
export const dashboardApi = realDashboardApi;
export const staffApi = realStaffApi;
export const inventoryApi = realInventoryApi;
export const purchasesApi = realPurchasesApi;
export const distributorsApi = realDistributorsApi;
export const customersApi = realCustomersApi;
export const attendanceApi = realAttendanceApi;
export const reportsApi = realReportsApi;
export const accountsApi = realAccountsApi;
export const settingsApi = realSettingsApi;
export const chainApi = realChainApi;
export const voucherApi = realVoucherApi;
export const doctorsApi = realDoctorsApi;
