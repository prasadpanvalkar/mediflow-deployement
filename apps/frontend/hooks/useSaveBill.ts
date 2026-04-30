'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBillingStore } from '@/store/billingStore';
import { useAuthStore } from '@/store/authStore';
import { salesApi } from '@/lib/apiClient';
import { PaymentSplit } from '@/types';

export function useSaveBill() {
    const billingStore = useBillingStore();
    const queryClient = useQueryClient();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const saveBill = async (payment: PaymentSplit) => {
        setIsLoading(true);
        setError(null);

        try {
            const cart = useBillingStore.getState().cart;
            const customer = useBillingStore.getState().customer;
            const customerLedger = useBillingStore.getState().customerLedger;
            const doctor = useBillingStore.getState().doctor;
            const activeStaff = useBillingStore.getState().activeStaff;
            const scheduleHData = useBillingStore.getState().scheduleHData;
            const totals = useBillingStore.getState().getTotals();
            const extraDiscountPct = useBillingStore.getState().extraDiscountPct || 0;
            const { outlet, user } = useAuthStore.getState();

            // M13: Require a valid session before touching the backend.
            // Never fall back to hardcoded demo values — a bill without a real
            // outletId or billedBy cannot be audited and would pass backend checks
            // silently on a misconfigured tenant.
            if (!outlet?.id || !activeStaff?.id) {
                throw {
                    type: 'AUTH_ERROR',
                    message: 'Your session has expired. Please log in again.',
                    requiresReauth: true,
                };
            }

            const getPaid = (method: string) => {
                if (payment.method === method) return payment.amount;
                if (payment.method === 'split') {
                    return (payment.splitBreakdown as any)?.[method] || 0;
                }
                return 0;
            };

            const payload = {
                outletId: outlet.id,
                // Ledger-first (Marg-style): prefer partyLedgerId; fall back to legacy customerId
                partyLedgerId: customerLedger?.id,
                customerId: customerLedger ? undefined : customer?.id,
                doctorId: doctor?.id,
                billedBy: activeStaff.id,
                items: cart.map((item: any) => {
                    const rawTotal = item.rate * item.totalQty;
                    const gstRate = item.gstRate || 0;
                    // Apply extra discount before GST extraction (matches getTotals & backend)
                    const discountFactor = extraDiscountPct > 0 ? 1 - extraDiscountPct / 100 : 1;
                    const discountedTotal = rawTotal * discountFactor;
                    const taxable = gstRate > 0
                        ? Number((discountedTotal / (1 + gstRate / 100)).toFixed(2))
                        : Number(discountedTotal.toFixed(2));
                    const gst = Number((discountedTotal - taxable).toFixed(2));
                    return {
                        batchId: item.batchId,
                        productId: item.productId,
                        qtyStrips: item.qtyStrips,
                        qtyLoose: item.qtyLoose,
                        saleMode: item.saleMode,
                        rate: item.rate,
                        discountPct: item.discountPct,
                        gstRate: item.gstRate,
                        scheduleType: item.scheduleType || 'OTC',
                        taxableAmount: taxable,
                        gstAmount: gst,
                        totalAmount: Number(discountedTotal.toFixed(2)),
                    };
                }),
                subtotal: Number(totals.subtotal.toFixed(2)),
                discountAmount: Number(totals.discountAmount.toFixed(2)),
                taxableAmount: Number(totals.taxableAmount.toFixed(2)),
                cgstAmount: Number(totals.cgstAmount.toFixed(2)),
                sgstAmount: Number(totals.sgstAmount.toFixed(2)),
                igstAmount: 0,
                cgst: Number(totals.cgstAmount.toFixed(2)),
                sgst: Number(totals.sgstAmount.toFixed(2)),
                igst: 0,
                roundOff: Number(totals.roundOff.toFixed(2)),
                grandTotal: Number(totals.grandTotal.toFixed(2)),
                extraDiscountPct,
                paymentMode: payment.method,
                cashPaid: getPaid('cash'),
                upiPaid: getPaid('upi'),
                cardPaid: getPaid('card'),
                creditGiven: getPaid('credit'),
                scheduleHData: (totals.requiresDoctorDetails || totals.hasScheduleH) ? scheduleHData : undefined,
            };

            // Try to create via API — no offline fallback (C4).
            // On network failure the cart stays intact and the cashier must retry.
            const editingSaleId = useBillingStore.getState().editingSaleId;
            let invoice;
            try {
                if (editingSaleId) {
                    invoice = await salesApi.update(editingSaleId, payload as never);
                } else {
                    invoice = await salesApi.create(payload as never);
                }
                // If the create response didn't include items, fetch the full invoice
                if ((invoice as any).id && !((invoice as any).items?.length)) {
                    try {
                        invoice = await salesApi.getById((invoice as any).id, outlet?.id);
                    } catch {
                        // fallback to create response
                    }
                }
            } catch (err: unknown) {
                const isNetworkError =
                    !navigator.onLine ||
                    (err instanceof TypeError && err.message === 'Failed to fetch');
                if (isNetworkError) {
                    throw {
                        type: 'NETWORK_ERROR',
                        message:
                            'Cannot save bill — no connection to server. ' +
                            'Please check your internet connection and try again. ' +
                            'Do NOT dispense medicines until the bill is confirmed.',
                        canRetry: true,
                    };
                }
                // Real API error (400, 500, etc.) — propagate as-is
                throw err;
            }

            // Capture doctor/customer before clearCart clears them
            const savedDoctor = useBillingStore.getState().doctor;
            const savedCustomer = useBillingStore.getState().customer;
            const savedScheduleH = useBillingStore.getState().scheduleHData;
            const enrichedInvoice = {
                ...invoice,
                customer: (invoice as any).customer ?? savedCustomer ?? undefined,
                doctorName: savedDoctor?.name ?? savedScheduleH?.doctorName ?? undefined,
                doctorRegNo: savedDoctor?.regNo ?? savedScheduleH?.doctorRegNo ?? undefined,
                doctorDegree: savedDoctor?.degree ?? undefined,
                doctorSpecialty: savedDoctor?.specialty ?? (savedDoctor as any)?.specialization ?? undefined,
                doctorHospitalName: savedDoctor?.hospitalName ?? undefined,
                doctorAddress: savedDoctor?.address ?? undefined,
                doctorQualification: savedDoctor?.qualification ?? undefined,
                patientName: savedScheduleH?.patientName ?? undefined,
                patientAddress: savedScheduleH?.patientAddress ?? undefined,
            };

            // On Success (Online or Offline):
            useBillingStore.getState().setLastInvoice(enrichedInvoice as any);
            useBillingStore.getState().clearCart();
            useBillingStore.getState().incrementBillsToday();

            // If this was an edit, clear the editing state
            if (editingSaleId) {
                useBillingStore.getState().setEditingSaleId(null);
            }

            // Invalidate all related caches so UI reflects changes everywhere:
            // - sales list (SalesList, P&L drilldown)
            // - inventory (stock levels changed)
            // - dashboard stats
            // - accounts / ledgers (journal entries reversed + re-posted)
            queryClient.invalidateQueries({ queryKey: ['sales'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['ledger'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            queryClient.invalidateQueries({ queryKey: ['profit-loss'] });
            queryClient.invalidateQueries({ queryKey: ['pl-ledger-stmt'] });

            return invoice;

        } catch (err: any) {
            const message =
                err?.message ??          // NETWORK_ERROR shape
                err?.error?.message ??   // API error shape { error: { message } }
                'Failed to save bill. Please try again.';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    return { saveBill, isLoading, error };
}
