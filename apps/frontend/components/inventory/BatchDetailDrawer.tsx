'use client';

import { useProductBatches } from '@/hooks/useInventory';
import { 
    Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose 
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal, Plus, X } from 'lucide-react';
import { formatCurrency } from '@/lib/gst';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { useRouter } from 'next/navigation';

export function BatchDetailDrawer({ productId, isOpen, onClose, onAdjust }: any) {
    const router = useRouter();
    const { data: batches, isLoading } = useProductBatches(productId);
    const data = batches || [];

    // Derive product details from the first batch or fallback
    const product = React.useMemo(() => {
        // Find product name or details from another source if possible.
        // Actually we don't return product data in getBatches directly, just batches.
        // We can use the mockProductsApi to get product details, but since batches
        // belong to a product, we rely on the parent or we could fetch Product Details.
        // For simplicity, we just use batches.
        return null;
    }, [data]);

    return (
        <Drawer open={isOpen} onOpenChange={(open: boolean) => !open && onClose()} direction="right">
            <DrawerContent className="h-full w-[400px] border-l rounded-none p-6 overscroll-y-auto">
                <DrawerHeader className="px-0 relative">

                     <DrawerClose asChild>
                         <Button variant="ghost" size="icon" className="absolute right-0 top-0">
                             <X className="w-4 h-4" />
                         </Button>
                     </DrawerClose>
                     <DrawerTitle className="text-xl font-bold">Batches in Stock</DrawerTitle>
                     <p className="text-sm text-muted-foreground">Sorted by expiry (FIFO)</p>
                </DrawerHeader>

                <div className="py-4 space-y-4">
                     {isLoading ? (
                          Array(3).fill(null).map((_, i) => (
                               <Skeleton key={i} className="h-32 w-full rounded-xl" />
                          ))
                     ) : data.length > 0 ? (
                          data.map((batch: any) => {
                               const exDate = new Date(batch.expiryDate);
                               const now = new Date();
                               const diffDays = Math.ceil((exDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
                               let borderColor = "border-l-green-400 border";
                               let badgeColor = "text-slate-600";
                               
                               if (diffDays <= 0) {
                                    borderColor = "border-l-red-500 border opacity-60 relative overflow-hidden";
                                    badgeColor = "bg-red-100 text-red-700 bg-red-600 px-2 py-0.5 rounded";
                               } else if (diffDays <= 30) {
                                    borderColor = "border-l-red-400 border";
                                    badgeColor = "bg-red-100 text-red-700 px-2 py-0.5 rounded";
                               } else if (diffDays <= 90) {
                                    borderColor = "border-l-amber-400 border";
                                    badgeColor = "bg-amber-100 text-amber-700 px-2 py-0.5 rounded";
                               }

                               return (
                                   <div key={batch.id} className={`rounded-xl p-4 mb-3 border-l-4 ${borderColor}`}>
                                        {diffDays <= 0 && (
                                            <div className="absolute top-4 -right-8 w-32 bg-red-600 text-white text-xs font-bold py-1 text-center rotate-45 transform">
                                                EXPIRED
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center">
                                            <div className="font-mono font-bold text-slate-900">{batch.batchNo}</div>
                                            <div className={`text-xs font-semibold ${badgeColor}`}>
                                                {exDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
                                             <div>
                                                 <div className="text-xs text-muted-foreground">Strips</div>
                                                 <div className="text-lg font-bold">{batch.qtyStrips}</div>
                                             </div>
                                             <div>
                                                 <div className="text-xs text-muted-foreground">Loose</div>
                                                 <div>{batch.qtyLoose}</div>
                                             </div>
                                             <div>
                                                 <div className="text-xs text-muted-foreground">Rack</div>
                                                 <div>{batch.rackLocation || '—'}</div>
                                             </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
                                             <div>
                                                 <div className="text-xs text-muted-foreground">MRP</div>
                                                 <div className="font-medium">{formatCurrency(batch.mrp)}</div>
                                             </div>
                                             <div>
                                                 <div className="text-xs text-muted-foreground">Sale Rate</div>
                                                 <div className="font-medium">{formatCurrency(batch.saleRate)}</div>
                                             </div>
                                             <PermissionGate permission="view_purchase_rates">
                                                 <div>
                                                     <div className="text-xs text-muted-foreground">Purchase Rate</div>
                                                     <div className="font-medium">{formatCurrency(batch.purchaseRate)}</div>
                                                 </div>
                                             </PermissionGate>
                                        </div>

                                        <div className="flex justify-between items-center mt-4 pt-4 border-t border-dashed">
                                             <div className="text-xs text-muted-foreground">
                                                  Mfg: {batch.mfgDate ? new Date(batch.mfgDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'Not recorded'}
                                             </div>
                                             <Button variant="outline" size="sm" onClick={() => onAdjust(batch)}>
                                                  <SlidersHorizontal className="w-3 h-3 mr-2" /> Adjust
                                             </Button>
                                        </div>
                                   </div>
                               );
                          })
                     ) : (
                          <div className="text-center text-slate-500 py-8">No batches found.</div>
                     )}
                     
                     <PermissionGate permission="create_purchases">
                         <Button 
                             variant="outline" 
                             className="w-full mt-4 border-dashed py-8 text-primary border-primary/50 hover:bg-primary/5"
                             onClick={() => router.push(`/dashboard/purchases/new?productId=${productId}`)}
                         >
                             <Plus className="w-4 h-4 mr-2" />
                             Add New Batch
                         </Button>
                     </PermissionGate>

                     <div className="mt-8">
                         <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent Activity</h3>
                         <div className="space-y-3">
                              {/* Mock activity */}
                              <div className="text-xs border rounded p-2 bg-slate-50 flex items-center justify-between">
                                  <span>Bill #INV-2026-000003</span>
                                  <span className="text-red-600 font-semibold">-2 strips</span>
                              </div>
                              <div className="text-xs border rounded p-2 bg-slate-50 flex items-center justify-between">
                                  <span>Purchase GRN</span>
                                  <span className="text-green-600 font-semibold">+100 strips</span>
                              </div>
                              <div className="text-xs border rounded p-2 bg-slate-50 flex items-center justify-between">
                                  <span>Damage adjustment</span>
                                  <span className="text-red-600 font-semibold">-3 strips</span>
                              </div>
                         </div>
                     </div>
                </div>
            </DrawerContent>
        </Drawer>
    );
}

// Ensure you import React at the top since we use React.useMemo
import React from 'react';
