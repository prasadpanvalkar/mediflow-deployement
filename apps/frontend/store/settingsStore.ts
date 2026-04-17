import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
    OutletSettings, GSTSettings, PrinterSettings, BillingSettings,
    AttendanceSettings, NotificationSettings, AppPreferences,
} from '../types';
import { STATE_CODES } from '@mediflow/constants';

const DEFAULT_OUTLET: OutletSettings = {
    outletName: '',
    outletAddress: '',
    outletCity: '',
    outletState: 'Maharashtra',
    outletPincode: '',
    outletPhone: '',
    outletEmail: '',
    outletGstin: '',
    outletDrugLicenseNo: '',
    outletLogoUrl: null,
    invoiceFooter: 'Thank you for your purchase!',
    invoiceHeader: '',
};

const DEFAULT_GST: GSTSettings = {
    gstType: 'intrastate',
    enableGST: true,
    defaultGSTRate: 12,
    roundOffInvoice: true,
    showGSTBreakup: true,
    outletStateCode: '27',
};

const DEFAULT_PRINTER: PrinterSettings = {
    printerType: 'a4',
    thermalWidth: '80mm',
    autoPrintAfterBill: false,
    printCopies: 1,
    showMRPOnInvoice: true,
    showBatchOnInvoice: true,
    showDoctorOnInvoice: true,
};

const DEFAULT_BILLING: BillingSettings = {
    defaultDiscountPct: 0,
    allowNegativeStock: false,
    requirePinForEveryBill: true,
    pinSessionTimeoutMins: 30,
    enableLooseTablets: true,
    enableCreditSales: true,
    creditWarningThresholdPct: 80,
    enableWhatsAppReceipt: true,
};

const DEFAULT_ATTENDANCE: AttendanceSettings = {
    attendanceGraceMinutes: 10,
    kioskPhotoCapture: true,
    kioskAutoResetSeconds: 5,
    enableAttendance: true,
    workingHoursPerDay: 8,
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
    notifyLowStock: true,
    lowStockThreshold: 10,
    notifyExpiryDays: 90,
    notifyOverdueCredit: true,
    notifyRefillDue: true,
    whatsappNotifications: false,
};

const DEFAULT_PREFERENCES: AppPreferences = {
    theme: 'light',
    language: 'en',
    dateFormat: 'dd/MM/yyyy',
    compactMode: false,
    sidebarCollapsed: false,
};

interface SettingsState extends
    OutletSettings,
    GSTSettings,
    PrinterSettings,
    BillingSettings,
    AttendanceSettings,
    NotificationSettings,
    AppPreferences {
    // Legacy fields kept for backward compatibility
    selectedOutletId: string | null;
    isSidebarCollapsed: boolean;

    // Legacy actions (preserved for backward compat)
    setOutletId: (id: string) => void;
    toggleSidebar: () => void;
    setSidebarCollapsed: (v: boolean) => void;
    setPrinterType: (t: 'a4' | 'thermal' | 'thermal_80mm') => void;
    setKioskPhotoCapture: (v: boolean) => void;
    setKioskAutoResetSeconds: (v: number) => void;
    setAttendanceGraceMinutes: (v: number) => void;

    // Grouped update actions
    updateOutletSettings: (data: Partial<OutletSettings>) => void;
    updateGSTSettings: (data: Partial<GSTSettings>) => void;
    updatePrinterSettings: (data: Partial<PrinterSettings>) => void;
    updateBillingSettings: (data: Partial<BillingSettings>) => void;
    updateAttendanceSettings: (data: Partial<AttendanceSettings>) => void;
    updateNotificationSettings: (data: Partial<NotificationSettings>) => void;
    updatePreferences: (data: Partial<AppPreferences>) => void;
    resetToDefaults: () => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            // Legacy
            selectedOutletId: null,
            isSidebarCollapsed: false,

            // Outlet
            ...DEFAULT_OUTLET,

            // GST
            ...DEFAULT_GST,

            // Printer
            ...DEFAULT_PRINTER,

            // Billing
            ...DEFAULT_BILLING,

            // Attendance
            ...DEFAULT_ATTENDANCE,

            // Notifications
            ...DEFAULT_NOTIFICATIONS,

            // Preferences
            ...DEFAULT_PREFERENCES,

            // ── Legacy actions ────────────────────────────────────────
            setOutletId: (id) => set({ selectedOutletId: id }),
            toggleSidebar: () =>
                set((s) => ({
                    isSidebarCollapsed: !s.isSidebarCollapsed,
                    sidebarCollapsed: !s.isSidebarCollapsed,
                })),
            setSidebarCollapsed: (v) =>
                set({ isSidebarCollapsed: v, sidebarCollapsed: v }),
            setPrinterType: (t) => set({ printerType: t }),
            setKioskPhotoCapture: (v) => set({ kioskPhotoCapture: v }),
            setKioskAutoResetSeconds: (v) => set({ kioskAutoResetSeconds: v }),
            setAttendanceGraceMinutes: (v) => set({ attendanceGraceMinutes: v }),

            // ── Grouped actions ───────────────────────────────────────
            updateOutletSettings: (data) => {
                // M9: whenever outletState changes, re-derive outletStateCode
                // so the two values never drift out of sync.
                const extra: Partial<SettingsState> = {};
                if (data.outletState !== undefined) {
                    extra.outletStateCode = STATE_CODES[data.outletState] ?? '';
                }
                set({ ...data, ...extra });
            },
            updateGSTSettings: (data) => set(data),
            updatePrinterSettings: (data) => set(data),
            updateBillingSettings: (data) => set(data),
            updateAttendanceSettings: (data) => set(data),
            updateNotificationSettings: (data) => set(data),
            updatePreferences: (data) => {
                // Sync sidebarCollapsed → isSidebarCollapsed
                const extra: Partial<SettingsState> = {};
                if (data.sidebarCollapsed !== undefined) {
                    extra.isSidebarCollapsed = data.sidebarCollapsed;
                }
                set({ ...data, ...extra });
            },
            resetToDefaults: () =>
                set({
                    ...DEFAULT_OUTLET,
                    ...DEFAULT_GST,
                    ...DEFAULT_PRINTER,
                    ...DEFAULT_BILLING,
                    ...DEFAULT_ATTENDANCE,
                    ...DEFAULT_NOTIFICATIONS,
                    ...DEFAULT_PREFERENCES,
                    isSidebarCollapsed: false,
                }),
        }),
        {
            name: 'mediflow-settings',
            skipHydration: true,
            version: 3,
            migrate: (state: any, v: number) => {
                if (v < 2) {
                    if (state.printerType === 'thermal_80mm') {
                        state.printerType = 'thermal'
                        state.thermalWidth = '80mm'
                    }
                    if (state.printerType === 'thermal_57mm') {
                        state.printerType = 'thermal'
                        state.thermalWidth = '58mm'
                    }
                }
                if (v < 3) {
                    // M9: re-derive outletStateCode from outletState to fix
                    // any persisted data where the two values drifted apart.
                    if (state.outletState) {
                        state.outletStateCode = STATE_CODES[state.outletState] ?? state.outletStateCode ?? '27'
                    }
                }
                return state
            },
        }
    )
);
