import { create } from 'zustand';
import {
    CartItem,
    StaffPinVerifyResponse,
    Customer,
    Doctor,
    Ledger,
    PaymentSplit,
    ScheduleHData,
    BillTotals,
    SaleInvoice
} from '../types';

interface BillingState {
    cart: CartItem[];
    activeStaff: StaffPinVerifyResponse | null;
    isPinVerified: boolean;
    customer: Customer | null;
    customerLedger: Ledger | null;
    doctor: Doctor | null;
    payment: PaymentSplit;
    scheduleHData: ScheduleHData | null;
    prescriptionImageUrl: string | null;
    isCartOpen: boolean;
    searchQuery: string;
    lastInvoice: SaleInvoice | null;

    extraDiscountPct: number;

    // Actions
    setActiveStaff: (staff: StaffPinVerifyResponse) => void;
    clearPin: () => void;
    setCustomer: (c: Customer | null) => void;
    setCustomerLedger: (l: Ledger | null) => void;
    setDoctor: (d: Doctor | null) => void;
    addToCart: (item: CartItem) => void;
    removeFromCart: (batchId: string) => void;
    updateCartItem: (batchId: string, updates: Partial<CartItem>) => void;
    applyDiscountToItem: (batchId: string, pct: number) => void;
    setExtraDiscountPct: (pct: number) => void;
    clearCart: () => void;
    setPayment: (payment: Partial<PaymentSplit>) => void;
    setScheduleHData: (data: ScheduleHData | null) => void;
    setSearchQuery: (q: string) => void;
    toggleCart: () => void;
    setLastInvoice: (inv: SaleInvoice | null) => void;
    resetBilling: () => void;

    backendRateErrors: Record<string, string>;
    setBackendRateError: (batchId: string, errorMsg: string) => void;
    clearBackendRateError: (batchId: string) => void;
    clearAllBackendRateErrors: () => void;

    // Computed (get values as functions)
    getTotals: () => BillTotals;
    hasScheduleHItems: () => boolean;
    cartCount: () => number;

    // Session bill counter (resets on page reload, not persisted)
    billsToday: number;
    incrementBillsToday: () => void;
}

const initialPayment: PaymentSplit = {
    method: 'cash',
    amount: 0,
    cashTendered: 0,
    cashReturned: 0
};

export const useBillingStore = create<BillingState>((set, get) => ({
    cart: [],
    activeStaff: null,
    isPinVerified: false,
    customer: null,
    customerLedger: null,
    doctor: null,
    payment: initialPayment,
    scheduleHData: null,
    prescriptionImageUrl: null,
    isCartOpen: false,
    searchQuery: '',
    lastInvoice: null,
    billsToday: 0,
    extraDiscountPct: 0,
    backendRateErrors: {},

    setBackendRateError: (batchId, errorMsg) => set((state) => ({
        backendRateErrors: { ...state.backendRateErrors, [batchId]: errorMsg }
    })),
    clearBackendRateError: (batchId) => set((state) => {
        const { [batchId]: _, ...rest } = state.backendRateErrors;
        return { backendRateErrors: rest };
    }),
    clearAllBackendRateErrors: () => set({ backendRateErrors: {} }),

    setActiveStaff: (staff) => set({ activeStaff: staff, isPinVerified: true }),
    clearPin: () => set({ activeStaff: null, isPinVerified: false }),
    setCustomer: (customer) => set({ customer }),
    setCustomerLedger: (customerLedger) => set({ customerLedger }),
    setDoctor: (doctor) => set({ doctor }),

    addToCart: (item) => set((state) => {
        const existingIndex = state.cart.findIndex(i => i.batchId === item.batchId);
        if (existingIndex >= 0) {
            const newCart = [...state.cart];
            newCart[existingIndex] = {
                ...newCart[existingIndex],
                ...item,
                totalQty: item.totalQty
            };
            return { cart: newCart };
        }
        return { cart: [...state.cart, item] };
    }),

    removeFromCart: (batchId) => set((state) => ({
        cart: state.cart.filter((item) => item.batchId !== batchId)
    })),

    updateCartItem: (batchId, updates) => set((state) => ({
        cart: state.cart.map((item) =>
            item.batchId === batchId ? { ...item, ...updates } : item
        )
    })),

    applyDiscountToItem: (batchId, discountPct) => set((state) => ({
        cart: state.cart.map((item) => {
            if (item.batchId === batchId) {
                // Recalculate based on discount pct
                const discountedRate = (item.saleRate ?? item.mrp) * (1 - discountPct / 100);
                return {
                    ...item,
                    discountPct,
                    rate: discountedRate
                };
            }
            return item;
        })
    })),

    setExtraDiscountPct: (pct) => set({ extraDiscountPct: Math.max(0, Math.min(100, pct)) }),

    clearCart: () => set({
        cart: [],   
        customer: null,
        customerLedger: null,
        doctor: null,
        payment: initialPayment,
        scheduleHData: null,
        prescriptionImageUrl: null,
        extraDiscountPct: 0,
    }),

    setPayment: (updates) => set((state) => ({
        payment: { ...state.payment, ...updates }
    })),

    setScheduleHData: (data) => set({ scheduleHData: data }),

    setSearchQuery: (q) => set({ searchQuery: q }),
    toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
    setLastInvoice: (inv) => set({ lastInvoice: inv }),
    resetBilling: () => set({
        cart: [],
        customer: null,
        customerLedger: null,
        doctor: null,
        payment: initialPayment,
        scheduleHData: null,
        isPinVerified: false,
        activeStaff: null,
        extraDiscountPct: 0,
        lastInvoice: null,
        // intentionally keeping lastInvoice per requirements
    }),

    getTotals: () => {
        const state = get();
        const extraDiscPct = state.extraDiscountPct || 0;
        // C2 fix: discount factor applied per-item BEFORE GST extraction
        const discountFactor = extraDiscPct > 0 ? 1 - extraDiscPct / 100 : 1;

        let subtotal = 0;
        let totalRateAmount = 0;
        let taxableAmount = 0;
        let cgstAmount = 0;
        let sgstAmount = 0;
        let totalQty = 0;
        let hasScheduleH = false;
        let requiresDoctorDetails = false;

        state.cart.forEach(item => {
            const rawTotal = item.rate * item.totalQty;
            const gstRate = item.gstRate || 0;

            subtotal += item.mrp * item.totalQty;
            totalRateAmount += rawTotal;
            totalQty += item.totalQty;

            // Apply extra discount to this item BEFORE extracting GST
            const discountedTotal = rawTotal * discountFactor;

            // Backward GST extraction from GST-inclusive discounted amount
            // Quantize itemTaxable to 2 decimals BEFORE computing itemGst
            // so the floor-based CGST/SGST split matches the backend exactly.
            const itemTaxable = gstRate > 0
                ? Number((discountedTotal / (1 + gstRate / 100)).toFixed(2))
                : Number(discountedTotal.toFixed(2));
            const itemGst = Number((discountedTotal - itemTaxable).toFixed(2));

            taxableAmount += itemTaxable;

            // H8 fix: floor-based split guarantees CGST + SGST = itemGst exactly
            const itemCgst = Math.floor(itemGst * 100 / 2) / 100;
            const itemSgst = Number((itemGst - itemCgst).toFixed(2));
            cgstAmount += itemCgst;
            sgstAmount += itemSgst;

            if (['G', 'H', 'H1', 'X', 'C', 'Narcotic'].includes(item.scheduleType)) {
                hasScheduleH = true;
                requiresDoctorDetails = true;
            }
        });

        const discountAmount = subtotal - totalRateAmount;
        const extraDiscountAmount = totalRateAmount * extraDiscPct / 100;

        const exactTotal = taxableAmount + cgstAmount + sgstAmount;
        const grandTotal = Math.round(exactTotal);
        const roundOff = grandTotal - exactTotal;

        const amountPaid = state.payment.amount || 0;
        const amountDue = grandTotal - amountPaid;

        return {
            subtotal,
            discountAmount,
            extraDiscountAmount,
            taxableAmount,
            cgstAmount,
            sgstAmount,
            cgst: cgstAmount,
            sgst: sgstAmount,
            igst: 0,
            roundOff,
            grandTotal,
            amountPaid,
            amountDue,
            itemCount: state.cart.length,
            totalQty,
            hasScheduleH,
            requiresDoctorDetails
        };
    },

    hasScheduleHItems: () => {
        const state = get();
        return state.cart.some(
            item => ['H1', 'X', 'C', 'Narcotic'].includes(item.scheduleType)
        );
    },

    cartCount: () => get().cart.length,

    incrementBillsToday: () => set((state) => ({ billsToday: state.billsToday + 1 })),
}));
