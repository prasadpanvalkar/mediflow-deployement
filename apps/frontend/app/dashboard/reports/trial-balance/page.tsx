'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Scale, CheckCircle, XCircle, Printer, Download, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { accountsApi, voucherApi } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const fmt = (n: number) =>
    n === 0 ? '—' : '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface LedgerData {
    id: string;
    name: string;
    opening_debit: number;
    opening_credit: number;
    period_debit: number;
    period_credit: number;
    closing_debit: number;
    closing_credit: number;
}

interface GroupData {
    id: string;
    group: string;
    ledgers: LedgerData[];
}

interface TrialBalanceResponse {
    groups: GroupData[];
    total_closing_debit: number;
    total_closing_credit: number;
    balanced: boolean;
    from_date: string;
    to_date: string;
}

export default function TrialBalancePage() {
    const { outlet } = useAuthStore();
    const { selectedOutletId } = useSettingsStore();
    const outletId = selectedOutletId ?? outlet?.id ?? '';

    // Date filters - default to current financial year
    const now = new Date();
    // Offset local timezone so toISOString gives local date
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const finStart = new Date(now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear(), 3, 1);
    const localFinStart = new Date(finStart.getTime() - finStart.getTimezoneOffset() * 60000);
    
    const defFrom = localFinStart.toISOString().split('T')[0];
    const defTo = localNow.toISOString().split('T')[0];

    const [fromDate, setFromDate] = useState(defFrom);
    const [toDate, setToDate] = useState(defTo);
    const [showZero, setShowZero] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    // Drilldown tracking
    const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);
    const [selectedLedgerName, setSelectedLedgerName] = useState<string | ''>('');

    const { data, isLoading, isError, refetch } = useQuery<TrialBalanceResponse>({
        queryKey: ['trial-balance', outletId, fromDate, toDate],
        queryFn: () => accountsApi.getTrialBalance(outletId, { from: fromDate, to: toDate }),
        enabled: !!outletId,
        staleTime: 1000 * 60 * 5,
    });



    const balanced = data?.balanced ?? false;

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    // Calculate derived data, group hierarchy, and zero-balance filtering
    const tableData = useMemo(() => {
        if (!data?.groups) return { parentGroups: [], grandTotals: null };

        let gtOpDr = 0, gtOpCr = 0, gtPerDr = 0, gtPerCr = 0, gtClDr = 0, gtClCr = 0;
        
        const GROUP_HIERARCHY: Record<string, string> = {
            "Bank Accounts": "Current Assets",
            "Cash in Hand": "Current Assets",
            "Sundry Debtors": "Current Assets",
            "Stock in Hand": "Current Assets",
            "Investments": "Current Assets",
            "Sundry Creditors": "Current Liabilities",
            "Bank OD": "Current Liabilities",
            "Duties & Taxes": "Direct Expenses",
            "Loans (Liability)": "Current Liabilities",
            "Purchase Account": "Direct Expenses",
            "Direct Expenses": "Direct Expenses",
            "Sales Account": "Direct Incomes",
            "Direct Incomes": "Direct Incomes",
        };

        const topLevelMap: Record<string, any> = {};

        const getParent = (name: string) => {
            const pName = GROUP_HIERARCHY[name] || name;
            if (!topLevelMap[pName]) {
                topLevelMap[pName] = {
                    id: `parent-${pName.replace(/\s+/g, '-')}`,
                    name: pName,
                    children: [],
                    ledgers: [],
                    totals: { opDr: 0, opCr: 0, perDr: 0, perCr: 0, clDr: 0, clCr: 0 }
                };
            }
            return topLevelMap[pName];
        };

        data.groups.forEach(g => {
            const parent = getParent(g.group);
            
            let gOpDr = 0, gOpCr = 0, gPerDr = 0, gPerCr = 0, gClDr = 0, gClCr = 0;
            const validLedgers: any[] = [];

            g.ledgers.forEach(l => {
                const isZero = Math.abs(l.opening_debit) < 0.001 && Math.abs(l.opening_credit) < 0.001 &&
                               Math.abs(l.period_debit) < 0.001 && Math.abs(l.period_credit) < 0.001 &&
                               Math.abs(l.closing_debit) < 0.001 && Math.abs(l.closing_credit) < 0.001;

                if (showZero || !isZero) {
                    validLedgers.push(l);
                    gOpDr += l.opening_debit; gOpCr += l.opening_credit;
                    gPerDr += l.period_debit; gPerCr += l.period_credit;
                    gClDr += l.closing_debit; gClCr += l.closing_credit;
                }
            });

            if (validLedgers.length > 0) {
                if (parent.name === g.group) {
                    parent.ledgers.push(...validLedgers);
                } else {
                    parent.children.push({
                        id: g.id,
                        name: g.group,
                        ledgers: validLedgers,
                        totals: { opDr: gOpDr, opCr: gOpCr, perDr: gPerDr, perCr: gPerCr, clDr: gClDr, clCr: gClCr }
                    });
                }
                
                parent.totals.opDr += gOpDr; parent.totals.opCr += gOpCr;
                parent.totals.perDr += gPerDr; parent.totals.perCr += gPerCr;
                parent.totals.clDr += gClDr; parent.totals.clCr += gClCr;

                gtOpDr += gOpDr; gtOpCr += gOpCr;
                gtPerDr += gPerDr; gtPerCr += gPerCr;
                gtClDr += gClDr; gtClCr += gClCr;
            }
        });

        const activeParents = Object.values(topLevelMap).filter(p => p.children.length > 0 || p.ledgers.length > 0);

        return {
            parentGroups: activeParents.sort((a, b) => a.name.localeCompare(b.name)),
            grandTotals: { opDr: gtOpDr, opCr: gtOpCr, perDr: gtPerDr, perCr: gtPerCr, clDr: gtClDr, clCr: gtClCr }
        };
    }, [data, showZero]);

    const handlePrint = () => {
        window.print();
    };

    const handleExportExcel = () => {
        if (!tableData.grandTotals) return;
        
        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <!--[if gte mso 9]>
                <xml>
                  <x:ExcelWorkbook>
                    <x:ExcelWorksheets>
                      <x:ExcelWorksheet>
                        <x:Name>Trial Balance</x:Name>
                        <x:WorksheetOptions>
                          <x:DisplayGridlines/>
                        </x:WorksheetOptions>
                      </x:ExcelWorksheet>
                    </x:ExcelWorksheets>
                  </x:ExcelWorkbook>
                </xml>
                <![endif]-->
            </head>
            <body>
            <table border="1" cellpadding="3" cellspacing="0" style="font-family: Calibri, sans-serif;">
                <thead>
                    <tr>
                        <th colspan="7" style="text-align: center; font-size: 20px; font-weight: bold; height: 40px; vertical-align: middle;">Trial Balance (${fromDate} to ${toDate})</th>
                    </tr>
                    <tr>
                        <th style="background-color: #f3f4f6; font-weight: bold; width: 250px;">Account/Group</th>
                        <th style="background-color: #f3f4f6; font-weight: bold; width: 120px;">Opening Dr</th>
                        <th style="background-color: #f3f4f6; font-weight: bold; width: 120px;">Opening Cr</th>
                        <th style="background-color: #e0f2fe; font-weight: bold; width: 120px;">Period Dr</th>
                        <th style="background-color: #e0f2fe; font-weight: bold; width: 120px;">Period Cr</th>
                        <th style="background-color: #f3f4f6; font-weight: bold; width: 120px;">Closing Dr</th>
                        <th style="background-color: #f3f4f6; font-weight: bold; width: 120px;">Closing Cr</th>
                    </tr>
                </thead>
                <tbody>
        `;

        tableData.parentGroups.forEach(p => {
            html += `
                <tr>
                    <td style="font-weight: bold; background-color: #f1f5f9; font-size: 14px;">${p.name.toUpperCase()}</td>
                    <td style="text-align: right; font-weight: bold; background-color: #f1f5f9;">${fmt(p.totals.opDr)}</td>
                    <td style="text-align: right; font-weight: bold; background-color: #f1f5f9;">${fmt(p.totals.opCr)}</td>
                    <td style="text-align: right; font-weight: bold; background-color: #e0f2fe;">${fmt(p.totals.perDr)}</td>
                    <td style="text-align: right; font-weight: bold; background-color: #e0f2fe;">${fmt(p.totals.perCr)}</td>
                    <td style="text-align: right; font-weight: bold; background-color: #f1f5f9;">${fmt(p.totals.clDr)}</td>
                    <td style="text-align: right; font-weight: bold; background-color: #f1f5f9;">${fmt(p.totals.clCr)}</td>
                </tr>
            `;

            p.children.forEach((c: any) => {
                html += `
                    <tr>
                        <td style="padding-left: 20px; font-weight: bold; background-color: #f8fafc;">${c.name}</td>
                        <td style="text-align: right; font-weight: bold; background-color: #f8fafc;">${fmt(c.totals.opDr)}</td>
                        <td style="text-align: right; font-weight: bold; background-color: #f8fafc;">${fmt(c.totals.opCr)}</td>
                        <td style="text-align: right; font-weight: bold; background-color: #f0f9ff;">${fmt(c.totals.perDr)}</td>
                        <td style="text-align: right; font-weight: bold; background-color: #f0f9ff;">${fmt(c.totals.perCr)}</td>
                        <td style="text-align: right; font-weight: bold; background-color: #f8fafc;">${fmt(c.totals.clDr)}</td>
                        <td style="text-align: right; font-weight: bold; background-color: #f8fafc;">${fmt(c.totals.clCr)}</td>
                    </tr>
                `;
                c.ledgers.forEach((l: any) => {
                    html += `
                        <tr>
                            <td style="padding-left: 40px;">${l.name}</td>
                            <td style="text-align: right; color: #475569;">${l.opening_debit > 0 ? fmt(l.opening_debit) : ''}</td>
                            <td style="text-align: right; color: #475569;">${l.opening_credit > 0 ? fmt(l.opening_credit) : ''}</td>
                            <td style="text-align: right; color: #475569;">${l.period_debit > 0 ? fmt(l.period_debit) : ''}</td>
                            <td style="text-align: right; color: #475569;">${l.period_credit > 0 ? fmt(l.period_credit) : ''}</td>
                            <td style="text-align: right; font-weight: bold;">${l.closing_debit > 0 ? fmt(l.closing_debit) : ''}</td>
                            <td style="text-align: right; font-weight: bold;">${l.closing_credit > 0 ? fmt(l.closing_credit) : ''}</td>
                        </tr>
                    `;
                });
            });

            p.ledgers.forEach((l: any) => {
                html += `
                    <tr>
                        <td style="padding-left: 20px;">${l.name}</td>
                        <td style="text-align: right; color: #475569;">${l.opening_debit > 0 ? fmt(l.opening_debit) : ''}</td>
                        <td style="text-align: right; color: #475569;">${l.opening_credit > 0 ? fmt(l.opening_credit) : ''}</td>
                        <td style="text-align: right; color: #475569;">${l.period_debit > 0 ? fmt(l.period_debit) : ''}</td>
                        <td style="text-align: right; color: #475569;">${l.period_credit > 0 ? fmt(l.period_credit) : ''}</td>
                        <td style="text-align: right; font-weight: bold;">${l.closing_debit > 0 ? fmt(l.closing_debit) : ''}</td>
                        <td style="text-align: right; font-weight: bold;">${l.closing_credit > 0 ? fmt(l.closing_credit) : ''}</td>
                    </tr>
                `;
            });
        });

        html += `
                </tbody>
                <tfoot>
                    <tr>
                        <td style="font-weight: bold; background-color: #0f172a; color: white;">GRAND TOTAL</td>
                        <td style="text-align: right; font-weight: bold; background-color: #0f172a; color: white;">${tableData.grandTotals.opDr}</td>
                        <td style="text-align: right; font-weight: bold; background-color: #0f172a; color: white;">${tableData.grandTotals.opCr}</td>
                        <td style="text-align: right; font-weight: bold; background-color: #1e293b; color: white;">${tableData.grandTotals.perDr}</td>
                        <td style="text-align: right; font-weight: bold; background-color: #1e293b; color: white;">${tableData.grandTotals.perCr}</td>
                        <td style="text-align: right; font-weight: bold; background-color: #0f172a; color: #4ade80;">${tableData.grandTotals.clDr}</td>
                        <td style="text-align: right; font-weight: bold; background-color: #0f172a; color: #4ade80;">${tableData.grandTotals.clCr}</td>
                    </tr>
                </tfoot>
            </table>
            </body>
            </html>
        `;
        
        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trial-balance-${fromDate}-to-${toDate}.xls`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    // Ledger Statement Data via Query
    const { data: ledgerStatement, isLoading: isLedgerLoading } = useQuery({
        queryKey: ['ledger-statement', selectedLedgerId, fromDate, toDate],
        queryFn: () => voucherApi.getLedgerStatement(selectedLedgerId!, fromDate, toDate),
        enabled: !!selectedLedgerId,
    });

    return (
        <div className="space-y-6 p-6 print:p-0 print:space-y-4">
            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background-color: white !important; }
                    .print-table { page-break-inside: auto; }
                    .print-row { page-break-inside: avoid; page-break-after: auto; }
                }
            `}</style>
            
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between no-print">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Scale className="h-6 w-6 text-primary" />
                        Trial Balance
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Marg ERP Style Detailed Account Structure
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="bg-white border rounded-lg p-1.5 flex items-center shadow-sm">
                        <input 
                            type="date" 
                            className="bg-transparent text-sm border-none outline-none focus:ring-0 px-2"
                            value={fromDate} onChange={e => setFromDate(e.target.value)} 
                        />
                        <span className="text-slate-400 mx-1">to</span>
                        <input 
                            type="date" 
                            className="bg-transparent text-sm border-none outline-none focus:ring-0 px-2"
                            value={toDate} onChange={e => setToDate(e.target.value)} 
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" onClick={() => refetch()}>
                            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                        </Button>
                    </div>

                    <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-1.5 shadow-sm h-[40px]">
                        <Switch id="zero-toggle" checked={showZero} onCheckedChange={setShowZero} />
                        <Label htmlFor="zero-toggle" className="text-sm cursor-pointer whitespace-nowrap">Show Zeros</Label>
                    </div>

                    <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-[40px]">
                        <Download className="mr-2 h-4 w-4" /> Export Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePrint} className="h-[40px]">
                        <Printer className="mr-2 h-4 w-4" /> Print
                    </Button>
                </div>
            </div>

            {isError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 no-print">
                    Failed to load trial balance data.
                </div>
            )}

            {/* Trial Balance Report */}
            <Card className="print:border-none print:shadow-none print:bg-transparent">
                <CardHeader className="print:hidden pb-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base text-slate-800">For the period {fromDate} to {toDate}</CardTitle>
                        {data && (
                            <Badge variant={balanced ? "default" : "destructive"} className={balanced ? "bg-green-600" : ""}>
                                {balanced ? 'Balanced ✓' : 'Unbalanced ✗'}
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <div className="hidden print:block mb-4">
                    <h2 className="text-xl font-bold text-center">Trial Balance</h2>
                    <p className="text-sm text-center text-gray-500">Period: {fromDate} to {toDate}</p>
                </div>
                <CardContent className="print:p-0">
                    <div className="overflow-x-auto border rounded-lg print:border-t print:border-x-0 print:border-b-0 print:rounded-none">
                        <Table className="w-full text-sm print-table">
                            <TableHeader className="bg-slate-100/80 sticky top-0 z-10 print:bg-white print:border-b-2 print:border-gray-800">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="font-semibold px-4 w-[30%]">Particulars</TableHead>
                                    <TableHead className="text-right font-semibold whitespace-nowrap">Opening (Dr)</TableHead>
                                    <TableHead className="text-right font-semibold whitespace-nowrap">Opening (Cr)</TableHead>
                                    <TableHead className="text-right font-semibold bg-blue-50/50 print:bg-transparent whitespace-nowrap">Period (Dr)</TableHead>
                                    <TableHead className="text-right font-semibold bg-blue-50/50 print:bg-transparent whitespace-nowrap">Period (Cr)</TableHead>
                                    <TableHead className="text-right font-semibold whitespace-nowrap">Closing (Dr)</TableHead>
                                    <TableHead className="text-right font-semibold whitespace-nowrap">Closing (Cr)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-slate-500">Aggregating Ledgers...</TableCell>
                                    </TableRow>
                                ) : tableData.parentGroups.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-slate-500">No ledgers to display in this period</TableCell>
                                    </TableRow>
                                ) : (
                                    <>
                                        {tableData.parentGroups.map(p => {
                                            const isParentExpanded = expandedGroups[p.id] === true;
                                            return (
                                                <div key={p.id} className="contents print-row">
                                                    {/* Parent Group Row */}
                                                    <TableRow 
                                                        className="bg-slate-100 border-b-2 hover:bg-slate-200 cursor-pointer print:bg-transparent"
                                                        onClick={() => toggleGroup(p.id)}
                                                    >
                                                        <TableCell className="font-bold text-slate-900 px-4 py-3 flex items-center gap-1.5 uppercase text-[15px]">
                                                            {isParentExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                                                            {p.name}
                                                        </TableCell>
                                                        <TableCell className="text-right font-bold text-slate-800">{fmt(p.totals.opDr)}</TableCell>
                                                        <TableCell className="text-right font-bold text-slate-800">{fmt(p.totals.opCr)}</TableCell>
                                                        <TableCell className="text-right font-bold text-slate-800 bg-blue-50/50 print:bg-transparent">{fmt(p.totals.perDr)}</TableCell>
                                                        <TableCell className="text-right font-bold text-slate-800 bg-blue-50/50 print:bg-transparent">{fmt(p.totals.perCr)}</TableCell>
                                                        <TableCell className="text-right font-bold text-slate-900">{fmt(p.totals.clDr)}</TableCell>
                                                        <TableCell className="text-right font-bold text-slate-900">{fmt(p.totals.clCr)}</TableCell>
                                                    </TableRow>
                                                    
                                                    {/* Nested Children Groups */}
                                                    {isParentExpanded && p.children.map((c: any) => {
                                                        const isChildExpanded = expandedGroups[c.id] === true;
                                                        return (
                                                            <div key={c.id} className="contents print-row">
                                                                <TableRow 
                                                                    className="bg-slate-50/80 hover:bg-slate-100 cursor-pointer print:bg-transparent border-l-4 border-l-slate-300"
                                                                    onClick={() => toggleGroup(c.id)}
                                                                >
                                                                    <TableCell className="font-semibold text-slate-800 py-2.5 flex items-center gap-1.5" style={{ paddingLeft: '2rem' }}>
                                                                        {isChildExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                                                                        {c.name}
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-semibold text-slate-700">{fmt(c.totals.opDr)}</TableCell>
                                                                    <TableCell className="text-right font-semibold text-slate-700">{fmt(c.totals.opCr)}</TableCell>
                                                                    <TableCell className="text-right font-semibold text-slate-700 bg-blue-50/30 print:bg-transparent">{fmt(c.totals.perDr)}</TableCell>
                                                                    <TableCell className="text-right font-semibold text-slate-700 bg-blue-50/30 print:bg-transparent">{fmt(c.totals.perCr)}</TableCell>
                                                                    <TableCell className="text-right font-semibold text-slate-700">{fmt(c.totals.clDr)}</TableCell>
                                                                    <TableCell className="text-right font-semibold text-slate-700">{fmt(c.totals.clCr)}</TableCell>
                                                                </TableRow>

                                                                {/* Child Ledgers Row */}
                                                                {isChildExpanded && c.ledgers.map((l: any) => (
                                                                    <TableRow 
                                                                        key={l.id} 
                                                                        className="hover:bg-blue-50/50 cursor-pointer border-l-4 border-l-slate-200 transition-colors print-row"
                                                                        onClick={() => { setSelectedLedgerId(l.id); setSelectedLedgerName(l.name); }}
                                                                    >
                                                                        <TableCell className="text-slate-600 font-medium py-2" style={{ paddingLeft: '4rem' }}>
                                                                            <div className="flex items-center group">
                                                                                <FileText className="h-3.5 w-3.5 mr-2 text-slate-300 group-hover:text-primary transition-colors" />
                                                                                {l.name}
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell className="text-right text-slate-500 font-mono text-[13px]">{fmt(l.opening_debit)}</TableCell>
                                                                        <TableCell className="text-right text-slate-500 font-mono text-[13px]">{fmt(l.opening_credit)}</TableCell>
                                                                        <TableCell className="text-right text-slate-500 font-mono text-[13px] bg-blue-50/20 print:bg-transparent">{fmt(l.period_debit)}</TableCell>
                                                                        <TableCell className="text-right text-slate-500 font-mono text-[13px] bg-blue-50/20 print:bg-transparent">{fmt(l.period_credit)}</TableCell>
                                                                        <TableCell className="text-right text-slate-800 font-mono font-medium text-[13px]">{fmt(l.closing_debit)}</TableCell>
                                                                        <TableCell className="text-right text-slate-800 font-mono font-medium text-[13px]">{fmt(l.closing_credit)}</TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Parent Direct Ledgers Row */}
                                                    {isParentExpanded && p.ledgers.map((l: any) => (
                                                        <TableRow 
                                                            key={l.id} 
                                                            className="hover:bg-blue-50/50 cursor-pointer border-l-4 border-l-slate-300 transition-colors print-row"
                                                            onClick={() => { setSelectedLedgerId(l.id); setSelectedLedgerName(l.name); }}
                                                        >
                                                            <TableCell className="text-slate-600 font-medium py-2" style={{ paddingLeft: '2rem' }}>
                                                                <div className="flex items-center group">
                                                                    <FileText className="h-3.5 w-3.5 mr-2 text-slate-300 group-hover:text-primary transition-colors" />
                                                                    {l.name}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right text-slate-500 font-mono text-[13px]">{fmt(l.opening_debit)}</TableCell>
                                                            <TableCell className="text-right text-slate-500 font-mono text-[13px]">{fmt(l.opening_credit)}</TableCell>
                                                            <TableCell className="text-right text-slate-500 font-mono text-[13px] bg-blue-50/20 print:bg-transparent">{fmt(l.period_debit)}</TableCell>
                                                            <TableCell className="text-right text-slate-500 font-mono text-[13px] bg-blue-50/20 print:bg-transparent">{fmt(l.period_credit)}</TableCell>
                                                            <TableCell className="text-right text-slate-800 font-mono font-medium text-[13px]">{fmt(l.closing_debit)}</TableCell>
                                                            <TableCell className="text-right text-slate-800 font-mono font-medium text-[13px]">{fmt(l.closing_credit)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </div>
                                            )
                                        })}
                                        
                                        {/* Grand Totals Footer */}
                                        <TableRow className="bg-slate-900 hover:bg-slate-900 border-none print-row print:bg-transparent print:border-t-2 print:border-gray-800">
                                            <TableCell className="font-bold text-white px-4 py-4 print:text-black">GRAND TOTAL</TableCell>
                                            <TableCell className="text-right font-bold text-white font-mono print:text-black">{fmt(tableData.grandTotals?.opDr ?? 0)}</TableCell>
                                            <TableCell className="text-right font-bold text-white font-mono print:text-black">{fmt(tableData.grandTotals?.opCr ?? 0)}</TableCell>
                                            <TableCell className="text-right font-bold text-white font-mono bg-slate-800/50 print:bg-transparent print:text-black">{fmt(tableData.grandTotals?.perDr ?? 0)}</TableCell>
                                            <TableCell className="text-right font-bold text-white font-mono bg-slate-800/50 print:bg-transparent print:text-black">{fmt(tableData.grandTotals?.perCr ?? 0)}</TableCell>
                                            <TableCell className="text-right font-bold text-green-400 font-mono text-[15px] border-t-2 border-t-transparent print:text-black">{fmt(tableData.grandTotals?.clDr ?? 0)}</TableCell>
                                            <TableCell className="text-right font-bold text-green-400 font-mono text-[15px] border-t-2 border-t-transparent print:text-black">{fmt(tableData.grandTotals?.clCr ?? 0)}</TableCell>
                                        </TableRow>
                                    </>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Sheet open={!!selectedLedgerId} onOpenChange={(open) => !open && setSelectedLedgerId(null)}>
                <SheetContent side="right" className="w-[800px] sm:max-w-4xl overflow-y-auto bg-slate-50">
                    <SheetHeader className="bg-white p-6 border-b -mx-6 -mt-6 rounded-t-xl mb-6 shadow-sm">
                        <SheetTitle className="text-2xl text-slate-800 tracking-tight">Ledger Drilldown: {selectedLedgerName}</SheetTitle>
                        <p className="text-slate-500 text-sm mt-1">Detailed transaction view from {fromDate} to {toDate}</p>
                    </SheetHeader>
                    
                    {isLedgerLoading ? (
                        <div className="flex h-40 items-center justify-center text-slate-400">Loading statements...</div>
                    ) : !ledgerStatement?.transactions ? (
                        <div className="text-center text-slate-400 py-10">No transactions found</div>
                    ) : (
                        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                            <Table className="text-sm">
                                <TableHeader className="bg-slate-100/80 border-b-2 border-slate-200">
                                    <TableRow>
                                        <TableHead className="font-semibold text-slate-700">Date</TableHead>
                                        <TableHead className="font-semibold text-slate-700">Type & Ref</TableHead>
                                        <TableHead className="font-semibold text-slate-700">Particulars</TableHead>
                                        <TableHead className="text-right font-semibold text-slate-700">Debit (₹)</TableHead>
                                        <TableHead className="text-right font-semibold text-slate-700">Credit (₹)</TableHead>
                                        <TableHead className="text-right font-bold text-slate-800">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow className="bg-slate-50/80">
                                        <TableCell colSpan={5} className="text-right uppercase text-[11px] font-bold tracking-widest text-slate-500 pt-4 pb-3">Opening Balance</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-700 pt-4 pb-3">
                                            {ledgerStatement.openingBalance === 0 ? '—' : `${fmt(Math.abs(ledgerStatement.openingBalance))} ${ledgerStatement.openingBalance > 0 ? 'Dr' : 'Cr'}`}
                                        </TableCell>
                                    </TableRow>
                                    
                                    {ledgerStatement.transactions.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <FileText className="w-8 h-8 text-slate-300" />
                                                    <span>No transactions recorded during this period.</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        ledgerStatement.transactions.map((tx: any, idx: number) => (
                                            <TableRow key={idx} className="hover:bg-blue-50/30 transition-colors">
                                                <TableCell className="whitespace-nowrap text-slate-600 font-medium text-xs">
                                                    {tx.date}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">{tx.sourceType}</span>
                                                        {tx.voucherNo && <span className="text-[10px] text-slate-400 font-mono mt-0.5">{tx.voucherNo}</span>}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="max-w-[220px] truncate text-slate-600 text-sm" title={tx.description}>
                                                    {tx.description || '-'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-slate-700">{tx.debit > 0 ? fmt(tx.debit) : ''}</TableCell>
                                                <TableCell className="text-right font-mono text-slate-700">{tx.credit > 0 ? fmt(tx.credit) : ''}</TableCell>
                                                <TableCell className="text-right font-mono font-medium text-slate-800">
                                                    {tx.balance === 0 ? '—' : `${fmt(Math.abs(tx.balance))} ${tx.balance > 0 ? 'Dr' : 'Cr'}`}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                    
                                    <TableRow className="bg-slate-900 hover:bg-slate-900 !border-none">
                                        <TableCell colSpan={5} className="text-right text-slate-300 font-bold uppercase text-xs tracking-widest border-none py-5">Closing Balance</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-white text-[15px] border-none py-5">
                                            {ledgerStatement.closingBalance === 0 ? '—' : `${fmt(Math.abs(ledgerStatement.closingBalance))} ${ledgerStatement.closingBalance > 0 ? 'Dr' : 'Cr'}`}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
