import React, { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Loader2, Calendar, Filter, MapPin, ClipboardText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Animal, InternalMovement, OperationalList } from '../types';

export const Route = createFileRoute('/logistics/internal-movements')({
  component: InternalMovementsPage,
});

export function InternalMovementsPage() {
  const [filterAnimalId, setFilterAnimalId] = useState<string>('ALL');

  // Warm Cache Animal Dock
  const { data: animals = [], isLoading: loadingAnimals } = useQuery({
    queryKey: ['animals', 'dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*').neq('is_deleted', true);
      if (error) throw error;
      return data as Animal[];
    },
    staleTime: Infinity
  });

  // Location Metadata List
  const { data: locations = [] } = useQuery({
    queryKey: ['operational_lists', 'LOCATION'],
    queryFn: async () => {
      const { data, error } = await supabase.from('operational_lists').select('*').eq('category', 'LOCATION').eq('is_deleted', false);
      if (error) throw error;
      return data as OperationalList[];
    },
    staleTime: Infinity
  });

  // Ledger query mapped strictly to schema
  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ['internal_movements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internal_movements')
        .select('*')
        .eq('is_deleted', false)
        .order('movement_date', { ascending: false });
      if (error) throw error;
      return data as InternalMovement[];
    }
  });

  const locationMap = useMemo(() => new Map(locations.map(l => [l.id, l.name])), [locations]);
  const animalMap = useMemo(() => new Map(animals.map(a => [a.id, a])), [animals]);

  const displayedMovements = useMemo(() => {
    if (filterAnimalId === 'ALL') return movements;
    return movements.filter(m => m.animal_id === filterAnimalId);
  }, [movements, filterAnimalId]);

  const inputClass = "bg-transparent text-[10px] font-black text-slate-700 uppercase tracking-widest border-none focus:ring-0 cursor-pointer outline-none py-1 pr-2 w-48 truncate";

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <ArrowRightLeft className="text-emerald-600" size={24} /> Internal Movements
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Enclosure Location Auditing (ZLA compliance)</p>
        </div>

        {/* Global Filter Bar */}
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
          <Filter size={14} className="text-slate-400 ml-2" />
          <select value={filterAnimalId} onChange={(e) => setFilterAnimalId(e.target.value)} className={inputClass}>
            <option value="ALL">All Enclosure Assets</option>
            {animals.map(a => <option key={a.id} value={a.id}>{a.name || 'Unnamed'} ({a.species})</option>)}
          </select>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
        <div className="flex-1 overflow-y-auto relative">
          {(loadingMovements || loadingAnimals) && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
              <Loader2 className="animate-spin text-emerald-600 w-8 h-8" />
            </div>
          )}

          <table className="w-full text-left min-w-[700px]">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/5">Timestamp</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/4">Animal Asset</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/4">Movement Sequence</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/3">Authorization Reason & Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedMovements.length === 0 && !loadingMovements ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                    No movement records found within this scope.
                  </td>
                </tr>
              ) : (
                displayedMovements.map((move) => {
                  const targetAnimal = animalMap.get(move.animal_id);
                  const fromLocName = locationMap.get(move.from_location || '') || move.from_location || 'System Origin';
                  const toLocName = locationMap.get(move.to_location) || move.to_location || 'Unknown';
                  const dateObj = new Date(move.movement_date);

                  return (
                    <tr key={move.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                          <Calendar size={12} /> {dateObj.toLocaleDateString('en-GB')} {dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{targetAnimal?.name || 'Unknown Entity'}</p>
                        <p className="text-[10px] font-bold text-slate-400 italic tracking-tight">{targetAnimal?.species || 'Unclassified'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                          <span className="text-slate-400 font-medium truncate max-w-[100px]" title={fromLocName}>{fromLocName}</span>
                          <span className="text-emerald-600 font-black">→</span>
                          <span className="text-emerald-700 font-black bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 truncate max-w-[120px]" title={toLocName}>{toLocName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-0.5">
                          <p className="text-xs font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                            <ClipboardText size={12} className="text-slate-400" /> {move.reason || 'Unspecified Revision'}
                          </p>
                          {move.notes && <p className="text-[11px] font-medium text-slate-500 leading-relaxed">{move.notes}</p>}
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