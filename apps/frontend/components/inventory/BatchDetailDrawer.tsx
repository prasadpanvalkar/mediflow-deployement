'use client';

import React from 'react';
import { useProductBatches } from '@/hooks/useInventory';
import { 
    Drawer, DrawerContent, DrawerHeader, DrawerClose 
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal, Plus, X, Package, AlertTriangle, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/gst';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { useRouter } from 'next/navigation';

export function BatchDetailDrawer({ productId, product, isOpen, onClose, onAdjust }: any) {
    const router = useRouter();
    const { data: batches, isLoading } = useProductBatches(productId);
    const data = batches || [];

    // Derive product details and aggregates from the batches array
    const { productInfo, totalStrips, averageMrp } = React.useMemo(() => {
        if (!data || data.length === 0) return { productInfo: product || null, totalStrips: 0, averageMrp: 0 };
        
        // Grab product details from the passed product prop, or the first batch
        const firstBatch = data[0];
        const info = product || (firstBatch ? firstBatch.product : {});
        
        const total = data.reduce((sum: number, b: any) => sum + (Number(b.qtyStrips) || 0), 0);
        
        // Calculate average MRP for active stock
        const totalValue = data.reduce((sum: number, b: any) => sum + ((Number(b.mrp) || 0) * (Number(b.qtyStrips) || 0)), 0);
        const avg = total > 0 ? (totalValue / total) : 0;

        return { productInfo: info, totalStrips: total, averageMrp: avg };
    }, [data]);

    return (
        <Drawer open={isOpen} onOpenChange={(open: boolean) => !open && onClose()} direction="right">
            <DrawerContent className="h-full w-[450px] border-l rounded-none p-0 overflow-y-auto">
                
                {/* Fixed Header with Close Button */}
                <div className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex justify-between items-start">
                    {isLoading ? (
                        <div className="space-y-2 w-full">
                            <Skeleton className="h-6 w-3/4" />
                            <Skeleton className="h-4 w-1/2" />
                        </div>
                    ) : (
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">
                                {productInfo?.name || 'Unknown Product'}
                            </h2>
                            <p className="text-sm text-slate-500 font-medium mt-1">
                                {productInfo?.manufacturer || 'Unknown Manufacturer'}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-3">
                                {productInfo?.scheduleType && productInfo.scheduleType !== 'OTC' && (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded border border-red-200">
                                        Schedule {productInfo.scheduleType}
                                    </span>
                                )}
                                {productInfo?.drugType && (
                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded border border-blue-200">
                                        {productInfo.drugType.charAt(0).toUpperCase() + productInfo.drugType.slice(1)}
                                    </span>
                                )}
                                {productInfo?.packSize && (
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs font-medium rounded border border-slate-200">
                                        1 {productInfo.packType || 'Strip'} = {productInfo.packSize} {productInfo.packUnit || 'units'}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    <DrawerClose asChild>
                        <Button variant="ghost" size="icon" className="-mr-2 -mt-2">
                            <X className="w-5 h-5 text-slate-500" />
                        </Button>
                    </DrawerClose>
                </div>

                <div className="p-6 space-y-6">
                    
                    {/* SECTION 2: Stock Summary Metrics */}
                    {!isLoading && (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-slate-50 border rounded-xl p-3 flex flex-col items-center justify-center text-center">
                                <Package className="w-4 h-4 text-slate-400 mb-1" />
                                <span className="text-2xl font-bold text-slate-900">{totalStrips}</span>
                                <span className="text-xs text-slate-500">Total Strips</span>
                            </div>
                            <div className={`border rounded-xl p-3 flex flex-col items-center justify-center text-center ${totalStrips < (productInfo?.minQty || 10) ? 'bg-red-50 border-red-200' : 'bg-slate-50'}`}>
                                <AlertTriangle className={`w-4 h-4 mb-1 ${totalStrips < (productInfo?.minQty || 10) ? 'text-red-500' : 'text-slate-400'}`} />
                                <span className={`text-xl font-bold ${totalStrips < (productInfo?.minQty || 10) ? 'text-red-700' : 'text-slate-900'}`}>
                                    {productInfo?.minQty || 10}
                                </span>
                                <span className="text-xs text-slate-500">Reorder Level</span>
                            </div>
                            <div className="bg-slate-50 border rounded-xl p-3 flex flex-col items-center justify-center text-center">
                                <TrendingUp className="w-4 h-4 text-slate-400 mb-1" />
                                <span className="text-xl font-bold text-slate-900">{formatCurrency(averageMrp)}</span>
                                <span className="text-xs text-slate-500">Avg MRP</span>
                            </div>
                        </div>
                    )}

                    {/* SECTION 3: Batches List */}
                    <div>
                        <div className="flex justify-between items-end mb-4">
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Available Batches</h3>
                            <span className="text-xs text-slate-500">Sorted by FEFO</span>
                        </div>

                        {isLoading ? (
                            Array(2).fill(null).map((_, i) => (
                                <Skeleton key={i} className="h-32 w-full rounded-xl mb-3" />
                            ))
                        ) : data.length > 0 ? (
                            data.map((batch: any) => {
                                const exDate = new Date(batch.expiryDate);
                                const now = new Date();
                                const diffDays = Math.ceil((exDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
                                
                                let borderColor = "border-slate-200";
                                let badgeColor = "text-slate-500 bg-slate-100";
                                
                                if (diffDays <= 0) {
                                    borderColor = "border-red-500 bg-red-50";
                                    badgeColor = "bg-red-600 text-white";
                                } else if (diffDays <= 90) {
                                    borderColor = "border-orange-300";
                                    badgeColor = "bg-orange-100 text-orange-800";
                                }

                                return (
                                    <div key={batch.id} className={`rounded-xl p-4 mb-3 border ${borderColor} relative overflow-hidden transition-all hover:shadow-md bg-white`}>
                                        {diffDays <= 0 && (
                                            <div className="absolute top-3 -right-8 w-32 bg-red-600 text-white text-[10px] font-bold py-1 text-center rotate-45 transform uppercase tracking-wider shadow-sm">
                                                Expired
                                            </div>
                                        )}
                                        
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-0.5">Batch No</div>
                                                <div className="font-mono font-bold text-base text-slate-900">{batch.batchNo}</div>
                                            </div>
                                            <div className={`text-xs font-bold px-2 py-1 rounded ${badgeColor}`}>
                                                Exp: {exDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-4 gap-2 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                            <div>
                                                <div className="text-[10px] uppercase text-slate-500 font-semibold">Strips</div>
                                                <div className="font-bold text-slate-900">{batch.qtyStrips}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] uppercase text-slate-500 font-semibold">MRP</div>
                                                <div className="font-medium text-slate-700">{formatCurrency(batch.mrp)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] uppercase text-slate-500 font-semibold">Sale</div>
                                                <div className="font-medium text-slate-700">{formatCurrency(batch.saleRate)}</div>
                                            </div>
                                            <PermissionGate permission="view_purchase_rates">
                                                <div>
                                                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Purc</div>
                                                    <div className="font-medium text-slate-700">{formatCurrency(batch.purchaseRate)}</div>
                                                </div>
                                            </PermissionGate>
                                        </div>

                                        <div className="flex justify-end">
                                            <Button variant="ghost" size="sm" className="h-8 text-xs text-primary hover:bg-primary/10" onClick={() => onAdjust(batch)}>
                                                <SlidersHorizontal className="w-3 h-3 mr-1.5" /> Adjust Stock
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center bg-slate-50 border border-dashed rounded-xl py-8">
                                <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <p className="text-sm font-medium text-slate-600">No stock available</p>
                            </div>
                        )}
                        
                        <PermissionGate permission="create_purchases">
                            <Button 
                                variant="outline" 
                                className="w-full mt-2 border-dashed border-2 py-6 text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/60 transition-colors"
                                onClick={() => router.push(`/dashboard/purchases/new?productId=${productId}`)}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Receive New Stock (GRN)
                            </Button>
                        </PermissionGate>
                    </div>

                    {/* SECTION 4: Recent Activity */}
                    <div className="pt-4 border-t">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Recent Activity</h3>
                        <div className="space-y-2">
                            {/* Placeholder Activity - You can wire this up to a real API later */}
                            <div className="text-xs border rounded-lg p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                <div className="flex flex-col">
                                    <span className="font-medium text-slate-700">Bill #INV-2026-000003</span>
                                    <span className="text-[10px] text-slate-400 mt-0.5">Today, 2:30 PM</span>
                                </div>
                                <span className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded">-2 strips</span>
                            </div>
                            <div className="text-xs border rounded-lg p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                <div className="flex flex-col">
                                    <span className="font-medium text-slate-700">Purchase GRN</span>
                                    <span className="text-[10px] text-slate-400 mt-0.5">Yesterday, 11:15 AM</span>
                                </div>
                                <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded">+100 strips</span>
                            </div>
                        </div>
                    </div>

                </div>
            </DrawerContent>
        </Drawer>
    );
}