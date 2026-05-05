"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import { Search, Calendar as CalendarIcon, ArrowUpRight, ArrowDownRight, RefreshCw, FileText } from 'lucide-react';
import { format } from 'date-fns';

interface StockLedgerEntry {
  id: string;
  txn_date: string;
  txn_type: string;
  voucher_type: string;
  voucher_number: string;
  party_name: string;
  product_name: string;
  batch_number: string;
  expiry_date: string | null;
  qty_in: number;
  qty_out: number;
  rate: number;
  running_qty: number;
  running_value: number;
  created_at: string;
}

export default function StockLedgerPage() {
  const { outlet } = useAuthStore();
  const outletId = outlet?.id ?? '';

  const [entries, setEntries] = useState<StockLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState({ total_in: 0, total_out: 0 });

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return format(d, 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const fetchLedger = useCallback(async () => {
    if (!outletId) return;

    setLoading(true);
    setError('');
    try {
      const response = await api.get('/inventory/stockledger/', {
        params: { outletId, startDate, endDate, pageSize: 1000 },
      });
      setEntries(response.data.data ?? []);
      setSummary(response.data.summary ?? { total_in: 0, total_out: 0 });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch stock ledger');
    } finally {
      setLoading(false);
    }
  }, [outletId, startDate, endDate]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const filteredEntries = entries.filter((entry) => {
    const s = search.toLowerCase();
    return (
      (entry.product_name || '').toLowerCase().includes(s) ||
      (entry.batch_number || '').toLowerCase().includes(s) ||
      (entry.voucher_number || '').toLowerCase().includes(s) ||
      (entry.party_name || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Stock Ledger</h1>
          <p className="text-slate-500 text-sm mt-1">Append-only audit trail of all inventory movements.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
            <CalendarIcon className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm bg-transparent outline-none border-none text-slate-700"
            />
            <span className="text-slate-400 text-sm">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm bg-transparent outline-none border-none text-slate-700"
            />
          </div>

          <button
            onClick={fetchLedger}
            disabled={loading}
            className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm disabled:opacity-60"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <ArrowUpRight className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Qty In</p>
            <p className="text-2xl font-bold text-slate-900">{summary.total_in.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <ArrowDownRight className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Qty Out</p>
            <p className="text-2xl font-bold text-slate-900">{summary.total_out.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Entries</p>
            <p className="text-2xl font-bold text-slate-900">{entries.length}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col" style={{ height: 560 }}>
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 shrink-0">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search product, batch, voucher, or party…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10 shadow-[0_1px_0] shadow-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Voucher / Type</th>
                <th className="px-4 py-3 font-medium">Party</th>
                <th className="px-4 py-3 font-medium">Product (Batch)</th>
                <th className="px-4 py-3 font-medium text-right">In</th>
                <th className="px-4 py-3 font-medium text-right">Out</th>
                <th className="px-4 py-3 font-medium text-right">Running Bal.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                    Loading ledger…
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No ledger entries found for the selected date range.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  const isIn = entry.qty_in > 0;
                  const isOut = entry.qty_out > 0;
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-700">
                          {format(new Date(entry.txn_date), 'dd MMM yyyy')}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {format(new Date(entry.created_at), 'HH:mm')}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-indigo-600">{entry.voucher_number || '—'}</div>
                        <div className="text-xs text-slate-500">{entry.voucher_type}</div>
                      </td>

                      <td className="px-4 py-3 max-w-[150px]">
                        <span className="truncate block" title={entry.party_name}>
                          {entry.party_name || '—'}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 truncate max-w-[200px]" title={entry.product_name}>
                          {entry.product_name}
                        </div>
                        <div className="text-xs text-slate-500">Batch: {entry.batch_number || '—'}</div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        {isIn ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100 text-xs">
                            +{entry.qty_in.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {isOut ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-semibold border border-rose-100 text-xs">
                            -{entry.qty_out.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="font-bold text-slate-800">{entry.running_qty.toFixed(2)}</div>
                        <div className="text-xs text-slate-400">₹{entry.running_value.toFixed(2)}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
