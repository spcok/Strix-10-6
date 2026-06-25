import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getExpandedRowModel, useReactTable, SortingState, ExpandedState
} from '@tanstack/react-table';
import { 
  Search, Plus, Drumstick, ArrowUpDown, Loader2, Scale, Calendar, CheckCircle2, ThermometerSun, AlertCircle, ClipboardList, Activity, ChevronRight, ChevronDown, Users, User, MapPin, Clock
} from 'lucide-react';
import { Animal, DailyLog } from '../../types';
import { supabase } from '../../lib/supabase';
import AnimalFormModal from '../animals/AnimalFormModal';
import { AnimalProfile } from '../animals/AnimalProfile';
import { MobProfile } from '../animals/MobProfile';

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

// Helper function to safely extract the meals array from ANY log row
const extractMeals = (log: DailyLog) => {
  if (!log?.feed_details) return [];
  try {
    const parsed = typeof log.feed_details === 'string' ? JSON.parse(log.feed_details) : log.feed_details;
    return parsed?.meals || [];
  } catch {
    return [];
  }
};

const columnHelper = createColumnHelper<Animal>();
const EXOTIC_CATEGORIES = ['EXOTIC'];

export function Dashboard() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [isCreateAnimalModalOpen, setIsCreateAnimalModalOpen] = useState(false);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  
  const [viewDate, setViewDate] = useState<string>(getLocalDateString());

  const { data: allAnimals = [], isLoading: loadingAnimals, error } = useQuery({
    queryKey: ['animals', 'dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*').order('name');
      if (error) throw error;
      return data as Animal[];
    },
    meta: { persist: true },
  });

  const { data: todaysLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['daily_logs', 'dashboard', viewDate],
    queryFn: async () => {
      const startOfDay = new Date(`${viewDate}T00:00:00`);
      const endOfDay = new Date(`${viewDate}T23:59:59.999`);
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('is_deleted', false)
        .gte('log_date', startOfDay.toISOString())
        .lte('log_date', endOfDay.toISOString());
      if (error) throw error;
      return data as DailyLog[];
    },
    meta: { persist: true },
  });

  // DATA FIX: Removed .eq('log_type', 'FEEDING') filter. It now grabs ANY historical log that contains a JSON feed block.
  const { data: recentFeedLogs = [] } = useQuery({
    queryKey: ['recent_feeds', 'dashboard', viewDate],
    queryFn: async () => {
      const startOfDay = new Date(`${viewDate}T00:00:00`);
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('is_deleted', false)
        .not('feed_details', 'is', null)
        .lt('log_date', startOfDay.toISOString())
        .order('log_date', { ascending: false })
        .limit(2000); 
      if (error) throw error;
      return data as DailyLog[];
    },
    meta: { persist: true },
  });

  const selectedAnimal = useMemo(() => selectedAnimalId ? allAnimals.find(a => a.id === selectedAnimalId) || null : null, [allAnimals, selectedAnimalId]);

  useEffect(() => {
    const animalChannel = supabase.channel('dashboard-animals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'animals' }, () => {
        queryClient.invalidateQueries({ queryKey: ['animals', 'dashboard'] });
      }).subscribe();
      
    const logsChannel = supabase.channel('dashboard-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['daily_logs', 'dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['recent_feeds', 'dashboard'] });
      }).subscribe();

    return () => { 
      supabase.removeChannel(animalChannel); 
      supabase.removeChannel(logsChannel);
    };
  }, [queryClient]);

  const hierarchicalData = useMemo(() => {
    const logMap = new Map<string, DailyLog>();
    todaysLogs.forEach(log => {
      // Defensive mapping: If multiple logs somehow exist for today, ensure we prioritize the one with actual meals
      const existing = logMap.get(log.animal_id);
      if (existing) {
        const existingMeals = extractMeals(existing);
        const newMeals = extractMeals(log);
        if (existingMeals.length > 0 && newMeals.length === 0) return;
      }
      logMap.set(log.animal_id, log);
    });

    const lastFeedMap = new Map<string, DailyLog>();
    recentFeedLogs.forEach(log => {
        if (!lastFeedMap.has(log.animal_id)) {
            // DATA FIX: STRICTLY filter out logs that have empty meal arrays `{meals: []}` from blocking the map
            const meals = extractMeals(log);
            if (meals.length > 0) {
              lastFeedMap.set(log.animal_id, log);
            }
        }
    });

    let baseData = allAnimals.map(a => ({
      ...a,
      today_log: logMap.get(a.id),
      last_feed_log: lastFeedMap.get(a.id)
    }));

    if (activeTab === 'ARCHIVED') baseData = baseData.filter(a => a.status === 'ARCHIVED');
    else if (activeTab !== 'ALL') baseData = baseData.filter(a => a.category === activeTab && a.status !== 'ARCHIVED');
    else baseData = baseData.filter(a => a.status !== 'ARCHIVED');

    const groups = baseData.filter(a => a.record_type === 'GROUP');
    const individuals = baseData.filter(a => a.record_type === 'INDIVIDUAL' || !a.record_type);
    const orphans: Animal[] = [];
    const groupMap = new Map(groups.map(g => [g.id, { ...g, subRows: [] as Animal[] }]));

    individuals.forEach(ind => {
      if (ind.parent_group_id && groupMap.has(ind.parent_group_id)) groupMap.get(ind.parent_group_id)!.subRows!.push(ind);
      else orphans.push(ind);
    });
    return [...Array.from(groupMap.values()), ...orphans];
  }, [allAnimals, todaysLogs, recentFeedLogs, activeTab]);

  const totalInView = hierarchicalData.length;

  const columns = useMemo(() => {
    const nameColumn = columnHelper.accessor('name', {
      id: 'name',
      header: 'Entity Matrix',
      cell: info => {
        const isGroup = info.row.original.record_type === 'GROUP';
        const canExpand = info.row.getCanExpand();
        const avatarUrl = (info.row.original as any).avatar_url;
        const explicitLatinName = (info.row.original as any).latin_name || (info.row.original as any).scientific_name;

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
              <button onClick={() => setSelectedAnimalId(info.row.original.id)} className="font-black text-slate-900 text-sm leading-tight hover:text-emerald-600 hover:underline text-left transition-colors truncate max-w-full">
                {info.getValue() || (isGroup ? 'Unnamed Group' : 'Unnamed Animal')}
              </button>
              
              {info.row.original.record_type === 'GROUP' && (
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">Mob</span>
              )}
              
              {/* MOBILE ONLY FALLBACK */}
              <span className="lg:hidden text-[11px] font-bold text-slate-500 italic truncate max-w-[130px] shrink-0">
                {explicitLatinName || '--'}
              </span>
              
              <span className="lg:hidden text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 shadow-sm shrink-0">
                <MapPin size={10} className="text-slate-400 shrink-0" />
                <span className="truncate max-w-[90px]">{(info.row.original as any).location || 'Unknown'}</span>
              </span>
            </div>
          </div>
        );
      },
    });

    const latinNameColumn = columnHelper.accessor('id', {
      id: 'latin_name', // Changed ID from 'species' to break the default fallback
      header: 'Latin Taxonomy',
      cell: info => {
        // STRICT TAXONOMY FIX: Forces only the DB latin/scientific name to show. Never the common name.
        const explicitLatinName = (info.row.original as any).latin_name || (info.row.original as any).scientific_name;
        return <span className="text-xs font-bold text-slate-500 italic block truncate">{explicitLatinName && explicitLatinName.trim() !== '' ? explicitLatinName : '--'}</span>;
      }
    });

    const locationColumn = columnHelper.display({
      id: 'location',
      header: 'Location',
      cell: info => (
        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg w-fit border border-slate-200 shadow-sm">
          <MapPin size={12} className="text-slate-400 shrink-0" />
          <span className="truncate">{(info.row.original as any).location || 'Unknown'}</span>
        </span>
      )
    });

    const renderTodaysFeed = (log?: DailyLog) => {
      const meals = log ? extractMeals(log) : [];
      if (meals.length === 0) return <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">--</span>;
      
      return (
        <div className="flex flex-col gap-1.5 w-full">
          {meals.map((meal: any, idx: number) => {
            const timeFormatted = meal.time ? new Date(meal.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            const qty = meal.quantity || meal.quantity_consumed || meal.food_consumed_g || meal.quantity_offered || meal.food_offered_g;
            const unit = meal.unit === 'g' ? 'g' : (meal.unit === 'Whole' && qty ? ' items' : '');
            const qtyStr = qty ? ` (${qty}${unit})` : '';
            
            return (
              <div key={idx} className="flex flex-col gap-0.5 border-b border-slate-100/50 last:border-0 pb-1.5 last:pb-0 px-1 -mx-1 rounded">
                <span className="text-[11px] font-black text-slate-700 truncate max-w-full leading-tight">{meal.food_item || 'Diet Apportion'}{qtyStr}</span>
                <span className="text-[9px] font-bold text-amber-600 tracking-widest flex items-center gap-1"><Clock size={10} /> {timeFormatted}</span>
              </div>
            );
          })}
        </div>
      );
    };

    const renderHistoricalFeedData = (log?: DailyLog) => {
      const meals = log ? extractMeals(log) : [];
      const lastMeal = meals.length > 0 ? meals[meals.length - 1] : null;

      if (!lastMeal) return <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">--</span>;
      
      let timeFormatted = '--:--';
      if (lastMeal.time) {
        const d = new Date(lastMeal.time);
        timeFormatted = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      }

      const qty = lastMeal.quantity || lastMeal.quantity_consumed || lastMeal.food_consumed_g;
      const unit = lastMeal.unit === 'g' ? 'g' : (lastMeal.unit === 'Whole' && qty ? ' items' : '');
      const qtyStr = qty ? ` (${qty}${unit})` : '';

      return (
        <div className="flex flex-col gap-0.5 px-1 -mx-1 pb-1">
          <span className="text-[11px] font-black text-slate-700 truncate max-w-full">{lastMeal.food_item || 'Unknown Diet'}{qtyStr}</span>
          <span className="text-[9px] font-bold text-slate-500 tracking-widest flex items-center gap-1"><Clock size={10} /> {timeFormatted}</span>
        </div>
      );
    };

    if (EXOTIC_CATEGORIES.includes(activeTab)) {
      return [
        nameColumn, latinNameColumn,
        columnHelper.accessor('flying_weight', {
          id: 'weight',
          header: 'Weight',
          cell: info => {
            const todayLog = (info.row.original as any).today_log;
            const unit = (info.row.original as any).weight_unit || 'g';
            
            if (todayLog?.weight_not_required) return <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Exempt</span>;
            
            if (todayLog?.weight_grams) {
                return <span className="text-sm font-black text-emerald-600 flex items-center gap-1.5"><Scale size={14} className="text-emerald-500 shrink-0" />{formatWeightDisplay(todayLog.weight_grams, unit)}</span>;
            }
            return <span className="text-sm font-black text-slate-300 flex items-center gap-1.5"><Scale size={14} className="text-slate-200 shrink-0" />--</span>;
          },
        }),
        columnHelper.display({ 
          id: 'last_feed', 
          header: 'Last Feed', 
          cell: info => renderHistoricalFeedData((info.row.original as any).last_feed_log) 
        }),
        columnHelper.accessor('next_feed_date', {
          id: 'next_feed',
          header: 'Next Feed',
          cell: info => {
            const date = info.getValue();
            if (!date) return <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Unscheduled</span>;
            return <span className="font-black text-slate-800 text-xs uppercase tracking-tight flex items-center gap-1.5"><Drumstick size={14} className="text-amber-500 shrink-0" />{new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>;
          },
        }),
        columnHelper.accessor('target_day_temp_c', {
          id: 'temperature',
          header: 'Thermal Target',
          cell: info => {
            const todayLog = (info.row.original as any).today_log;
            const targetDay = info.getValue(); 
            const targetNight = info.row.original.target_night_temp_c; 
            const ambient = info.row.original.ambient_temp_only;

            if (todayLog?.temperature_c || todayLog?.basking_temp_c) {
                const temp = todayLog.temperature_c || todayLog.basking_temp_c;
                return (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black text-blue-600 flex items-center gap-1.5"><ThermometerSun size={14} className="shrink-0" />{temp}°C <span className="text-[9px] text-blue-400 uppercase tracking-widest ml-1 bg-blue-50 px-1 rounded border border-blue-100">Logged</span></span>
                  </div>
                );
            }

            if (!targetDay && !targetNight) return <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">--</span>;
            return (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-black text-orange-600 flex items-center gap-1.5"><ThermometerSun size={14} className="shrink-0" />{ambient ? 'Amb:' : 'Bask:'} {targetDay}°C</span>
                {!ambient && targetNight && <span className="text-[10px] text-blue-600 font-black tracking-widest uppercase ml-5">Night: {targetNight}°C</span>}
              </div>
            );
          },
        }),
        locationColumn
      ];
    }

    return [
      nameColumn, latinNameColumn,
      columnHelper.accessor('flying_weight', {
        id: 'weight',
        header: 'Today\'s Weight',
        cell: info => {
          const todayLog = (info.row.original as any).today_log;
          const unit = (info.row.original as any).weight_unit || 'g';
          
          if (todayLog?.weight_not_required) return <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Exempt</span>;
          
          if (todayLog?.weight_grams) {
              return <span className="text-sm font-black text-emerald-600 flex items-center gap-1.5"><Scale size={14} className="text-emerald-500 shrink-0" />{formatWeightDisplay(todayLog.weight_grams, unit)}</span>;
          }
          return <span className="text-sm font-black text-slate-300 flex items-center gap-1.5"><Scale size={14} className="text-slate-200 shrink-0" />--</span>;
        },
      }),
      columnHelper.display({ 
        id: 'todays_feed', 
        header: 'Today\'s Feed', 
        cell: info => renderTodaysFeed((info.row.original as any).today_log) 
      }),
      columnHelper.display({ 
        id: 'last_feed', 
        header: 'Last Feed', 
        cell: info => renderHistoricalFeedData((info.row.original as any).last_feed_log) 
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

  const tableGridCols = useMemo(() => {
    return table.getVisibleLeafColumns().map(c => {
      if (c.id === 'name') return 'minmax(250px, 3fr)';
      if (c.id === 'latin_name') return 'minmax(140px, 1.5fr)';
      if (c.id === 'location') return 'minmax(140px, 1.5fr)';
      if (c.id === 'weight') return 'minmax(120px, 1fr)';
      if (c.id === 'todays_feed' || c.id === 'last_feed' || c.id === 'next_feed') return 'minmax(180px, 2fr)';
      return 'minmax(100px, 1fr)';
    }).join(' ');
  }, [table.getVisibleLeafColumns()]);

  return (
    // WIDTH FIX: Replaced max-w with w-full to stretch edge-to-edge on large 4k/1080p monitors
    <div className="w-full mx-auto space-y-4 md:space-y-6 px-4 md:px-8 pb-20">
      
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm w-full">
        <div className="w-full xl:w-auto">
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">Real-time husbandry overview</p>
        </div>
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full xl:w-auto">
          <div className="relative w-full md:w-auto shrink-0">
            <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="date" value={viewDate} onChange={e => setViewDate(e.target.value)} className="w-full pl-9 pr-4 py-2.5 md:py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm" />
          </div>
          <div className="relative w-full md:w-72 shrink-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={globalFilter ?? ''} onChange={e => setGlobalFilter(e.target.value)} placeholder="Search entities, species..." className="w-full pl-9 pr-4 py-2.5 md:py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm" />
          </div>
          <button onClick={() => setIsCreateAnimalModalOpen(true)} className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 md:py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(16,185,129,0.15)] shrink-0">
            <Plus size={16} /> Add Record
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-40 md:h-48">
          <div className="flex items-center gap-3 mb-4"><div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100"><ClipboardList size={18} /></div><h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Active Tasks</h2></div>
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400"><CheckCircle2 size={32} className="mb-2 md:mb-3 opacity-20" /><p className="text-[10px] font-black uppercase tracking-widest">No pending tasks</p></div>
        </div>
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-40 md:h-48">
          <div className="flex items-center gap-3 mb-4"><div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100"><Activity size={18} /></div><h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Health & Medical</h2></div>
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400"><AlertCircle size={32} className="mb-2 md:mb-3 opacity-20" /><p className="text-[10px] font-black uppercase tracking-widest">No active medical alerts</p></div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <div className="bg-white px-4 py-3 md:px-5 md:py-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4"><div className="p-2 md:p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100"><Scale size={18} className="w-4 h-4 md:w-5 md:h-5" /></div><div><p className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">Weighed Today</p><p className="text-lg md:text-xl font-black text-slate-900 leading-none mt-1 md:mt-1.5">0 <span className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-widest ml-1">/ {totalInView}</span></p></div></div>
          </div>
          <div className="bg-white px-4 py-3 md:px-5 md:py-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4"><div className="p-2 md:p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-100"><Drumstick size={18} className="w-4 h-4 md:w-5 md:h-5" /></div><div><p className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">Fed Today</p><p className="text-lg md:text-xl font-black text-slate-900 leading-none mt-1 md:mt-1.5">0 <span className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-widest ml-1">/ {totalInView}</span></p></div></div>
          </div>
        </div>
        
        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2 touch-pan-x">
          {categories.map((category) => (
            <button key={category} onClick={() => setActiveTab(category)} className={`px-4 md:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === category ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:text-slate-700 hover:bg-slate-50'}`}>
              {category.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-transparent lg:bg-white border-none lg:border lg:border-slate-200 rounded-none lg:rounded-2xl lg:shadow-sm overflow-hidden flex flex-col w-full">
        {error ? (
          <div className="p-10 text-center text-rose-600 bg-rose-50 rounded-2xl font-bold flex flex-col items-center gap-3"><AlertCircle size={24} /> Connection error: Verify RLS policies and DB connection.</div>
        ) : loadingAnimals || loadingLogs ? (
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
                      
                      <div className="grid grid-cols-2 gap-3 lg:hidden p-4 bg-white rounded-2xl border border-slate-200 shadow-sm mx-1">
                        {row.getVisibleCells().map(cell => {
                          if (cell.column.id === 'latin_name' || cell.column.id === 'location') return null;
                          
                          const isName = cell.column.id === 'name';
                          return (
                            <div key={cell.id} className={isName ? "col-span-2 border-b border-slate-100 pb-3" : "col-span-1 flex flex-col gap-1.5 p-3 bg-slate-50 border border-slate-100 rounded-xl"}>
                              {!isName && <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{cell.column.columnDef.header as string}</span>}
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                          );
                        })}
                      </div>

                      <div 
                        className={`hidden lg:grid gap-4 px-6 py-4 items-center transition-colors hover:bg-emerald-50/30 border-b border-slate-100 ${row.original.record_type === 'GROUP' ? 'bg-slate-50/50' : 'bg-white'}`}
                        style={{ gridTemplateColumns: tableGridCols }}
                      >
                        {row.getVisibleCells().map(cell => (
                          <div key={cell.id} className="truncate">
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