import { create } from 'zustand';
import {
    CartItem,
    StaffPinVerifyResponse,
    Customer,
    Doctor,
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
    doctor: Doctor | null;
    payment: PaymentSplit;
    scheduleHData: ScheduleHData | null;
    prescriptionImageUrl: string | null;
    isCartOpen: boolean;
    searchQuery: string;
    lastInvoice: SaleInvoice | null;

    // Actions
    setActiveStaff: (staff: StaffPinVerifyResponse) => void;
    clearPin: () => void;
    setCustomer: (c: Customer | null) => void;
    setDoctor: (d: Doctor | null) => void;
    addToCart: (item: CartItem) => void;
    removeFromCart: (batchId: string) => void;
    updateCartItem: (batchId: string, updates: Partial<CartItem>) => void;
    applyDiscountToItem: (batchId: string, pct: number) => void;
    clearCart: () => void;
    setPayment: (payment: Partial<PaymentSplit>) => void;
    setScheduleHData: (data: ScheduleHData | null) => void;
    setSearchQuery: (q: string) => void;
    toggleCart: () => void;
    setLastInvoice: (inv: SaleInvoice | null) => void;
    resetBilling: () => void;

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
    doctor: null,
    payment: initialPayment,
    scheduleHData: null,
    prescriptionImageUrl: null,
    isCartOpen: false,
    searchQuery: '',
    lastInvoice: null,
    billsToday: 0,

    setActiveStaff: (staff) => set({ activeStaff: staff, isPinVerified: true }),
    clearPin: () => set({ activeStaff: null, isPinVerified: false }),
    setCustomer: (customer) => set({ customer }),
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

    clearCart: () => set({
        cart: [],
        customer: null,
        doctor: null,
        payment: initialPayment,
        scheduleHData: null,
        prescriptionImageUrl: null
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
        doctor: null,
        payment: initialPayment,
        scheduleHData: null,
        isPinVerified: false,
        activeStaff: null
        // intentionally keeping lastInvoice per requirements
    }),

    getTotals: () => {
        const state = get();
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
            const itemTaxable = gstRate > 0 ? rawTotal / (1 + gstRate / 100) : rawTotal;
            const itemGst = rawTotal - itemTaxable;

            subtotal += (item.mrp * item.totalQty);
            totalRateAmount += rawTotal;
            taxableAmount += itemTaxable;
            cgstAmount += itemGst / 2;
            sgstAmount += itemGst / 2;
            totalQty += item.totalQty;

            if (item.scheduleType === 'H' || item.scheduleType === 'H1' || item.scheduleType === 'X' || item.scheduleType === 'Narcotic') {
                hasScheduleH = true;
            }
            if (item.scheduleType === 'H1' || item.scheduleType === 'X' || item.scheduleType === 'Narcotic') {
                requiresDoctorDetails = true;
            }
        });

        const discountAmount = subtotal - totalRateAmount;
        // ensure grand total uses exact GST matching to taxable
        const exactTotal = taxableAmount + cgstAmount + sgstAmount;
        const grandTotal = Math.round(exactTotal);
        const roundOff = grandTotal - exactTotal;

        const amountPaid = state.payment.amount || 0;
        const amountDue = grandTotal - amountPaid;

        return {
            subtotal,
            discountAmount,
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
            item => item.scheduleType === 'H1' || item.scheduleType === 'X' || item.scheduleType === 'Narcotic'
        );
    },

    cartCount: () => get().cart.length,

    incrementBillsToday: () => set((state) => ({ billsToday: state.billsToday + 1 })),
}));
