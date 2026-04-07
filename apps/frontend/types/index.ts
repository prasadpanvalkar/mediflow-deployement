// ─── Enums / Union Types ──────────────────────────────────────────────────────

export type StaffRole =
    | 'super_admin'
    | 'admin'
    | 'manager'
    | 'billing_staff'
    | 'view_only';

export type DrugSchedule =
  | 'OTC'
  | 'G'
  | 'H'
  | 'H1'
  | 'X'
  | 'C'
  | 'Narcotic'
  | 'Ayurvedic'
  | 'Surgical'
  | 'Cosmetic'
  | 'Veterinary';
export type DrugType = 'allopathy' | 'ayurveda' | 'homeo' | 'fmcg';
export type PaymentMode = 'cash' | 'upi' | 'card' | 'credit' | 'split' | 'ledger' | 'cheque' | 'bank_transfer';
export type SaleMode = 'strip' | 'loose' | 'bottle';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'holiday' | 'weekly_off';
export type PurchaseType = 'cash' | 'credit';
export type GodownLocation = 'main' | 'cold_storage' | 'secondary';
export type CreditStatus = 'active' | 'partial' | 'cleared' | 'overdue';
export type AgingBucket = 'current' | '30-60' | '60-90' | 'over90';
export type ReportPeriod =
    | 'today'
    | 'yesterday'
    | 'this_week'
    | 'last_week'
    | 'this_month'
    | 'last_month'
    | 'this_year'
    | 'custom';

// ─── API Wrappers ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
    data: T;
    meta: { timestamp: string; version: string };
}

export interface ApiError {
    error: {
        code: string;
        message: string;
        details?: Record<string, string[]>;
    };
}

export interface PaginatedResponse<T> {
    data: T[];
    analytics?: {
        totalRevenue: number;
        totalCost: number;
        totalProfit: number;
        totalDiscount: number;
        totalBills: number;
        cashCollected: number;
        upiCollected: number;
        cardCollected: number;
        creditGiven: number;
        customerOutstanding?: number | null;
    };
    pagination: {
        page: number;
        pageSize: number;
        totalPages: number;
        totalRecords: number;
    };
}

// ─── Organization & Outlet ────────────────────────────────────────────────────

export interface Organization {
    id: string;
    name: string;
    slug: string;
    plan: 'starter' | 'pro' | 'enterprise';
    isActive: boolean;
    createdAt: string;
}

export interface Outlet {
    id: string;
    organizationId: string;
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    gstin: string;
    drugLicenseNo: string;
    phone: string;
    logoUrl?: string;
    invoiceFooter?: string;
    isActive: boolean;
    createdAt: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
    id: string;
    name: string;
    phone: string;
    role: StaffRole;
    staffPin?: string;
    outletId: string;
    organizationId?: string;
    isSuperAdmin?: boolean;
    outlet: Outlet;
    avatarUrl?: string;
    maxDiscount: number;
    canEditRate: boolean;
    canViewPurchaseRates: boolean;
    canCreatePurchases: boolean;
    canAccessReports: boolean;
}

export interface LoginPayload {
    phone: string;
    password: string;
}

export interface AuthResponse {
    access: string;
    refresh: string;
    user: AuthUser;
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export interface StaffMember {
    id: string;
    outletId: string;
    name: string;
    phone: string;
    role: StaffRole;
    staffPin?: string;
    avatarUrl?: string;
    maxDiscount: number;
    canEditRate: boolean;
    canViewPurchaseRates: boolean;
    canCreatePurchases: boolean;
    canAccessReports: boolean;
    isActive: boolean;
    joiningDate: string;
    lastLogin?: string;
}

export interface StaffPinVerifyResponse {
    id: string;
    name: string;
    role: StaffRole;
    staffPin?: string;
    maxDiscount: number;
    canEditRate: boolean;
    canViewPurchaseRates?: boolean;
    billsToday: number;
    totalSalesToday: number;
}

export interface StaffPerformance {
    billsCount: number;
    totalSales: number;
    avgBillValue: number;
    topSellingItems: { name: string; qty: number; revenue: number }[];
    hourlyActivity: { hour: number; bills: number; sales: number }[];
}

// ─── Products ─────────────────────────────────────────────────────────────────

export interface MasterProduct {
    id: string;
    name: string;
    composition: string;
    manufacturer: string;
    category: string;
    drugType: DrugType;
    scheduleType: DrugSchedule;
    hsnCode: string;
    gstRate: number;
    packSize: number;
    packUnit: string;
    packType: string;
    barcode?: string;
    isFridge: boolean;
    isDiscontinued: boolean;
    imageUrl?: string;
    mrp: number;
    saleRate: number;
    currentStock?: number;
}

export interface CreateProductPayload {
    name: string;
    composition?: string;
    manufacturer?: string;
    hsnCode: string;
    gstRate: number;
    packSize: number;
    packUnit: string;
    scheduleType: string;
    mrp: number;
    saleRate: number;
}

export interface Batch {
    id: string;
    outletId: string;
    outletProductId: string;
    batchNo: string;
    mfgDate?: string;
    expiryDate: string;
    mrp: number;
    purchaseRate: number;
    saleRate: number;
    qtyStrips: number;
    qtyLoose: number;
    rackLocation?: string;
    isActive: boolean;
    createdAt: string;
}

export interface ProductSearchResult extends MasterProduct {
    outletProductId: string;
    totalStock: number;
    nearestExpiry: string;
    isLowStock: boolean;
    batches: Batch[];
}

// ─── Customer & Doctor ────────────────────────────────────────────────────────

export interface Customer {
    id: string;
    outletId: string;
    name: string;
    phone: string;
    address?: string;
    dob?: string;
    gstin?: string;
    fixedDiscount: number;
    creditLimit: number;
    outstanding: number;
    totalPurchases: number;
    isChronic: boolean;
    isActive?: boolean;
    createdAt: string;
}

export interface Doctor {
    id: string;
    outletId: string;
    name: string;
    phone: string;
    regNo: string;
    degree?: string;
    qualification?: string;
    specialty?: string;
    hospitalName?: string;
    address?: string;
    isActive: boolean;
}

export interface RegularMedicine {
    productId: string;
    name: string;
    qty: number;
    frequency: 'Daily' | 'Weekly' | 'Monthly';
}

export interface CustomerFull extends Customer {
    bloodGroup?: string;
    allergies: string[];
    chronicConditions: string[];
    preferredDoctorId?: string;
    preferredDoctor?: Doctor;
    regularMedicines: RegularMedicine[];
    lastRefillDate?: string;
    nextRefillDue?: string;
    totalVisits: number;
    notes?: string;
}

export interface CustomerPurchaseSummary {
    invoiceId: string;
    date: string;
    total: number;
    items: number;
    billedBy: string;
    paymentMode: PaymentMode;
}

export interface CustomerFilters {
    search?: string;
    isChronic?: boolean;
    hasOutstanding?: boolean;
    sortBy?: 'name' | 'totalPurchases' | 'lastVisit' | 'outstanding' | 'nextRefill';
    sortOrder?: 'asc' | 'desc';
}

export interface RefillAlert {
    customer: CustomerFull;
    medicines: RegularMedicine[];
    daysOverdue: number;
    nextRefillDue: string;
}

// ─── Cart & Billing ───────────────────────────────────────────────────────────

export interface CartItem {
    batchId: string;
    productId: string;
    name: string;
    composition?: string;
    manufacturer?: string;
    packSize: number;
    packUnit: string;
    requiresPrescription?: boolean;
    batchNo: string;
    expiryDate: string;
    scheduleType: DrugSchedule;
    mrp: number;
    saleRate?: number;
    rate: number;
    qtyStrips: number;
    qtyLoose: number;
    totalQty: number;
    saleMode: SaleMode;
    discountPct: number;
    gstRate: number;
    taxableAmount: number;
    gstAmount: number;
    totalAmount: number;
    purchaseRate?: number;
}

export interface PaymentSplit {
    method: PaymentMode;
    amount: number;
    cashTendered?: number;
    cashReturned?: number;
    upiRef?: string;
    cardLast4?: string;
    cardType?: string;
    creditGiven?: number;
    splitBreakdown?: {
        cash: number;
        upi: number;
        card: number;
        credit: number;
    };
    ledgerNote?: string;
    ledgerCustomerId?: string | null;
}

export interface BillTotals {
    subtotal: number;
    discountAmount: number;
    extraDiscountAmount: number;
    taxableAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    roundOff: number;
    grandTotal: number;
    amountPaid: number;
    amountDue: number;
    itemCount: number;
    totalQty: number;
    hasScheduleH: boolean;
    requiresDoctorDetails: boolean;
}

export interface ScheduleHData {
    patientName: string;
    patientAge: number;
    patientAddress: string;
    doctorName: string;
    doctorRegNo: string;
    prescriptionNo: string;
}

export interface SaleInvoice {
    id: string;
    outletId: string;
    invoiceNo: string;
    invoiceDate: string;
    customerId?: string;
    customer?: Customer;
    doctorId?: string;
    subtotal: number;
    discountAmount: number;
    taxableAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    roundOff: number;
    grandTotal: number;
    paymentMode: PaymentMode;
    cashPaid: number;
    upiPaid: number;
    cardPaid: number;
    creditGiven: number;
    amountPaid: number;
    amountDue: number;
    isReturn: boolean;
    billedBy: string;
    billedByName: string;
    items: CartItem[];
    createdAt: string;
    doctorName?: string;
    doctorRegNo?: string;
    doctorDegree?: string;
    doctorSpecialty?: string;
    doctorHospitalName?: string;
    doctorAddress?: string;
    doctorQualification?: string;
    patientName?: string;
    patientAddress?: string;
    prescriptionNo?: string;
}

export interface SaleInvoiceSummary {
    id: string;
    invoiceNo: string;
    invoiceDate: string;
    grandTotal: number;
    amountPaid: number;
    amountDue: number;
    paymentMode: 'cash' | 'upi' | 'card' | 'credit' | 'split';
    isReturn: boolean;
    itemsCount: number;
    billedByName?: string;
}

export interface SaleItemDetail {
    id: string;
    productName: string;
    qtyStrips: number;
    qtyLoose: number;
    totalQty: number;
    rate: number;
    discountPct: number;
    totalAmount: number;
    packSize?: number;
    packUnit?: string;
    batchNo?: string;
    expiryDate?: string;
    gstRate?: number;
}

// ─── Credit ───────────────────────────────────────────────────────────────────

export interface CreditAccount {
    id: string;
    customerId: string;
    customer: Customer;
    outletId: string;
    creditLimit: number;
    totalOutstanding: number;
    totalBorrowed: number;
    totalRepaid: number;
    status: CreditStatus;
    lastTransactionDate?: string;
    createdAt: string;
}

export interface CreditTransaction {
    id: string;
    creditAccountId: string;
    customerId: string;
    invoiceId?: string;
    type: 'debit' | 'credit';
    amount: number;
    description: string;
    balanceAfter: number;
    recordedBy: string;
    createdAt: string;
    date?: string;
}

export interface CreditAgingSummary {
    current: { count: number; amount: number };
    days30to60: { count: number; amount: number };
    days60to90: { count: number; amount: number };
    over90: { count: number; amount: number };
    totalOverdue: { count: number; amount: number };
    totalOutstanding: { count: number; amount: number };
}

export interface RecordCreditPaymentPayload {
    amount: number;
    mode: PaymentMode;
    reference?: string;
    notes?: string;
    paymentDate: string;
}

// ─── Distributor ──────────────────────────────────────────────────────────────

export interface Distributor {
    id: string;
    outletId: string;
    name: string;
    gstin?: string;
    drugLicenseNo?: string;
    foodLicenseNo?: string;
    phone: string;
    email?: string;
    address: string;
    city: string;
    state: string;
    creditDays: number;
    openingBalance?: number;
    currentBalance?: number;
    balanceType?: 'CR' | 'DR';
    isActive: boolean;
}

export interface DistributorLedgerEntry {
    id: string;
    date: string;
    type: 'purchase' | 'payment';
    invoiceNo: string;
    amount: number;
    balanceAfter: number;
    description: string;
}

// ─── Purchase Item Form Data (UI-only) ────────────────────────────────────────

export interface PurchaseItemFormData {
    productId: string;
    productName: string;
    isCustom: boolean;
    hsnCode: string;
    batchNo: string;
    expiryDate: string;
    pkg: number;
    qty: number;
    freeQty: number;
    purchaseRate: number;
    discountPct: number;
    cashDiscountPct: number;
    gstRate: number;
    cess: number;
    mrp: number;
    ptr: number;
    pts: number;
    saleRate: number;
}

// ─── Purchase Item ────────────────────────────────────────────────────────────

export interface PurchaseItem {
    id: string;
    purchaseId: string;
    masterProductId: string | null;
    customProductName: string | null;
    isCustomProduct: boolean;
    product?: MasterProduct;        // joined on read, omitted on write

    // Identification
    hsnCode?: string;               // GST/GSTR-2 compliance
    batchNo: string;
    expiryDate: string;             // yyyy-MM-dd

    // Quantity
    pkg: number;                    // pack size (e.g. 10 tabs/strip)
    qty: number;                    // number of packs purchased
    actualQty: number;              // pkg × qty — units added to inventory
    freeQty: number;

    // Pricing
    purchaseRate: number;
    discountPct: number;            // trade discount %
    cashDiscountPct: number;        // CD / cash discount %
    gstRate: number;
    cess: number;                   // cess % (special category items)
    mrp: number;
    ptr: number;                    // Price to Retailer
    pts: number;                    // Price to Stockist
    saleRate: number;

    // Computed amounts (stored for reporting / audit)
    taxableAmount: number;
    gstAmount: number;
    cessAmount: number;
    totalAmount: number;
}

// ─── Purchase Invoice ─────────────────────────────────────────────────────────

export interface PurchaseInvoice {
    id: string;
    outletId: string;
    distributorId: string;
    distributor?: Distributor;      // joined on read

    invoiceNo: string;
    invoiceDate: string;            // yyyy-MM-dd
    dueDate?: string;               // undefined for cash purchases

    // Bill amounts
    subtotal: number;               // goods value = sum(qty × pkg × rate)
    discountAmount: number;         // trade discount + cash discount combined
    taxableAmount: number;          // subtotal − discountAmount
    gstAmount: number;              // total SGST+CGST or IGST
    cessAmount: number;             // cess on applicable items
    freight: number;                // transport / freight charges
    roundOff: number;               // penny rounding (±)
    grandTotal: number;             // taxable + gst + cess + freight + roundOff

    // Payment
    amountPaid: number;
    outstanding: number;            // grandTotal − amountPaid

    createdAt: string;
}

// ─── Purchase Invoice Full (with relations) ───────────────────────────────────

export interface PurchaseInvoiceFull extends PurchaseInvoice {
    items: PurchaseItem[];
    createdByName: string;
    purchaseType: PurchaseType;
    purchaseOrderRef?: string;
    godown: GodownLocation | string; // string fallback for custom godowns
    notes?: string;
}

// ─── Purchase Payloads ────────────────────────────────────────────────────────

export interface CreatePurchaseItemPayload {
    masterProductId: string | null;
    customProductName: string | null;
    isCustomProduct: boolean;
    hsnCode?: string;
    batchNo: string;
    expiryDate: string;
    pkg: number;
    qty: number;
    actualQty: number;              // pkg × qty — pre-computed on client
    freeQty: number;
    purchaseRate: number;
    discountPct: number;
    cashDiscountPct: number;
    gstRate: number;
    cess: number;
    mrp: number;
    ptr: number;
    pts: number;
    saleRate: number;
    taxableAmount: number;
    gstAmount: number;
    cessAmount: number;
    totalAmount: number;
}

export interface CreatePurchasePayload {
    outletId: string;
    partyLedgerId: string;
    purchaseType: PurchaseType;
    invoiceNo: string;
    invoiceDate: string;
    dueDate?: string;
    purchaseOrderRef?: string;
    godown?: GodownLocation | string;
    freight: number;
    notes?: string;

    // Bill-level totals (pre-computed on client, stored as-is)
    subtotal: number;
    discountAmount: number;
    taxableAmount: number;
    gstAmount: number;
    cessAmount: number;
    roundOff: number;
    ledgerAdjustment: number;
    ledgerNote?: string;
    grandTotal: number;

    items: CreatePurchaseItemPayload[];
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface AttendanceRecord {
    id: string;
    staffId: string;
    staff?: StaffMember;
    outletId: string;
    date: string;
    checkInTime?: string;
    checkInPhotoUrl?: string;
    checkInPhoto?: string;
    checkOutTime?: string;
    checkOutPhotoUrl?: string;
    checkOutPhoto?: string;
    workingHours?: number;
    status: AttendanceStatus;
    isLate: boolean;
    lateByMinutes?: number;
    earlyLeaveMinutes?: number;
    notes?: string;
    markedBy?: string;
}

export interface AttendanceSummary {
    staffId: string;
    staffName: string;
    month: number;
    year: number;
    totalWorkingDays: number;
    presentDays: number;
    absentDays: number;
    lateDays: number;
    halfDays: number;
    totalHoursWorked: number;
    avgCheckInTime: string;
    attendancePct: number;
}

export interface KioskCheckPayload {
    staffId: string;
    type: 'check_in' | 'check_out';
    photoBase64?: string;
    outletId: string;
}

export interface MonthlyAttendanceFilter {
    staffId?: string;
    month: number;
    year: number;
    outletId: string;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardKPI {
    date: string;
    totalSales: number;
    totalBills: number;
    cashCollected: number;
    upiCollected: number;
    cardCollected: number;
    creditGiven: number;
    totalDiscount: number;
    totalGst: number;
    topSellingItems: {
        name: string;
        qty: number;
        revenue: number;
    }[];
    staffLeaderboard: {
        staffId: string;
        id?: string;
        name: string;
        role?: StaffRole;
        avatarUrl?: string;
        billsCount: number;
        totalSales: number;
    }[];
    hourlySales: {
        hour: string;
        bills: number;
        sales: number;
    }[];
    paymentBreakdown: {
        cash: number;
        upi: number;
        card: number;
        credit: number;
    };
}

export interface DashboardAlerts {
    lowStock: {
        batch: { productName: string; batchNumber: string; expiryDate: string };
        currentStock: number;
        reorderLevel: number;
    }[];
    expiringSoon: {
        batch: { productName: string; batchNumber: string; expiryDate: string };
        daysUntilExpiry: number;
    }[];
    overdueAccounts: {
        customerId: string;
        customerName: string;
        outstandingAmount: number;
        daysOverdue: number;
    }[];
}

// ─── Stock ────────────────────────────────────────────────────────────────────

export interface StockFilters {
    search?: string;
    scheduleType?: DrugSchedule | 'all';
    lowStock?: boolean;
    expiringSoon?: boolean;
    category?: string;
    manufacturer?: string;
    sortBy?: 'name' | 'stock' | 'expiry' | 'mrp';
    sortOrder?: 'asc' | 'desc';
}

export interface StockAdjustmentPayload {
    batchId: string;
    adjustmentType: 'damage' | 'theft' | 'correction' | 'return_from_patient';
    qtyChange: number;
    reason: string;
    adjustedBy: string;
}

export interface ExpiryReportItem {
    product: MasterProduct;
    batch: Batch;
    daysRemaining: number;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface DateRangeFilter {
    from: string;
    to: string;
    period: ReportPeriod;
}

export interface SalesReportRow {
    date: string;
    invoiceCount: number;
    totalSales: number;
    totalDiscount: number;
    totalTax: number;
    netSales: number;
    cashSales: number;
    upiSales: number;
    cardSales: number;
    creditSales: number;
}

export interface GSTReportRow {
    hsnCode: string;
    productName: string;
    taxableAmount: number;
    cgstRate: number;
    cgstAmount: number;
    sgstRate: number;
    sgstAmount: number;
    totalTax: number;
    totalAmount: number;
}

export interface GSTSummary {
    period: DateRangeFilter;
    outletGstin: string;
    outletName: string;
    rows: GSTReportRow[];
    totals: {
        taxableAmount: number;
        cgstAmount: number;
        sgstAmount: number;
        totalTax: number;
        totalAmount: number;
    };
    gstSlabBreakup: {
        rate: number;
        taxableAmount: number;
        taxAmount: number;
    }[];
}

export interface StockValuationRow {
    productId: string;
    productName: string;
    composition: string;
    batchNo: string;
    expiryDate: string;
    qtyStrips: number;
    purchaseRate: number;
    mrp: number;
    saleRate: number;
    stockValue: number;
    mrpValue: number;
}

export interface ExpiryReportRow {
    productName: string;
    batchNo: string;
    expiryDate: string;
    daysRemaining: number;
    qtyStrips: number;
    mrp: number;
    stockValue: number;
    distributorName: string;
}

export interface StaffReportRow {
    staffId: string;
    staffName: string;
    role: StaffRole;
    billsCount: number;
    totalSales: number;
    avgBillValue: number;
    totalDiscount: number;
    avgDiscountPct: number;
    cashBills: number;
    creditBills: number;
}

export interface PurchaseReportRow {
    date: string;
    invoiceNo: string;
    distributorName: string;
    itemCount: number;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    grandTotal: number;
    amountPaid: number;
    outstanding: number;
}

export interface ReportSummaryCard {
    label: string;
    value: string;
    change?: number;
    changeLabel?: string;
    trend?: 'up' | 'down' | 'flat';
    color?: string;
}

// ─── Chain / Multi-outlet ──────────────────────────────────────────────────────

export interface OrganizationSummary {
    id: string;
    name: string;
    slug: string;
    plan: 'starter' | 'pro' | 'enterprise';
    masterGstin: string;
    phone: string;
    email: string;
    outletCount: number;
}

export interface ChainOutletRow {
    id: string;
    name: string;
    city: string;
    state: string;
    periodSales: number;
    periodInvoices: number;
    todaySales: number;
}

export interface ChainDashboard {
    organization: { id: string; name: string };
    period: { from: string; to: string };
    totalSales: { total: number; invoices: number };
    todaySales: { total: number; invoices: number };
    totalPurchases: { total: number; invoices: number };
    totalPayables: number;
    totalReceivables: number;
    outlets: ChainOutletRow[];
}

// ─── Balance Sheet ─────────────────────────────────────────────────────────────

export interface BalanceSheet {
    asOfDate: string;
    assets: {
        currentStock: number;
        receivables: number;
        cashAndBank: number;
        totalAssets: number;
        breakdown: { batchCount: number; customersWithOutstanding: number };
    };
    liabilities: {
        payables: number;
        totalLiabilities: number;
        breakdown: { distributorsWithOutstanding: number };
    };
    netWorth: number;
}

// ─── GSTR-2A Reconciliation ────────────────────────────────────────────────────

export interface GSTR2AInvoiceRow {
    supplierGstin: string;
    supplierName: string;
    invoiceNo: string;
    invoiceDate: string;
    totalAmount: number;
    gstAmount: number;
    gstr2aAmount?: number;
    variance?: number;
}

export interface GSTR2AReconciliation {
    gstin: string;
    period: { from: string; to: string };
    summary: {
        ourInvoices: number;
        gstr2aInvoices: number;
        matched: number;
        ourOnly: number;
        gstr2aOnly: number;
        totalOurAmount: number;
        totalGstr2aAmount: number;
        totalVariance: number;
    };
    matched: GSTR2AInvoiceRow[];
    ourOnly: GSTR2AInvoiceRow[];
    gstr2aOnly: GSTR2AInvoiceRow[];
    note: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface OutletSettings {
    outletName: string;
    outletAddress: string;
    outletCity: string;
    outletState: string;
    outletPincode: string;
    outletPhone: string;
    outletEmail: string;
    outletGstin: string;
    outletDrugLicenseNo: string;
    outletLogoUrl: string | null;
    invoiceFooter: string;
    invoiceHeader: string;
}

export interface GSTSettings {
    gstType: 'intrastate' | 'interstate';
    enableGST: boolean;
    defaultGSTRate: number;
    roundOffInvoice: boolean;
    showGSTBreakup: boolean;
    outletStateCode: string;
}

export interface PrinterSettings {
    printerType: 'a4' | 'thermal';
    thermalWidth: '58mm' | '80mm';
    autoPrintAfterBill: boolean;
    printCopies: number;
    showMRPOnInvoice: boolean;
    showBatchOnInvoice: boolean;
    showDoctorOnInvoice: boolean;
}

export interface BillingSettings {
    defaultDiscountPct: number;
    allowNegativeStock: boolean;
    requirePinForEveryBill: boolean;
    pinSessionTimeoutMins: number;
    enableLooseTablets: boolean;
    enableCreditSales: boolean;
    creditWarningThresholdPct: number;
    enableWhatsAppReceipt: boolean;
}

export interface AttendanceSettings {
    attendanceGraceMinutes: number;
    kioskPhotoCapture: boolean;
    kioskAutoResetSeconds: number;
    enableAttendance: boolean;
    workingHoursPerDay: number;
}

export interface NotificationSettings {
    notifyLowStock: boolean;
    lowStockThreshold: number;
    notifyExpiryDays: number;
    notifyOverdueCredit: boolean;
    notifyRefillDue: boolean;
    whatsappNotifications: boolean;
}

export interface AppPreferences {
    theme: 'light' | 'dark' | 'system';
    language: 'en' | 'hi' | 'mr';
    dateFormat: string;
    compactMode: boolean;
    sidebarCollapsed: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Accounts & Payments ──────────────────────────────────────────────────────

export type ExpenseHead =
    | 'rent'
    | 'salary'
    | 'electricity'
    | 'transport'
    | 'maintenance'
    | 'marketing'
    | 'other';

export type LedgerEntityType = 'distributor' | 'customer' | 'cash' | 'bank';

export type LedgerEntryType =
    | 'purchase'
    | 'payment'
    | 'sale'
    | 'receipt'
    | 'debit_note'
    | 'credit_note'
    | 'expense'
    | 'opening_balance';

export interface PaymentAllocation {
    purchaseInvoiceId: string;
    invoiceNo: string;
    invoiceDate: string;
    invoiceTotal: number;
    currentOutstanding: number;
    allocatedAmount: number;
}

export interface PaymentEntry {
    id: string;
    outletId: string;
    distributorId: string;
    distributor?: Distributor;
    date: string;
    totalAmount: number;
    paymentMode: PaymentMode;
    referenceNo?: string;
    notes?: string;
    allocations: PaymentAllocation[];
    createdBy: string;
    createdAt: string;
}

export interface CreatePaymentPayload {
    distributorId: string;
    date: string;
    totalAmount: number;
    paymentMode: PaymentMode;
    referenceNo?: string;
    notes?: string;
    allocations: { purchaseInvoiceId: string; allocatedAmount: number }[];
}

export interface ReceiptAllocation {
    saleInvoiceId: string;
    invoiceNo: string;
    invoiceDate: string;
    invoiceTotal: number;
    currentOutstanding: number;
    allocatedAmount: number;
}

export interface ReceiptEntry {
    id: string;
    outletId: string;
    customerId: string;
    customer?: Customer;
    date: string;
    totalAmount: number;
    paymentMode: PaymentMode;
    referenceNo?: string;
    notes?: string;
    allocations: ReceiptAllocation[];
    createdBy: string;
    createdAt: string;
}

export interface CreateReceiptPayload {
    customerId: string;
    date: string;
    totalAmount: number;
    paymentMode: PaymentMode;
    referenceNo?: string;
    notes?: string;
    allocations: { saleInvoiceId: string; allocatedAmount: number }[];
}

export interface ExpenseEntry {
    id: string;
    outletId: string;
    date: string;
    expenseHead: ExpenseHead;
    customHead?: string;
    amount: number;
    paymentMode: PaymentMode;
    notes?: string;
    createdBy: string;
    createdAt: string;
}

export interface CreateExpensePayload {
    date: string;
    expenseHead: ExpenseHead;
    customHead?: string;
    amount: number;
    paymentMode: PaymentMode;
    notes?: string;
}

export interface LedgerEntry {
    id: string;
    date: string;
    entryType: LedgerEntryType;
    referenceNo: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
}

export interface DistributorOutstanding {
    distributorId: string;
    name: string;
    gstin?: string;
    phone?: string;
    totalBills: number;
    paidBills: number;
    overdueBills: number;
    totalOutstanding: number;
    overdueAmount: number;
    oldestDueDate?: string;
}

export interface CustomerOutstanding {
    customerId: string;
    name: string;
    phone?: string;
    totalBills: number;
    totalOutstanding: number;
    overdueAmount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const INDIAN_STATES = [
    { code: '01', name: 'Jammu & Kashmir' },
    { code: '02', name: 'Himachal Pradesh' },
    { code: '03', name: 'Punjab' },
    { code: '04', name: 'Chandigarh' },
    { code: '05', name: 'Uttarakhand' },
    { code: '06', name: 'Haryana' },
    { code: '07', name: 'Delhi' },
    { code: '08', name: 'Rajasthan' },
    { code: '09', name: 'Uttar Pradesh' },
    { code: '10', name: 'Bihar' },
    { code: '11', name: 'Sikkim' },
    { code: '12', name: 'Arunachal Pradesh' },
    { code: '13', name: 'Nagaland' },
    { code: '14', name: 'Manipur' },
    { code: '15', name: 'Mizoram' },
    { code: '16', name: 'Tripura' },
    { code: '17', name: 'Meghalaya' },
    { code: '18', name: 'Assam' },
    { code: '19', name: 'West Bengal' },
    { code: '20', name: 'Jharkhand' },
    { code: '21', name: 'Odisha' },
    { code: '22', name: 'Chhattisgarh' },
    { code: '23', name: 'Madhya Pradesh' },
    { code: '24', name: 'Gujarat' },
    { code: '27', name: 'Maharashtra' },
    { code: '29', name: 'Karnataka' },
    { code: '30', name: 'Goa' },
    { code: '32', name: 'Kerala' },
    { code: '33', name: 'Tamil Nadu' },
    { code: '36', name: 'Telangana' },
    { code: '37', name: 'Andhra Pradesh' },
] as const;

// ─── Ledger / Voucher / Notes ─────────────────────────────────────────────────

export interface LedgerGroup {
    id: string;
    name: string;
    nature: 'asset' | 'liability' | 'income' | 'expense';
    parentId: string | null;
    isSystem: boolean;
}

export interface Ledger {
    id: string;
    name: string;
    groupId: string;
    groupName: string;
    nature: 'asset' | 'liability' | 'income' | 'expense';
    openingBalance: number;
    balanceType: 'Dr' | 'Cr';
    currentBalance: number;
    phone?: string;
    gstin?: string;
    address?: string;
    linkedCustomerId?: string;
    linkedDistributorId?: string;
    isSystem: boolean;
    createdAt: string;
    // Contact
    station?: string;
    mailTo?: string;
    contactPerson?: string;
    designation?: string;
    phoneOffice?: string;
    phoneResidence?: string;
    faxNo?: string;
    website?: string;
    email?: string;
    pincode?: string;
    // Compliance
    freezeUpto?: string | null;
    dlNo?: string;
    dlExpiry?: string | null;
    vatNo?: string;
    vatExpiry?: string | null;
    stNo?: string;
    stExpiry?: string | null;
    foodLicenceNo?: string;
    foodLicenceExpiry?: string | null;
    extraHeadingNo?: string;
    extraHeadingExpiry?: string | null;
    panNo?: string;
    itPanNo?: string;
    // GST / Tax
    gstHeading?: 'local' | 'central' | 'exempt';
    billExport?: 'gstn' | 'non_gstn';
    ledgerType?: 'registered' | 'unregistered' | 'composition' | 'consumer';
    // Settings
    balancingMethod?: 'bill_by_bill' | 'on_account';
    ledgerCategory?: string;
    state?: string;
    country?: string;
    color?: 'normal' | 'red' | 'green' | 'blue';
    isHidden?: boolean;
    retailioId?: string;
}

export interface PendingBill {
    id: string;
    invoiceNo: string;
    date: string;
    grandTotal: number;
    outstanding: number;
    invoiceType: 'sale' | 'purchase';
}

export interface BillAdjustment {
    invoiceId: string;
    invoiceType: 'sale' | 'purchase';
    adjustedAmount: number;
}

export interface VoucherLine {
    id?: string;
    ledgerId: string;
    ledgerName?: string;
    debit: number;
    credit: number;
    description?: string;
}

export interface Voucher {
    id: string;
    voucherType: 'receipt' | 'payment' | 'contra' | 'journal';
    voucherNo: string;
    date: string;
    narration?: string;
    totalAmount: number;
    paymentMode: 'cash' | 'bank' | 'upi';
    lines: VoucherLine[];
    createdBy: string;
    createdAt: string;
}

export interface DebitNoteItem {
    id?: string;
    batchId: string;
    productName: string;
    qty: number;
    rate: number;
    gstRate: number;
    total: number;
}

export interface DebitNote {
    id: string;
    debitNoteNo: string;
    date: string;
    distributorId: string;
    distributorName: string;
    purchaseInvoiceId?: string;
    reason: string;
    subtotal: number;
    gstAmount: number;
    totalAmount: number;
    status: 'pending' | 'adjusted' | 'refunded';
    items: DebitNoteItem[];
    createdAt: string;
}

export interface CreditNoteItem {
    id?: string;
    batchId: string;
    productName: string;
    qty: number;
    rate: number;
    gstRate: number;
    total: number;
}

export interface CreditNote {
    id: string;
    creditNoteNo: string;
    date: string;
    customerId?: string;
    customerName?: string;
    saleInvoiceId?: string;
    reason: string;
    subtotal: number;
    gstAmount: number;
    totalAmount: number;
    status: 'pending' | 'adjusted' | 'refunded';
    items: CreditNoteItem[];
    createdAt: string;
}

export interface LedgerStatement {
    ledger: Ledger;
    openingBalance: number;
    closingBalance: number;
    transactions: LedgerTransaction[];
}

export interface LedgerTransaction {
    date: string;
    voucherNo: string;
    voucherType: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
}
