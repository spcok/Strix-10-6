import React, { useState, useMemo, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Truck, Search, Loader2, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';

const transfersOptions = queryOptions({
  queryKey: ['external_transfers'],
  queryFn: async () => {
    const { data, error } = await supabase.from('external_transfers').select('*, animals (name)').order('transfer_date', { ascending: false });
    if (error) throw error;
    return data;
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/logistics/external-transfers')({
  loader: ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) queryClient.ensureQueryData(transfersOptions);
  },
  component: ExternalTransfersPage,
});

export function ExternalTransfersPage() {
  const { data: transfers = [], isLoading } = useQuery(transfersOptions);
  const rowVirtualizer = useWindowVirtualizer({
    count: transfers.length,
    estimateSize: () => 80,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
          <Truck className="text-indigo-600" /> External Transfers
        </h1>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>
        ) : (
          <div className="w-full overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-4">Transfer Date</th>
                  <th className="px-6 py-4">Animal</th>
                  <th className="px-6 py-4">Destination</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paddingTop > 0 && <tr><td colSpan={4} style={{ height: `${paddingTop}px` }} /></tr>}
                {virtualItems.map((virtualRow) => {
                  const t = transfers[virtualRow.index];
                  return (
                    <tr key={t.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-[10px] font-black text-slate-400">{format(parseISO(t.transfer_date), 'dd MMM yyyy')}</td>
                      <td className="px-6 py-4 text-xs font-bold">{t.animals?.name}</td>
                      <td className="px-6 py-4 text-xs font-medium">{t.destination_name}</td>
                      <td className="px-6 py-4 text-xs font-bold text-emerald-600">{t.status}</td>
                    </tr>
                  );
                })}
                {paddingBottom > 0 && <tr><td colSpan={4} style={{ height: `${paddingBottom}px` }} /></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}