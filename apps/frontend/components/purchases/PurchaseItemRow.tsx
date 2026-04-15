'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { differenceInDays } from 'date-fns';
import { X, AlertTriangle, ChevronDown, ChevronUp, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PurchaseItemFormData, ProductSearchResult } from '@/types';
import { productsApi } from '@/lib/apiClient';
import { useOutletSettings } from '@/hooks/useOutletSettings';
import { calculateLandingRate } from '@/lib/purchase-calculations';

interface ItemFieldError { message?: string; }

interface Props {
    index: number;
    value: PurchaseItemFormData;
    onChange: (index: number, field: keyof PurchaseItemFormData, value: string | number) => void;
    onRemove: (index: number) => void;
    onSelectProduct: (index: number, product: ProductSearchResult) => void;
    onOpenAddProduct: (index: number, name: string) => void;
    outletId: string;
    errors?: Partial<Record<keyof PurchaseItemFormData, ItemFieldError>>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ExpiryStatus = 'expired' | 'near' | 'ok';

const getExpiryStatus = (exp: string): ExpiryStatus => {
    if (!exp) return 'ok';
    const diff = differenceInDays(new Date(exp), new Date());
    if (diff < 0)  return 'expired';
    if (diff < 90) return 'near';
    return 'ok';
};

const computeTotal = (v: PurchaseItemFormData): number => {
    const afterTradeDisc = v.qty * v.purchaseRate * (1 - v.discountPct / 100);
    const afterCashDisc  = afterTradeDisc * (1 - v.cashDiscountPct / 100);
    return afterCashDisc * (1 + v.gstRate / 100 + v.cess / 100);
};

const calcPTR = (mrp: number, gstRate: number, retailMargin = 20) =>
    mrp ? parseFloat(((mrp - mrp * retailMargin / 100) / (1 + gstRate / 100)).toFixed(2)) : 0;

const calcPTS = (ptr: number, stockistMargin = 5) =>
    ptr ? parseFloat((ptr * (1 - stockistMargin / 100)).toFixed(2)) : 0;

const autoSaleRate = (mrp: number, marginPct = 10) =>
    mrp ? parseFloat((mrp * (1 - marginPct / 100)).toFixed(2)) : 0;

// ─── Shared cell input — plain <input> for full table cell control ────────────
// We intentionally do NOT use shadcn Input here because its internal padding
// and ring classes interfere with table cell sizing and spinner removal.

const cellInputCls = (err = false, align: 'left' | 'right' = 'left') =>
    cn(
        // reset browser defaults
        'w-full h-7 rounded-md border bg-white px-1.5 text-xs outline-none',
        'transition-colors',
        // spinner removal — works on plain <input>, not shadcn
        '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
        align === 'right' && 'text-right',
        err
            ? 'border-red-300 focus:border-red-400 focus:ring-1 focus:ring-red-200'
            : 'border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100',
    );

// ─── Column definitions (single source of truth for widths) ──────────────────
// Used in both <colgroup> (in the parent table) and exported here for the parent.

export const PURCHASE_ITEM_COLS = [
    { key: '#',         width: 32  },
    { key: 'product',   width: 180 },
    { key: 'hsn',       width: 80  },
    { key: 'batch',     width: 96  },
    { key: 'expiry',    width: 80  },
    { key: 'pkg',       width: 52  },
    { key: 'qty',       width: 60  },
    { key: 'free',      width: 52  },
    { key: 'rate',      width: 76  },
    { key: 'disc',      width: 60  },
    { key: 'gst',       width: 52  },
    { key: 'mrp',       width: 76  },
    { key: 'saleRate',  width: 76  },
    { key: 'amount',    width: 84  },
    { key: 'expand',    width: 32  },
    { key: 'remove',    width: 32  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function PurchaseItemRow({
    index, value, onChange, onRemove,
    onSelectProduct, onOpenAddProduct, outletId, errors,
}: Props) {
    const [expanded, setExpanded] = useState(false);

    // Product search state
    const [query, setQuery]               = useState('');
    const [results, setResults]           = useState<ProductSearchResult[]>([]);
    const [searching, setSearching]       = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number } | null>(null);
    const debounceRef                     = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapperRef                      = useRef<HTMLDivElement>(null);
    const inputRef                        = useRef<HTMLInputElement>(null);
    const portalRef                       = useRef<HTMLDivElement>(null);

    const { data: settings } = useOutletSettings();
    const landingRate = calculateLandingRate(
        value.purchaseRate || 0,
        value.gstRate || 0,
        value.freightPerUnit || 0,
        !!settings?.landingCostIncludeGst,
        settings?.landingCostIncludeFreight ?? true,
        value.otherCostPerUnit || 0
    );
    
    // Auto-fill saleRate when landingRate is calculated and saleRate is empty
    useEffect(() => {
        if (landingRate > 0 && !value.saleRate) {
            onChange(index, 'saleRate', landingRate);
        }
    }, [landingRate, value.saleRate]);

    // Helper to calculate dropdown position (viewport-relative for position:fixed)
    const openDropdown = () => {
        if (inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            setDropdownStyle({
                top: rect.bottom + 2,
                left: rect.left,
            });
        }
        setDropdownOpen(true);
    };

    // Close dropdown on outside click — must check both wrapper and portal
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            const inWrapper = wrapperRef.current?.contains(target);
            const inPortal  = portalRef.current?.contains(target);
            if (!inWrapper && !inPortal) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Sync dropdown position on scroll/resize when open
    useEffect(() => {
        if (!dropdownOpen) return;

        const updatePosition = () => {
            openDropdown();
        };

        // Use capture: true to catch scrolls on overflow ancestors
        document.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
            document.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [dropdownOpen]);

    const handleQueryChange = (raw: string) => {
        setQuery(raw);
        onChange(index, 'productName', raw);
        onChange(index, 'productId', '' as unknown as number);
        onChange(index, 'isCustom', false as unknown as number);

        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (raw.length < 2) {
            setResults([]);
            if (raw.length > 0) openDropdown(); // show "no results + add" even for short queries
            return;
        }

        setSearching(true);
        openDropdown();
        debounceRef.current = setTimeout(async () => {
            if (!outletId) {
                setResults([]);
                setSearching(false);
                return;
            }
            try {
                const found = await productsApi.search(raw, outletId);
                setResults(found);
            } catch {
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);
    };

    const handleSelectResult = (product: ProductSearchResult) => {
        setQuery('');
        setResults([]);
        setDropdownOpen(false);
        onSelectProduct(index, product);
    };

    const handleAddNew = () => {
        setDropdownOpen(false);
        onOpenAddProduct(index, query);
    };

    const num = (field: keyof PurchaseItemFormData, raw: string) =>
        onChange(index, field, parseFloat(raw) || 0);

    const expStatus = getExpiryStatus(value.expiryDate);
    const total     = computeTotal(value);
    const rowBg     = index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30';
    const effPkg    = typeof value.pkg === 'number' && value.pkg > 0 ? value.pkg : 1;

    const handleMrpChange = (raw: string) => {
        const mrp = parseFloat(raw) || 0;
        onChange(index, 'mrp', mrp);
        if (mrp > 0) {
            if (!value.saleRate) onChange(index, 'saleRate', autoSaleRate(mrp));
            if (!value.ptr)      onChange(index, 'ptr', calcPTR(mrp, value.gstRate));
            if (!value.pts)      onChange(index, 'pts', calcPTS(calcPTR(mrp, value.gstRate)));
        }
    };

    // td padding kept uniform
    const td = 'px-1.5 py-1.5 align-middle';

    return (
        <>
            {/* Portal: Search dropdown (rendered at document.body to escape overflow clipping) */}
            {dropdownOpen && !value.productId && dropdownStyle && createPortal(
                <div
                    ref={portalRef}
                    className="z-[9999] w-80 min-w-[280px] rounded-xl border-2 border-slate-200 bg-white/95 backdrop-blur-sm shadow-2xl ring-1 ring-slate-200/50"
                    style={{
                        position: 'fixed',
                        top: `${dropdownStyle.top}px`,
                        left: `${dropdownStyle.left}px`,
                    }}
                >
                    {searching && (
                        <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Searching…
                        </div>
                    )}

                    {!searching && results.length === 0 && query.length >= 2 && (
                        <div className="px-3 py-2 text-xs text-slate-500">
                            No results for &ldquo;{query}&rdquo;
                        </div>
                    )}

                    {!searching && results.map((product) => (
                        <button
                            key={product.id}
                            type="button"
                            className="flex w-full flex-col px-3 py-2 text-left hover:bg-blue-50"
                            onMouseDown={(e) => { e.preventDefault(); handleSelectResult(product); }}
                        >
                            <span className="text-xs font-medium text-slate-800">{product.name}</span>
                            {product.composition && (
                                <span className="text-[10px] text-slate-500 truncate">{product.composition}</span>
                            )}
                            <span className="text-[10px] text-slate-400">
                                GST {product.gstRate}% · Stock {product.totalStock}
                            </span>
                        </button>
                    ))}

                    {/* Always show "Add new product" at bottom */}
                    <button
                        type="button"
                        className="flex w-full items-center gap-1.5 border-t border-dashed border-slate-200 px-3 py-2 text-left hover:bg-blue-50"
                        onMouseDown={(e) => { e.preventDefault(); handleAddNew(); }}
                    >
                        <Plus className="h-3 w-3 text-blue-600" />
                        <span className="text-xs font-medium text-blue-600">
                            {query ? `Add "${query}" as new product` : 'Add new product'}
                        </span>
                    </button>
                </div>,
                document.body,
            )}

            <tr className={cn('group border-b border-slate-100 transition-colors hover:bg-blue-50/20', rowBg)}>

                {/* # */}
                <td className={cn(td, 'text-center text-[11px] font-medium text-slate-400')}>
                    {index + 1}
                </td>

                {/* Product */}
                <td className={cn(td, 'overflow-visible')}>
                    <div ref={wrapperRef} className="relative">
                        {value.productId ? (
                            /* Product already selected — show name + reset button */
                            <div className="flex items-center gap-1">
                                <span className="flex-1 truncate rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-800">
                                    {value.productName}
                                </span>
                                <span
                                    title="Clear — search again"
                                    onClick={() => {
                                        onChange(index, 'productId', '' as unknown as number);
                                        onChange(index, 'productName', '');
                                        onChange(index, 'isCustom', false as unknown as number);
                                        setQuery('');
                                        setResults([]);
                                    }}
                                    className="cursor-pointer rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-red-100 hover:text-red-600 whitespace-nowrap"
                                >
                                    ×
                                </span>
                            </div>
                        ) : (
                            /* Search input */
                            <input
                                ref={inputRef}
                                className={cn(cellInputCls(!!errors?.productName), 'w-full')}
                                value={query || value.productName}
                                placeholder="Search product..."
                                onChange={(e) => handleQueryChange(e.target.value)}
                                onFocus={() => {
                                    if (query.length >= 2 || results.length > 0) openDropdown();
                                }}
                                autoComplete="off"
                            />
                        )}

                    </div>
                    {errors?.productName && (
                        <p className="mt-0.5 text-[10px] leading-none text-red-500">{errors.productName.message}</p>
                    )}
                </td>

                {/* HSN */}
                <td className={td}>
                    <input
                        className={cellInputCls()}
                        value={value.hsnCode}
                        placeholder="300490"
                        onChange={(e) => onChange(index, 'hsnCode', e.target.value)}
                    />
                </td>

                {/* Batch */}
                <td className={td}>
                    <input
                        className={cellInputCls(!!errors?.batchNo)}
                        value={value.batchNo}
                        placeholder="Batch No"
                        onChange={(e) => onChange(index, 'batchNo', e.target.value)}
                    />
                </td>

                {/* Expiry — MM/YY text input, compact */}
                <td className={td}>
                    <div className="flex items-center gap-0.5">
                        <input
                            className={cn(
                                cellInputCls(!!errors?.expiryDate),
                                expStatus === 'expired' && 'border-red-400 bg-red-50',
                                expStatus === 'near'    && 'border-orange-300 bg-orange-50',
                            )}
                            placeholder="MM/YY or MM/YYYY"
                            maxLength={7}
                            value={
                                value.expiryDate
                                    ? value.expiryDate.slice(0, 7).replace(/^(\d{4})-(\d{2})$/, '$2/$1')
                                    : ''
                            }
                            onChange={(e) => {
                                const raw = e.target.value;
                                const mShort = raw.match(/^(\d{2})\/(\d{2})$/);   // MM/YY
                                const mLong  = raw.match(/^(\d{2})\/(\d{4})$/);   // MM/YYYY
                                if (mShort) {
                                    const month = parseInt(mShort[1]);
                                    const year  = parseInt(mShort[2]) + 2000;
                                    if (month >= 1 && month <= 12) {
                                        onChange(index, 'expiryDate', `${year}-${mShort[1]}-01`);
                                    } else {
                                        onChange(index, 'expiryDate', raw);
                                    }
                                } else if (mLong) {
                                    const month = parseInt(mLong[1]);
                                    const year  = parseInt(mLong[2]);
                                    if (month >= 1 && month <= 12) {
                                        onChange(index, 'expiryDate', `${year}-${mLong[1]}-01`);
                                    } else {
                                        onChange(index, 'expiryDate', raw);
                                    }
                                } else {
                                    onChange(index, 'expiryDate', raw);
                                }
                            }}
                        />
                        {expStatus !== 'ok' && (
                            <span title={expStatus === 'expired' ? 'Expired!' : 'Expiring within 90 days'}>
                                <AlertTriangle className={cn(
                                    'h-3 w-3 shrink-0',
                                    expStatus === 'expired' ? 'text-red-500' : 'text-orange-400',
                                )} />
                            </span>
                        )}
                    </div>
                </td>

                {/* Pkg */}
                <td className={td}>
                    <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded py-0.5">
                        <span className="font-medium text-slate-700 text-xs">{value.pkg || 1}</span>
                        {value.packUnitLabel && (
                            <span className="text-[9px] text-slate-400 whitespace-nowrap leading-none mt-0.5">
                                {value.packUnitLabel}/pkg
                            </span>
                        )}
                    </div>
                </td>

                {/* Qty */}
                <td className={cn(td, 'align-top')}>
                    <input
                        type="number" min={0}
                        className={cellInputCls(!!errors?.qty, 'right')}
                        value={value.qty || ''}
                        onChange={(e) => num('qty', e.target.value)}
                    />
                    {effPkg > 1 && value.qty > 0 && (
                        <p className="mt-0.5 text-right text-[10px] leading-none text-slate-400">
                            ={effPkg * value.qty}u
                        </p>
                    )}
                </td>

                {/* Free */}
                <td className={td}>
                    <input
                        type="number" min={0}
                        className={cellInputCls(false, 'right')}
                        value={value.freeQty || ''}
                        onChange={(e) => num('freeQty', e.target.value)}
                    />
                </td>

                {/* Rate */}
                <td className={td}>
                    <input
                        type="number" min={0} step="0.01"
                        className={cellInputCls(!!errors?.purchaseRate, 'right')}
                        value={value.purchaseRate || ''}
                        onChange={(e) => num('purchaseRate', e.target.value)}
                    />
                </td>

                {/* Disc% */}
                <td className={td}>
                    <input
                        type="number" min={0} max={100} step="0.01"
                        className={cellInputCls(false, 'right')}
                        value={value.discountPct || ''}
                        onChange={(e) => num('discountPct', e.target.value)}
                    />
                </td>

                {/* GST% */}
                <td className={td}>
                    <input
                        type="number" min={0}
                        className={cellInputCls(false, 'right')}
                        value={value.gstRate || ''}
                        onChange={(e) => num('gstRate', e.target.value)}
                    />
                </td>

                {/* MRP */}
                <td className={td}>
                    <input
                        type="number" min={0} step="0.01"
                        className={cellInputCls(!!errors?.mrp, 'right')}
                        value={value.mrp || ''}
                        onChange={(e) => handleMrpChange(e.target.value)}
                    />
                </td>

                {/* Sale Rate */}
                <td className={td}>
                    <input
                        type="number" min={0} step="0.01"
                        className={cellInputCls(!!errors?.saleRate, 'right')}
                        value={value.saleRate || ''}
                        onChange={(e) => num('saleRate', e.target.value)}
                    />
                </td>

                {/* Amount */}
                <td className={cn(td, 'text-right')}>
                    <span className="whitespace-nowrap font-mono text-xs font-semibold text-slate-800">
                        {total.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </span>
                </td>

                {/* Expand */}
                <td className={cn(td, 'text-center')}>
                    <Button
                        type="button" variant="ghost" size="icon"
                        title="PTR / PTS / Cash Disc / Cess"
                        className={cn(
                            'h-6 w-6 text-slate-400 hover:text-blue-500',
                            expanded && 'bg-blue-50 text-blue-500',
                        )}
                        onClick={() => setExpanded((x) => !x)}
                    >
                        {expanded
                            ? <ChevronUp  className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" />}
                    </Button>
                </td>

                {/* Remove */}
                <td className={cn(td, 'text-center')}>
                    <Button
                        type="button" variant="ghost" size="icon"
                        className="h-6 w-6 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                        onClick={() => onRemove(index)}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </td>
            </tr>

            {/* ── Expanded row ──────────────────────────────────────────── */}
            {expanded && (
                <tr className={cn('border-b border-dashed border-blue-100', rowBg)}>
                    <td />
                    <td colSpan={11} className="px-3 pb-3 pt-1.5">
                        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5">
                            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                                Pricing Details
                            </span>

                            {[
                                { label: 'Cash Disc%', field: 'cashDiscountPct' as const, width: 'w-14' },
                                { label: 'Cess%',      field: 'cess'            as const, width: 'w-12' },
                                { label: 'PTR ₹',     field: 'ptr'             as const, width: 'w-20' },
                                { label: 'PTS ₹',     field: 'pts'             as const, width: 'w-20' },
                                { label: 'Freight/Unit ₹', field: 'freightPerUnit' as const, width: 'w-20' },
                                { label: 'Other/Unit ₹',   field: 'otherCostPerUnit' as const, width: 'w-20' },
                            ].map(({ label, field, width }) => (
                                <div key={field} className="flex items-center gap-1.5">
                                    <label className="whitespace-nowrap text-[11px] text-slate-500">
                                        {label}
                                    </label>
                                    <input
                                        type="number" min={0} step="0.01"
                                        className={cn(
                                            cellInputCls(false, 'right'),
                                            width,
                                            'h-6',
                                        )}
                                        value={(value[field] as number) || ''}
                                        onChange={(e) => num(field, e.target.value)}
                                    />
                                </div>
                            ))}

                            <div className="flex items-center gap-1.5 ml-auto border-l border-blue-200 pl-4">
                                <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">Landing Cost Floor:</span>
                                <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                                    ₹{landingRate.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </td>
                    <td colSpan={4} />
                </tr>
            )}
        </>
    );
}
