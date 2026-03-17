'use client';

import { useState } from 'react';
import { Download, ChevronDown, Sheet, FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DateRangeFilter } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useGSTReport } from '@/hooks/useReports';
import {
    exportSalesReportCSV,
    exportGSTReportCSV,
    exportStockValuationCSV,
    exportExpiryReportCSV,
    exportStaffReportCSV,
    exportPurchaseReportCSV,
} from '@/lib/reportExport';

interface ExportButtonProps {
    activeTab: string;
    dateRange: DateRangeFilter;
}

export function ExportButton({ activeTab, dateRange }: ExportButtonProps) {
    const [pdfLoading, setPdfLoading] = useState(false);
    const { outlet } = useAuthStore();
    const { data: gstData } = useGSTReport(dateRange);

    const handleCSV = () => {
        const allSales: any[] = []; // Phase 2: getSalesReport API not yet wired to this component

        switch (activeTab) {
            case 'sales':
                exportSalesReportCSV(allSales, dateRange);
                break;
            case 'gst':
                if (gstData) exportGSTReportCSV(gstData);
                break;
            case 'stock':
                exportStockValuationCSV([]); // Phase 2: NOT_IMPLEMENTED
                break;
            case 'expiry':
                exportExpiryReportCSV([]); // Phase 2: NOT_IMPLEMENTED
                break;
            case 'staff':
                exportStaffReportCSV([], dateRange); // Phase 2: NOT_IMPLEMENTED
                break;
            case 'purchases':
                exportPurchaseReportCSV([], dateRange); // Phase 2: NOT_IMPLEMENTED
                break;
        }
    };

    const handleGSTPDF = async () => {
        if (!gstData || !outlet) return;
        setPdfLoading(true);
        try {
            const { pdf } = await import('@react-pdf/renderer');
            const { GSTReportPDF } = await import('@/lib/GSTReportPDF');
            const blob = await pdf(<GSTReportPDF summary={gstData} outlet={outlet} />).toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `GST-Report-${dateRange.from}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setPdfLoading(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={pdfLoading}>
                    {pdfLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <Download className="w-4 h-4 mr-2" />
                    )}
                    {pdfLoading ? 'Generating...' : 'Export'}
                    <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCSV}>
                    <Sheet className="w-4 h-4 mr-2" />
                    Export CSV
                    <span className="ml-auto text-xs text-muted-foreground">⌘E</span>
                </DropdownMenuItem>
                {activeTab === 'gst' && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleGSTPDF}>
                            <FileDown className="w-4 h-4 mr-2" />
                            Export PDF (GST Report)
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
