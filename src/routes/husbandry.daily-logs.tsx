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

// DECOUPLED MODAL IMPORTS
import { FeedModal } from '../components/husbandry/FeedModal';
import { WeightModal } from '../components/husbandry/WeightModal';
import { TemperatureModal } from '../components/husbandry/TemperatureModal';

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

  // TARGETED MODAL STATE CONTROLLERS
  const [feedModalState, setFeedModalState] = useState<{ isOpen: boolean; animalId: string | null }>({ isOpen: false, animalId: null });
  const [weightModalState, setWeightModalState] = useState<{ isOpen: boolean; animalId: string | null }>({ isOpen: false, animalId: null });
  const [tempModalState, setTempModalState] = useState<{ isOpen: boolean; animal: Animal | null }>({ isOpen: false, animal: null });

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

  const columns = useMemo<ColumnDef<WorksheetRecord>[]>(() => [
    {
      id: 'entity',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex flex-col pt-2">
          <span className="font-black text-slate-900 text-lg lg:text-sm leading-tight">{row.original.animal.name}</span>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">{row.original.animal.species}</span>
        </div>
      )
    },
    {
      id: 'weight',
      header: 'Weight',
      cell: ({ row: { original: { animal, log } } }) => (
        <button 
          type="button" 
          onClick={() => setWeightModalState({ isOpen: true, animalId: animal.id })} 
          className={`w-full min-h-[54px] lg:min-h-[46px] p-2 rounded-xl border border-dashed text-center flex flex-col justify-center items-center transition-all ${log?.weight_not_required ? 'bg-slate-100 border-slate-200 text-slate-400' : log?.weight_grams ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:border-slate-300'}`}
        >
          {log?.weight_not_required ? <span className="text-[9px] font-black uppercase tracking-widest">Exempt</span> : log?.weight_grams ? <span className="text-sm font-black tracking-tight">{formatWeightDisplay(log.weight_grams, animal.weight_unit || 'g')}</span> : <><Scale size={14} className="opacity-40 mb-1" /><span className="text-[9px] font-black uppercase tracking-widest">Log Wt</span></>}
        </button>
      )
    },
    {
      id: 'temperature',
      header: 'Temperature',
      cell: ({ row: { original: { animal, log } } }) => (
        <button 
          type="button" 
          onClick={() => setTempModalState({ isOpen: true, animal: animal })} 
          className={`w-full min-h-[54px] lg:min-h-[46px] p-2 rounded-xl border border-dashed text-left transition-all flex flex-col justify-center ${log?.temperature_c || log?.basking_temp_c || log?.cool_temp_c ? 'bg-blue-50 border-blue-200 text-blue-800 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 items-center'}`}
        >
          {log?.temperature_c ? <div className="w-full space-y-0.5 font-bold text-[9px] tracking-tight text-center">{log.temperature_c}°C</div> : <><Thermometer size={14} className="opacity-40 mb-1" /><span className="text-[9px] font-black uppercase tracking-widest">Log Temp</span></>}
        </button>
      )
    },
    {
      id: 'feeding',
      header: 'Feed',
      cell: ({ row: { original: { animal, log } } }) => {
        // Keeping legacy JSON parser intact for historical rows until complete migration
        const feedParsed = typeof log?.feed_details === 'string' ? (() => { try { return JSON.parse(log.feed_details); } catch { return null; } })() : log?.feed_details;
        const meals = feedParsed?.meals || [];
        return (
          <div className="flex flex-col gap-2 w-full">
            {meals.map((meal: any, idx: number) => (
              <div key={idx} className="bg-amber-50/60 border border-amber-200/70 p-3 lg:p-2 rounded-xl text-[10px] flex flex-col gap-1 lg:gap-0.5 shadow-sm">
                <div className="flex justify-between font-black text-slate-800 tracking-tight"><span>{meal.food_item || 'Diet Apportion'}</span><span className="text-amber-700 font-bold">{new Date(meal.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>
                <div className="text-slate-500 font-bold tracking-tight">Offered: {meal.quantity_offered || meal.food_offered_g}g | Consumed: <span className="text-emerald-600 font-black">{meal.quantity_consumed || meal.food_consumed_g}g</span></div>
              </div>
            ))}
            
            <button 
              type="button" 
              onClick={() => setFeedModalState({ isOpen: true, animalId: animal.id })} 
              className="w-full min-h-[54px] lg:min-h-[46px] p-2 rounded-xl border border-dashed bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:border-slate-300 text-center flex flex-col justify-center items-center transition-all shadow-sm"
            >
              <Plus size={14} className="opacity-40 mb-1" />
              <span className="text-[9px] font-black uppercase tracking-widest">Add Feed</span>
            </button>
          </div>
        );
      }
    },
    {
      id: 'observations',
      header: 'Daily Descriptive Observations',
      cell: ({ row: { original: { animal, log } } }) => (
        // Leaving Observation routing untouched for now
        <button type="button" className="w-full text-left hover:bg-slate-100/50 p-3 lg:p-2 rounded-xl border border-slate-100 lg:border-transparent transition-colors min-h-[60px] lg:min-h-[44px] flex items-start">
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
    estimateSize: () => 85,
    overscan: 5,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
  });

  if (loadingAnimals || loadingLogs) {
    return <div className="p-8 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;
  }

  if (logsError) {
    return <div className="p-8 text-red-500 flex flex-col items-center gap-2"><AlertCircle /><p className="font-bold">Failed to load logs.</p></div>;
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50 overflow-hidden" ref={parentRef}>
      {/* Header & Date Picker */}
      <div className="flex-none p-4 lg:p-6 bg-white border-b border-slate-200 space-y-4 shadow-sm z-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Husbandry Worksheet</h1>
            <p className="text-sm font-bold text-slate-500 mt-1">Daily operations and telemetry tracking</p>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-full lg:w-auto overflow-x-auto hide-scrollbar">
            {SECTION_BAR.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex-1 lg:flex-none px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                  activeSection === section.id 
                    ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100/50' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => shiftDate(-1)} className="p-2 lg:p-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 lg:flex-none max-w-[200px] px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none text-center"
          />
          <button onClick={() => shiftDate(1)} className="p-2 lg:p-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500 transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Worksheet Body */}
      <div className="flex-1 overflow-x-auto">
        <div className="min-w-[1000px] w-full p-4 lg:p-6">
          <div className={`hidden lg:grid ${DYNAMIC_GRID_COLS} gap-4 mb-4 px-4`}>
            {table.getHeaderGroups()[0].headers.map(header => (
              <div key={header.id} className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))}
          </div>

          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <div
                  key={row.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="pb-3"
                >
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 lg:p-2 lg:px-4 shadow-sm hover:border-slate-300 hover:shadow-md transition-all flex flex-col lg:grid lg:grid-cols-[minmax(180px,1.5fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(280px,2.5fr)_minmax(250px,2fr)] gap-4 lg:items-center">
                    {row.getVisibleCells().map(cell => (
                      <div key={cell.id} className="w-full">
                        <div className="lg:hidden text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                          {flexRender(cell.column.columnDef.header, cell.getContext())}
                        </div>
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

      {/* THE NEW DECOUPLED MODALS */}
      {feedModalState.isOpen && feedModalState.animalId && (
        <FeedModal
          isOpen={feedModalState.isOpen}
          animalId={feedModalState.animalId}
          onClose={() => setFeedModalState({ isOpen: false, animalId: null })}
        />
      )}

      {weightModalState.isOpen && weightModalState.animalId && (
        <WeightModal
          isOpen={weightModalState.isOpen}
          animalId={weightModalState.animalId}
          onClose={() => setWeightModalState({ isOpen: false, animalId: null })}
        />
      )}

      {tempModalState.isOpen && tempModalState.animal && (
        <TemperatureModal
          isOpen={tempModalState.isOpen}
          animalId={tempModalState.animal.id}
          ambientOnly={tempModalState.animal.ambient_temp_only || false} 
          onClose={() => setTempModalState({ isOpen: false, animal: null })}
        />
      )}
    </div>
  );
}