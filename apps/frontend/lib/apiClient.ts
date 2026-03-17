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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

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
                staffPin: u.staffPin,
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
            staffPin: data.staffPin,
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
            hsn: item.hsn,
            scheduleType: item.schedule_type,
            mrp: item.mrp,
            packSize: item.pack_size,
            outletProductId: item.id,
            totalStock: item.total_stock,
            nearestExpiry: item.nearest_expiry,
            isLowStock: item.is_low_stock,
            batches: item.batches || [],
        }));
    },
    getStock: async (productId: string, outletId: string) => {
        const response = await fetch(
            `${API_URL}/inventory/?outletId=${outletId}&search=${productId}`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        const data = await response.json();
        return Array.isArray(data) ? data : (data.data || []);
    }
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
            body: JSON.stringify({
                outlet_id: payload.outletId,
                customer_id: payload.customerId,
                sale_items: payload.saleItems,
                cash_paid: payload.cashPaid || 0,
                upi_paid: payload.upiPaid || 0,
                card_paid: payload.cardPaid || 0,
                credit_given: payload.creditGiven || 0,
            }),
        });
        await assertOk(response);
        return response.json();
    },
    list: async (outletId: string, params?: any): Promise<PaginatedResponse<SaleInvoice>> => {
        let url = `${API_URL}/sales/?outletId=${outletId}`;
        if (params?.page) url += `&page=${params.page}`;
        if (params?.pageSize) url += `&pageSize=${params.pageSize}`;
        if (params?.startDate) url += `&startDate=${params.startDate}`;
        if (params?.endDate) url += `&endDate=${params.endDate}`;

        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    getById: async (id: string): Promise<SaleInvoice> => {
        const response = await fetch(`${API_URL}/sales/${id}/`, { headers: getHeaders() });
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
        const response = await fetch(`${API_URL}/credit/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
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
    getDailySummary: async (outletId: string, date: string): Promise<DashboardKPI> => {
        const response = await fetch(
            `${API_URL}/dashboard/daily/?outletId=${outletId}&date=${date}`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        return response.json();
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
        return response.json();
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
    getLeaderboard: async (outletId: string) => {
        const response = await fetch(`${API_URL}/staff/leaderboard/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
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
    getById: async (id: string): Promise<PurchaseInvoiceFull> => {
        const response = await fetch(`${API_URL}/purchases/${id}/`, { headers: getHeaders() });
        await assertOk(response);
        return response.json();
    },
    create: async (payload: CreatePurchasePayload): Promise<PurchaseInvoiceFull> => {
        const response = await fetch(`${API_URL}/purchases/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                outletId: payload.outletId,
                distributorId: payload.distributorId,
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
                grandTotal: payload.grandTotal,
            }),
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
    getLedger: async (distributorId: string): Promise<DistributorLedgerEntry[]> => {
        const response = await fetch(
            `${API_URL}/purchases/distributors/${distributorId}/ledger/`,
            { headers: getHeaders() }
        );
        await assertOk(response);
        const data = await response.json();
        // Backend returns { distributor, ledger: [...], summary }
        return data.ledger || data.data || [];
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
    list: async (outletId: string, filters?: any): Promise<any[]> => {
        let url = `${API_URL}/customers/?outletId=${outletId}`;
        if (filters?.search) url += `&search=${encodeURIComponent(filters.search)}`;
        if (filters?.page) url += `&page=${filters.page}`;

        const response = await fetch(url, { headers: getHeaders() });
        await assertOk(response);
        const data = await response.json();
        return data.data || [];
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
                outlet_id: payload.outletId,
                name: payload.name,
                phone: payload.phone,
                address: payload.address,
                dob: payload.dob,
            }),
        });
        await assertOk(response);
        return response.json();
    },
    update: async (id: string, payload: any) => {
        const response = await fetch(`${API_URL}/customers/${id}/`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload),
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
    getMonthlySummaries: async (outletId: string, staffId: string, month: string) => {
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
        return response.json();
    },
    getCustomerOutstanding: async (outletId: string) => {
        const response = await fetch(`${API_URL}/outstanding/customers/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        await assertOk(response);
        return response.json();
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
        return response.json();
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
