'use client'

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Search, X, Pill, PackageSearch } from 'lucide-react'
import { useProductSearch } from '@/hooks/useProductSearch'
import { ProductSearchResult } from '@/types'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface ProductSearchBarProps {
    onProductSelect: (product: ProductSearchResult) => void
    disabled?: boolean
}

export const ProductSearchBar = forwardRef<HTMLInputElement, ProductSearchBarProps>(
    ({ onProductSelect, disabled }, ref) => {
        const [query, setQuery] = useState('')
        const [isOpen, setIsOpen] = useState(false)
        const [highlightedIndex, setHighlightedIndex] = useState(-1)
        
        const internalRef = useRef<HTMLInputElement>(null)
        const dropdownRef = useRef<HTMLDivElement>(null)

        useImperativeHandle(ref, () => internalRef.current as HTMLInputElement)

        const { data: results = [], isLoading } = useProductSearch(query)

        const handleSelect = (product: ProductSearchResult) => {
            if (product.totalStock === 0) return
            onProductSelect(product)
            setQuery('')
            setIsOpen(false)
            setHighlightedIndex(-1)
        }

        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (!isOpen || results.length === 0) return

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    setHighlightedIndex(prev => Math.min(prev + 1, results.length - 1))
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    setHighlightedIndex(prev => Math.max(prev - 1, 0))
                    break
                case 'Enter':
                    e.preventDefault()
                    if (highlightedIndex >= 0 && highlightedIndex < results.length) {
                        handleSelect(results[highlightedIndex])
                    }
                    break
                case 'Escape':
                    e.preventDefault()
                    setIsOpen(false)
                    setQuery('')
                    break
                case 'Tab':
                    setIsOpen(false)
                    break
            }
        }

        // Close dropdown when clicking outside
        useEffect(() => {
            const handleClickOutside = (e: MouseEvent) => {
                if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
                    internalRef.current && !internalRef.current.contains(e.target as Node)) {
                    setIsOpen(false)
                }
            }
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }, [])

        useEffect(() => {
            if (query.length >= 2) {
                setIsOpen(true)
                setHighlightedIndex(-1)
            } else {
                setIsOpen(false)
            }
        }, [query])

        // Handle auto-scroll for highlighted item
        useEffect(() => {
            if (highlightedIndex >= 0 && dropdownRef.current) {
                const highlightedEl = dropdownRef.current.children[highlightedIndex] as HTMLElement
                if (highlightedEl) {
                    highlightedEl.scrollIntoView({ block: 'nearest' })
                }
            }
        }, [highlightedIndex])

        const renderHighlightedText = (text: string, highlight: string) => {
            if (!highlight.trim()) {
                return <span>{text}</span>;
            }
            const regex = new RegExp(`(${highlight})`, 'gi');
            const parts = text.split(regex);
            
            return (
                <span>
                    {parts.map((part, i) => 
                        regex.test(part) ? (
                            <span key={i} className="font-bold bg-yellow-100 text-slate-900">{part}</span>
                        ) : (
                            <span key={i}>{part}</span>
                        )
                    )}
                </span>
            );
        };

        const getScheduleColors = (type: string) => {
            switch (type) {
                case 'OTC': return 'bg-green-100 text-green-600'
                case 'H': return 'bg-amber-100 text-amber-600'
                case 'H1': return 'bg-orange-100 text-orange-600'
                case 'X': return 'bg-red-100 text-red-600'
                case 'Narcotic': return 'bg-purple-100 text-purple-600'
                default: return 'bg-slate-100 text-slate-600'
            }
        }

        const getScheduleBadgeColors = (type: string) => {
            switch (type) {
                case 'H1':
                case 'X':
                case 'Narcotic': 
                    return 'bg-red-100 text-red-700 border-red-200'
                case 'H': 
                    return 'bg-amber-100 text-amber-700 border-amber-200'
                case 'OTC': 
                default:
                    return 'bg-green-100 text-green-700 border-green-200'
            }
        }

        return (
            <div className="relative w-full max-w-2xl">
                <Search className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground z-10" />
                
                <input
                    ref={internalRef}
                    data-testid="product-search"
                    type="text"
                    disabled={disabled}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => query.length >= 2 && setIsOpen(true)}
                    placeholder="Search medicine, composition, brand... (press /)"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full h-12 text-base pl-12 pr-10 border-2 border-slate-200 focus:border-primary rounded-xl bg-white shadow-sm outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-400"
                />

                {query.length > 0 && !disabled ? (
                    <button
                        onClick={() => {
                            setQuery('')
                            setIsOpen(false)
                            internalRef.current?.focus()
                        }}
                        className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 z-10"
                    >
                        <X className="w-5 h-5" />
                    </button>
                ) : (
                    <div className="absolute right-3 top-3.5 z-10 hidden sm:block pointer-events-none">
                        {!disabled && query.length === 0 && (
                            <kbd className="bg-slate-100 text-slate-500 text-xs px-1.5 py-0.5 rounded border border-slate-200 font-sans">
                                /
                            </kbd>
                        )}
                    </div>
                )}

                {isOpen && query.length >= 2 && (
                    <div 
                        ref={dropdownRef}
                        className="absolute top-full left-0 right-0 mt-2 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-80 overflow-y-auto"
                    >
                        {isLoading ? (
                            <div className="p-2 space-y-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="flex items-start gap-3 p-3 border-b last:border-0">
                                        <Skeleton className="w-10 h-10 rounded-lg" />
                                        <div className="space-y-2 flex-1">
                                            <Skeleton className="h-4 w-1/2" />
                                            <Skeleton className="h-3 w-3/4" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : results.length > 0 ? (
                            <div className="py-1">
                                {results.map((product, index) => {
                                    const outOfStock = product.totalStock === 0
                                    const lowStock = product.totalStock > 0 && product.totalStock <= 10
                                    
                                    return (
                                        <button
                                            key={product.id}
                                            data-testid={`search-result-${index}`}
                                            onClick={() => handleSelect(product)}
                                            disabled={outOfStock}
                                            className={cn(
                                                "w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors flex items-start gap-3 outline-none",
                                                highlightedIndex === index && "bg-primary/5",
                                                outOfStock && "opacity-60 grayscale hover:bg-transparent cursor-not-allowed"
                                            )}
                                        >
                                            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", getScheduleColors(product.scheduleType))}>
                                                <Pill className="w-5 h-5" />
                                            </div>
                                            
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-slate-900 truncate">
                                                    {renderHighlightedText(product.name, query)}
                                                </div>
                                                <div className="text-xs text-muted-foreground truncate mt-0.5">
                                                    {renderHighlightedText(product.composition, query)}
                                                </div>
                                                <div className="text-xs text-slate-400 truncate mt-0.5">
                                                    {renderHighlightedText(product.manufacturer, query)}
                                                </div>
                                            </div>

                                            <div className="ml-auto text-right flex flex-col items-end flex-shrink-0 pl-3">
                                                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border mb-1", getScheduleBadgeColors(product.scheduleType))}>
                                                    {product.scheduleType === 'OTC' ? 'OTC' : `Sch ${product.scheduleType}`}
                                                </span>
                                                <div className="text-sm font-medium">
                                                    {outOfStock ? (
                                                        <span className="text-red-500">Out of stock</span>
                                                    ) : lowStock ? (
                                                        <span className="text-amber-600">Low: {product.totalStock} strips</span>
                                                    ) : (
                                                        <span className="text-slate-700">{product.totalStock} strips</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                    MRP ₹{product.batches[0]?.mrp ?? 0}
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="py-10 text-center flex flex-col items-center justify-center">
                                <PackageSearch className="text-slate-300 w-12 h-12 mb-3" />
                                <p className="text-slate-600 font-medium">No medicines found for &quot;{query}&quot;</p>
                                <p className="text-sm text-muted-foreground mt-1">Try searching by composition or manufacturer</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }
)
ProductSearchBar.displayName = 'ProductSearchBar'
