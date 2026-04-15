import { PurchaseItemFormData } from '../types';

export function calculatePurchaseItem(item: {
  pkg?: any
  qty: number
  freeQty: number
  purchaseRate: number
  discountPct: number
  gstRate: number
  mrp: number
  saleRate: number
}): {
  effectiveQty: number
  taxableAmount: number
  gstAmount: number
  totalAmount: number
  marginPct: number
  freeGoodsValue: number
} {
  const effPkg = typeof item.pkg === 'number' && item.pkg > 0 ? item.pkg : 1;
  const effectiveQty = (item.qty + item.freeQty) * effPkg;
  const baseAmount = item.qty * item.purchaseRate;
  const discountAmount = baseAmount * (item.discountPct / 100);
  const taxableAmount = baseAmount - discountAmount;
  const gstAmount = taxableAmount * (item.gstRate / 100);
  const totalAmount = taxableAmount + gstAmount;

  const marginPct = item.saleRate > 0
    ? ((item.saleRate - item.purchaseRate) / item.purchaseRate) * 100
    : 0;

  const freeGoodsValue = item.freeQty * item.purchaseRate;

  return {
    effectiveQty,
    taxableAmount,
    gstAmount,
    totalAmount,
    marginPct,
    freeGoodsValue,
  }
}

export function calculatePurchaseTotals(
  items: PurchaseItemFormData[]
): {
  itemCount: number
  totalQty: number
  subtotal: number
  totalDiscount: number
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  grandTotal: number
  freeGoodsValue: number
} {
  let subtotal = 0;
  let totalDiscount = 0;
  let taxableAmount = 0;
  let gstAmount = 0;
  let totalQty = 0;
  let freeGoodsValue = 0;

  items.forEach(item => {
    const calc = calculatePurchaseItem(item);
    const effPkg = typeof item.pkg === 'number' && item.pkg > 0 ? item.pkg : 1;
    subtotal += item.qty * item.purchaseRate;
    totalDiscount += (item.qty * item.purchaseRate) * (item.discountPct / 100);
    taxableAmount += calc.taxableAmount;
    gstAmount += calc.gstAmount;
    totalQty += item.qty * effPkg;
    freeGoodsValue += calc.freeGoodsValue;
  });

  const cgstAmount = gstAmount / 2;
  const sgstAmount = gstAmount / 2;
  const grandTotal = taxableAmount + gstAmount;

  return {
    itemCount: items.length,
    totalQty,
    subtotal,
    totalDiscount,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    grandTotal,
    freeGoodsValue,
  };
}

export function calculateLandingRate(
  purchaseRate: number,
  gstRate: number,         // e.g. 12 for 12%
  freight: number,         // per-unit freight amount
  includeGst: boolean,     // from outlet settings
  includeFreight: boolean, // from outlet settings
  otherPerUnit: number = 0 // per-unit other charges — always added
): number {
  let base = purchaseRate;
  if (includeGst) base += (purchaseRate * gstRate) / 100;
  if (includeFreight) base += freight;
  base += otherPerUnit;
  return Math.round(base * 100) / 100;
}