import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, queryOptions, useQueryClient } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { 
  useReactTable, 
  getCoreRowModel, 
  flexRender, 
  ColumnDef 
} from '@tanstack/react-table';
import { Scale, Thermometer, ChevronLeft, ChevronRight, Plus, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Animal, DailyLog } from '../types';
import DailyLogFormModal from '../components/animals/DailyLogFormModal';

export const generateOfflineUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const getLocalDateString = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

export const formatWeightDisplay = (grams: number | null | undefined, unit: string) => {
  if (!grams) return null;
  if (unit === 'kg') return `${(grams / 1000).toFixed(2)}kg`;
  if (unit === 'lb') {
    const totalOunces = grams / 28.3495;
    let lbs = Math.floor(totalOunces / 16);
    let oz = Math.floor(totalOunces - (lbs * 16));
    let eighths = Math.round((totalOunces - (lbs * 16) - oz) * 8);
    if (eighths >= 8) { oz += 1; eighths = 0; }
    if (oz >= 16) { lbs += 1; oz = 0; }
    const eighthsStr = eighths > 0 ? ` ${eighths}/8` : '';
    return `${lbs}lb ${oz}${eighthsStr}oz`;
  }
  if (unit === 'oz') {
    const totalOunces = grams / 28.3495;
    let oz = Math.floor(totalOunces);
    let eighths = Math.round((totalOunces - oz) * 8);
    if (eighths >= 8) { oz += 1; eighths = 0; }
    const eighthsStr = eighths > 0 ? ` ${eighths}/8` : '';
    return `${oz}${eighthsStr}oz`;
  }
  return `${Math.round(grams)}g`;
};

const getAnimalsOptions = () => queryOptions({
  queryKey: ['animals', 'dashboard'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('*').order('name');
    if (error) throw error;
    return data as Animal[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const getDailyLogsOptions = (date: string) => queryOptions({
  queryKey: ['daily_logs', 'date-view', date],
  queryFn: async () => {
    const startOfDay = new Date(`${date}T00:00:00`);
    const endOfDay = new Date(`${date}T23:59:59.999`);
    const { data, error } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('is_deleted', false)
      .gte('log_date', startOfDay.toISOString())
      .lte('log_date', endOfDay.toISOString());
    if (error) throw error;
    return data as DailyLog[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/husbandry/daily-logs')({
  loader: async ({ context: { queryClient } }) => {
    const today = getLocalDateString();
    if (queryClient) {
      await queryClient.ensureQueryData(getAnimalsOptions());
      await queryClient.ensureQueryData(getDailyLogsOptions(today));
    }
  },
  component: DailyLogsPage,
});

const SECTION_BAR = [
  { id: 'ALL', label: 'All' },
  { id: 'OWL', label: 'Owls' },
  { id: 'RAPTOR', label: 'Raptors' },
  { id: 'MAMMAL', label: 'Mammal' },
  { id: 'EXOTIC', label: 'Exotic' }
] as const;

type WorksheetRecord = { animal: Animal; log: DailyLog | undefined };

const DYNAMIC_GRID_COLS = "lg:grid-cols-[minmax(180px,1.5fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(280px,2.5fr)_minmax(250px,2fr)]";

export function DailyLogsPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [activeSection, setActiveSection] = useState<string>('ALL');
  
  const [logModalState, setLogModalState] = useState<{
    isOpen: boolean;
    animal: Animal | null;
    mode: 'WEIGHT' | 'FEEDING' | 'TEMPERATURE' | 'OBSERVATION';
    initialData: DailyLog | undefined;
  }>({ isOpen: false, animal: null, mode: 'OBSERVATION', initialData: undefined });

  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['daily_logs'] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: animals = [], isLoading: loadingAnimals } = useQuery(getAnimalsOptions());
  const { data: todaysLogs = [], isLoading: loadingLogs, error: logsError } = useQuery(getDailyLogsOptions(selectedDate));

  const filteredWorksheetRecords = useMemo<WorksheetRecord[]>(() => {
    const cleanAnimals = animals.filter(a => {
      if (a.status === 'ARCHIVED') return false;
      if (activeSection === 'ALL') return true;
      return a.category === activeSection;
    });
    const logMap = new Map<string, DailyLog>();
    todaysLogs.forEach(log => { logMap.set(log.animal_id, log); });
    return cleanAnimals.map(animal => ({ animal, log: logMap.get(animal.id) }));
  }, [animals, todaysLogs, activeSection]);

  const shiftDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const triggerLogForm = (animal: Animal, mode: 'WEIGHT' | 'FEEDING' | 'TEMPERATURE' | 'OBSERVATION', existingLog?: DailyLog) => {
    setLogModalState({ isOpen: true, animal, mode, initialData: existingLog });
  };

  const columns = useMemo<ColumnDef<WorksheetRecord>[]>(() => [
    {
      id: 'entity',
      header: 'Entity Matrix',
      cell: ({ row }) => (
        <div className="flex flex-col pt-2">
          <span className="font-black text-slate-900 text-lg lg:text-sm leading-tight">{row.original.animal.name}</span>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">{row.original.animal.species}</span>
        </div>
      )
    },
    {
      id: 'weight',
      header: 'Target Bio-Weight',
      cell: ({ row: { original: { animal, log } } }) => (
        <button type="button" onClick={() => triggerLogForm(animal, 'WEIGHT', log)} className={`w-full min-h-[54px] lg:min-h-[46px] p-2 rounded-xl border border-dashed text-center flex flex-col justify-center items-center transition-all ${log?.weight_not_required ? 'bg-slate-100 border-slate-200 text-slate-400' : log?.weight_grams ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:border-slate-300'}`}>
          {log?.weight_not_required ? <span className="text-[9px] font-black uppercase tracking-widest">Exempt</span> : log?.weight_grams ? <span className="text-sm font-black tracking-tight">{formatWeightDisplay(log.weight_grams, animal.weight_unit || 'g')}</span> : <><Scale size={14} className="opacity-40 mb-1" /><span className="text-[9px] font-black uppercase tracking-widest">Log Wt</span></>}
        </button>
      )
    },
    {
      id: 'temperature',
      header: 'Thermal Parameters',
      cell: ({ row: { original: { animal, log } } }) => (
        <button type="button" onClick={() => triggerLogForm(animal, 'TEMPERATURE', log)} className={`w-full min-h-[54px] lg:min-h-[46px] p-2 rounded-xl border border-dashed text-left transition-all flex flex-col justify-center ${log?.temperature_c || log?.basking_temp_c || log?.cool_temp_c ? 'bg-blue-50 border-blue-200 text-blue-800 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 items-center'}`}>
          {log?.temperature_c ? <div className="w-full space-y-0.5 font-bold text-[9px] tracking-tight text-center">{log.temperature_c}°C</div> : <><Thermometer size={14} className="opacity-40 mb-1" /><span className="text-[9px] font-black uppercase tracking-widest">Log Temp</span></>}
        </button>
      )
    },
    {
      id: 'feeding',
      header: 'Multi-Feeding Event Pipeline',
      cell: ({ row: { original: { animal, log } } }) => {
        const feedParsed = typeof log?.feed_details === 'string' ? (() => { try { return JSON.parse(log.feed_details); } catch { return null; } })() : log?.feed_details;
        const meals = feedParsed?.meals || [];
        return (
          <div className="flex flex-col gap-2 w-full">
            {meals.map((meal: any, idx: number) => {
              const qty = meal.quantity || meal.quantity_consumed || meal.food_consumed_g || meal.quantity_offered || meal.food_offered_g;
              const unit = meal.unit === 'g' ? 'g' : (meal.unit === 'Whole' && qty ? ' items' : '');
              const qtyStr = qty ? `${qty}${unit}` : '--';

              return (
                <div key={idx} onClick={() => triggerLogForm(animal, 'FEEDING', log)} className="bg-amber-50/60 border border-amber-200/70 p-3 lg:p-2 rounded-xl flex flex-col gap-1 lg:gap-0.5 shadow-sm cursor-pointer hover:bg-amber-100/50">
                  <div className="flex justify-between font-black text-slate-800 tracking-tight text-[11px]"><span>{meal.food_item || 'Diet Apportion'}</span><span className="text-amber-700 font-bold">{new Date(meal.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>
                  <div className="text-slate-500 font-bold tracking-tight text-[10px]">Qty: <span className="text-emerald-600 font-black">{qtyStr}</span></div>
                </div>
              );
            })}
            <button type="button" onClick={() => triggerLogForm(animal, 'FEEDING', log)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 lg:py-1.5 bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-amber-700 hover:border-amber-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all w-full lg:w-max shadow-sm"><Plus size={12} className="lg:w-[10px] lg:h-[10px]" /> Add Feed</button>
          </div>
        );
      }
    },
    {
      id: 'observations',
      header: 'Daily Descriptive Observations',
      cell: ({ row: { original: { animal, log } } }) => (
        <button type="button" onClick={() => triggerLogForm(animal, 'OBSERVATION', log)} className="w-full text-left hover:bg-slate-100/50 p-3 lg:p-2 rounded-xl border border-slate-100 lg:border-transparent transition-colors min-h-[60px] lg:min-h-[44px] flex items-start">
          <span className="text-xs lg:text-[11px] leading-relaxed block whitespace-pre-wrap">{log?.notes || <span className="text-slate-400 italic">No notes entered for this date...</span>}</span>
        </button>
      )
    }
  ], []);

  const table = useReactTable({
    data: filteredWorksheetRecords,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => (typeof window !== 'undefined' && window.innerWidth >= 1024) ? 80 : 190,
    overscan: 5,
  });

  return (
    <div className="max-w-[1600px] mx-auto w-full space-y-4 lg:space-y-6 px-4 md:px-8 pb-20">
      
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 shadow-sm w-full">
        <div className="w-full xl:w-auto">
          <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">Husbandry Entry Sheet</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">Day-To-Day Logs Matrix</p>
        </div>
        
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 lg:gap-4 w-full xl:w-auto">
          <div className="flex gap-1 bg-slate-100 p-1 border rounded-xl shadow-inner overflow-x-auto w-full lg:w-auto scrollbar-hide">
            {SECTION_BAR.map(btn => (
              <button
                key={btn.id} type="button" onClick={() => setActiveSection(btn.id)}
                className={`px-4 py-2 lg:py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex-1 lg:flex-none ${
                  activeSection === btn.id ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner w-full lg:w-auto justify-between lg:justify-start">
            <button onClick={() => shiftDate(-1)} className="p-3 lg:p-2 text-slate-600 hover:bg-white hover:text-slate-900 rounded-lg shadow-sm"><ChevronLeft size={16} className="lg:w-4 lg:h-4" /></button>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent border-none text-xs font-black uppercase tracking-widest text-slate-700 outline-none text-center px-2 w-full lg:w-32" />
            <button onClick={() => shiftDate(1)} className="p-3 lg:p-2 text-slate-600 hover:bg-white hover:text-slate-900 rounded-lg shadow-sm"><ChevronRight size={16} className="lg:w-4 lg:h-4" /></button>
          </div>
        </div>
      </div>

      <div className="bg-transparent lg:bg-white lg:border border-slate-200 rounded-none lg:rounded-2xl lg:shadow-sm overflow-hidden flex flex-col w-full">
        {logsError ? (
          <div className="p-10 text-center text-rose-600 bg-rose-50 rounded-2xl font-bold flex flex-col items-center gap-3">
            <AlertCircle size={24} /> Database link exception. Verify network availability.
          </div>
        ) : (loadingAnimals || loadingLogs) && filteredWorksheetRecords.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-4">
            <Loader2 size={24} className="text-emerald-500 animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Syncing active workbook metrics...</span>
          </div>
        ) : (
          <div className="w-full lg:overflow-x-auto custom-scrollbar">
            <div className="w-full lg:min-w-full">
              
              <div className={`hidden lg:grid ${DYNAMIC_GRID_COLS} gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest`}>
                {table.getHeaderGroups().map(headerGroup => (
                  <React.Fragment key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <div key={header.id}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>

              <div ref={parentRef} style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  const { animal, log } = row.original;
                  
                  const feedParsed = typeof log?.feed_details === 'string' ? (() => { try { return JSON.parse(log.feed_details); } catch { return null; } })() : log?.feed_details;
                  const meals = feedParsed?.meals || [];

                  return (
                    <div
                      key={row.id}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="absolute top-0 left-0 w-full py-2 lg:py-0"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <div className="flex flex-col gap-3 lg:hidden p-4 bg-white rounded-2xl border border-slate-200 shadow-sm mx-1">
                        
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 text-lg leading-tight">{animal.name}</span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">{animal.species}</span>
                        </div>

                        {meals.length > 0 && (
                          <div className="flex flex-col gap-2 w-full">
                            {meals.map((meal: any, idx: number) => {
                              const qty = meal.quantity || meal.quantity_consumed || meal.food_consumed_g || meal.quantity_offered || meal.food_offered_g;
                              const unit = meal.unit === 'g' ? 'g' : (meal.unit === 'Whole' && qty ? ' items' : '');
                              const qtyStr = qty ? `${qty}${unit}` : '--';

                              return (
                                <div key={idx} onClick={() => triggerLogForm(animal, 'FEEDING', log)} className="bg-amber-50/60 border border-amber-200/70 p-3 rounded-xl flex flex-col gap-1 shadow-sm cursor-pointer">
                                  <div className="flex justify-between font-black text-slate-800 tracking-tight text-[11px]"><span>{meal.food_item || 'Diet Apportion'}</span><span className="text-amber-700 font-bold">{new Date(meal.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>
                                  <div className="text-slate-500 font-bold tracking-tight text-[10px]">Qty: <span className="text-emerald-600 font-black">{qtyStr}</span></div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2 w-full">
                          <button type="button" onClick={() => triggerLogForm(animal, 'WEIGHT', log)} className={`min-h-[48px] p-2 rounded-xl border border-dashed text-center flex flex-col justify-center items-center transition-all ${log?.weight_not_required ? 'bg-slate-100 border-slate-200 text-slate-400' : log?.weight_grams ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'}`}>
                            {log?.weight_not_required ? <span className="text-[9px] font-black uppercase tracking-widest">Exempt</span> : log?.weight_grams ? <span className="text-xs font-black tracking-tight">{formatWeightDisplay(log.weight_grams, animal.weight_unit || 'g')}</span> : <><Scale size={14} className="opacity-40 mb-1" /><span className="text-[9px] font-black uppercase tracking-widest">Log Wt</span></>}
                          </button>

                          <button type="button" onClick={() => triggerLogForm(animal, 'TEMPERATURE', log)} className={`min-h-[48px] p-2 rounded-xl border border-dashed text-center flex flex-col justify-center items-center transition-all ${log?.temperature_c || log?.basking_temp_c || log?.cool_temp_c ? 'bg-blue-50 border-blue-200 text-blue-800 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'}`}>
                            {log?.temperature_c ? <span className="text-xs font-black tracking-tight">{log.temperature_c}°C</span> : <><Thermometer size={14} className="opacity-40 mb-1" /><span className="text-[9px] font-black uppercase tracking-widest">Log Temp</span></>}
                          </button>

                          <button type="button" onClick={() => triggerLogForm(animal, 'FEEDING', log)} className="min-h-[48px] p-2 bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 rounded-xl flex flex-col justify-center items-center transition-all shadow-sm">
                            <Plus size={14} className="opacity-40 mb-1" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Add Feed</span>
                          </button>
                        </div>

                        <button type="button" onClick={() => triggerLogForm(animal, 'OBSERVATION', log)} className="w-full text-left p-3 bg-slate-50/50 rounded-xl border border-slate-100 min-h-[60px] flex items-start">
                          <span className="text-xs leading-relaxed block whitespace-pre-wrap">{log?.notes || <span className="text-slate-400 italic">No notes entered for this date...</span>}</span>
                        </button>

                      </div>

                      <div className={`hidden lg:grid ${DYNAMIC_GRID_COLS} gap-4 px-6 py-4 bg-transparent hover:bg-slate-50/40 border-b border-slate-100 transition-colors items-start`}>
                        {row.getVisibleCells().map(cell => (
                          <div key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        ))}
                      </div>

                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        )}
      </div>

      {logModalState.isOpen && logModalState.animal && (
        <DailyLogFormModal
          isOpen={logModalState.isOpen} 
          animal={logModalState.animal} 
          mode={logModalState.mode} 
          initialLogData={logModalState.initialData}
          onClose={() => setLogModalState({ isOpen: false, animal: null, mode: 'OBSERVATION', initialData: undefined })}
        />
      )}
    </div>
  );
}