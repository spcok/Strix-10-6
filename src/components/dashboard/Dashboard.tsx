import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getExpandedRowModel, useReactTable, SortingState, ExpandedState
} from '@tanstack/react-table';
import { 
  Search, Plus, Drumstick, ArrowUpDown, Loader2, Scale, Calendar, CheckCircle2, ThermometerSun, AlertCircle, ClipboardList, Activity, ChevronRight, ChevronDown, Users, User, MapPin, Clock, ChevronLeft
} from 'lucide-react';
import { Animal } from '../../types';
import { supabase } from '../../lib/supabase';
import AnimalFormModal from '../animals/AnimalFormModal';
import { AnimalProfile } from '../animals/AnimalProfile';
import { MobProfile } from '../animals/MobProfile';

const getLocalDateString = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

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

const columnHelper = createColumnHelper<Animal & { today_weight?: any; today_feed?: any; last_feed?: any; today_temp?: any; subRows?: any[] }>();
const EXOTIC_CATEGORIES = ['EXOTIC'];

export function Dashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('ALL');
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  
  const [isCreateAnimalModalOpen, setIsCreateAnimalModalOpen] = useState(false);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);

  // DATE NAVIGATION STATE
  const [activeDate, setActiveDate] = useState<string>(getLocalDateString());
  const [inputDate, setInputDate] = useState<string>(getLocalDateString());

  // 1. Fetch Animals
  const { data: allAnimals = [], isLoading: loadingAnimals } = useQuery({
    queryKey: ['animals', 'dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*').order('name');
      if (error) throw error;
      return data as Animal[];
    },
    meta: { persist: true },
  });

  // 2. Fetch TELEMETRY Logs strictly constrained to `activeDate`
  const { data: todayFeeds = [], isLoading: loadingFeeds } = useQuery({
    queryKey: ['feeds', activeDate],
    queryFn: async () => {
      const start = new Date(`${activeDate}T00:00:00`).toISOString();
      const end = new Date(`${activeDate}T23:59:59.999`).toISOString();
      const { data } = await supabase.from('feed_logs').select('*').gte('recorded_at', start).lte('recorded_at', end).order('recorded_at', { ascending: false });
      return data || [];
    },
    meta: { persist: true }
  });

  const { data: todayWeights = [], isLoading: loadingWeights } = useQuery({
    queryKey: ['weights', activeDate],
    queryFn: async () => {
      const start = new Date(`${activeDate}T00:00:00`).toISOString();
      const end = new Date(`${activeDate}T23:59:59.999`).toISOString();
      const { data } = await supabase.from('weight_logs').select('*').gte('recorded_at', start).lte('recorded_at', end).order('recorded_at', { ascending: false });
      return data || [];
    },
    meta: { persist: true }
  });

  const { data: todayTemps = [], isLoading: loadingTemps } = useQuery({
    queryKey: ['temperatures', activeDate],
    queryFn: async () => {
      const start = new Date(`${activeDate}T00:00:00`).toISOString();
      const end = new Date(`${activeDate}T23:59:59.999`).toISOString();
      const { data } = await supabase.from('temperature_logs').select('*').gte('recorded_at', start).lte('recorded_at', end).order('recorded_at', { ascending: false });
      return data || [];
    },
    meta: { persist: true }
  });

  // 3. Fetch HISTORICAL Latest Logs (Still uses View for true "Last Feed" regardless of date)
  const { data: historicalFeeds = [] } = useQuery({
    queryKey: ['feeds_historical_latest'],
    queryFn: async () => {
      const { data } = await supabase.from('latest_animal_feeds').select('*');
      return data || [];
    },
    meta: { persist: true }
  });

  const loadingLogs = loadingFeeds || loadingWeights || loadingTemps;
  const selectedAnimal = useMemo(() => selectedAnimalId ? allAnimals.find(a => a.id === selectedAnimalId) || null : null, [allAnimals, selectedAnimalId]);

  useEffect(() => {
    const animalChannel = supabase.channel('dashboard-animals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'animals' }, () => queryClient.invalidateQueries({ queryKey: ['animals'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_logs' }, () => { queryClient.invalidateQueries({ queryKey: ['feeds'] }); queryClient.invalidateQueries({ queryKey: ['feeds_historical_latest'] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weight_logs' }, () => queryClient.invalidateQueries({ queryKey: ['weights'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'temperature_logs' }, () => queryClient.invalidateQueries({ queryKey: ['temperatures'] }))
      .subscribe();

    return () => { supabase.removeChannel(animalChannel); };
  }, [queryClient]);

  // DATE NAVIGATION HELPERS
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

  // HASH MAP ENGINE
  const hierarchicalData = useMemo(() => {
    const weightMap = new Map(); todayWeights.forEach((w: any) => { if (!weightMap.has(w.animal_id)) weightMap.set(w.animal_id, w); });
    const tempMap = new Map(); todayTemps.forEach((t: any) => { if (!tempMap.has(t.animal_id)) tempMap.set(t.animal_id, t); });
    
    const feedMap = new Map(); 
    todayFeeds.forEach((f: any) => { 
      if (!feedMap.has(f.animal_id)) feedMap.set(f.animal_id, []);
      feedMap.get(f.animal_id).push(f);
    });

    const lastFeedMap = new Map();
    historicalFeeds.forEach((f: any) => { if (!lastFeedMap.has(f.animal_id)) lastFeedMap.set(f.animal_id, f); });

    let baseData = allAnimals.map(a => ({
      ...a,
      today_weight: weightMap.get(a.id),
      today_temp: tempMap.get(a.id),
      today_feed: feedMap.get(a.id) || [],
      last_feed: lastFeedMap.get(a.id)
    }));

    if (activeTab === 'ARCHIVED') baseData = baseData.filter(a => a.status === 'ARCHIVED');
    else if (activeTab !== 'ALL') baseData = baseData.filter(a => a.category === activeTab && a.status !== 'ARCHIVED');
    else baseData = baseData.filter(a => a.status !== 'ARCHIVED');

    const groups = baseData.filter(a => a.record_type === 'GROUP');
    const individuals = baseData.filter(a => a.record_type === 'INDIVIDUAL' || !a.record_type);
    const orphans: any[] = [];
    const groupMap = new Map(groups.map(g => [g.id, { ...g, subRows: [] as any[] }]));

    individuals.forEach(ind => {
      if (ind.parent_group_id && groupMap.has(ind.parent_group_id)) groupMap.get(ind.parent_group_id)!.subRows!.push(ind);
      else orphans.push(ind);
    });
    return [...Array.from(groupMap.values()), ...orphans];
  }, [allAnimals, todayWeights, todayTemps, todayFeeds, historicalFeeds, activeTab]);

  const columns = useMemo(() => {
    const nameColumn = columnHelper.accessor('name', {
      id: 'name',
      header: 'Name',
      cell: info => {
        const isGroup = info.row.original.record_type === 'GROUP';
        const canExpand = info.row.getCanExpand();
        const avatarUrl = (info.row.original as any).avatar_url;
        return (
          <div className="flex items-start lg:items-center gap-3 w-full" style={{ paddingLeft: `${info.row.depth * 1.5}rem` }}>
            <div className="flex items-center justify-center w-6 shrink-0 mt-1 lg:mt-0">
              {canExpand ? (
                <button onClick={(e) => { e.stopPropagation(); info.row.toggleExpanded(); }} className="cursor-pointer text-slate-400 hover:text-slate-900 transition-colors p-2 -ml-2 rounded-lg hover:bg-slate-200/60 active:bg-slate-300">
                  {info.row.getIsExpanded() ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>
              ) : null}
            </div>
            {avatarUrl ? 
              <img src={avatarUrl} className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 shadow-sm mt-0.5 lg:mt-0" alt="" /> : 
              <div className={`p-2.5 rounded-full shrink-0 shadow-sm mt-0.5 lg:mt-0 ${isGroup ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                {isGroup ? <Users size={16} /> : <User size={16} />}
              </div>
            }
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 w-full pt-1.5 lg:pt-0">
              {/* FIX: Swapped 'truncate max-w-full' for 'whitespace-normal break-words' to prevent long names clipping */}
              <button onClick={() => setSelectedAnimalId(info.row.original.id)} className="font-black text-slate-900 text-sm leading-tight hover:text-emerald-600 hover:underline text-left transition-colors whitespace-normal break-words">
                {info.getValue() || (isGroup ? 'Unnamed Group' : 'Unnamed Animal')}
              </button>
              {info.row.original.record_type === 'GROUP' && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">Mob</span>}
              <span className="lg:hidden text-[11px] font-bold text-slate-500 italic truncate max-w-[130px] shrink-0">{(info.row.original as any).scientific_name || info.row.original.species || 'Unknown Species'}</span>
              <span className="lg:hidden text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 shadow-sm shrink-0">
                <MapPin size={10} className="text-slate-400 shrink-0" /><span className="truncate max-w-[90px]">{(info.row.original as any).location || 'Unknown'}</span>
              </span>
            </div>
          </div>
        );
      },
    });

    const latinNameColumn = columnHelper.accessor('species', {
      id: 'species',
      header: 'Latin Taxonomy',
      cell: info => <span className="text-xs font-bold text-slate-500 italic block truncate">{(info.row.original as any).scientific_name || info.row.original.species || 'Unknown Scientific Name'}</span>
    });

    const locationColumn = columnHelper.display({
      id: 'location',
      header: 'Location',
      cell: info => (
        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg w-fit border border-slate-200 shadow-sm">
          <MapPin size={12} className="text-slate-400 shrink-0" />
          <span>{(info.row.original as any).location || 'Unknown Enclosure'}</span>
        </span>
      )
    });

    const renderFeedData = (feedsArray: any[]) => {
      if (!feedsArray || feedsArray.length === 0) return <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">No Feed Logged</span>;
      const lastMeal = feedsArray[0]; 
      const timeFormatted = lastMeal.recorded_at ? new Date(lastMeal.recorded_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--:--';
      const qtyStr = lastMeal.quantity ? ` (${lastMeal.quantity}${lastMeal.unit === 'grams' ? 'g' : ''})` : '';
      return (
        <div className="flex flex-col gap-0.5 w-full">
          <span className="text-xs font-black text-slate-700 whitespace-normal">{lastMeal.food_item || 'Diet Apportion'}{qtyStr}</span>
          <span className="text-[10px] font-bold text-amber-600 tracking-widest flex items-center gap-1"><Clock size={10} /> {timeFormatted}</span>
        </div>
      );
    };

    const renderHistoricalFeedData = (lastMeal: any) => {
      if (!lastMeal) return <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">No Data</span>;
      const timeFormatted = lastMeal.recorded_at ? new Date(lastMeal.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--:--';
      const qtyStr = lastMeal.quantity ? ` (${lastMeal.quantity}${lastMeal.unit === 'grams' ? 'g' : ''})` : '';
      return (
        <div className="flex flex-col gap-0.5 w-full">
          <span className="text-xs font-black text-slate-700 whitespace-normal">{lastMeal.food_item || 'Unknown Diet'}{qtyStr}</span>
          <span className="text-[10px] font-bold text-amber-600 tracking-widest flex items-center gap-1"><Clock size={10} /> {timeFormatted}</span>
        </div>
      );
    };

    if (EXOTIC_CATEGORIES.includes(activeTab)) {
      return [
        nameColumn, latinNameColumn,
        columnHelper.display({
          id: 'weight',
          header: 'Weight',
          cell: info => {
            const todayWeight = (info.row.original as any).today_weight;
            const unit = (info.row.original as any).weight_unit || 'g';
            
            if (info.row.original.record_type === 'GROUP') return <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">N/A (Group)</span>;
            
            if (todayWeight) {
                return <span className="text-sm font-black text-emerald-600 flex items-center gap-1.5"><Scale size={14} className="text-emerald-500 shrink-0" />{formatWeightDisplay(todayWeight.weight_grams, unit)}</span>;
            }
            return <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">No Weight</span>;
          },
        }),
        columnHelper.display({ 
          id: 'last_feed', 
          header: 'Last Feed', 
          cell: info => renderHistoricalFeedData((info.row.original as any).last_feed) 
        }),
        columnHelper.display({
          id: 'next_feed',
          header: 'Next Feed',
          cell: () => <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Unscheduled</span>
        }),
        columnHelper.display({
          id: 'temperature',
          header: 'Temperature', 
          cell: info => {
            const todayTemp = (info.row.original as any).today_temp;
            if (todayTemp) {
                const tempDisplay = todayTemp.temp_ambient ? `${todayTemp.temp_ambient}°C` : `${todayTemp.temp_basking}°C / ${todayTemp.temp_cool}°C`;
                return (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black text-blue-600 flex items-center gap-1.5"><ThermometerSun size={14} className="shrink-0" />{tempDisplay}</span>
                  </div>
                );
            }
            return <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">No Temp</span>;
          },
        }),
        locationColumn
      ];
    }

    return [
      nameColumn, latinNameColumn,
      columnHelper.display({
        id: 'weight',
        header: 'Today\'s Weight',
        cell: info => {
          const todayWeight = (info.row.original as any).today_weight;
          const unit = (info.row.original as any).weight_unit || 'g';
          
          if (info.row.original.record_type === 'GROUP') return <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">N/A (Group)</span>;
          
          if (todayWeight) {
              return <span className="text-sm font-black text-emerald-600 flex items-center gap-1.5"><Scale size={14} className="text-emerald-500 shrink-0" />{formatWeightDisplay(todayWeight.weight_grams, unit)}</span>;
          }
          return <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">No Weight</span>;
        },
      }),
      columnHelper.display({ 
        id: 'todays_feed', 
        header: 'Today\'s Feed', 
        cell: info => renderFeedData((info.row.original as any).today_feed) 
      }),
      columnHelper.display({ 
        id: 'last_feed', 
        header: 'Last Feed', 
        cell: info => renderHistoricalFeedData((info.row.original as any).last_feed) 
      }),
      locationColumn
    ];
  }, [activeTab]);

  const table = useReactTable({
    data: hierarchicalData, columns, state: { sorting, globalFilter, expanded },
    onSortingChange: setSorting, onGlobalFilterChange: setGlobalFilter, onExpandedChange: setExpanded,
    getSubRows: row => (row.subRows && row.subRows.length > 0 ? row.subRows : undefined),
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(), getExpandedRowModel: getExpandedRowModel(),
  });

  const categories = ['ALL', 'OWL', 'RAPTOR', 'MAMMAL', 'EXOTIC', 'ARCHIVED'];

  // COLUMN WIDTH ADJUSTMENTS
  const tableGridCols = useMemo(() => {
    return table.getVisibleLeafColumns().map(c => {
      // FIX: Slightly widened the Name minimum width from 160px up to 200px
      if (c.id === 'name') return 'minmax(200px, 1.5fr)';
      if (c.id === 'species') return 'minmax(100px, 1fr)';
      if (c.id === 'location') return 'minmax(140px, 1.2fr)';
      if (c.id === 'weight') return 'minmax(110px, 1fr)';
      if (c.id === 'todays_feed' || c.id === 'last_feed' || c.id === 'next_feed') return 'minmax(180px, 2fr)';
      if (c.id === 'temperature') return 'minmax(110px, 1fr)';
      return 'minmax(100px, 1fr)';
    }).join(' ');
  }, [table.getVisibleLeafColumns()]);

  return (
    <div className="max-w-7xl mx-auto space-y-4 md:space-y-6 px-2 md:px-0 pb-20">
      
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm w-full">
        <div className="w-full xl:w-auto">
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">Real-time husbandry overview</p>
        </div>
        
        {/* DATE NAVIGATION & SEARCH BAR */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 w-full xl:w-auto">
          
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1 shadow-sm shrink-0">
            <button onClick={() => shiftDate(-1)} className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-slate-500 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <input
              type="date"
              value={inputDate}
              onChange={(e) => setInputDate(e.target.value)}
              onBlur={() => {
                if (inputDate && !isNaN(new Date(inputDate).getTime())) setActiveDate(inputDate);
                else setInputDate(activeDate);
              }}
              className="w-[140px] px-2 py-1 bg-transparent text-sm font-bold text-slate-700 focus:outline-none text-center"
            />
            <button onClick={() => shiftDate(1)} className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-slate-500 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="relative flex-1 lg:w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search entity matrix..." 
              value={globalFilter ?? ''} 
              onChange={e => setGlobalFilter(e.target.value)} 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow shadow-sm" 
            />
          </div>
          <button 
            onClick={() => setIsCreateAnimalModalOpen(true)} 
            className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shrink-0 shadow-sm shadow-emerald-200 whitespace-nowrap"
          >
            <Plus size={18} />
            <span>Add Animal</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden w-full">
        
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-2 gap-2">
          <div className="flex items-center overflow-x-auto hide-scrollbar gap-2 w-full">
            {categories.map((tab) => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)} 
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === tab ? 'bg-white text-emerald-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {loadingAnimals || loadingLogs ? (
          <div className="h-64 flex flex-col items-center justify-center gap-4"><Loader2 size={28} className="text-emerald-500 animate-spin" /><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Synchronizing with Cache...</span></div>
        ) : (
          <div className="w-full lg:overflow-x-auto custom-scrollbar">
            <div className="w-full lg:min-w-full">
              
              <div 
                className="hidden lg:grid gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest"
                style={{ gridTemplateColumns: tableGridCols }}
              >
                {table.getHeaderGroups().map(headerGroup => (
                  <React.Fragment key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <div key={header.id} className="cursor-pointer hover:text-slate-700 transition-colors select-none group flex items-center gap-2" onClick={header.column.getToggleSortingHandler()}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        <ArrowUpDown size={12} className={`opacity-0 group-hover:opacity-100 transition-opacity ${header.column.getIsSorted() ? 'opacity-100 text-emerald-500' : ''}`} />
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>

              <div className="flex flex-col gap-3 lg:gap-0">
                {table.getRowModel().rows.length === 0 ? (
                  <div className="px-6 py-20 text-center bg-white rounded-2xl border border-slate-200 lg:border-none shadow-sm lg:shadow-none">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 mb-4 shadow-inner"><Scale size={24} className="text-slate-400" /></div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">No Records Found</h3>
                    <p className="text-xs font-bold text-slate-500 mt-2">No entities match this category filter.</p>
                  </div>
                ) : (
                  table.getRowModel().rows.map(row => (
                    <React.Fragment key={row.id}>
                      
                      {/* MOBILE CARD LAYOUT */}
                      <div className="grid grid-cols-2 gap-3 lg:hidden p-4 bg-white rounded-2xl border border-slate-200 shadow-sm mx-1">
                        {row.getVisibleCells().map(cell => {
                          if (cell.column.id === 'species' || cell.column.id === 'location') return null;
                          
                          const isName = cell.column.id === 'name';
                          return (
                            <div key={cell.id} className={isName ? "col-span-2 border-b border-slate-100 pb-3" : "col-span-1 flex flex-col gap-1.5 p-3 bg-slate-50 border border-slate-100 rounded-xl"}>
                              {!isName && <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{cell.column.columnDef.header as string}</span>}
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                          );
                        })}
                      </div>

                      {/* DESKTOP ROW LAYOUT */}
                      <div 
                        className={`hidden lg:grid gap-4 px-6 py-4 items-center transition-colors hover:bg-emerald-50/30 border-b border-slate-100 ${row.original.record_type === 'GROUP' ? 'bg-slate-50/50' : 'bg-white'}`}
                        style={{ gridTemplateColumns: tableGridCols }}
                      >
                        {row.getVisibleCells().map(cell => (
                          <div key={cell.id} className="flex flex-col justify-center min-w-0 h-full w-full">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        ))}
                      </div>

                    </React.Fragment>
                  ))
                )}
              </div>

            </div>
          </div>
        )}
      </div>

      {selectedAnimal && (selectedAnimal.record_type === 'GROUP' ? <MobProfile mob={selectedAnimal} onClose={() => setSelectedAnimalId(null)} /> : <AnimalProfile animal={selectedAnimal} onClose={() => setSelectedAnimalId(null)} />)}
      {isCreateAnimalModalOpen && <AnimalFormModal isOpen={isCreateAnimalModalOpen} onClose={() => setIsCreateAnimalModalOpen(false)} />}
    </div>
  );
}

export default Dashboard;