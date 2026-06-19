import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeftRight, Search, Loader2, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';

// ENTERPRISE FIX: 14-Day RAM Cap for heavy logistics tables
const movementsOptions = queryOptions({
  queryKey: ['internal_movements'],
  queryFn: async () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('internal_movements')
      .select('*, animals (name, species)')
      .gte('movement_date', fourteenDaysAgo)
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
  const queryClient = useQueryClient();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    const channel = supabase.channel('movements-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_movements' }, () => {
        queryClient.invalidateQueries({ queryKey: ['internal_movements'] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: movements = [], isLoading } = useQuery(movementsOptions);

  const filtered = useMemo(() => {
    if (!searchQuery) return movements;
    const q = searchQuery.toLowerCase();
    return movements.filter((m: any) => 
      (m.animals?.name || '').toLowerCase().includes(q) || 
      (m.reason || '').toLowerCase().includes(q) ||
      (m.to_location || '').toLowerCase().includes(q)
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
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
           <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
             <ArrowLeftRight className="text-indigo-600" /> Internal Movements
           </h1>
           <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Enclosure Transfers</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transfers..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] relative">
        {isLoading && <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex justify-center items-center"><Loader2 className="animate-spin text-indigo-600 w-8 h-8" /></div>}
        
        <div className="w-full overflow-x-auto custom-scrollbar flex-1 relative">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 w-1/6">Date</th>
                <th className="px-6 py-4 w-1/4">Animal</th>
                <th className="px-6 py-4 w-1/4">From → To</th>
                <th className="px-6 py-4">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 relative">
              {filtered.length === 0 && !isLoading ? (
                <tr><td colSpan={4} className="p-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No recent movements logged.</td></tr>
              ) : (
                <>
                  {paddingTop > 0 && <tr><td colSpan={4} style={{ height: `${paddingTop}px` }} /></tr>}
                  {virtualItems.map((virtualRow) => {
                    const m = filtered[virtualRow.index];
                    return (
                      <tr key={m.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50">
                        {/* ENTERPRISE FIX: Safe strict parsing */}
                        <td className="px-6 py-4 text-[10px] font-black text-slate-400 whitespace-nowrap">{format(parseISO(m.movement_date), 'dd MMM yyyy')}</td>
                        <td className="px-6 py-4">
                           <span className="text-xs font-black text-slate-900 block">{m.animals?.name}</span>
                           <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{m.animals?.species}</span>
                        </td>
                        <td className="px-6 py-4 text-[11px] font-black text-slate-700 uppercase tracking-tight flex items-center gap-2">
                          <span className="text-slate-400">{m.from_location || 'N/A'}</span>
                          <MapPin size={12} className="text-indigo-500 shrink-0"/> 
                          <span>{m.to_location}</span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-slate-600 line-clamp-2">{m.reason}</td>
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && <tr><td colSpan={4} style={{ height: `${paddingBottom}px` }} /></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}