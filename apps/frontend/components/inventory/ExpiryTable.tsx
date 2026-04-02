'use client';

import { useState } from 'react';
import { useExpiryReport } from '@/hooks/useInventory';
import { 
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Download, ShoppingBag, SlidersHorizontal } from 'lucide-react';
import { formatCurrency } from '@/lib/gst';
import { Skeleton } from '@/components/ui/skeleton';

export function ExpiryTable({ onAdjustClick }: any) {
    const [daysFilter, setDaysFilter] = useState<number>(90);
    const { data: expiringData, isLoading } = useExpiryReport(daysFilter);
    const raw = expiringData as any;
    const data: any[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);

    const totalValue = data.reduce((acc: number, item: any) => acc + (item.batch.qtyStrips * item.batch.purchaseRate), 0);

    return (
        <div className="space-y-4">
             {/* Summary Badge */}
             <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex justify-between items-center flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                       <AlertTriangle className="w-5 h-5 text-amber-500" />
                       <div>
                            <p className="font-semibold text-slate-800">{data.length} batches expiring within {daysFilter === 9999 ? 'all time' : `${daysFilter} days`}</p>
                            <p className="text-sm text-amber-700">Total stock value at risk: {formatCurrency(totalValue)}</p>
                       </div>
                  </div>
                  <div>
                      <Button variant="outline" size="sm">
                          <Download className="w-4 h-4 mr-2" />
                          Export List
                      </Button>
                  </div>
             </div>

             {/* Filter Control */}
             <div className="flex gap-2">
                 {[30, 60, 90, 9999].map(days => (
                      <Button 
                          key={days} 
                          variant={daysFilter === days ? "default" : "outline"} 
                          size="sm"
                          onClick={() => setDaysFilter(days)}
                      >
                          {days === 9999 ? "All Expiring" : `${days} Days`}
                      </Button>
                 ))}
             </div>

             {/* Table */}
             <div className="bg-white border rounded-xl overflow-hidden">
                  <Table>
                      <TableHeader className="bg-slate-50 border-b">
                           <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Batch No</TableHead>
                                <TableHead>Expiry Date</TableHead>
                                <TableHead className="text-right">Stock</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                           </TableRow>
                      </TableHeader>
                      <TableBody>
                           {isLoading ? (
                                Array(5).fill(null).map((_, i) => (
                                    <TableRow key={i}>
                                         <TableCell colSpan={6}>
                                              <Skeleton className="h-8 w-full" />
                                         </TableCell>
                                    </TableRow>
                                ))
                           ) : data.length > 0 ? (
                                data.map((item: any, idx: number) => {
                                    const { product, batch, daysRemaining } = item;
                                    let daysBadge = "";
                                    if (daysRemaining <= 0) daysBadge = "bg-red-600 text-white font-bold";
                                    else if (daysRemaining <= 30) daysBadge = "bg-red-100 text-red-700";
                                    else if (daysRemaining <= 60) daysBadge = "bg-amber-100 text-amber-700";
                                    else daysBadge = "bg-yellow-100 text-yellow-700";

                                    return (
                                        <TableRow key={`${batch.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                             <TableCell>
                                                  <div className="font-semibold text-slate-900 text-sm">{product.name}</div>
                                                  <div className="text-xs text-muted-foreground truncate">{product.composition}</div>
                                                  <div className="text-xs text-slate-400">{product.manufacturer}</div>
                                             </TableCell>
                                             <TableCell>
                                                  <span className="font-mono bg-slate-100 px-2 py-1 rounded text-sm">{batch.batchNo}</span>
                                             </TableCell>
                                             <TableCell>
                                                  <div className="text-sm font-medium">
                                                      {new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                                  </div>
                                                  <div className={`inline-block px-2 py-0.5 rounded text-xs mt-1 ${daysBadge}`}>
                                                      {daysRemaining <= 0 ? "EXPIRED" : `${daysRemaining} days left`}
                                                  </div>
                                             </TableCell>
                                             <TableCell className="text-right">
                                                  <div className="text-sm font-semibold">{batch.qtyStrips} strips</div>
                                                  {batch.qtyLoose > 0 && <div className="text-xs text-muted-foreground">+{batch.qtyLoose} loose</div>}
                                                  <div className="text-xs text-slate-500 mt-1">{formatCurrency(batch.qtyStrips * batch.purchaseRate)}</div>
                                             </TableCell>
                                             <TableCell>
                                                  <span className="text-sm text-slate-600">{batch.rackLocation || '—'}</span>
                                             </TableCell>
                                             <TableCell className="text-right">
                                                  <div className="flex gap-2 justify-end">
                                                      <Button variant="outline" size="sm" title="Mark for Return">
                                                           <ShoppingBag className="w-3 h-3" />
                                                      </Button>
                                                      <Button variant="outline" size="sm" title="Adjust/Write Off" onClick={() => onAdjustClick(batch)}>
                                                           <SlidersHorizontal className="w-3 h-3" />
                                                      </Button>
                                                  </div>
                                             </TableCell>
                                        </TableRow>
                                    );
                                })
                           ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                                         No expiring stock found in this timeframe.
                                    </TableCell>
                                </TableRow>
                           )}
                      </TableBody>
                  </Table>
             </div>
        </div>
    );
}
