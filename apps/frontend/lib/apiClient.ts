import {
    mockAuthApi,
    mockProductsApi,
    mockSalesApi,
    mockCreditApi,
    mockDashboardApi,
    mockStaffApi,
    mockInventoryApi,
    mockPurchasesApi,
    mockDistributorsApi,
    mockCustomersApi,
    mockAttendanceApi,
    mockReportsApi,
    mockAccountsApi,
} from './mockApi';
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

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

let authToken: string | null = null;

// Helper to get authorization headers
function getHeaders(includeAuth = true): HeadersInit {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };
    if (includeAuth && authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
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
        if (!response.ok) {
            const error = await response.json();
            throw error;
        }
        const data = await response.json();
        authToken = data.access;
        return {
            access: data.access,
            refresh: data.refresh,
            user: {
                id: data.user.id,
                name: data.user.name,
                phone: data.user.phone,
                role: data.user.role,
                staffPin: data.user.staff_pin,
                maxDiscount: data.user.max_discount,
                canEditRate: data.user.can_edit_rate,
                canViewPurchaseRates: data.user.can_view_purchase_rates,
                canCreatePurchases: data.user.can_create_purchases,
                canAccessReports: data.user.can_access_reports,
                outletId: data.user.outlet_id,
                outlet: {
                    id: data.user.outlet.id,
                    organizationId: data.user.outlet.organization_id,
                    name: data.user.outlet.name,
                    address: data.user.outlet.address,
                    city: data.user.outlet.city,
                    state: data.user.outlet.state,
                    pincode: data.user.outlet.pincode,
                    gstin: data.user.outlet.gstin,
                    drugLicenseNo: data.user.outlet.drug_license_no,
                    phone: data.user.outlet.phone,
                    isActive: data.user.outlet.is_active,
                    createdAt: data.user.outlet.created_at,
                },
            },
        };
    },
    logout: async (): Promise<void> => {
        authToken = null;
    }
};

const realProductsApi = {
    search: async (q: string, outletId: string): Promise<ProductSearchResult[]> => {
        const response = await fetch(
            `${API_URL}/products/search/?q=${encodeURIComponent(q)}&outletId=${outletId}`,
            { headers: getHeaders() }
        );
        if (!response.ok) throw await response.json();
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
        if (!response.ok) throw await response.json();
        const data = await response.json();
        return data.data || [];
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
        if (!response.ok) throw await response.json();
        return response.json();
    },
    getBatches: async (productId: string, outletId: string) => {
        const response = await fetch(
            `${API_URL}/inventory/?outletId=${outletId}&search=${productId}`,
            { headers: getHeaders() }
        );
        if (!response.ok) throw await response.json();
        const data = await response.json();
        return data.data || [];
    },
    getExpiryReport: async (outletId: string) => {
        const response = await fetch(
            `${API_URL}/inventory/?outletId=${outletId}&expiringSoon=true`,
            { headers: getHeaders() }
        );
        if (!response.ok) throw await response.json();
        return response.json();
    },
    getLowStock: async (outletId: string) => {
        const response = await fetch(
            `${API_URL}/inventory/?outletId=${outletId}&lowStock=true`,
            { headers: getHeaders() }
        );
        if (!response.ok) throw await response.json();
        return response.json();
    },
    adjustStock: async (payload: any) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Stock adjustment not yet implemented' } };
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
        if (!response.ok) throw await response.json();
        return response.json();
    },
    list: async (outletId: string, params?: any): Promise<PaginatedResponse<SaleInvoice>> => {
        let url = `${API_URL}/sales/?outletId=${outletId}`;
        if (params?.page) url += `&page=${params.page}`;
        if (params?.pageSize) url += `&pageSize=${params.pageSize}`;
        if (params?.startDate) url += `&startDate=${params.startDate}`;
        if (params?.endDate) url += `&endDate=${params.endDate}`;

        const response = await fetch(url, { headers: getHeaders() });
        if (!response.ok) throw await response.json();
        return response.json();
    },
    getById: async (id: string): Promise<SaleInvoice> => {
        const response = await fetch(`${API_URL}/sales/${id}/`, { headers: getHeaders() });
        if (!response.ok) throw await response.json();
        return response.json();
    },
    getPdf: async (id: string): Promise<null> => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'PDF generation not yet implemented' } };
    },
    createReturn: async (id: string, payload: any): Promise<SaleInvoice> => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Sales returns not yet implemented' } };
    }
};

const realCreditApi = {
    getAccountsList: async (outletId: string, filters?: any) => {
        const response = await fetch(`${API_URL}/credit/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        if (!response.ok) throw await response.json();
        return response.json();
    },
    list: async (outletId: string) => {
        const response = await fetch(`${API_URL}/credit/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        if (!response.ok) throw await response.json();
        const data = await response.json();
        return data.data || [];
    },
    getTransactions: async (accountId: string) => {
        const response = await fetch(`${API_URL}/credit/${accountId}/transactions/`, {
            headers: getHeaders(),
        });
        if (!response.ok) throw await response.json();
        return response.json();
    },
    getLedger: async (accountId: string) => {
        const response = await fetch(`${API_URL}/credit/${accountId}/ledger/`, {
            headers: getHeaders(),
        });
        if (!response.ok) throw await response.json();
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
        if (!response.ok) {
            const error = await response.json();
            throw error;
        }
        return response.json();
    },
    updateCreditLimit: async (accountId: string, newLimit: number) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Credit limit update not yet implemented' } };
    },
    getAgingSummary: async (outletId: string) => {
        const response = await fetch(`${API_URL}/credit/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        if (!response.ok) throw await response.json();
        return response.json();
    },
    sendReminder: async (accountId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Reminder sending not yet implemented' } };
    }
};

const realDashboardApi = {
    getDailySummary: async (outletId: string, date: string): Promise<DashboardKPI> => {
        const response = await fetch(
            `${API_URL}/dashboard/daily/?outletId=${outletId}&date=${date}`,
            { headers: getHeaders() }
        );
        if (!response.ok) throw await response.json();
        return response.json();
    },
    getAlerts: async (outletId: string): Promise<DashboardAlerts> => {
        const response = await fetch(
            `${API_URL}/dashboard/daily/?outletId=${outletId}&date=${new Date().toISOString().split('T')[0]}`,
            { headers: getHeaders() }
        );
        if (!response.ok) throw await response.json();
        const data = await response.json();
        return data.alerts || {};
    }
};

const realStaffApi = {
    list: async (outletId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Staff list not yet implemented' } };
    },
    verifyPin: async (staffId: string, pin: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'PIN verification not yet implemented' } };
    },
    getPerformance: async (staffId: string, startDate: string, endDate: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Performance metrics not yet implemented' } };
    },
    getLeaderboard: async (outletId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Leaderboard not yet implemented' } };
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
        if (!response.ok) throw await response.json();
        return response.json();
    },
    getById: async (id: string): Promise<PurchaseInvoiceFull> => {
        const response = await fetch(`${API_URL}/purchases/${id}/`, { headers: getHeaders() });
        if (!response.ok) throw await response.json();
        return response.json();
    },
    create: async (payload: CreatePurchasePayload): Promise<PurchaseInvoiceFull> => {
        const response = await fetch(`${API_URL}/purchases/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                outlet_id: payload.outletId,
                distributor_id: payload.distributorId,
                invoice_no: payload.invoiceNo,
                invoice_date: payload.invoiceDate,
                due_date: payload.dueDate,
                purchase_type: payload.purchaseType,
                items: payload.items,
                subtotal: payload.subtotal,
                discount_amount: payload.discountAmount,
                gst_amount: payload.gstAmount,
                cess_amount: payload.cessAmount,
                freight: payload.freight,
                round_off: payload.roundOff,
                grand_total: payload.grandTotal,
            }),
        });
        if (!response.ok) throw await response.json();
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
                distributor_id: payload.distributorId,
                date: payload.date,
                total_amount: payload.totalAmount,
                payment_mode: payload.paymentMode,
                allocations: payload.allocations,
                outlet_id: payload.outletId,
            }),
        });
        if (!response.ok) throw await response.json();
        return response.json();
    }
};

const realDistributorsApi = {
    list: async (outletId: string): Promise<any[]> => {
        const response = await fetch(`${API_URL}/purchases/distributors/?outletId=${outletId}`, {
            headers: getHeaders(),
        });
        if (!response.ok) throw await response.json();
        const data = await response.json();
        return data.data || [];
    },
    getById: async (id: string) => {
        const response = await fetch(`${API_URL}/purchases/distributors/${id}/`, {
            headers: getHeaders(),
        });
        if (!response.ok) throw await response.json();
        return response.json();
    },
    getLedger: async (distributorId: string): Promise<DistributorLedgerEntry[]> => {
        const response = await fetch(
            `${API_URL}/purchases/distributors/${distributorId}/ledger/`,
            { headers: getHeaders() }
        );
        if (!response.ok) throw await response.json();
        const data = await response.json();
        return data.data || [];
    },
    create: async (payload: any) => {
        const response = await fetch(`${API_URL}/purchases/distributors/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                outlet_id: payload.outletId,
                name: payload.name,
                gstin: payload.gstin,
                phone: payload.phone,
                email: payload.email,
                address: payload.address,
                city: payload.city,
                state: payload.state,
                credit_days: payload.creditDays,
                opening_balance: payload.openingBalance,
                balance_type: payload.balanceType,
            }),
        });
        if (!response.ok) throw await response.json();
        return response.json();
    },
    update: async (id: string, payload: any) => {
        const response = await fetch(`${API_URL}/purchases/distributors/${id}/`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw await response.json();
        return response.json();
    }
};

const realCustomersApi = {
    list: async (outletId: string, filters?: any): Promise<any[]> => {
        let url = `${API_URL}/customers/?outletId=${outletId}`;
        if (filters?.search) url += `&search=${encodeURIComponent(filters.search)}`;
        if (filters?.page) url += `&page=${filters.page}`;

        const response = await fetch(url, { headers: getHeaders() });
        if (!response.ok) throw await response.json();
        const data = await response.json();
        return data.data || [];
    },
    getById: async (id: string) => {
        const response = await fetch(`${API_URL}/customers/${id}/`, { headers: getHeaders() });
        if (!response.ok) throw await response.json();
        return response.json();
    },
    getPurchaseHistory: async (customerId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Purchase history not yet implemented' } };
    },
    getRefillAlerts: async (customerId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Refill alerts not yet implemented' } };
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
        if (!response.ok) throw await response.json();
        return response.json();
    },
    update: async (id: string, payload: any) => {
        const response = await fetch(`${API_URL}/customers/${id}/`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw await response.json();
        return response.json();
    },
    getDoctors: async (outletId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Doctor list not yet implemented' } };
    }
};

const realAttendanceApi = {
    getMonthlyRecords: async (outletId: string, staffId: string, month: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Monthly records not yet implemented' } };
    },
    getTodayRecords: async (outletId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Today records not yet implemented' } };
    },
    getMonthlySummaries: async (outletId: string, staffId: string, month: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Monthly summaries not yet implemented' } };
    },
    checkIn: async (payload: any): Promise<AttendanceRecord> => {
        const response = await fetch(`${API_URL}/attendance/check-in/`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                outlet_id: payload.outletId,
                staff_id: payload.staffId,
                staff_pin: payload.staffPin,
                type: payload.type,
                selfie_url: payload.selfieUrl,
            }),
        });
        if (!response.ok) throw await response.json();
        return response.json();
    },
    checkOut: async (payload: any): Promise<AttendanceRecord> => {
        return realAttendanceApi.checkIn(payload);
    },
    markManual: async (payload: any) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Manual marking not yet implemented' } };
    }
};

const realReportsApi = {
    getSalesReport: async (outletId: string, filters: any) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Sales report not yet implemented' } };
    },
    getGSTReport: async (outletId: string, filters: any) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'GST report not yet implemented' } };
    },
    getStockValuation: async (outletId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Stock valuation not yet implemented' } };
    },
    getExpiryReport: async (outletId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Expiry report not yet implemented' } };
    },
    getStaffReport: async (outletId: string, filters: any) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Staff report not yet implemented' } };
    },
    getPurchaseReport: async (outletId: string, filters: any) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Purchase report not yet implemented' } };
    }
};

const realAccountsApi = {
    getDistributorOutstanding: async (outletId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Distributor outstanding not yet implemented' } };
    },
    getCustomerOutstanding: async (outletId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Customer outstanding not yet implemented' } };
    },
    getUnpaidInvoices: async (outletId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Unpaid invoices not yet implemented' } };
    },
    createPayment: async (payload: any) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Payment creation not yet implemented' } };
    },
    getPayments: async (outletId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Payments not yet implemented' } };
    },
    createReceipt: async (payload: any) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Receipt creation not yet implemented' } };
    },
    getReceipts: async (outletId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Receipts not yet implemented' } };
    },
    getExpenses: async (outletId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Expenses not yet implemented' } };
    },
    createExpense: async (payload: any) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Expense creation not yet implemented' } };
    },
    getDistributorLedger: async (distributorId: string) => {
        return realDistributorsApi.getLedger(distributorId);
    },
    getCustomerLedger: async (customerId: string) => {
        throw { error: { code: 'NOT_IMPLEMENTED', message: 'Customer ledger not yet implemented' } };
    }
};

// Export conditional APIs based on USE_MOCK flag
export const authApi = USE_MOCK ? mockAuthApi : realAuthApi;
export const productsApi = USE_MOCK ? mockProductsApi : realProductsApi;
export const salesApi = USE_MOCK ? mockSalesApi : realSalesApi;
export const creditApi = USE_MOCK ? mockCreditApi : realCreditApi;
export const dashboardApi = USE_MOCK ? mockDashboardApi : realDashboardApi;
export const staffApi = USE_MOCK ? mockStaffApi : realStaffApi;
export const inventoryApi = USE_MOCK ? mockInventoryApi : realInventoryApi;
export const purchasesApi = USE_MOCK ? mockPurchasesApi : realPurchasesApi;
export const distributorsApi = USE_MOCK ? mockDistributorsApi : realDistributorsApi;
export const customersApi = USE_MOCK ? mockCustomersApi : realCustomersApi;
export const attendanceApi = USE_MOCK ? mockAttendanceApi : realAttendanceApi;
export const reportsApi = USE_MOCK ? mockReportsApi : realReportsApi;
export const accountsApi = USE_MOCK ? mockAccountsApi : realAccountsApi;
