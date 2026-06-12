import React, { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, Loader2, Calendar, Filter, BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Animal, ExternalTransfer } from '../types';

// Architectural Fix: Route Loader pre-fetches external dispositions
export const Route = createFileRoute('/logistics/external-transfers')({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData({
        queryKey: ['animals', 'dashboard'],
        queryFn: async () => {
          const { data, error } = await supabase.from('animals').select('*');
          if (error) throw error;
          return data as Animal[];
        }
      }),
      queryClient.ensureQueryData({
        queryKey: ['external_transfers'],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('external_transfers')
            .select('*')
            .eq('is_deleted', false)
            .order('transfer_date', { ascending: false });
          if (error) throw error;
          return data as ExternalTransfer[];
        }
      })
    ]);
  },
  component: ExternalTransfersPage,
});

export function ExternalTransfersPage() {
  const [filterType, setFilterType] = useState<string>('ALL');

  const { data: animals = [], isLoading: loadingAnimals } = useQuery({
    queryKey: ['animals', 'dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*');
      if (error) throw error;
      return data as Animal[];
    },
    staleTime: Infinity
  });

  const { data: transfers = [], isLoading: loadingTransfers } = useQuery({
    queryKey: ['external_transfers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_transfers')
        .select('*')
        .eq('is_deleted', false)
        .order('transfer_date', { ascending: false });
      if (error) throw error;
      return data as ExternalTransfer[];
    }
  });

  const animalMap = useMemo(() => new Map(animals.map(a => [a.id, a])), [animals]);

  const displayedTransfers = useMemo(() => {
    if (filterType === 'ALL') return transfers;
    return transfers.filter(t => t.transfer_type === filterType);
  }, [transfers, filterType]);

  const inputClass = "bg-transparent text-[10px] font-black text-slate-700 uppercase tracking-widest border-none focus:ring-0 cursor-pointer outline-none py-1 pr-2 w-48 truncate";

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Building2 className="text-rose-600" size={24} /> External Dispositions
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Audit trail for animals exiting collection scope</p>
        </div>

        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
          <Filter size={14} className="text-slate-400 ml-2" />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={inputClass}>
            <option value="ALL">All Disposition Types</option>
            <option value="TRANSFER_OUT">Transfers Out Only</option>
            <option value="DECEASED">Mortalities Only</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
        <div className="flex-1 overflow-y-auto relative">
          {(loadingTransfers || loadingAnimals) && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
              <Loader2 className="animate-spin text-rose-600 w-8 h-8" />
            </div>
          )}

          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/6">Date</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/4">Animal Identity</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/4">Receiving Entity</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/3">Transaction Reason & Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedTransfers.length === 0 && !loadingTransfers ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                    No outbound logistics logs found within this parameters.
                  </td>
                </tr>
              ) : (
                displayedTransfers.map((tx) => {
                  const targetAnimal = animalMap.get(tx.animal_id);
                  const txDate = new Date(tx.transfer_date);
                  const isDeceased = tx.transfer_type === 'DECEASED';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                          <Calendar size={12} /> {txDate.toLocaleDateString('en-GB')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{targetAnimal?.name || 'Archived Asset'}</p>
                        <p className="text-[9px] font-black tracking-widest uppercase text-slate-400">Species: {targetAnimal?.species || 'Unlisted'}</p>
                      </td>
                      <td className="px-6 py-4">
                        {isDeceased ? (
                          <span className="inline-block px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 text-[10px] font-black text-rose-700 uppercase tracking-widest shadow-sm">
                            Carcass Retention / N/A
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{tx.entity_name || 'Unspecified Zoo'}</p>
                            {tx.entity_contact && <p className="text-[10px] font-bold text-slate-400 tracking-tight">{tx.entity_contact}</p>}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${isDeceased ? 'bg-rose-100 border-rose-300 text-rose-800' : 'bg-amber-100 border-amber-300 text-amber-800'}`}>
                              {tx.transfer_type}
                            </span>
                            {tx.reason && (
                              <span className="text-xs font-bold text-slate-800 uppercase tracking-tight flex items-center gap-1">
                                <BookOpen size={12} className="text-slate-400" /> {tx.reason}
                              </span>
                            )}
                          </div>
                          {tx.notes && <p className="text-[11px] font-medium text-slate-500 leading-relaxed whitespace-pre-wrap">{tx.notes}</p>}
                        </div>
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