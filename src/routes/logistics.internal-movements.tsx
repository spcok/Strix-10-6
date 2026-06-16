import React, { useState, useMemo, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeftRight, Search, Loader2, Calendar, MapPin, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';

const movementsOptions = queryOptions({
  queryKey: ['internal_movements'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('internal_movements')
      .select('*, animals (name, species)')
      .order('movement_date', { ascending: false });
    if (error) throw error;
    return data;
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/logistics/internal-movements')({
  loader: ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) queryClient.ensureQueryData(movementsOptions);
  },
  component: InternalMovementsPage,
});

export function InternalMovementsPage() {
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: movements = [], isLoading } = useQuery(movementsOptions);

  const filtered = useMemo(() => {
    if (!searchQuery) return movements;
    const q = searchQuery.toLowerCase();
    return movements.filter(m => 
      m.animals?.name.toLowerCase().includes(q) || 
      m.reason?.toLowerCase().includes(q)
    );
  }, [movements, searchQuery]);

  const rowVirtualizer = useWindowVirtualizer({
    count: filtered.length,
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
          <ArrowLeftRight className="text-indigo-600" /> Internal Movements
        </h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transfers..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>
        ) : (
          <div className="w-full overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Animal</th>
                  <th className="px-6 py-4">From → To</th>
                  <th className="px-6 py-4">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paddingTop > 0 && <tr><td colSpan={4} style={{ height: `${paddingTop}px` }} /></tr>}
                {virtualItems.map((virtualRow) => {
                  const m = filtered[virtualRow.index];
                  return (
                    <tr key={m.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-[10px] font-black text-slate-400">{format(parseISO(m.movement_date), 'dd MMM yyyy')}</td>
                      <td className="px-6 py-4 text-xs font-bold">{m.animals?.name}</td>
                      <td className="px-6 py-4 text-xs font-medium flex items-center gap-2">
                        {m.from_location || 'N/A'} <MapPin size={12}/> {m.to_location}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600">{m.reason}</td>
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