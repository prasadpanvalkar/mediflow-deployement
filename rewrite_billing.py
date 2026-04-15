import re

with open("apps/frontend/components/billing/BillingCart.tsx", "r") as f:
    orig = f.read()

# First, define CartItemRow above BillingCart
cart_item_row_code = """

const CartItemRow = ({ 
    item, 
    index, 
    onRateErrorChange, 
    removeFromCart, 
    updateCartItem, 
    applyDiscountToItem, 
    canViewRates 
}: any) => {
    const { backendRateErrors, clearBackendRateError } = useBillingStore();
    const isExpiringSoon = diffInDays(item.expiryDate) < 90;
    
    // CHANGE 1: Fetch landing cost when batch is selected
    const [landingCostData, setLandingCostData] = useState<{landingCost?: number, mrp?: number, loading: boolean}>({loading: false});
    const [localError, setLocalError] = useState<string | null>(null);

    useEffect(() => {
        setLandingCostData({loading: true});
        fetch(`/api/v1/inventory/batches/${item.batchId}/landing-cost/`)
            .then(res => res.json())
            .then(data => setLandingCostData({landingCost: data.landingCost, mrp: data.mrp, loading: false}))
            .catch(() => setLandingCostData({loading: false}));
    }, [item.batchId]);

    // Validation
    const backendError = backendRateErrors[item.batchId];
    
    useEffect(() => {
        let error = null;
        if (landingCostData.landingCost !== undefined) {
            if (item.rate < (landingCostData.landingCost || 0)) {
                error = `Below Floor`;
            } else if (item.rate > (landingCostData.mrp || item.mrp)) {
                error = `Above MRP`;
            }
        }
        
        // Backend error overrides local error
        if (backendError) error = backendError;
        
        setLocalError(error);
        onRateErrorChange(item.batchId, !!error);
    }, [item.rate, landingCostData, backendError, item.batchId, onRateErrorChange]);

    const displayError = localError || backendError;

    const handleQtyChange = (delta: number) => {
        const isLooseOnly = item.qtyStrips === 0 && item.qtyLoose > 0;
        let newTotalQty = 0;
        let newStrips = item.qtyStrips;
        let newLoose = item.qtyLoose;

        if (isLooseOnly) {
            newLoose = Math.max(1, item.qtyLoose + delta);
            newTotalQty = newLoose / item.packSize;
        } else {
            newStrips = Math.max(1, item.qtyStrips + delta);
            newTotalQty = newStrips;
        }
        updateCartItem(item.batchId, { 
            qtyStrips: newStrips, 
            qtyLoose: newLoose, 
            totalQty: newTotalQty 
        });
        if (backendError) clearBackendRateError(item.batchId);
    };

    return (
        <div data-testid={`cart-item-${index}`} className="px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group">
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
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-0.5">
                        <button 
                            onClick={() => handleQtyChange(-1)}
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
                            onClick={() => handleQtyChange(1)}
                            className="w-7 h-7 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        {item.qtyStrips > 0 ? 'Strips' : 'Loose'}
                    </span>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1">
                        <span className={"text-[10px] text-muted-foreground"}>Rate ₹</span>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={landingCostData.loading}
                            value={item.rate === 0 && item.discountPct > 0 ? '' : item.rate.toFixed(2)}
                            onChange={(e) => {
                                const newRate = Math.max(0, parseFloat(e.target.value) || 0);
                                const pct = item.mrp > 0 ? Math.min(100, ((item.mrp - newRate) / item.mrp) * 100) : 0;
                                applyDiscountToItem(item.batchId, Math.max(0, pct));
                                if (backendError) clearBackendRateError(item.batchId);
                            }}
                            className={cn("w-20 h-7 text-center text-xs border rounded px-1 focus:outline-none", displayError ? "border-red-500 focus:border-red-500 bg-red-50" : "border-slate-200 focus:border-primary/50")}
                        />
                    </div>
                    {/* Rate Hint */}
                    {landingCostData.landingCost !== undefined && (
                        <div className="text-[9px] text-muted-foreground">
                            Floor ₹{landingCostData.landingCost} · MRP ₹{landingCostData.mrp}
                        </div>
                    )}
                    {displayError && (
                        <div className="text-[10px] text-red-500 font-medium">⚠ {displayError}</div>
                    )}

                    <div data-testid={`line-total-${index}`} className="text-sm font-bold text-slate-900 mt-1">
                        ₹{(item.rate * item.totalQty).toFixed(2)}
                    </div>
                </div>
            </div>
        </div>
    );
};
"""

# Find export function BillingCart
import re
new_code = orig.replace("export function BillingCart", cart_item_row_code + "\n\nexport function BillingCart")

# Add useState for errors in BillingCart
hooks_replacement = """    const [rateErrors, setRateErrors] = useState<Record<string, boolean>>({});
    const hasRateError = Object.values(rateErrors).some(Boolean);"""
new_code = new_code.replace("    const totals = getTotals()", "    const totals = getTotals()\n" + hooks_replacement)

# Replace the mapping over cart items
map_re = re.compile(r"\{cart\.map\(\(item, index\) => \{.*?return \((.*?)\)\n\s*\}\)\}", re.DOTALL)
new_map_str = """{cart.map((item, index) => (
                            <CartItemRow 
                                key={item.batchId} 
                                item={item} 
                                index={index}
                                onRateErrorChange={(batchId: string, has: boolean) => setRateErrors(p => ({...p, [batchId]: has}))}
                                removeFromCart={removeFromCart}
                                updateCartItem={updateCartItem}
                                applyDiscountToItem={applyDiscountToItem}
                                canViewRates={canViewRates}
                            />
                        ))}"""
new_code = map_re.sub(new_map_str, new_code)

# Add useState, useEffect to react import if not present
if "import { useState" not in new_code:
    new_code = new_code.replace("import { CreditCard", "import { useState, useEffect } from 'react';\nimport { CreditCard")
else:
    new_code = new_code.replace("import { useState }", "import { useState, useEffect }")
    new_code = new_code.replace("import { useState,", "import { useState, useEffect,")

# Update proceed button to disabled when rate error
new_code = new_code.replace("disabled={cart.length === 0 || !isPinVerified}", "disabled={cart.length === 0 || !isPinVerified || hasRateError}")

with open("apps/frontend/components/billing/BillingCart.tsx", "w") as f:
    f.write(new_code)
