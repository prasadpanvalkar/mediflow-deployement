'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { ArrowLeft, Printer, MessageCircle, AlertCircle, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { salesApi } from '@/lib/apiClient'
import { InvoicePreview } from '@/components/billing/InvoicePreview'
import { InvoiceThermal } from '@/components/billing/InvoiceThermal'
import { useSettingsStore } from '@/store/settingsStore'

// Loading Skeleton
function InvoiceSkeleton() {
    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                <div className="space-y-2">
                    <div className="h-4 w-16 bg-slate-200 rounded" />
                    <div className="h-6 w-48 bg-slate-200 rounded" />
                </div>
                <div className="flex gap-3">
                    <div className="h-9 w-28 bg-slate-200 rounded-lg" />
                    <div className="h-9 w-28 bg-slate-200 rounded-lg" />
                </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <div className="h-6 w-40 bg-slate-200 rounded mx-auto" />
                <div className="h-4 w-64 bg-slate-100 rounded mx-auto" />
                <div className="border-t border-slate-100 pt-4 space-y-3">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex justify-between">
                            <div className="h-4 bg-slate-100 rounded w-1/3" />
                            <div className="h-4 bg-slate-100 rounded w-1/4" />
                        </div>
                    ))}
                </div>
                <div className="border-t border-slate-200 pt-4">
                    <div className="h-5 w-32 bg-slate-200 rounded ml-auto" />
                </div>
            </div>
        </div>
    )
}

export default function PastInvoicePage() {
    const params = useParams()
    const router = useRouter()
    const { printerType } = useSettingsStore()
    const invoiceId = params.id as string
    const [copied, setCopied] = useState(false)

    const printRef = useRef<HTMLDivElement>(null)

    const handlePrint = () => {
        if (typeof window !== 'undefined') window.print()
    }
    const isThermal = printerType?.startsWith('thermal')

    const { data: invoice, isLoading, isError } = useQuery({
        queryKey: ['invoice', invoiceId],
        queryFn: () => salesApi.getById(invoiceId),
        enabled: !!invoiceId,
        staleTime: 1000 * 60 * 10, // invoices don't change
        retry: 1,
    })

    const handleWhatsApp = () => {
        const text = encodeURIComponent(`Your invoice ${invoice?.invoiceNo} from MediFlow Pharmacy. Thank you!`)
        window.open(`https://wa.me/?text=${text}`, '_blank')
    }

    const handleCopyLink = async () => {
        await navigator.clipboard.writeText(window.location.href)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    if (isLoading) return <InvoiceSkeleton />

    if (isError || !invoice) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <AlertCircle className="w-12 h-12 text-red-500" />
                <h2 className="text-xl font-bold text-slate-800">Invoice Not Found</h2>
                <p className="text-slate-500 text-sm text-center">
                    Invoice ID: <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{invoiceId}</span> might be invalid or deleted.
                </p>
                <Button variant="outline" onClick={() => router.back()} className="mt-4">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
                </Button>
            </div>
        )
    }

    return (
        <div className="past-invoice-print-container max-w-4xl mx-auto space-y-6">

            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 print:hidden">
                <div>
                    <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-2 text-slate-500 mb-1 hover:text-slate-900">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <h1 className="text-xl font-bold text-slate-900">Invoice: {invoice.invoiceNo}</h1>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-none"
                        onClick={handleCopyLink}
                    >
                        {copied
                            ? <><Check className="w-4 h-4 mr-2 text-green-600" /> Copied!</>
                            : <><Copy className="w-4 h-4 mr-2" /> Copy Link</>
                        }
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-none"
                        onClick={handleWhatsApp}
                    >
                        <MessageCircle className="w-4 h-4 mr-2 text-green-600" /> WhatsApp
                    </Button>
                    <Button
                        size="sm"
                        className="flex-1 sm:flex-none"
                        onClick={handlePrint}
                    >
                        <Printer className="w-4 h-4 mr-2" /> Reprint Bill
                    </Button>
                </div>
            </div>

            {/* Invoice Container */}
            <div className={`mx-auto bg-white shadow-md border border-slate-200 rounded-xl overflow-hidden py-4 print:shadow-none print:border-none print:py-0 print:m-0 ${isThermal ? 'w-[80mm] box-content' : ''}`}>
                <div className="flex items-center justify-between px-6 py-2 bg-slate-50 border-b border-slate-200 mb-6 text-sm print:hidden">
                    <span className="font-semibold text-slate-600">
                        {isThermal ? 'Thermal Layout' : 'A4 Layout'}
                    </span>
                    <span className="text-slate-400">Printer: {printerType}</span>
                </div>
                
                {/* Built-in Print Overrides for native Ctrl+P to hide nav/sidebar */}
                <style dangerouslySetInnerHTML={{ __html: `
                    @media print {
                        @page {
                            size: ${!isThermal ? 'auto' : printerType === 'thermal_80mm' ? '80mm auto' : '57mm auto'};
                            margin: 0mm;
                        }
                        body { -webkit-print-color-adjust: exact; }
                        body * { visibility: hidden; }
                        /* We want to make sure the root layout sidebar and header don't show up. */
                        .past-invoice-print-container, .past-invoice-print-container * { visibility: visible; }
                        /* But hide the header actions */
                        .past-invoice-print-container .print\\:hidden, .past-invoice-print-container .print\\:hidden * { display: none !important; }
                        .past-invoice-print-container {
                            position: absolute;
                            left: 0;
                            top: 0;
                            margin: 0;
                            width: 100%;
                            max-width: none !important;
                            transform: none !important;
                            box-shadow: none !important;
                        }
                    }
                ` }} />

                {isThermal ? (
                    <InvoiceThermal ref={printRef} invoice={invoice} />
                ) : (
                    <InvoicePreview ref={printRef} invoice={invoice} />
                )}
            </div>
        </div>
    )
}
