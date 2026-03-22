'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { ShoppingCart, X, AlertTriangle, ShieldAlert } from 'lucide-react'
import { ProductSearchResult, CartItem } from '@/types'
import { calculateItemTotals, formatCurrency } from '@/lib/gst'
import { cn } from '@/lib/utils'

// Inline date helpers to avoid external date-fns dependency in Docker
const diffInDays = (dateStr: string) => Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))


interface AddToCartPanelProps {
    product: ProductSearchResult
    onAdd: (item: CartItem) => void
    onClose: () => void
    maxDiscount: number
}

export function AddToCartPanel({ product, onAdd, onClose, maxDiscount }: AddToCartPanelProps) {
    const defaultBatch = product.batches.length > 0 
        ? [...product.batches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0]
        : null

    const [selectedBatchId, setSelectedBatchId] = useState<string>(defaultBatch?.id ?? '')
    const [saleMode, setSaleMode] = useState<'strip' | 'loose'>('strip')
    const [qtyStrips, setQtyStrips] = useState<number>(1)
    const [qtyLoose, setQtyLoose] = useState<number>(0)
    
    // Default discount handling (if product has a default, capped at maxDiscount)
    const [discountPct, setDiscountPct] = useState<number>(Math.min(0, maxDiscount))
    const [isDiscountCapped, setIsDiscountCapped] = useState(false)

    const qtyInputRef = useRef<HTMLInputElement>(null)

    // Reset state when product changes
    useEffect(() => {
        const fifoBatch = product.batches.length > 0 
            ? [...product.batches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0]
            : null
        
        setSelectedBatchId(fifoBatch?.id ?? '')
        setSaleMode('strip')
        setQtyStrips(1)
        setQtyLoose(0)
        setDiscountPct(Math.min(0, maxDiscount))
        setIsDiscountCapped(false)
        
        // Auto-focus quantity input slightly after mount
        setTimeout(() => qtyInputRef.current?.focus(), 50)
    }, [product, maxDiscount])

    const selectedBatch = useMemo(() => 
        product.batches.find(b => b.id === selectedBatchId), [product.batches, selectedBatchId])

    const handleDiscountChange = (val: string) => {
        let num = parseFloat(val)
        if (isNaN(num)) num = 0
        if (num > maxDiscount) {
            setDiscountPct(maxDiscount)
            setIsDiscountCapped(true)
        } else {
            setDiscountPct(num)
            setIsDiscountCapped(false)
        }
    }

    const totalQty = useMemo(() => {
        if (!selectedBatch) return 0
        if (saleMode === 'strip') return qtyStrips
        return qtyLoose / product.packSize
    }, [saleMode, qtyStrips, qtyLoose, product.packSize, selectedBatch])

    const { taxableAmount, gstAmount, totalAmount } = useMemo(() => {
        if (!selectedBatch) return { taxableAmount: 0, gstAmount: 0, totalAmount: 0 }
        
        // The GST calculation takes the base rate (not MRP). 
        // We calculate discount against the MRP to find the final selling price
        // In our mock/app flow, if item has MRP 100 and rate 85, discount is usually given on MRP.
        // Let's assume rate = mrp here for simplicity per requirements, and calculateItemTotals handles the exact split
        
        return calculateItemTotals(
            selectedBatch.mrp, 
            selectedBatch.mrp, // using MRP as the base rate for discount application
            totalQty, 
            discountPct, 
            product.gstRate
        )
    }, [selectedBatch, totalQty, discountPct, product.gstRate])

    const discountAmount = useMemo(() => {
        if (!selectedBatch) return 0
        return (selectedBatch.mrp * totalQty) - totalAmount
    }, [selectedBatch, totalQty, totalAmount])

    const isOutOfStock = !selectedBatch || (selectedBatch.qtyStrips === 0 && selectedBatch.qtyLoose === 0)

    const handleAdd = () => {
        if (isOutOfStock || !selectedBatch) return

        const item: CartItem = {
            productId: product.id,
            batchId: selectedBatch.id,
            name: product.name,
            composition: product.composition,
            packSize: product.packSize,
            packUnit: product.packUnit,
            batchNo: selectedBatch.batchNo,
            expiryDate: selectedBatch.expiryDate,
            mrp: selectedBatch.mrp,
            rate: selectedBatch.saleRate, // Backend rate (purchase/base)
            gstRate: product.gstRate,
            qtyStrips: saleMode === 'strip' ? qtyStrips : 0,
            qtyLoose: saleMode === 'loose' ? qtyLoose : 0,
            totalQty: totalQty,
            saleMode: saleMode,
            discountPct: discountPct,
            taxableAmount: taxableAmount,
            gstAmount: gstAmount,
            totalAmount: totalAmount,
            scheduleType: product.scheduleType,
            requiresPrescription: ['H', 'H1', 'X', 'Narcotic'].includes(product.scheduleType)
        }

        onAdd(item)
        onClose()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleAdd()
        } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
        }
    }

    if (!selectedBatch) return null

    const isLooseAllowed = product.packUnit?.toLowerCase() === 'tablet' || product.packUnit?.toLowerCase() === 'capsule'
    
    // Progress bar for discount
    const discountProgressPercentage = maxDiscount > 0 ? (discountPct / maxDiscount) * 100 : 0
    const progressColor = discountProgressPercentage > 90 ? 'bg-red-500' : discountProgressPercentage > 60 ? 'bg-amber-500' : 'bg-green-500'

    return (
        <div 
            className="bg-white border border-slate-200 rounded-xl shadow-lg p-5 mt-3 animate-in slide-in-from-bottom-4"
            onKeyDown={handleKeyDown}
        >
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 leading-tight">{product.name}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{product.composition}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-slate-500">{product.manufacturer}</span>
                        {product.scheduleType !== 'OTC' && (
                            <span className={cn(
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                                ['H1', 'X', 'Narcotic'].includes(product.scheduleType) ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"
                            )}>
                                Sch {product.scheduleType}
                            </span>
                        )}
                    </div>
                </div>
                <button 
                    onClick={onClose}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Batch Selector */}
            <div className="mb-4">
                <label className="text-sm font-medium text-slate-700 mb-2 block">Select Batch</label>
                <div className="space-y-2">
                    {product.batches.map(batch => {
                        const daysToExpiry = diffInDays(batch.expiryDate)
                        const isExpiringSoon = daysToExpiry < 90
                        
                        return (
                            <label 
                                key={batch.id} 
                                className={cn(
                                    "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors text-sm",
                                    selectedBatchId === batch.id ? "bg-primary/5 border-primary" : "hover:bg-slate-50 border-slate-200"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="radio" 
                                        name="batch" 
                                        value={batch.id}
                                        checked={selectedBatchId === batch.id}
                                        onChange={() => setSelectedBatchId(batch.id)}
                                        className="text-primary focus:ring-primary h-4 w-4"
                                    />
                                    <div>
                                        <div className="font-medium">{batch.batchNo}</div>
                                        <div className={cn("text-xs mt-0.5", isExpiringSoon ? "text-red-600 font-medium" : "text-muted-foreground")}>
                                            Exp: {new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-semibold">{formatCurrency(batch.mrp)}</div>
                                    <div className="text-xs text-muted-foreground">
                                        Stk: {batch.qtyStrips} (S) / {batch.qtyLoose} (L)
                                    </div>
                                </div>
                            </label>
                        )
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Quantity */}
                <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">Quantity</label>
                    {isLooseAllowed && (
                        <div className="flex bg-slate-100 p-1 rounded-lg mb-2">
                            <button
                                type="button"
                                onClick={() => setSaleMode('strip')}
                                className={cn(
                                    "flex-1 text-sm py-1.5 rounded-md transition-colors",
                                    saleMode === 'strip' ? "bg-white text-primary font-medium shadow-sm" : "text-slate-600 hover:text-slate-900"
                                )}
                            >
                                Strips
                            </button>
                            <button
                                type="button"
                                onClick={() => setSaleMode('loose')}
                                className={cn(
                                    "flex-1 text-sm py-1.5 rounded-md transition-colors",
                                    saleMode === 'loose' ? "bg-white text-primary font-medium shadow-sm" : "text-slate-600 hover:text-slate-900"
                                )}
                            >
                                Loose ({product.packUnit}s)
                            </button>
                        </div>
                    )}
                    
                    {saleMode === 'strip' ? (
                        <>
                            <input
                                ref={qtyInputRef}
                                type="number"
                                min={1}
                                step={1}
                                value={qtyStrips}
                                onChange={(e) => setQtyStrips(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full h-10 px-3 border border-slate-300 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">
                                = {qtyStrips * product.packSize} {product.packUnit}s
                            </p>
                        </>
                    ) : (
                        <>
                            <input
                                ref={qtyInputRef}
                                type="number"
                                min={1}
                                step={1}
                                value={qtyLoose}
                                onChange={(e) => setQtyLoose(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full h-10 px-3 border border-slate-300 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">
                                = {(qtyLoose / product.packSize).toFixed(2)} strips equivalent
                            </p>
                        </>
                    )}
                </div>

                {/* Discount */}
                <div>
                    <div className="flex justify-between mb-2">
                        <label className="text-sm font-medium text-slate-700">Discount %</label>
                        <span className="text-xs text-slate-500">Max: {maxDiscount}%</span>
                    </div>
                    <input
                        data-testid="discount-0"
                        type="number"
                        min={0}
                        max={maxDiscount}
                        step={0.5}
                        value={discountPct}
                        onChange={(e) => handleDiscountChange(e.target.value)}
                        className={cn(
                            "w-full h-10 px-3 border rounded-lg focus:outline-none focus:ring-1 text-sm transition-colors",
                            isDiscountCapped ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500" : "border-slate-300 focus:border-primary focus:ring-primary"
                        )}
                    />
                    
                    {isDiscountCapped && (
                        <p className="text-xs text-amber-600 mt-1.5 font-medium animate-in fade-in">
                            Capped at {maxDiscount}% for your role
                        </p>
                    )}
                    
                    <div className="h-1.5 w-full bg-slate-100 rounded-full mt-2 overflow-hidden">
                        <div 
                            className={cn("h-full transition-all duration-300", progressColor)} 
                            style={{ width: `${discountProgressPercentage}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Live Totals Box */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-4">
                <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between text-slate-600">
                        <span>MRP ({totalQty.toFixed(2)} × {formatCurrency(selectedBatch.mrp)})</span>
                        <span>{formatCurrency(selectedBatch.mrp * totalQty)}</span>
                    </div>
                    {discountAmount > 0 && (
                        <div className="flex justify-between text-red-500">
                            <span>Discount ({discountPct}%)</span>
                            <span>-{formatCurrency(discountAmount)}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-slate-500 text-xs mt-1 pt-1 border-t border-slate-200">
                        <span>Taxable</span>
                        <span>{formatCurrency(taxableAmount)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-xs pb-1">
                        <span>GST ({product.gstRate}%)</span>
                        <span>+{formatCurrency(gstAmount)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                        <span>Total Amount</span>
                        <span>{formatCurrency(totalAmount)}</span>
                    </div>
                </div>
            </div>

            {/* Alerts */}
            {['H', 'H1', 'X', 'Narcotic'].includes(product.scheduleType) && (
                <div className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border mb-4 text-sm animate-in fade-in",
                    ['H1', 'X', 'Narcotic'].includes(product.scheduleType) ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
                )}>
                    {['H1', 'X', 'Narcotic'].includes(product.scheduleType) ? (
                        <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                        <div className="font-semibold">Schedule {product.scheduleType} Drug</div>
                        <div className="text-xs opacity-90 mt-0.5">
                            {['H1', 'X', 'Narcotic'].includes(product.scheduleType)
                                ? "Doctor details MUST be provided before saving bill"
                                : "Prescription required at dispensing"}
                        </div>
                    </div>
                </div>
            )}

            {/* Submit Button */}
            <button
                data-testid="add-to-cart-btn"
                onClick={handleAdd}
                disabled={isOutOfStock}
                className="w-full h-12 flex items-center justify-center gap-2 bg-primary text-white font-semibold rounded-xl text-base transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary disabled:active:scale-100"
            >
                <ShoppingCart className="w-5 h-5" />
                {isOutOfStock ? "Out of Stock" : `Add ${formatCurrency(totalAmount)} to Cart`}
            </button>
        </div>
    )
}
