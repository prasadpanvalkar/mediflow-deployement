import { z } from 'zod';

export const outletSettingsSchema = z.object({
    outletName: z.string().min(2, 'Name required'),
    outletAddress: z.string().min(5, 'Address required'),
    outletCity: z.string().min(2, 'City required'),
    outletState: z.string().min(2, 'State required'),
    outletPincode: z.string()
        .min(6, 'Must be 6 digits')
        .max(6, 'Must be 6 digits')
        .regex(/^\d{6}$/, 'Invalid pincode'),
    outletPhone: z.string()
        .min(10, 'Must be 10 digits')
        .max(10, 'Must be 10 digits')
        .regex(/^[6-9]\d{9}$/, 'Invalid phone number'),
    outletEmail: z.string()
        .refine(
            (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
            'Invalid email address'
        ),
    outletGstin: z.string()
        .refine(
            (val) => !val || /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(val),
            'Invalid GSTIN format'
        ),
    outletDrugLicenseNo: z.string().min(3, 'Drug license number required'),
    invoiceFooter: z.string().max(120, 'Max 120 characters'),
    invoiceHeader: z.string().max(80, 'Max 80 characters'),
});

export const gstSettingsSchema = z.object({
    gstType: z.enum(['intrastate', 'interstate']),
    enableGST: z.boolean(),
    defaultGSTRate: z.number().min(0).max(28),
    roundOffInvoice: z.boolean(),
    showGSTBreakup: z.boolean(),
    // outletStateCode is no longer a form field — it is derived automatically
    // from outletState by settingsStore.updateOutletSettings (M9).
});

export const printerSettingsSchema = z.object({
    printerType: z.enum(['a4', 'thermal', 'thermal_80mm']),
    thermalWidth: z.enum(['58mm', '80mm']),
    autoPrintAfterBill: z.boolean(),
    printCopies: z.number().int().min(1).max(3),
    showMRPOnInvoice: z.boolean(),
    showBatchOnInvoice: z.boolean(),
    showDoctorOnInvoice: z.boolean(),
});

export const billingSettingsSchema = z.object({
    defaultDiscountPct: z.number().min(0).max(30),
    allowNegativeStock: z.boolean(),
    requirePinForEveryBill: z.boolean(),
    pinSessionTimeoutMins: z.number().int().min(5).max(480),
    enableLooseTablets: z.boolean(),
    enableCreditSales: z.boolean(),
    creditWarningThresholdPct: z.number().min(50).max(100),
    enableWhatsAppReceipt: z.boolean(),
});

export const attendanceSettingsSchema = z.object({
    attendanceGraceMinutes: z.number().int().min(0).max(60),
    kioskPhotoCapture: z.boolean(),
    kioskAutoResetSeconds: z.number().int().min(3).max(30),
    enableAttendance: z.boolean(),
    workingHoursPerDay: z.number().min(4).max(12),
});

export const notificationSettingsSchema = z.object({
    notifyLowStock: z.boolean(),
    lowStockThreshold: z.number().int().min(1).max(100),
    notifyExpiryDays: z.number().int().min(7).max(365),
    notifyOverdueCredit: z.boolean(),
    notifyRefillDue: z.boolean(),
    whatsappNotifications: z.boolean(),
});

export type OutletSettingsFormValues = z.infer<typeof outletSettingsSchema>;
export type GSTSettingsFormValues = z.infer<typeof gstSettingsSchema>;
export type PrinterSettingsFormValues = z.infer<typeof printerSettingsSchema>;
export type BillingSettingsFormValues = z.infer<typeof billingSettingsSchema>;
export type AttendanceSettingsFormValues = z.infer<typeof attendanceSettingsSchema>;
export type NotificationSettingsFormValues = z.infer<typeof notificationSettingsSchema>;
