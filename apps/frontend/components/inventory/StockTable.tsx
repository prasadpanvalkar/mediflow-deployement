'use client';

import { useState, useEffect } from 'react';
import { useStockList } from '@/hooks/useInventory';
import { useInventoryFilters } from '@/hooks/useInventoryFilters';
import { 
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { 
    ColumnDef, flexRender, getCoreRowModel, getSortedRowModel, 
    SortingState, useReactTable 
} from '@tanstack/react-table';
import { ProductSearchResult } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, PackageSearch, Eye, SlidersHorizontal, ChevronUp, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/gst';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { useDebounce } from '@/hooks/useDebounce';
import { SCHEDULE_TYPE_OPTIONS } from '@/constants/scheduleTypes';

export function StockTable({ onProductClick, onAdjustClick }: any) {
    const { filters, setFilter, clearFilters } = useInventoryFilters();
    
    // For debounce
    const [searchTerm, setSearchTerm] = useState(filters.search || '');
    const debouncedSearch = useDebounce(searchTerm, 200);

    useEffect(() => {
        setFilter('q', debouncedSearch);
    }, [debouncedSearch]);

    const { data: stockData, isLoading } = useStockList(filters);
    const data = stockData?.data || [];

    const [sorting, setSorting] = useState<SortingState>([{ 
         id: filters.sortBy || 'name', 
         desc: filters.sortOrder === 'desc' 
    }]);

    useEffect(() => {
        if (sorting.length > 0) {
             setFilter('sort', sorting[0].id);
             setFilter('order', sorting[0].desc ? 'desc' : 'asc');
        }
    }, [sorting]);

    const columns: ColumnDef<ProductSearchResult>[] = [
        {
            accessorKey: 'name',
            header: ({ column }) => <SortableHeader column={column} title="Product" />,
            cell: ({ row }) => (
                <div 
                    className="flex-1 min-w-[200px] cursor-pointer" 
                    onClick={() => onProductClick(row.original)}
                >
                    <div className="text-sm font-semibold text-slate-900">{row.original.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{row.original.composition}</div>
                    <div className="text-xs text-slate-400">{row.original.manufacturer}</div>
                </div>
            )
        },
        {
            accessorKey: 'scheduleType',
            header: ({ column }) => <SortableHeader column={column} title="Schedule" />,
            cell: ({ row }) => {
                const s = row.original.scheduleType;
                const colors: Record<string, string> = {
                    OTC:        'bg-green-100 text-green-700',
                    G:          'bg-blue-100 text-blue-700',
                    H:          'bg-amber-100 text-amber-700',
                    H1:         'bg-orange-100 text-orange-700',
                    X:          'bg-red-100 text-red-700',
                    C:          'bg-cyan-100 text-cyan-700',
                    Narcotic:   'bg-purple-100 text-purple-700',
                    Ayurvedic:  'bg-emerald-100 text-emerald-700',
                    Surgical:   'bg-slate-100 text-slate-700',
                    Cosmetic:   'bg-pink-100 text-pink-700',
                    Veterinary: 'bg-amber-100 text-amber-800',
                };
                return (
                    <div className="w-20 text-center">
                        <span className={`inline-block px-2 rounded text-xs font-semibold ${colors[s] || 'bg-slate-100 text-slate-700'}`}>
                            {s}
                        </span>
                    </div>
                );
            }
        },
        {
            id: 'stock',
            accessorFn: row => row.totalStock,
            header: ({ column }) => <SortableHeader column={column} title="Stock" />,
            cell: ({ row }) => {
                const p = row.original;
                const qtyStrips = p.totalStock;
                
                // Safely calculate total loose items across all batches
                const qtyLoose = p.batches?.reduce((sum: number, b: any) => sum + (Number(b.qtyLoose) || 0), 0) || 0;
                
                // Use dynamic labels based on the packaging setup
                const packTypeLabel = p.packType ? `${p.packType}s` : 'strips';
                const packUnitLabel = p.packUnit ? `${p.packUnit}s` : 'loose';

                let color = "text-slate-900";
                if (qtyStrips === 0 && qtyLoose === 0) color = "text-red-600 font-bold";
                else if (p.isLowStock) color = "text-red-600 font-bold";

                return (
                    <div className="w-32 text-right">
                        {qtyStrips === 0 && qtyLoose === 0 ? (
                            <div className={`text-sm ${color}`}>Out of stock</div>
                        ) : (
                            <div className="flex flex-col items-end">
                                <div className={`text-sm font-medium ${color}`}>
                                    {qtyStrips} {packTypeLabel.toLowerCase()}
                                </div>
                                {qtyLoose > 0 && (
                                    <div className="text-xs text-slate-500 mt-0.5 bg-slate-100 px-1.5 py-0.5 rounded">
                                        + {qtyLoose} {packUnitLabel.toLowerCase()}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )
            }
        },
        {
            id: 'batches',
            header: 'Batches',
            cell: ({ row }) => {
                const len = row.original.batches.length;
                return (
                    <div className="w-20 text-center">
                        <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded">
                            {len} batch{len !== 1 ? 'es' : ''}
                        </span>
                    </div>
                );
            }
        },
        {
            id: 'expiry',
            accessorFn: row => row.nearestExpiry,
            header: ({ column }) => <SortableHeader column={column} title="Nearest Expiry" />,
            cell: ({ row }) => {
                 const exStr = row.original.nearestExpiry;
                 if (!exStr) return <span className="text-slate-400">N/A</span>;
                 const exDate = new Date(exStr);
                 const now = new Date();
                 const diffDays = Math.ceil((exDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
                 
                 let style = "text-slate-600";
                 if (diffDays < 30) style = "bg-red-100 text-red-700 rounded px-2 py-0.5";
                 else if (diffDays <= 90) style = "bg-amber-100 text-amber-700 rounded px-2 py-0.5";

                 return (
                     <div className="w-32">
                         <span className={style}>{exDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric'})}</span>
                     </div>
                 );
            }
        },
        {
            id: 'mrp',
            accessorFn: row => row.batches[0]?.mrp || 0,
            header: ({ column }) => <SortableHeader column={column} title="MRP" />,
            cell: ({ row }) => (
                <div className="w-24 text-right text-sm">
                    {formatCurrency(row.original.batches[0]?.mrp || 0)}
                </div>
            )
        },
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => (
                <div className="w-28 flex gap-1">
                     <Button variant="outline" size="sm" onClick={() => onProductClick(row.original)}>
                         <Eye className="w-3 h-3" />
                     </Button>
                     <PermissionGate permission="manage_staff">
                         <Button variant="outline" size="sm" onClick={() => {
                             if(row.original.batches.length > 0)
                                 onAdjustClick(row.original.batches[0])
                         }}>
                             <SlidersHorizontal className="w-3 h-3" />
                         </Button>
                     </PermissionGate>
                </div>
            )
        }
    ];

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
        state: { sorting }
    });

    const hasFilters = filters.search || (filters.scheduleType && filters.scheduleType !== 'all') || filters.lowStock || filters.expiringSoon;

    return (
        <div className="space-y-4">
             <div className="flex gap-3 flex-wrap items-center">
                 <div className="relative w-full md:w-64">
                     <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                     <Input 
                         placeholder="Search medicine, salt, brand..." 
                         className="pl-9"
                         value={searchTerm}
                         onChange={(e) => setSearchTerm(e.target.value)}
                     />
                 </div>
                 
                 <Select value={filters.scheduleType || 'all'} onValueChange={(v) => setFilter('schedule', v)}>
                      <SelectTrigger className="w-36">
                          <SelectValue placeholder="Schedule" />
                      </SelectTrigger>
                      <SelectContent>
                           <SelectItem value="all">All Types</SelectItem>
                           {SCHEDULE_TYPE_OPTIONS.map((opt) => (
                               <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                           ))}
                      </SelectContent>
                 </Select>

                 <Button 
                      variant={filters.lowStock ? "default" : "outline"} 
                      onClick={() => setFilter('lowStock', !filters.lowStock)}
                      className={filters.lowStock ? "bg-primary/10 border-primary text-primary hover:bg-primary/20" : ""}
                 >
                      Low Stock Only
                 </Button>

                 <Button 
                      variant={filters.expiringSoon ? "default" : "outline"} 
                      onClick={() => setFilter('expiring', !filters.expiringSoon)}
                      className={filters.expiringSoon ? "bg-primary/10 border-primary text-primary hover:bg-primary/20" : ""}
                 >
                      Expiring &lt; 90d
                 </Button>

                 {hasFilters && (
                      <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(''); clearFilters(); }} className="text-sm text-muted-foreground hover:text-slate-900">
                          Clear filters x
                      </Button>
                 )}
             </div>

             <div className="bg-white border rounded-xl overflow-hidden">
                  <Table>
                      <TableHeader className="bg-slate-50 border-b">
                           {table.getHeaderGroups().map(hg => (
                               <TableRow key={hg.id}>
                                   {hg.headers.map(h => (
                                       <TableHead key={h.id}>
                                           {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                                       </TableHead>
                                   ))}
                               </TableRow>
                           ))}
                      </TableHeader>
                      <TableBody>
                           {isLoading ? (
                                Array(8).fill(null).map((_, i) => (
                                    <TableRow key={i}>
                                         <TableCell colSpan={7}>
                                              <Skeleton className="h-8 w-full" />
                                         </TableCell>
                                    </TableRow>
                                ))
                           ) : table.getRowModel().rows.length > 0 ? (
                                table.getRowModel().rows.map(row => (
                                    <TableRow key={row.id} className="hover:bg-slate-50 transition-colors even:bg-slate-50/50">
                                         {row.getVisibleCells().map(cell => (
                                              <TableCell key={cell.id}>
                                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                              </TableCell>
                                         ))}
                                    </TableRow>
                                ))
                           ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-64 text-center">
                                         <div className="flex flex-col items-center justify-center text-slate-500">
                                             <PackageSearch className="w-16 h-16 text-slate-200 mb-4" />
                                             <p className="text-lg font-medium text-slate-900">No products found</p>
                                             <p className="text-sm">Try adjusting your search or filters</p>
                                             {hasFilters && (
                                                  <Button variant="outline" className="mt-4" onClick={() => { setSearchTerm(''); clearFilters(); }}>Clear filters</Button>
                                             )}
                                         </div>
                                    </TableCell>
                                </TableRow>
                           )}
                      </TableBody>
                  </Table>
             </div>
        </div>
    );
}

function SortableHeader({ column, title }: any) {
     return (
          <Button variant="ghost" className="-ml-4 h-8 px-4" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
               {title}
               {column.getIsSorted() === 'asc' ? <ChevronUp className="w-3 h-3 ml-2" /> : column.getIsSorted() === 'desc' ? <ChevronDown className="w-3 h-3 ml-2" /> : null}
          </Button>
     );
}
