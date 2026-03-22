'use client'

import { useState } from 'react'
import { ShoppingCart, X, Trash2, UserPlus, Minus, Plus } from 'lucide-react'
import { useBillingStore } from '@/store/billingStore'
import { formatCurrency } from '@/lib/gst'
import { cn } from '@/lib/utils'
import { ScheduleHAlert } from './ScheduleHAlert'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'

// Inline date helper to avoid external date-fns dependency
const diffInDays = (dateStr: string) => Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

interface BillingCartProps {
    onProceedToPayment?: () => void
}

export function BillingCart({ onProceedToPayment }: BillingCartProps = {}) {
    const {
        cart,
        customer,
        getTotals,
        isPinVerified,
        updateCartItem,
        removeFromCart,
        clearCart
    } = useBillingStore()

    const totals = getTotals()

    const handleQtyChange = (batchId: string, currentTotalQty: number, packSize: number, delta: number, currentStrips: number, currentLoose: number) => {
        // Find if we are operating in loose or strip mode based on what's in cart.
        // For simplicity, if qtyStrips > 0 we alter strips, else we alter loose.
        // If both, prioritizing strips for the `+`/`-` buttons.
        const isLooseOnly = currentStrips === 0 && currentLoose > 0;
        
        let newTotalQty = 0;
        let newStrips = currentStrips;
        let newLoose = currentLoose;

        if (isLooseOnly) {
            newLoose = Math.max(1, currentLoose + delta);
            newTotalQty = newLoose / packSize;
        } else {
            newStrips = Math.max(1, currentStrips + delta);
            newTotalQty = newStrips;
        }

        updateCartItem(batchId, { 
            qtyStrips: newStrips, 
            qtyLoose: newLoose, 
            totalQty: newTotalQty 
        })
    }

    const CartContent = () => (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="px-4 py-3 border-b flex justify-between items-center bg-white z-10 shrink-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 leading-none">Cart</h3>
                    <span data-testid="cart-count" className="bg-slate-100 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                        {totals.itemCount} items
                    </span>
                </div>

                {customer ? (
                    <div className="bg-blue-50 text-blue-700 text-xs border border-blue-200 rounded-lg px-2 py-1 flex items-center gap-1.5 max-w-[150px]">
                        <span className="truncate">{customer.name}</span>
                        <button 
                            onClick={clearCart /* placeholder for remove customer specifically */}
                            className="hover:bg-blue-200/50 rounded-full p-0.5"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <button className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
                        Add Customer <UserPlus className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Items List */}
            <ScrollArea className="flex-1 w-full">
                {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                        <ShoppingCart className="w-16 h-16 text-slate-200 mb-4" />
                        <p className="font-medium text-slate-600">Cart is empty</p>
                        <p className="text-sm text-muted-foreground mt-1">Search for a medicine to add</p>
                    </div>
                ) : (
                    <div className="pb-4">
                        {cart.map((item, index) => {
                            const isExpiringSoon = diffInDays(item.expiryDate) < 90

                            return (
                                <div key={item.batchId} data-testid={`cart-item-${index}`} className="px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group">
                                    {/* Row 1 */}
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="text-sm font-semibold text-slate-900 leading-tight">
                                            {item.name}
                                            <span className="text-xs font-normal text-muted-foreground ml-1.5 block sm:inline">
                                                {item.packSize} {item.packUnit}s
                                            </span>
                                        </div>
                                        <button
                                            data-testid={`remove-item-${index}`}
                                            onClick={() => removeFromCart(item.batchId)}
                                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1 -mr-1"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Row 2 */}
                                    <div className="flex items-center justify-between mt-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">Batch: {item.batchNo}</span>
                                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", isExpiringSoon ? "text-red-600 bg-red-50 border-red-200" : "text-muted-foreground border-slate-200")}>
                                                Exp: {new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>
                                        {item.scheduleType !== 'OTC' && (
                                            <span className={cn("text-[10px] font-semibold px-1 rounded border", ['H1', 'X', 'Narcotic'].includes(item.scheduleType) ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-600 border-amber-200")}>
                                                {item.scheduleType}
                                            </span>
                                        )}
                                    </div>

                                    {/* Row 3 */}
                                    <div className="flex items-end justify-between mt-2.5">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-0.5">
                                                <button 
                                                    onClick={() => handleQtyChange(item.batchId, item.totalQty, item.packSize, -1, item.qtyStrips, item.qtyLoose)}
                                                    className="w-7 h-7 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95"
                                                >
                                                    <Minus className="w-3 h-3" />
                                                </button>
                                                <input
                                                    data-testid={`qty-strips-${index}`}
                                                    type="number"
                                                    min={1}
                                                    value={item.qtyStrips > 0 ? item.qtyStrips : item.qtyLoose}
                                                    onChange={(e) => {
                                                        const newQty = Math.max(1, parseInt(e.target.value) || 1)
                                                        const newStrips = item.qtyStrips > 0 ? newQty : 0
                                                        const newLoose = item.qtyStrips > 0 ? 0 : newQty
                                                        updateCartItem(item.batchId, {
                                                            qtyStrips: newStrips,
                                                            qtyLoose: newLoose,
                                                            totalQty: newQty
                                                        })
                                                    }}
                                                    className="w-10 h-7 text-center text-sm font-medium border-y border-slate-200 bg-white focus:outline-none"
                                                />
                                                <button 
                                                    onClick={() => handleQtyChange(item.batchId, item.totalQty, item.packSize, 1, item.qtyStrips, item.qtyLoose)}
                                                    className="w-7 h-7 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                                {item.qtyStrips > 0 ? 'Strips' : 'Loose'}
                                            </span>
                                        </div>

                                        <div className="text-right">
                                            {item.discountPct > 0 && (
                                                <div className="flex items-center justify-end gap-1.5 mb-0.5">
                                                    <span className="text-xs text-muted-foreground line-through decoration-slate-300">
                                                        {formatCurrency(item.mrp * item.totalQty)}
                                                    </span>
                                                    <span className="text-[10px] bg-green-100 text-green-700 font-semibold rounded px-1 py-0.5">
                                                        {item.discountPct}% OFF
                                                    </span>
                                                </div>
                                            )}
                                            <div data-testid={`line-total-${index}`} className="text-sm font-bold text-slate-900">
                                                {formatCurrency((item.mrp * (1 - item.discountPct / 100)) * item.totalQty)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        
                        <ScheduleHAlert 
                            hasScheduleH={totals.hasScheduleH} 
                            requiresDoctorDetails={totals.requiresDoctorDetails} 
                        />
                    </div>
                )}
            </ScrollArea>

            {/* Totals Section */}
            <div className="border-t border-slate-200 bg-slate-50/80 shrink-0">
                <div className="px-4 py-3 space-y-1.5 text-sm">
                    <div className="flex justify-between text-slate-500">
                        <span>Subtotal (MRP)</span>
                        <span data-testid="cart-subtotal">{formatCurrency(totals.subtotal)}</span>
                    </div>
                    {totals.discountAmount > 0 && (
                        <div className="flex justify-between text-green-600 font-medium">
                            <span>Discount</span>
                            <span>-{formatCurrency(totals.discountAmount)}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-slate-600 pt-1.5 border-t border-slate-200/60 mt-1.5">
                        <span>Taxable Amount</span>
                        <span>{formatCurrency(totals.taxableAmount)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-xs">
                        <span>CGST/SGST</span>
                        <span data-testid="cart-gst">{formatCurrency(totals.cgstAmount + totals.sgstAmount)}</span>
                    </div>
                    <div className="flex justify-between items-end pt-2 mt-2 border-t border-slate-200">
                        <span className="font-semibold text-slate-900">Grand Total</span>
                        <div className="text-right">
                            <span data-testid="cart-total" className="font-bold text-xl text-slate-900 leading-none">{formatCurrency(totals.grandTotal)}</span>
                        </div>
                    </div>
                    {totals.amountDue > 0 && totals.amountPaid > 0 && (
                        <div className="flex justify-between text-red-600 text-xs font-semibold pt-1">
                            <span>Balance Due</span>
                            <span>{formatCurrency(totals.amountDue)}</span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-4 pb-4 pt-2 space-y-2">
                    <button
                        data-testid="save-bill-btn"
                        onClick={onProceedToPayment}
                        disabled={cart.length === 0 || !isPinVerified}
                        className="w-full h-12 bg-primary text-white rounded-xl font-semibold text-base flex justify-between items-center px-5 transition-transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
                    >
                        <span>Proceed to Payment</span>
                        <span className="text-sm font-medium bg-black/20 px-2 py-0.5 rounded backdrop-blur-sm hidden sm:block">Ctrl+S</span>
                    </button>
                    
                    <div className="flex gap-2">
                        <button 
                            disabled={cart.length === 0}
                            className="flex-1 h-10 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-100 disabled:opacity-50 transition-colors"
                        >
                            Save Draft
                        </button>
                        <button 
                            onClick={clearCart}
                            disabled={cart.length === 0}
                            className="flex-1 h-10 border border-red-100 text-red-600 bg-red-50/50 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50 transition-colors"
                        >
                            Clear Cart
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )

    return (
        <div className="h-full w-full border-l border-slate-200 flex flex-col shadow-[-4px_0_24px_-16px_rgba(0,0,0,0.1)]">
            <CartContent />
        </div>
    )
}

export function MobileCartFAB({ onProceedToPayment }: BillingCartProps = {}) {
    const { cartCount, isCartOpen, toggleCart } = useBillingStore()
    const count = cartCount()

    return (
        <Sheet open={isCartOpen} onOpenChange={(open) => {
            if (open !== isCartOpen) toggleCart()
        }}>
            <SheetTrigger asChild>
                <button 
                    className={cn(
                        "fixed bottom-20 right-4 bg-primary text-white rounded-full w-14 h-14 shadow-xl shadow-blue-500/20 flex items-center justify-center transition-transform active:scale-95 z-40 lg:hidden",
                        count === 0 && "bg-slate-800 shadow-none opacity-80"
                    )}
                >
                    <ShoppingCart className="w-6 h-6" />
                    {count > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-50">
                            {count}
                        </span>
                    )}
                </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="p-0 h-[85vh] rounded-t-2xl sm:max-w-md sm:mx-auto">
                {/* Visual indicator handle */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full z-50 pointer-events-none" />
                <div className="h-full pt-4">
                    <BillingCart onProceedToPayment={onProceedToPayment} />
                </div>
            </SheetContent>
        </Sheet>
    )
}
