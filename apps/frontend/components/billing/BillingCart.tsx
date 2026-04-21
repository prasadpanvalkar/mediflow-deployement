'use client'
import { useState, useEffect, useMemo } from 'react'

import { ShoppingCart, X, Trash2, UserPlus, Minus, Plus } from 'lucide-react'
import { useBillingStore } from '@/store/billingStore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency } from '@/lib/gst'
import { cn, formatQty } from '@/lib/utils'
import { SCHEDULE_MARKERS } from '@/constants/scheduleTypes'
import { ScheduleHAlert } from './ScheduleHAlert'
import { CustomerSelector } from './CustomerSelector'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'

import { calculateLandingRate } from '@/lib/purchase-calculations'
import { useOutletSettings } from '@/hooks/useOutletSettings'

// Inline date helper to avoid external date-fns dependency
const diffInDays = (dateStr: string) => Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

interface BillingCartProps {
    onProceedToPayment?: () => void
    onAddDoctorDetails?: () => void
}



const CartItemRow = ({ 
    item, 
    index, 
    onRateErrorChange, 
    onFloorErrorChange,
    removeFromCart, 
    updateCartItem, 
    applyDiscountToItem, 
    canViewRates 
}: any) => {
    const { backendRateErrors, clearBackendRateError } = useBillingStore();
    const isExpiringSoon = diffInDays(item.expiryDate) < 90;
    
    const { data: settings } = useOutletSettings();

    const landingRate = useMemo(() => {
        return calculateLandingRate(
            item.purchaseRate || 0,
            item.gstRate || 0,
            item.freight || 0,
            !!settings?.landingCostIncludeGst,
            settings?.landingCostIncludeFreight ?? true
        );
    }, [item.purchaseRate, item.gstRate, item.freight, settings]);

    // Validation
    const backendError = backendRateErrors[item.batchId];
    const isWarning = item.rate < landingRate;
    const isError = item.rate > item.mrp;

    useEffect(() => {
        onRateErrorChange(item.batchId, isError);
    }, [isError, item.batchId]);

    useEffect(() => {
        onFloorErrorChange(item.batchId, isWarning);
    }, [isWarning, item.batchId]);

    const displayError = backendError ? backendError : isError ? `Exceeds MRP (₹${item.mrp.toFixed(2)})` : null;
    const displayWarning = isWarning && !isError && !backendError ? `Below landing rate (₹${landingRate.toFixed(2)})` : null;

    // ── Draft state for Rate input ──────────────────────────────────────────
    const [rateDraft, setRateDraft] = useState('');
    const [rateFocused, setRateFocused] = useState(false);

    const rateDisplay = rateFocused
        ? rateDraft
        : (item.rate === 0 && item.discountPct > 0 ? '' : item.rate.toFixed(2));

    const commitRate = (raw: string) => {
        const newRate = Math.max(0, parseFloat(raw) || 0);
        const pct = item.mrp > 0 ? Math.min(100, ((item.mrp - newRate) / item.mrp) * 100) : 0;
        applyDiscountToItem(item.batchId, Math.max(0, pct));
        if (backendError) clearBackendRateError(item.batchId);
    };

    // ── Draft state for Qty input ───────────────────────────────────────────
    const currentQty = item.qtyStrips > 0 ? item.qtyStrips : item.qtyLoose;
    const [qtyDraft, setQtyDraft] = useState('');
    const [qtyFocused, setQtyFocused] = useState(false);

    const qtyDisplay = qtyFocused ? qtyDraft : String(currentQty);

    const commitQty = (raw: string) => {
        const newQty = Math.max(1, parseInt(raw) || 1);
        const newStrips = item.qtyStrips > 0 ? newQty : 0;
        const newLoose  = item.qtyStrips > 0 ? 0 : newQty;
        updateCartItem(item.batchId, { qtyStrips: newStrips, qtyLoose: newLoose, totalQty: newQty });
    };

    const handleQtyStep = (delta: number) => {
        const isLooseOnly = item.qtyStrips === 0 && item.qtyLoose > 0;
        let newStrips = item.qtyStrips;
        let newLoose  = item.qtyLoose;
        let newTotal  = 0;
        if (isLooseOnly) {
            newLoose = Math.max(1, item.qtyLoose + delta);
            newTotal = newLoose / item.packSize;
        } else {
            newStrips = Math.max(1, item.qtyStrips + delta);
            newTotal  = newStrips;
        }
        updateCartItem(item.batchId, { qtyStrips: newStrips, qtyLoose: newLoose, totalQty: newTotal });
        if (backendError) clearBackendRateError(item.batchId);
    };

    // shared no-spinner class
    const noSpin = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

    return (
        <div data-testid={`cart-item-${index}`} className={cn("px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group", displayWarning && !displayError ? "bg-amber-50/30" : "")}>
            <div className="flex justify-between items-start gap-2">
                <div className="text-sm font-semibold text-slate-900 leading-tight">
                    {item.name}
                    <span className="text-xs font-normal text-muted-foreground ml-1.5 block sm:inline">
                        {item.packSize} {item.packUnit}s
                    </span>
                </div>
                <button
                    data-testid={`remove-item-${index}`}
                    onClick={() => {
                        removeFromCart(item.batchId);
                        onRateErrorChange(item.batchId, false);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1 -mr-1"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Batch: {item.batchNo}</span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", isExpiringSoon ? "text-red-600 bg-red-50 border-red-200" : "text-muted-foreground border-slate-200")}>
                        Exp: {new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    {canViewRates && (
                        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 text-[10px] leading-none shrink-0" title={`Per Unit Cost: ₹${item.purchaseRate || 0}`}>
                            <span className="text-emerald-700 font-semibold whitespace-nowrap">PR: ₹{item.purchaseRate || 0}</span>
                            <span className="w-[1px] h-2 bg-emerald-200/60" />
                            <span className="text-emerald-600 whitespace-nowrap font-medium">Mrg: ₹{(((item.rate - (item.purchaseRate || 0)) * item.totalQty).toFixed(2))}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-end justify-between mt-2.5">
                {/* ── Qty stepper ── */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-0.5">
                        <button
                            onClick={() => handleQtyStep(-1)}
                            className="w-7 h-7 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95"
                        >
                            <Minus className="w-3 h-3" />
                        </button>
                        <input
                            data-testid={`qty-strips-${index}`}
                            inputMode="numeric"
                            value={qtyDisplay}
                            className={`w-10 h-7 text-center text-sm font-medium border-y border-slate-200 bg-white focus:outline-none ${noSpin}`}
                            onFocus={(e) => {
                                setQtyFocused(true);
                                setQtyDraft(String(currentQty));
                                e.target.select();
                            }}
                            onChange={(e) => setQtyDraft(e.target.value)}
                            onBlur={() => {
                                setQtyFocused(false);
                                commitQty(qtyDraft);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { commitQty(qtyDraft); (e.target as HTMLInputElement).blur(); }
                                if (e.key === 'ArrowUp')   { e.preventDefault(); handleQtyStep(1); }
                                if (e.key === 'ArrowDown') { e.preventDefault(); handleQtyStep(-1); }
                            }}
                        />
                        <button
                            onClick={() => handleQtyStep(1)}
                            className="w-7 h-7 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        {item.qtyStrips > 0 ? 'Strips' : 'Loose'}
                    </span>
                </div>

                {/* ── Rate input ── */}
                <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">Rate ₹</span>
                        <input
                            inputMode="decimal"
                            placeholder={item.mrp.toFixed(2)}
                            value={rateDisplay}
                            className={cn(
                                `w-20 h-7 text-center text-xs border rounded px-1 focus:outline-none focus:ring-1 ${noSpin}`,
                                displayError
                                    ? 'border-red-500 focus:border-red-500 focus:ring-red-200 bg-red-50 text-red-900'
                                    : displayWarning
                                    ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-200 bg-amber-50 text-amber-900'
                                    : 'border-slate-200 focus:border-primary/50 focus:ring-primary/20'
                            )}
                            onFocus={(e) => {
                                setRateFocused(true);
                                setRateDraft(item.rate > 0 ? item.rate.toFixed(2) : '');
                                e.target.select();
                            }}
                            onChange={(e) => setRateDraft(e.target.value)}
                            onBlur={() => {
                                setRateFocused(false);
                                commitRate(rateDraft);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { commitRate(rateDraft); (e.target as HTMLInputElement).blur(); }
                                if (e.key === 'Escape') { setRateDraft(''); setRateFocused(false); }
                            }}
                        />
                    </div>
                    {/* Rate hint */}
                    {displayError ? (
                        <div className="text-[10px] text-red-600 font-medium whitespace-nowrap">✗ {displayError}</div>
                    ) : displayWarning ? (
                        <div className="text-[10px] text-amber-600 font-medium whitespace-nowrap">⚠ {displayWarning}</div>
                    ) : (
                        <div className="text-[9px] text-muted-foreground whitespace-nowrap">
                            Floor ₹{landingRate.toFixed(2)} · MRP ₹{item.mrp.toFixed(2)}
                        </div>
                    )}

                    <div data-testid={`line-total-${index}`} className="text-sm font-bold text-slate-900 mt-1">
                        ₹{(item.rate * item.totalQty).toFixed(2)}
                    </div>
                </div>
            </div>
        </div>
    );
};


// ── ExtraDiscountRow ─────────────────────────────────────────────────────────
// Uses LOCAL string state so typing is never interrupted.
// Only commits to the Zustand store on blur / Enter.
function ExtraDiscountRow({
    extraDiscountPct,
    setExtraDiscountPct,
    base,
    extraDiscountAmount,
}: {
    extraDiscountPct: number;
    setExtraDiscountPct: (pct: number) => void;
    base: number;               // subtotal after item discounts
    extraDiscountAmount: number; // computed by store
}) {
    const [pctDraft, setPctDraft] = useState<string>('');
    const [amtDraft, setAmtDraft] = useState<string>('');
    const [pctFocused, setPctFocused] = useState(false);
    const [amtFocused, setAmtFocused] = useState(false);

    // When an input is NOT focused, always sync visible value from store
    const pctDisplay = pctFocused ? pctDraft : extraDiscountPct === 0 ? '' : String(extraDiscountPct);
    const amtDisplay = amtFocused ? amtDraft : extraDiscountAmount === 0 ? '' : extraDiscountAmount.toFixed(2);

    const commitPct = (raw: string) => {
        const v = Math.min(100, Math.max(0, parseFloat(raw) || 0));
        setExtraDiscountPct(v);
    };

    const commitAmt = (raw: string) => {
        const v = Math.max(0, parseFloat(raw) || 0);
        const pct = base > 0 ? Math.min(100, (v / base) * 100) : 0;
        setExtraDiscountPct(pct);
    };

    const inputClass =
        'w-16 h-7 text-center text-xs border border-slate-200 rounded px-1 ' +
        'focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 ' +
        '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

    return (
        <div className="flex items-center justify-between text-slate-500">
            <span>Extra Discount</span>
            <div className="flex items-center gap-1.5">
                {/* ── % input ── */}
                <div className="relative flex items-center">
                    <input
                        inputMode="decimal"
                        placeholder="0"
                        value={pctDisplay}
                        className={inputClass + ' w-14 pr-4'}
                        onFocus={(e) => {
                            setPctFocused(true);
                            setPctDraft(extraDiscountPct === 0 ? '' : String(extraDiscountPct));
                            e.target.select();
                        }}
                        onChange={(e) => setPctDraft(e.target.value)}
                        onBlur={() => {
                            setPctFocused(false);
                            commitPct(pctDraft);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { commitPct(pctDraft); (e.target as HTMLInputElement).blur(); }
                            if (e.key === 'Escape') { setPctDraft(''); setPctFocused(false); }
                        }}
                    />
                    <span className="absolute right-1.5 text-[10px] text-slate-400 pointer-events-none select-none">%</span>
                </div>

                <span className="text-xs text-slate-400">|</span>

                {/* ── ₹ input ── */}
                <div className="relative flex items-center">
                    <span className="absolute left-1.5 text-[10px] text-slate-400 pointer-events-none select-none">₹</span>
                    <input
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amtDisplay}
                        className={inputClass + ' w-20 pl-4'}
                        onFocus={(e) => {
                            setAmtFocused(true);
                            setAmtDraft(extraDiscountAmount === 0 ? '' : extraDiscountAmount.toFixed(2));
                            e.target.select();
                        }}
                        onChange={(e) => setAmtDraft(e.target.value)}
                        onBlur={() => {
                            setAmtFocused(false);
                            commitAmt(amtDraft);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { commitAmt(amtDraft); (e.target as HTMLInputElement).blur(); }
                            if (e.key === 'Escape') { setAmtDraft(''); setAmtFocused(false); }
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export function BillingCart({ onProceedToPayment, onAddDoctorDetails }: BillingCartProps = {}) {
    const {
        cart,
        customerLedger,
        setCustomerLedger,
        getTotals,
        isPinVerified,
        activeStaff,
        updateCartItem,
        removeFromCart,
        clearCart,
        applyDiscountToItem,
        extraDiscountPct,
        setExtraDiscountPct,
    } = useBillingStore()

    const { user } = useAuthStore()
    
    // Honor Kiosk (PIN) user if a bill is currently underway by a specific pin, else fall back to main session
    const canViewRates = isPinVerified && activeStaff 
        ? (activeStaff.canViewPurchaseRates ?? false)
        : (user?.canViewPurchaseRates ?? false)

    const totals = getTotals()
    const { data: settings } = useOutletSettings();
    const [rateErrors, setRateErrors] = useState<Record<string, boolean>>({});
    const [floorErrors, setFloorErrors] = useState<Record<string, boolean>>({});
    const hasRateError = Object.values(rateErrors).some(Boolean);
    const hasFloorError = Object.values(floorErrors).some(Boolean);
    const totalFloorCost = canViewRates
        ? cart.reduce((sum, item) => {
            const floorRate = calculateLandingRate(
                item.purchaseRate || 0,
                item.gstRate || 0,
                item.freight || 0,
                !!settings?.landingCostIncludeGst,
                settings?.landingCostIncludeFreight ?? true
            );
            return sum + floorRate * item.totalQty;
          }, 0)
        : 0

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

    return (
        <div className="h-full w-full border-l border-slate-200 flex flex-col bg-white shadow-[-4px_0_24px_-16px_rgba(0,0,0,0.1)]">
            {/* Header */}
            <div className="px-4 py-3 border-b flex justify-between items-center bg-white z-10 shrink-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 leading-none">Cart</h3>
                    <span data-testid="cart-count" className="bg-slate-100 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                        {totals.itemCount} items
                    </span>
                </div>

                {customerLedger ? (
                    <div className="bg-blue-50 text-blue-700 text-xs border border-blue-200 rounded-lg px-2 py-1 flex items-center gap-1.5 max-w-[160px]">
                        <span className="truncate font-medium">{customerLedger.name}</span>
                        {customerLedger.currentBalance > 0 && (
                            <span className="text-red-600 font-semibold shrink-0">
                                {formatCurrency(customerLedger.currentBalance)} due
                            </span>
                        )}
                        <button
                            onClick={() => setCustomerLedger(null)}
                            className="hover:bg-blue-200/50 rounded-full p-0.5 shrink-0"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <CustomerSelector>
                        <button className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
                            Add Party <UserPlus className="w-4 h-4" />
                        </button>
                    </CustomerSelector>
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
                        {cart.map((item, index) => (
                            <CartItemRow 
                                key={item.batchId} 
                                item={item} 
                                index={index}
                                onRateErrorChange={(batchId: string, has: boolean) => setRateErrors(p => ({...p, [batchId]: has}))}
                                onFloorErrorChange={(batchId: string, has: boolean) => setFloorErrors(p => ({...p, [batchId]: has}))}
                                removeFromCart={removeFromCart}
                                updateCartItem={updateCartItem}
                                applyDiscountToItem={applyDiscountToItem}
                                canViewRates={canViewRates}
                            />
                        ))}
                        
                        <ScheduleHAlert 
                            hasScheduleH={totals.hasScheduleH} 
                            requiresDoctorDetails={totals.requiresDoctorDetails} 
                            onAddDoctorDetails={onAddDoctorDetails}
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
                            <span>Item Discount</span>
                            <span>-{formatCurrency(totals.discountAmount)}</span>
                        </div>
                    )}
                    <ExtraDiscountRow
                        extraDiscountPct={extraDiscountPct}
                        setExtraDiscountPct={setExtraDiscountPct}
                        base={totals.subtotal - totals.discountAmount}
                        extraDiscountAmount={totals.extraDiscountAmount}
                    />
                    <div className="flex justify-between text-slate-600 pt-1.5 border-t border-slate-200/60 mt-1.5">
                        <span>Taxable Amount</span>
                        <span>{formatCurrency(totals.taxableAmount)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-xs">
                        <span>CGST/SGST</span>
                        <span data-testid="cart-gst">{formatCurrency(totals.cgstAmount + totals.sgstAmount)}</span>
                    </div>
                    {canViewRates && (
                        <>
                            <div className="flex justify-between text-emerald-600 text-xs font-medium pt-1">
                                <span>Total Cost (Floor Rate)</span>
                                <span>{formatCurrency(totalFloorCost)}</span>
                            </div>
                            <div className="flex justify-between text-emerald-600 text-xs font-medium">
                                <span>Est. Margin</span>
                                <span>{formatCurrency(totals.grandTotal - totalFloorCost)}</span>
                            </div>
                        </>
                    )}
                    <div className="flex justify-between items-end pt-2 mt-2 border-t border-slate-200">
                        <span className="font-semibold text-slate-900">Grand Total</span>
                        <div className="text-right">
                            <span data-testid="cart-total" className="font-bold text-xl text-slate-900 leading-none">
                                {formatCurrency(totals.grandTotal)}
                            </span>
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
                        disabled={cart.length === 0 || !isPinVerified || hasRateError || hasFloorError}
                        title={
                            hasRateError ? "Fix pricing errors to continue: rate exceeds MRP" :
                            hasFloorError ? "Cannot bill below floor rate — adjust item rates" :
                            ""
                        }
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
}

export function MobileCartFAB({ onProceedToPayment, onAddDoctorDetails }: BillingCartProps = {}) {
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
                    <BillingCart onProceedToPayment={onProceedToPayment} onAddDoctorDetails={onAddDoctorDetails} />
                </div>
            </SheetContent>
        </Sheet>
    )
}
