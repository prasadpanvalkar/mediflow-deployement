'use client'

import { Lock, Search } from 'lucide-react'
import { useBillingStore } from '@/store/billingStore'

export function BillingEmptyState({ isPinVerified }: { isPinVerified: boolean }) {
    const { cartCount, lastInvoice } = useBillingStore()
    const count = cartCount()

    if (!isPinVerified) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-500">
                <div className="bg-slate-100 p-4 rounded-full mb-4">
                    <Lock className="w-12 h-12 text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Enter your PIN to start billing</h3>
                <p className="text-slate-500 mt-2 max-w-sm">
                    Use the secure keypad overlay to verify your identity and access the POS system.
                </p>
            </div>
        )
    }

    if (count === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-500">
                {lastInvoice ? (
                    <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-5 mb-8 max-w-sm w-full">
                        <div className="font-semibold text-lg mb-1">Success!</div>
                        <p className="text-sm">Invoice <span className="font-bold">{lastInvoice.invoiceNo}</span> created.</p>
                        <div className="mt-3 flex gap-2">
                            <button className="flex-1 bg-white border border-green-200 text-green-700 text-sm py-1.5 rounded-lg font-medium hover:bg-green-50 transition-colors">
                                Print Receipt
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-blue-50/50 p-4 rounded-full mb-4">
                        <Search className="w-12 h-12 text-blue-300" />
                    </div>
                )}

                <h3 className="text-xl font-bold text-slate-900">Search for a medicine</h3>
                <p className="text-slate-500 mt-2 max-w-sm">
                    Type the medicine name, salt, or scan the product barcode to add to cart.
                </p>

                <div className="mt-8 flex items-center gap-3 text-sm text-slate-400">
                    <span>Press</span>
                    <kbd className="bg-slate-100 border border-slate-200 px-2 py-1 rounded text-slate-600 font-sans font-medium">
                        /
                    </kbd>
                    <span>to focus search</span>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex items-center justify-center text-slate-400">
            <p>Select a product to configure add-to-cart options</p>
        </div>
    )
}
