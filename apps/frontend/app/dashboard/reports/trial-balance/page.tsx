'use client';

import { Fragment, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Scale, Printer, Download, ChevronDown, ChevronRight, FileText } from 'lucide-react';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
    n === 0 ? '—' : '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Returns YYYY-MM-DD using local time (avoids UTC shift on IST +5:30). */
function localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** FY start (April 1) as YYYY-MM-DD for the given date. */
function fyStart(d: Date): string {
    const fyYear = d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear();
    return `${fyYear}-04-01`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TrialBalancePage() {
    const { outlet } = useAuthStore();
    const { selectedOutletId } = useSettingsStore();
    const outletId = selectedOutletId ?? outlet?.id ?? '';

    // ── Date state — computed once at mount, NOT on every render ──────────────
    const [fromDate, setFromDate] = useState<string>(() => {
        const now = new Date();
        return fyStart(now);
    });
    const [toDate, setToDate] = useState<string>(() => localDateStr(new Date()));

    // ── UI state ──────────────────────────────────────────────────────────────
    const [showZero, setShowZero] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [showPrintDialog, setShowPrintDialog] = useState(false);

    // ── Drilldown state ───────────────────────────────────────────────────────
    const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);
    const [selectedLedgerName, setSelectedLedgerName] = useState('');

    // ── API queries ───────────────────────────────────────────────────────────
    const { data, isLoading, isError, refetch } = useQuery<TrialBalanceResponse>({
        queryKey: ['trial-balance', outletId, fromDate, toDate],
        queryFn: () => accountsApi.getTrialBalance(outletId, { from: fromDate, to: toDate }),
        enabled: !!outletId,
        staleTime: 1000 * 60 * 5,
    });

    const { data: ledgerStatement, isLoading: isLedgerLoading } = useQuery({
        queryKey: ['ledger-statement', selectedLedgerId, fromDate, toDate],
        queryFn: () => voucherApi.getLedgerStatement(selectedLedgerId!, fromDate, toDate),
        enabled: !!selectedLedgerId,
    });

    // ── Derived data ──────────────────────────────────────────────────────────
    const balanced = data?.balanced ?? false;

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    const tableData = useMemo(() => {
        if (!data?.groups) return { parentGroups: [], grandTotals: null };

        let gtOpDr = 0, gtOpCr = 0, gtPerDr = 0, gtPerCr = 0, gtClDr = 0, gtClCr = 0;

        const GROUP_HIERARCHY: Record<string, string> = {
            'Bank Accounts':       'Current Assets',
            'Cash in Hand':        'Current Assets',
            'Sundry Debtors':      'Current Assets',
            'Stock in Hand':       'Current Assets',
            'Investments':         'Current Assets',
            'Sundry Creditors':    'Current Liabilities',
            'Bank OD':             'Current Liabilities',
            'Duties & Taxes':      'Current Liabilities',
            'Loans (Liability)':   'Current Liabilities',
            'Purchase Account':    'Direct Expenses',
            'Direct Expenses':     'Direct Expenses',
            'Sales Account':       'Direct Incomes',
            'Direct Incomes':      'Direct Incomes',
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
                    totals: { opDr: 0, opCr: 0, perDr: 0, perCr: 0, clDr: 0, clCr: 0 },
                };
            }
            return topLevelMap[pName];
        };

        data.groups.forEach(g => {
            const parent = getParent(g.group);

            let gOpDr = 0, gOpCr = 0, gPerDr = 0, gPerCr = 0, gClDr = 0, gClCr = 0;
            const validLedgers: LedgerData[] = [];

            g.ledgers.forEach(l => {
                const isZero =
                    Math.abs(l.opening_debit) < 0.001 && Math.abs(l.opening_credit) < 0.001 &&
                    Math.abs(l.period_debit)  < 0.001 && Math.abs(l.period_credit)  < 0.001 &&
                    Math.abs(l.closing_debit) < 0.001 && Math.abs(l.closing_credit) < 0.001;

                if (showZero || !isZero) {
                    validLedgers.push(l);
                    gOpDr += l.opening_debit;  gOpCr += l.opening_credit;
                    gPerDr += l.period_debit;  gPerCr += l.period_credit;
                    gClDr += l.closing_debit;  gClCr += l.closing_credit;
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
                        totals: { opDr: gOpDr, opCr: gOpCr, perDr: gPerDr, perCr: gPerCr, clDr: gClDr, clCr: gClCr },
                    });
                }

                parent.totals.opDr  += gOpDr;  parent.totals.opCr  += gOpCr;
                parent.totals.perDr += gPerDr; parent.totals.perCr += gPerCr;
                parent.totals.clDr  += gClDr;  parent.totals.clCr  += gClCr;

                gtOpDr  += gOpDr;  gtOpCr  += gOpCr;
                gtPerDr += gPerDr; gtPerCr += gPerCr;
                gtClDr  += gClDr;  gtClCr  += gClCr;
            }
        });

        const activeParents = Object.values(topLevelMap).filter(
            p => p.children.length > 0 || p.ledgers.length > 0
        );

        return {
            parentGroups: activeParents.sort((a, b) => a.name.localeCompare(b.name)),
            grandTotals: { opDr: gtOpDr, opCr: gtOpCr, perDr: gtPerDr, perCr: gtPerCr, clDr: gtClDr, clCr: gtClCr },
        };
    }, [data, showZero]);

    // ── Print ─────────────────────────────────────────────────────────────────
    const handlePrint = (layout: string, detail: string) => {
        const root = document.getElementById('tb-print-root');
        if (root) {
            root.setAttribute('data-print-layout', layout);
            root.setAttribute('data-print-detail', detail);
        }
        // Expand all groups so rows are visible when printing
        const allExpanded: Record<string, boolean> = {};
        tableData.parentGroups.forEach((p: any) => {
            allExpanded[p.id] = true;
            p.children.forEach((c: any) => { allExpanded[c.id] = true; });
        });
        setExpandedGroups(allExpanded);

        const existing = document.getElementById('tb-page-style');
        if (existing) existing.remove();
        const styleEl = document.createElement('style');
        styleEl.id = 'tb-page-style';
        styleEl.textContent = `@media print { @page { size: A4 ${
            layout === 'landscape' ? 'landscape' : 'portrait'
        }; margin: 1cm; } }`;
        document.head.appendChild(styleEl);

        // Wait for React to re-render expanded rows before printing
        setTimeout(() => {
            window.print();
            setTimeout(() => {
                document.getElementById('tb-page-style')?.remove();
                // Collapse all back after print
                setExpandedGroups({});
            }, 1500);
        }, 300);
    };

    // ── Export Excel ──────────────────────────────────────────────────────────
    const handleExportExcel = () => {
        if (!tableData.grandTotals) return;

        const fmtXl = (n: number) =>
            '₹' + n.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });

        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <!--[if gte mso 9]><xml>
                  <x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
                    <x:Name>Trial Balance</x:Name>
                    <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
                  </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
                </xml><![endif]-->
            </head>
            <body>
            <table border="1" cellpadding="3" cellspacing="0" style="font-family: Calibri, sans-serif;">
                <thead>
                    <tr>
                        <th colspan="7" style="text-align:center;font-size:16px;font-weight:bold;height:34px;vertical-align:middle;">
                            Trial Balance (${fromDate} to ${toDate})
                        </th>
                    </tr>
                    <tr>
                        <th style="background-color:#f3f4f6;font-weight:bold;width:250px;">Account / Group</th>
                        <th style="background-color:#f3f4f6;font-weight:bold;width:120px;">Opening Dr</th>
                        <th style="background-color:#f3f4f6;font-weight:bold;width:120px;">Opening Cr</th>
                        <th style="background-color:#e0f2fe;font-weight:bold;width:120px;">Period Dr</th>
                        <th style="background-color:#e0f2fe;font-weight:bold;width:120px;">Period Cr</th>
                        <th style="background-color:#f3f4f6;font-weight:bold;width:120px;">Closing Dr</th>
                        <th style="background-color:#f3f4f6;font-weight:bold;width:120px;">Closing Cr</th>
                    </tr>
                </thead>
                <tbody>
        `;

        tableData.parentGroups.forEach(p => {
            html += `
                <tr>
                    <td style="font-weight:bold;background-color:#f1f5f9;font-size:13px;">${p.name.toUpperCase()}</td>
                    <td style="text-align:right;font-weight:bold;background-color:#f1f5f9;">${fmtXl(p.totals.opDr)}</td>
                    <td style="text-align:right;font-weight:bold;background-color:#f1f5f9;">${fmtXl(p.totals.opCr)}</td>
                    <td style="text-align:right;font-weight:bold;background-color:#e0f2fe;">${fmtXl(p.totals.perDr)}</td>
                    <td style="text-align:right;font-weight:bold;background-color:#e0f2fe;">${fmtXl(p.totals.perCr)}</td>
                    <td style="text-align:right;font-weight:bold;background-color:#f1f5f9;">${fmtXl(p.totals.clDr)}</td>
                    <td style="text-align:right;font-weight:bold;background-color:#f1f5f9;">${fmtXl(p.totals.clCr)}</td>
                </tr>`;

            p.children.forEach((c: any) => {
                html += `
                    <tr>
                        <td style="padding-left:20px;font-weight:bold;background-color:#f8fafc;">${c.name}</td>
                        <td style="text-align:right;font-weight:bold;background-color:#f8fafc;">${fmtXl(c.totals.opDr)}</td>
                        <td style="text-align:right;font-weight:bold;background-color:#f8fafc;">${fmtXl(c.totals.opCr)}</td>
                        <td style="text-align:right;font-weight:bold;background-color:#f0f9ff;">${fmtXl(c.totals.perDr)}</td>
                        <td style="text-align:right;font-weight:bold;background-color:#f0f9ff;">${fmtXl(c.totals.perCr)}</td>
                        <td style="text-align:right;font-weight:bold;background-color:#f8fafc;">${fmtXl(c.totals.clDr)}</td>
                        <td style="text-align:right;font-weight:bold;background-color:#f8fafc;">${fmtXl(c.totals.clCr)}</td>
                    </tr>`;
                c.ledgers.forEach((l: LedgerData) => {
                    html += `
                        <tr>
                            <td style="padding-left:40px;">${l.name}</td>
                            <td style="text-align:right;color:#475569;">${l.opening_debit > 0 ? fmtXl(l.opening_debit) : ''}</td>
                            <td style="text-align:right;color:#475569;">${l.opening_credit > 0 ? fmtXl(l.opening_credit) : ''}</td>
                            <td style="text-align:right;color:#475569;">${l.period_debit > 0 ? fmtXl(l.period_debit) : ''}</td>
                            <td style="text-align:right;color:#475569;">${l.period_credit > 0 ? fmtXl(l.period_credit) : ''}</td>
                            <td style="text-align:right;font-weight:bold;">${l.closing_debit > 0 ? fmtXl(l.closing_debit) : ''}</td>
                            <td style="text-align:right;font-weight:bold;">${l.closing_credit > 0 ? fmtXl(l.closing_credit) : ''}</td>
                        </tr>`;
                });
            });

            p.ledgers.forEach((l: LedgerData) => {
                html += `
                    <tr>
                        <td style="padding-left:20px;">${l.name}</td>
                        <td style="text-align:right;color:#475569;">${l.opening_debit > 0 ? fmtXl(l.opening_debit) : ''}</td>
                        <td style="text-align:right;color:#475569;">${l.opening_credit > 0 ? fmtXl(l.opening_credit) : ''}</td>
                        <td style="text-align:right;color:#475569;">${l.period_debit > 0 ? fmtXl(l.period_debit) : ''}</td>
                        <td style="text-align:right;color:#475569;">${l.period_credit > 0 ? fmtXl(l.period_credit) : ''}</td>
                        <td style="text-align:right;font-weight:bold;">${l.closing_debit > 0 ? fmtXl(l.closing_debit) : ''}</td>
                        <td style="text-align:right;font-weight:bold;">${l.closing_credit > 0 ? fmtXl(l.closing_credit) : ''}</td>
                    </tr>`;
            });
        });

        const gt = tableData.grandTotals;
        html += `
                </tbody>
                <tfoot>
                    <tr>
                        <td style="font-weight:bold;background-color:#0f172a;color:white;">GRAND TOTAL</td>
                        <td style="text-align:right;font-weight:bold;background-color:#0f172a;color:white;">${fmtXl(gt.opDr)}</td>
                        <td style="text-align:right;font-weight:bold;background-color:#0f172a;color:white;">${fmtXl(gt.opCr)}</td>
                        <td style="text-align:right;font-weight:bold;background-color:#1e293b;color:white;">${fmtXl(gt.perDr)}</td>
                        <td style="text-align:right;font-weight:bold;background-color:#1e293b;color:white;">${fmtXl(gt.perCr)}</td>
                        <td style="text-align:right;font-weight:bold;background-color:#0f172a;color:#4ade80;">${fmtXl(gt.clDr)}</td>
                        <td style="text-align:right;font-weight:bold;background-color:#0f172a;color:#4ade80;">${fmtXl(gt.clCr)}</td>
                    </tr>
                </tfoot>
            </table>
            </body>
            </html>`;

        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trial-balance-${fromDate}-to-${toDate}.xls`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <>
            {/* ── Print styles: isolates #tb-print-root during printing ─────── */}
            <style>{`
                .tb-print-company { display: none; }
                
                @media print {
                    /* Hide Next.js shell elements */
                    #__next > *:not(:has(#tb-print-root)),
                    nav, aside, header, footer,
                    [class*="sidebar"], [class*="Sidebar"],
                    [class*="navbar"], [class*="Navbar"] {
                        display: none !important;
                    }
                    
                    /* Make sure all ancestors of print root are visible */
                    #tb-print-root,
                    #tb-print-root * {
                        visibility: visible;
                    }
                    
                    /* Alternative approach — position print root to fill page */
                    #tb-print-root {
                        position: fixed !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        padding: 16px !important;
                        background: white !important;
                        z-index: 99999 !important;
                    }
                    
                    .no-print { display: none !important; }
                    .tb-print-company { 
                        display: block !important; 
                        text-align: center; 
                        margin-bottom: 12px; 
                    }
                    .tb-print-company h2 { 
                        font-size: 1.2rem; 
                        font-weight: 700; 
                        margin: 0 0 2px; 
                    }
                    .tb-print-company p { 
                        font-size: 0.78rem; 
                        color: #555; 
                        margin: 0; 
                    }
                    
                    table { width: 100%; border-collapse: collapse; }
                    th, td { 
                        padding: 4px 8px; 
                        border: 1px solid #ccc; 
                        font-size: 11px; 
                    }
                    * { 
                        color: #000 !important; 
                        background: #fff !important;
                        -webkit-print-color-adjust: exact;
                    }
                    tr { page-break-inside: avoid; }
                    
                    #tb-print-root[data-print-detail="without"] .tb-print-ledger-row { 
                        display: none !important; 
                    }
                }
            `}</style>

            {/* ── Print settings dialog ─────────────────────────────────────── */}
            {showPrintDialog && (
                <TBPrintDialog
                    open={showPrintDialog}
                    onClose={() => setShowPrintDialog(false)}
                    outletName={outlet?.name ?? 'MediFlow'}
                    fromDate={fromDate}
                    toDate={toDate}
                    onPrint={handlePrint}
                />
            )}

            {/* ── Ledger drilldown Sheet — outside print-root so it doesn't print ── */}
            <Sheet open={!!selectedLedgerId} onOpenChange={(open) => !open && setSelectedLedgerId(null)}>
                <SheetContent side="right" className="w-[800px] sm:max-w-4xl overflow-y-auto bg-slate-50">
                    <SheetHeader className="bg-white p-6 border-b -mx-6 -mt-6 rounded-t-xl mb-6 shadow-sm">
                        <SheetTitle className="text-2xl text-slate-800 tracking-tight">
                            Ledger Drilldown: {selectedLedgerName}
                        </SheetTitle>
                        <p className="text-slate-500 text-sm mt-1">
                            Detailed transaction view from {fromDate} to {toDate}
                        </p>
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
                                        <TableHead className="font-semibold text-slate-700">Type &amp; Ref</TableHead>
                                        <TableHead className="font-semibold text-slate-700">Particulars</TableHead>
                                        <TableHead className="text-right font-semibold text-slate-700">Debit (₹)</TableHead>
                                        <TableHead className="text-right font-semibold text-slate-700">Credit (₹)</TableHead>
                                        <TableHead className="text-right font-bold text-slate-800">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow className="bg-slate-50/80">
                                        <TableCell colSpan={5} className="text-right uppercase text-[11px] font-bold tracking-widest text-slate-500 pt-4 pb-3">
                                            Opening Balance
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-700 pt-4 pb-3">
                                            {ledgerStatement.openingBalance === 0
                                                ? '—'
                                                : `${fmt(Math.abs(ledgerStatement.openingBalance))} ${ledgerStatement.openingBalance > 0 ? 'Dr' : 'Cr'}`}
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
                                        <TableCell colSpan={5} className="text-right text-slate-300 font-bold uppercase text-xs tracking-widest border-none py-5">
                                            Closing Balance
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-white text-[15px] border-none py-5">
                                            {ledgerStatement.closingBalance === 0
                                                ? '—'
                                                : `${fmt(Math.abs(ledgerStatement.closingBalance))} ${ledgerStatement.closingBalance > 0 ? 'Dr' : 'Cr'}`}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* ── Printable report root ─────────────────────────────────────── */}
            <div id="tb-print-root" className="space-y-6 p-6 print:p-0 print:space-y-4">

                {/* Print-only header — hidden on screen, shown in print */}
                <div className="tb-print-company">
                    <h2>{outlet?.name ?? 'MediFlow'}</h2>
                    <p>Trial Balance</p>
                    <p>Period: {fromDate} to {toDate}</p>
                    <hr style={{ margin: '6px 0', borderColor: '#ccc' }} />
                </div>

                {/* ── Page controls (hidden on print) ────────────────────────── */}
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
                                value={fromDate}
                                onChange={e => setFromDate(e.target.value)}
                            />
                            <span className="text-slate-400 mx-1">to</span>
                            <input
                                type="date"
                                className="bg-transparent text-sm border-none outline-none focus:ring-0 px-2"
                                value={toDate}
                                onChange={e => setToDate(e.target.value)}
                            />
                            <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" onClick={() => refetch()}>
                                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                            </Button>
                        </div>

                        <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-1.5 shadow-sm h-[40px]">
                            <Switch id="zero-toggle" checked={showZero} onCheckedChange={setShowZero} />
                            <Label htmlFor="zero-toggle" className="text-sm cursor-pointer whitespace-nowrap">Show Zeros</Label>
                        </div>

                        <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={isLoading || !data} className="h-[40px]">
                            <Download className="mr-2 h-4 w-4" /> Export Excel
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setShowPrintDialog(true)} className="h-[40px]">
                            <Printer className="mr-2 h-4 w-4" /> Print
                        </Button>
                    </div>
                </div>

                {isError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 no-print">
                        Failed to load trial balance data.
                    </div>
                )}

                {/* ── Report card ────────────────────────────────────────────── */}
                <Card className="print:border-none print:shadow-none print:bg-transparent">
                    <CardHeader className="print:hidden pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base text-slate-800">
                                For the period {fromDate} to {toDate}
                            </CardTitle>
                            {data && (
                                <Badge variant={balanced ? 'default' : 'destructive'} className={balanced ? 'bg-green-600' : ''}>
                                    {balanced ? 'Balanced ✓' : 'Unbalanced ✗'}
                                </Badge>
                            )}
                        </div>
                    </CardHeader>

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
                                            <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                                                Aggregating Ledgers...
                                            </TableCell>
                                        </TableRow>
                                    ) : tableData.parentGroups.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                                                No ledgers to display in this period
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        <>
                                            {tableData.parentGroups.map(p => {
                                                const isParentExpanded = expandedGroups[p.id] === true;
                                                return (
                                                    // ✅ React fragment instead of invalid <div class="contents"> in <tbody>
                                                    <Fragment key={p.id}>
                                                        {/* Parent Group Row */}
                                                        <TableRow
                                                            className="bg-slate-100 border-b-2 hover:bg-slate-200 cursor-pointer print:bg-transparent"
                                                            onClick={() => toggleGroup(p.id)}
                                                        >
                                                            <TableCell className="font-bold text-slate-900 px-4 py-3 flex items-center gap-1.5 uppercase text-[15px]">
                                                                {isParentExpanded
                                                                    ? <ChevronDown className="h-4 w-4 text-slate-500" />
                                                                    : <ChevronRight className="h-4 w-4 text-slate-500" />}
                                                                {p.name}
                                                            </TableCell>
                                                            <TableCell className="text-right font-bold text-slate-800">{fmt(p.totals.opDr)}</TableCell>
                                                            <TableCell className="text-right font-bold text-slate-800">{fmt(p.totals.opCr)}</TableCell>
                                                            <TableCell className="text-right font-bold text-slate-800 bg-blue-50/50 print:bg-transparent">{fmt(p.totals.perDr)}</TableCell>
                                                            <TableCell className="text-right font-bold text-slate-800 bg-blue-50/50 print:bg-transparent">{fmt(p.totals.perCr)}</TableCell>
                                                            <TableCell className="text-right font-bold text-slate-900">{fmt(p.totals.clDr)}</TableCell>
                                                            <TableCell className="text-right font-bold text-slate-900">{fmt(p.totals.clCr)}</TableCell>
                                                        </TableRow>

                                                        {/* Nested child groups */}
                                                        {isParentExpanded && p.children.map((c: any) => {
                                                            const isChildExpanded = expandedGroups[c.id] === true;
                                                            return (
                                                                <Fragment key={c.id}>
                                                                    <TableRow
                                                                        className="bg-slate-50/80 hover:bg-slate-100 cursor-pointer print:bg-transparent border-l-4 border-l-slate-300"
                                                                        onClick={() => toggleGroup(c.id)}
                                                                    >
                                                                        <TableCell className="font-semibold text-slate-800 py-2.5 flex items-center gap-1.5" style={{ paddingLeft: '2rem' }}>
                                                                            {isChildExpanded
                                                                                ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                                                                : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                                                                            {c.name}
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-semibold text-slate-700">{fmt(c.totals.opDr)}</TableCell>
                                                                        <TableCell className="text-right font-semibold text-slate-700">{fmt(c.totals.opCr)}</TableCell>
                                                                        <TableCell className="text-right font-semibold text-slate-700 bg-blue-50/30 print:bg-transparent">{fmt(c.totals.perDr)}</TableCell>
                                                                        <TableCell className="text-right font-semibold text-slate-700 bg-blue-50/30 print:bg-transparent">{fmt(c.totals.perCr)}</TableCell>
                                                                        <TableCell className="text-right font-semibold text-slate-700">{fmt(c.totals.clDr)}</TableCell>
                                                                        <TableCell className="text-right font-semibold text-slate-700">{fmt(c.totals.clCr)}</TableCell>
                                                                    </TableRow>

                                                                    {/* Child ledger rows */}
                                                                    {isChildExpanded && c.ledgers.map((l: LedgerData) => (
                                                                        <TableRow
                                                                            key={l.id}
                                                                            className="hover:bg-blue-50/50 cursor-pointer border-l-4 border-l-slate-200 transition-colors tb-print-ledger-row"
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
                                                                </Fragment>
                                                            );
                                                        })}

                                                        {/* Parent direct ledger rows */}
                                                        {isParentExpanded && p.ledgers.map((l: LedgerData) => (
                                                            <TableRow
                                                                key={l.id}
                                                                className="hover:bg-blue-50/50 cursor-pointer border-l-4 border-l-slate-300 transition-colors tb-print-ledger-row"
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
                                                    </Fragment>
                                                );
                                            })}

                                            {/* Grand Totals row */}
                                            <TableRow className="bg-slate-900 hover:bg-slate-900 border-none print:bg-transparent print:border-t-2 print:border-gray-800">
                                                <TableCell className="font-bold text-white px-4 py-4 print:text-black">GRAND TOTAL</TableCell>
                                                <TableCell className="text-right font-bold text-white font-mono print:text-black">{fmt(tableData.grandTotals?.opDr ?? 0)}</TableCell>
                                                <TableCell className="text-right font-bold text-white font-mono print:text-black">{fmt(tableData.grandTotals?.opCr ?? 0)}</TableCell>
                                                <TableCell className="text-right font-bold text-white font-mono bg-slate-800/50 print:bg-transparent print:text-black">{fmt(tableData.grandTotals?.perDr ?? 0)}</TableCell>
                                                <TableCell className="text-right font-bold text-white font-mono bg-slate-800/50 print:bg-transparent print:text-black">{fmt(tableData.grandTotals?.perCr ?? 0)}</TableCell>
                                                <TableCell className="text-right font-bold text-green-400 font-mono text-[15px] print:text-black">{fmt(tableData.grandTotals?.clDr ?? 0)}</TableCell>
                                                <TableCell className="text-right font-bold text-green-400 font-mono text-[15px] print:text-black">{fmt(tableData.grandTotals?.clCr ?? 0)}</TableCell>
                                            </TableRow>
                                        </>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

// ─── Print Settings Dialog ────────────────────────────────────────────────────
function TBPrintDialog({
    open, onClose, outletName, fromDate, toDate, onPrint,
}: {
    open: boolean; onClose: () => void;
    outletName: string; fromDate: string; toDate: string;
    onPrint: (layout: string, detail: string) => void;
}) {
    const [layout, setLayout] = useState<'portrait' | 'landscape'>('portrait');
    const [detail, setDetail] = useState<'with' | 'without'>('with');

    if (!open) return null;

    return (
        <div
            className="no-print"
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    🖨️ Print Settings
                </h3>

                {/* Paper size */}
                <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#6b7280', marginBottom: 8 }}>Paper Size</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {([{ v: 'portrait', l: 'A4 Portrait' }, { v: 'landscape', l: 'A4 Landscape' }] as const).map(o => (
                            <button key={o.v} onClick={() => setLayout(o.v)}
                                style={{
                                    flex: 1, padding: '8px 12px',
                                    border: `2px solid ${layout === o.v ? '#4f46e5' : '#e2e8f0'}`,
                                    borderRadius: 8, background: layout === o.v ? '#eef2ff' : 'white',
                                    cursor: 'pointer', fontSize: 13,
                                    fontWeight: layout === o.v ? 700 : 400,
                                    color: layout === o.v ? '#4f46e5' : '#374151',
                                }}
                            >{o.l}</button>
                        ))}
                    </div>
                </div>

                {/* Detail level */}
                <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#6b7280', marginBottom: 8 }}>Detail Level</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {([{ v: 'with', l: 'With Detail' }, { v: 'without', l: 'Summary Only' }] as const).map(o => (
                            <button key={o.v} onClick={() => setDetail(o.v)}
                                style={{
                                    flex: 1, padding: '8px 12px',
                                    border: `2px solid ${detail === o.v ? '#4f46e5' : '#e2e8f0'}`,
                                    borderRadius: 8, background: detail === o.v ? '#eef2ff' : 'white',
                                    cursor: 'pointer', fontSize: 13,
                                    fontWeight: detail === o.v ? 700 : 400,
                                    color: detail === o.v ? '#4f46e5' : '#374151',
                                }}
                            >{o.l}</button>
                        ))}
                    </div>
                </div>

                {/* Info */}
                <div style={{ fontSize: 12, color: '#6b7280', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
                    <strong style={{ color: '#374151' }}>{outletName}</strong><br />
                    Trial Balance · {fromDate} to {toDate}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={onClose}
                        style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: 'white' }}
                    >Cancel</button>
                    <button
                        onClick={() => { onPrint(layout, detail); onClose(); }}
                        style={{ padding: '8px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                    >🖨️ Print</button>
                </div>
            </div>
        </div>
    );
}


