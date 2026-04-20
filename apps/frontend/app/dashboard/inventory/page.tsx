'use client'

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useInventoryFilters } from '@/hooks/useInventoryFilters';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Download, Plus, AlertTriangle, PackageX } from 'lucide-react';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { InventoryStatCards } from '@/components/inventory/InventoryStatCards';
import { StockTable } from '@/components/inventory/StockTable';
import { ExpiryTable } from '@/components/inventory/ExpiryTable';
import { LowStockTable } from '@/components/inventory/LowStockTable';
import { BatchDetailDrawer } from '@/components/inventory/BatchDetailDrawer';
import { StockAdjustmentModal } from '@/components/inventory/StockAdjustmentModal';
import { Batch, MasterProduct, ProductSearchResult } from '@/types';
import { useStockList, useExpiryReport, useLowStockReport } from '@/hooks/useInventory';
import { inventoryApi } from '@/lib/apiClient';
import { exportToCSV } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { EditProductModal } from '@/components/inventory/EditProductModal';

export default function InventoryPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { filters, setFilter, clearFilters } = useInventoryFilters();

    const [activeTab, setActiveTab] = useState<string>('all');
    const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
    const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
    const [adjustmentBatch, setAdjustmentBatch] = useState<Batch | null>(null);

    // Edit product
    const [editProduct, setEditProduct] = useState<MasterProduct | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);

    // Queries to just get sizes for the badges
    const { data: stockData } = useStockList({});
    const { data: expiringData } = useExpiryReport(90);
    const { data: lowStockData } = useLowStockReport();

    const totalProducts = stockData?.pagination?.totalRecords ?? stockData?.data?.length ?? 0;
    const expiringCount = expiringData?.length || 0;
    const lowStockCount = lowStockData?.length || 0;

    const handleAdjustStock = async (payload: any) => {
        try {
            await inventoryApi.adjustStock(payload);
            // Invalidate queries will be handled inside the modal component
        } catch (e: any) {
            throw e;
        }
    };

    const handleExport = () => {
        if (activeTab === 'all' && stockData?.data) {
             const rows = stockData.data.map((p: any) => ({
                 name: p.name,
                 composition: p.composition,
                 manufacturer: p.manufacturer,
                 schedule: p.scheduleType,
                 totalStrips: p.totalStock,
                 nearestExpiry: p.nearestExpiry,
             }));
             exportToCSV(rows, 'stock-report', [
                 { key: 'name', label: 'Product Name' },
                 { key: 'composition', label: 'Composition' },
                 { key: 'manufacturer', label: 'Manufacturer' },
                 { key: 'schedule', label: 'Schedule' },
                 { key: 'totalStrips', label: 'Total Strips' },
                 { key: 'nearestExpiry', label: 'Nearest Expiry' },
             ]);
        } else if (activeTab === 'expiring' && expiringData) {
             const rows = expiringData.map((e: any) => ({
                  name: e.product.name,
                  batchNo: e.batch.batchNo,
                  expiry: e.batch.expiryDate,
                  qtyStrips: e.batch.qtyStrips,
                  daysRemaining: e.daysRemaining
             }));
             exportToCSV(rows, 'expiry-report', [
                  { key: 'name', label: 'Product Name' },
                  { key: 'batchNo', label: 'Batch No' },
                  { key: 'expiry', label: 'Expiry Date' },
                  { key: 'qtyStrips', label: 'Strips' },
                  { key: 'daysRemaining', label: 'Days Remaining' },
             ]);
        } else if (activeTab === 'low_stock' && lowStockData) {
             const rows = lowStockData.map((p: any) => ({
                  name: p.name,
                  qtyStrips: p.totalStock,
                  reorderLevel: 10,
                  shortage: Math.max(0, 10 - p.totalStock)
             }));
             exportToCSV(rows, 'low-stock-report', [
                  { key: 'name', label: 'Product Name' },
                  { key: 'qtyStrips', label: 'Current Stock' },
                  { key: 'reorderLevel', label: 'Reorder Level' },
                  { key: 'shortage', label: 'Shortage' },
             ]);
        }
    };

    useKeyboardShortcuts({
        '/': () => {
             // For simplicity, we trigger focus using regular DOM in StockTable component or here 
             // In proper React we'd pass a ref, but using DOM is quicker for global shortcut
             document.querySelector<HTMLInputElement>('input[placeholder="Search medicine, salt, brand..."]')?.focus();
        },
        'Escape': () => {
             clearFilters();
             setSelectedProduct(null);
        },
        'e': () => setActiveTab('expiring'),
        'l': () => setActiveTab('low_stock'),
        'a': () => setActiveTab('all'),
    });

    return (
        <div className="space-y-6">
             <div className="flex items-center justify-between">
                 <div>
                     <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
                     <p className="text-muted-foreground">Stock levels, batches, and expiry tracking</p>
                 </div>
                 <div className="flex gap-2">
                     <Button variant="outline" onClick={handleExport}>
                         <Download className="w-4 h-4 mr-2" />
                         Export
                     </Button>
                     <PermissionGate permission="create_purchases">
                         <Button onClick={() => router.push('/dashboard/purchases')}>
                             <Plus className="w-4 h-4 mr-2" />
                             Add Stock (GRN)
                         </Button>
                     </PermissionGate>
                 </div>
             </div>

             <InventoryStatCards onTabChange={setActiveTab} />

             <Tabs value={activeTab} onValueChange={setActiveTab}>
                 <TabsList>
                     <TabsTrigger value="all">
                         All Stock
                         <Badge className="ml-2 bg-slate-200 text-slate-800 hover:bg-slate-300">{totalProducts}</Badge>
                     </TabsTrigger>
                     <TabsTrigger value="expiring">
                         <AlertTriangle className="w-3 h-3 mr-1 text-amber-500" />
                         Expiring Soon
                         <Badge variant="destructive" className="ml-2 bg-amber-500 hover:bg-amber-600">{expiringCount}</Badge>
                     </TabsTrigger>
                     <TabsTrigger value="low_stock">
                         <PackageX className="w-3 h-3 mr-1 text-red-500" />
                         Low Stock
                         <Badge variant="destructive" className="ml-2">{lowStockCount}</Badge>
                     </TabsTrigger>
                 </TabsList>

                 <div className="mt-6">
                     <TabsContent value="all" className="mt-0 outline-none">
                         <StockTable
                             onProductClick={setSelectedProduct}
                             onAdjustClick={(batch: Batch) => {
                                 setAdjustmentBatch(batch);
                                 setShowAdjustmentModal(true);
                             }}
                             onEditClick={(product: MasterProduct) => {
                                 setEditProduct(product);
                                 setShowEditModal(true);
                             }}
                         />
                     </TabsContent>

                     <TabsContent value="expiring" className="mt-0 outline-none">
                         <ExpiryTable
                             onAdjustClick={(batch: Batch) => {
                                 setAdjustmentBatch(batch);
                                 setShowAdjustmentModal(true);
                             }}
                         />
                     </TabsContent>

                     <TabsContent value="low_stock" className="mt-0 outline-none">
                         <LowStockTable
                             onReorderClick={() => router.push('/dashboard/purchases/new')}
                         />
                     </TabsContent>
                 </div>
             </Tabs>

             <BatchDetailDrawer
                 productId={selectedProduct?.id ?? null}
                 product={selectedProduct}
                 isOpen={!!selectedProduct}
                 onClose={() => setSelectedProduct(null)}
                 onAdjust={(batch: Batch) => {
                     setAdjustmentBatch(batch);
                     setShowAdjustmentModal(true);
                 }}
             />

             <StockAdjustmentModal
                 isOpen={showAdjustmentModal}
                 batch={adjustmentBatch}
                 onClose={() => {
                     setShowAdjustmentModal(false);
                     setAdjustmentBatch(null);
                 }}
                 onSubmit={handleAdjustStock}
             />

             <EditProductModal
                 product={editProduct}
                 open={showEditModal}
                 onOpenChange={(o) => {
                     setShowEditModal(o);
                     if (!o) setEditProduct(null);
                 }}
             />
        </div>
    );
}
