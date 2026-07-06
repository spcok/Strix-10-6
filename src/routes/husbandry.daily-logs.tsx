import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, queryOptions, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from '@tanstack/react-table';
import { Scale, Thermometer, ChevronLeft, ChevronRight, Plus, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Animal } from '../types';

import { FeedModal } from '../components/husbandry/FeedModal';
import { WeightModal } from '../components/husbandry/WeightModal';
import { TemperatureModal } from '../components/husbandry/TemperatureModal';

const getLocalDateString = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

// ============================================================================
// PERFORMANCE: Unified Dashboard Weight Display Engine
// ============================================================================
const GRAMS_PER_OZ = 28.349523125;

export const formatWeightDisplay = (grams: number | null | undefined, unit: string) => {
  if (!grams) return null;
  
  if (unit === 'kg') return `${(grams / 1000).toFixed(3)}kg`;
  
  if (unit === 'lb') {
    const totalOunces = grams / GRAMS_PER_OZ;
    let totalOzInt = Math.floor(totalOunces);
    let e = Math.round((totalOunces - totalOzInt) * 8);
    
    if (e >= 8) { totalOzInt += 1; e = 0; }
    
    const lb = Math.floor(totalOzInt / 16);
    const oz = totalOzInt % 16;
    
    let str = '';
    if (lb > 0) str += `${lb}lb `;
    if (oz > 0 || e > 0) str += `${oz}`;
    if (e > 0) str += ` ${e}/8`;
    if (oz > 0 || e > 0) str += 'oz';
    
    return str.trim() || '0lb';
  }
  
  if (unit === 'oz') {
    const totalOunces = grams / GRAMS_PER_OZ;
    let totalOzInt = Math.floor(totalOunces);
    let e = Math.round((totalOunces - totalOzInt) * 8);
    
    if (e >= 8) { totalOzInt += 1; e = 0; }
    
    let str = `${totalOzInt}`;
    if (e > 0) str += ` ${e}/8`;
    return `${str}oz`;
  }

  return `${Math.round(grams)}g`;
};

// ============================================================================
// QUERIES: Strictly mapped to new telemetry tables
// ============================================================================
const getAnimalsOptions = () => queryOptions({
  queryKey: ['animals', 'dashboard'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('*').order('name');
    if (error) throw error;
    return data as Animal[];
  }
});

const getFeedLogsOptions = (date: string) => queryOptions({
  queryKey: ['feeds', date],
  queryFn: async () => {
    if (!date) return [];
    const start = new Date(`${date}T00:00:00`).toISOString();
    const end = new Date(`${date}T23:59:59.999`).toISOString();
    const { data } = await supabase.from('feed_logs').select('*').gte('recorded_at', start).lte('recorded_at', end).order('recorded_at', { ascending: true });
    return data || [];
  },
  placeholderData: keepPreviousData // UX Polish: Prevents screen flashing on date change
});

const getWeightLogsOptions = (date: string) => queryOptions({
  queryKey: ['weights', date],
  queryFn: async () => {
    if (!date) return [];
    const start = new Date(`${date}T00:00:00`).toISOString();
    const end = new Date(`${date}T23:59:59.999`).toISOString();
    const { data } = await supabase.from('weight_logs').select('*').gte('recorded_at', start).lte('recorded_at', end).order('recorded_at', { ascending: false });
    return data || [];
  },
  placeholderData: keepPreviousData
});

const getTempLogsOptions = (date: string) => queryOptions({
  queryKey: ['temperatures', date],
  queryFn: async () => {
    if (!date) return [];
    const start = new Date(`${date}T00:00:00`).toISOString();
    const end = new Date(`${date}T23:59:59.999`).toISOString();
    const { data } = await supabase.from('temperature_logs').select('*').gte('recorded_at', start).lte('recorded_at', end).order('recorded_at', { ascending: false });
    return data || [];
  },
  placeholderData: keepPreviousData
});

export const Route = createFileRoute('/husbandry/daily-logs')({
  loader: async ({ context: { queryClient } }) => {
    const today = getLocalDateString();
    if (queryClient) {
      await Promise.all([
        queryClient.ensureQueryData(getAnimalsOptions()),
        queryClient.ensureQueryData(getFeedLogsOptions(today)),
        queryClient.ensureQueryData(getWeightLogsOptions(today)),
        queryClient.ensureQueryData(getTempLogsOptions(today)),
      ]);
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

type WorksheetRecord = { animal: Animal; feeds: any[]; weight: any; temp: any; };

const DYNAMIC_GRID_COLS = "lg:grid-cols-[minmax(200px,2fr)_minmax(160px,1.5fr)_minmax(160px,1.5fr)_minmax(320px,3fr)]";

export function DailyLogsPage() {
  const queryClient = useQueryClient();
  
  // DUAL-STATE DATE ENGINE: Isolates DOM typing from query firing
  const [activeDate, setActiveDate] = useState<string>(getLocalDateString());
  const [inputDate, setInputDate] = useState<string>(getLocalDateString());
  const [activeSection, setActiveSection] = useState<string>('ALL');

  const [feedModalState, setFeedModalState] = useState<{ isOpen: boolean; animalId: string | null; initialData?: any }>({ isOpen: false, animalId: null });
  const [weightModalState, setWeightModalState] = useState<{ isOpen: boolean; animalId: string | null; initialData?: any }>({ isOpen: false, animalId: null });
  const [tempModalState, setTempModalState] = useState<{ isOpen: boolean; animal: Animal | null; initialData?: any }>({ isOpen: false, animal: null });

  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase.channel('telemetry-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_logs' }, () => queryClient.invalidateQueries({ queryKey: ['feeds'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weight_logs' }, () => queryClient.invalidateQueries({ queryKey: ['weights'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'temperature_logs' }, () => queryClient.invalidateQueries({ queryKey: ['temperatures'] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: animals = [], isLoading: loadingAnimals } = useQuery(getAnimalsOptions());
  const { data: feedLogs = [], isFetching: fetchingFeeds, isError: errFeeds } = useQuery(getFeedLogsOptions(activeDate));
  const { data: weightLogs = [], isFetching: fetchingWeights, isError: errWeights } = useQuery(getWeightLogsOptions(activeDate));
  const { data: tempLogs = [], isFetching: fetchingTemps, isError: errTemps } = useQuery(getTempLogsOptions(activeDate));

  const isFetchingLogs = fetchingFeeds || fetchingWeights || fetchingTemps;
  const isError = errFeeds || errWeights || errTemps;

  // ============================================================================
  // HASH MAP O(1) ENGINE: Eliminates render loop freezing
  // ============================================================================
  const filteredWorksheetRecords = useMemo<WorksheetRecord[]>(() => {
    const feedMap = new Map<string, any[]>();
    feedLogs.forEach(f => {
      if (!feedMap.has(f.animal_id)) feedMap.set(f.animal_id, []);
      feedMap.get(f.animal_id)!.push(f);
    });

    const weightMap = new Map<string, any>();
    weightLogs.forEach(w => {
      if (!weightMap.has(w.animal_id)) weightMap.set(w.animal_id, w);
    });

    const tempMap = new Map<string, any>();
    tempLogs.forEach(t => {
      if (!tempMap.has(t.animal_id)) tempMap.set(t.animal_id, t);
    });

    return animals
      .filter(a => {
        if (a.status === 'ARCHIVED') return false;
        if (activeSection === 'ALL') return true;
        return a.category === activeSection;
      })
      .map(animal => ({
        animal,
        feeds: feedMap.get(animal.id) || [],
        weight: weightMap.get(animal.id),
        temp: tempMap.get(animal.id),
      }));
  }, [animals, feedLogs, weightLogs, tempLogs, activeSection]);

  const updateDate = (newDate: string) => {
    setActiveDate(newDate);
    setInputDate(newDate);
  };

  const shiftDate = (days: number) => {
    const parts = activeDate.split('-');
    if (parts.length !== 3) return;
    const [y, m, d] = parts.map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + days);

    const newDateString = dateObj.getFullYear() + '-' +
      String(dateObj.getMonth() + 1).padStart(2, '0') + '-' +
      String(dateObj.getDate()).padStart(2, '0');

    updateDate(newDateString);
  };

  const columns = useMemo<ColumnDef<WorksheetRecord>[]>(() => [
    {
      id: 'entity',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex flex-col pt-2">
          <span className="font-black text-slate-900 text-lg lg:text-base leading-tight">{row.original.animal.name}</span>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">{row.original.animal.species}</span>
        </div>
      )
    },
    {
      id: 'weight',
      header: 'Weight',
      cell: ({ row: { original: { animal, weight } } }) => {
        const displayGrams = weight?.weight_grams;

        return (
          <button 
            type="button" 
            onClick={() => setWeightModalState({ isOpen: true, animalId: animal.id, initialData: weight })} 
            className={`w-full min-h-[54px] lg:min-h-[46px] p-2 rounded-xl border border-dashed text-center flex flex-col justify-center items-center transition-all ${displayGrams ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm border-solid cursor-pointer hover:bg-emerald-100/50' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:border-slate-300 cursor-pointer'}`}
          >
            {displayGrams ? <span className="text-sm font-black tracking-tight">{formatWeightDisplay(displayGrams, animal.weight_unit || 'g')}</span> : <><Scale size={14} className="opacity-40 mb-1" /><span className="text-[9px] font-black uppercase tracking-widest">Log Wt</span></>}
          </button>
        );
      }
    },
    {
      id: 'temperature',
      header: 'Temperature',
      cell: ({ row: { original: { animal, temp } } }) => {
        const displayBasking = temp?.temp_basking;
        const displayCool = temp?.temp_cool;
        const displayAmbient = temp?.temp_ambient;

        const hasGradient = displayBasking != null && displayCool != null;
        const hasAmbient = displayAmbient != null;
        const isLogged = hasGradient || hasAmbient;
        
        return (
          <button 
            type="button" 
            onClick={() => setTempModalState({ isOpen: true, animal: animal, initialData: temp })} 
            className={`w-full min-h-[54px] lg:min-h-[46px] p-2 rounded-xl border border-dashed text-left transition-all flex flex-col justify-center ${isLogged ? 'bg-blue-50 border-blue-200 text-blue-800 shadow-sm border-solid cursor-pointer hover:bg-blue-100/50' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 items-center cursor-pointer'}`}
          >
            {hasGradient ? (
              <div className="w-full flex justify-center items-center gap-1.5 font-black text-[10px] tracking-tight">
                <span className="text-red-500">{displayBasking}°C</span>
                <span className="text-slate-400 font-medium">/</span>
                <span className="text-blue-500">{displayCool}°C</span>
              </div>
            ) : hasAmbient ? (
              <div className="w-full space-y-0.5 font-bold text-[9px] tracking-tight text-center">{displayAmbient}°C</div>
            ) : (
              <><Thermometer size={14} className="opacity-40 mb-1" /><span className="text-[9px] font-black uppercase tracking-widest">Log Temp</span></>
            )}
          </button>
        );
      }
    },
    {
      id: 'feeding',
      header: 'Feed',
      cell: ({ row: { original: { animal, feeds } } }) => {
        return (
          <div className="flex flex-col gap-2 w-full">
            {feeds.map((meal: any, idx: number) => (
              <div 
                key={meal.id || idx} 
                onClick={() => setFeedModalState({ isOpen: true, animalId: animal.id, initialData: meal })}
                className="bg-amber-50/60 border border-amber-200/70 p-3 lg:p-2 rounded-xl text-[10px] flex flex-col gap-1 lg:gap-0.5 shadow-sm cursor-pointer hover:bg-amber-100/80 transition-colors"
              >
                <div className="flex justify-between font-black text-slate-800 tracking-tight">
                  <span>{meal.food_item}</span>
                  <span className="text-amber-700 font-bold">{new Date(meal.recorded_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="text-slate-500 font-bold tracking-tight">
                  {meal.quantity}{meal.unit === 'grams' || meal.unit === 'g' ? 'g' : ' items'} 
                  {meal.feed_method ? ` (${meal.feed_method})` : ''}
                </div>
              </div>
            ))}
            
            <button 
              type="button" 
              onClick={() => setFeedModalState({ isOpen: true, animalId: animal.id })} 
              className="w-full lg:w-[140px] min-h-[54px] lg:min-h-[46px] p-2 rounded-xl border border-dashed bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:border-slate-300 text-center flex flex-col justify-center items-center transition-all shadow-sm cursor-pointer"
            >
              <Plus size={14} className="opacity-40 mb-1" />
              <span className="text-[9px] font-black uppercase tracking-widest">Add Feed</span>
            </button>
          </div>
        );
      }
    }
  ], []);

  const table = useReactTable({ data: filteredWorksheetRecords, columns, getCoreRowModel: getCoreRowModel() });
  const { rows } = table.getRowModel();
  
  if (loadingAnimals) return <div className="p-8 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;
  if (isError) return <div className="p-8 text-red-500 flex flex-col items-center gap-2"><AlertCircle /><p className="font-bold">Failed to load telemetry data.</p></div>;

  return (
    <div className="flex flex-col h-full bg-slate-50/50 overflow-hidden" ref={parentRef}>
      <div className="flex-none p-4 lg:p-6 bg-white border-b border-slate-200 space-y-4 z-10 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Husbandry Worksheet</h1>
              <p className="text-sm font-bold text-slate-500 mt-1">Daily operations and telemetry tracking</p>
            </div>
            {/* UX Polish: Subtle loading state while table remains mounted */}
            {isFetchingLogs && <Loader2 className="animate-spin text-emerald-500 ml-2" size={24} />}
          </div>
          
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-full lg:w-auto overflow-x-auto hide-scrollbar">
            {SECTION_BAR.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex-1 lg:flex-none px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                  activeSection === section.id ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
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
            value={inputDate}
            onChange={(e) => setInputDate(e.target.value)}
            onBlur={() => {
              if (inputDate && !isNaN(new Date(inputDate).getTime())) {
                setActiveDate(inputDate);
              } else {
                setInputDate(activeDate);
              }
            }}
            className="flex-1 lg:flex-none max-w-[200px] px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none text-center"
          />
          
          <button onClick={() => shiftDate(1)} className="p-2 lg:p-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500 transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto bg-white">
        <div className="min-w-[1000px] w-full px-4 py-4 lg:px-8 lg:py-6">
          <div className={`hidden lg:grid ${DYNAMIC_GRID_COLS} gap-6 mb-3 px-6`}>
            {table.getHeaderGroups()[0].headers.map(header => (
              <div key={header.id} className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))}
          </div>

          <div className="flex flex-col w-full pb-20">
            {rows.map((row) => (
              <div key={row.id} className="w-full border-b border-slate-200 shadow-sm sm:shadow-none sm:border-b sm:border-slate-100 mb-3 sm:mb-0">
                <div className="bg-white p-4 lg:py-4 lg:px-6 hover:bg-slate-50/50 transition-colors flex flex-col lg:grid lg:grid-cols-[minmax(200px,2fr)_minmax(160px,1.5fr)_minmax(160px,1.5fr)_minmax(320px,3fr)] gap-6 lg:items-center rounded-2xl sm:rounded-none">
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
            ))}
          </div>
        </div>
      </div>

      {feedModalState.isOpen && feedModalState.animalId && (
        <FeedModal isOpen={feedModalState.isOpen} animalId={feedModalState.animalId} initialData={feedModalState.initialData} onClose={() => setFeedModalState({ isOpen: false, animalId: null, initialData: undefined })} />
      )}
      {weightModalState.isOpen && weightModalState.animalId && (
        <WeightModal isOpen={weightModalState.isOpen} animalId={weightModalState.animalId} initialData={weightModalState.initialData} onClose={() => setWeightModalState({ isOpen: false, animalId: null, initialData: undefined })} />
      )}
      {tempModalState.isOpen && tempModalState.animal && (
        <TemperatureModal isOpen={tempModalState.isOpen} animalId={tempModalState.animal.id} ambientOnly={tempModalState.animal.ambient_temp_only || false} initialData={tempModalState.initialData} onClose={() => setTempModalState({ isOpen: false, animal: null, initialData: undefined })} />
      )}
    </div>
  );
}