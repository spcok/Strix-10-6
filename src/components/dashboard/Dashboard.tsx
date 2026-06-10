import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  createColumnHelper, 
  flexRender, 
  getCoreRowModel, 
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  useReactTable,
  SortingState,
  ExpandedState
} from '@tanstack/react-table';
import { 
  Search, Plus, Drumstick, ArrowUpDown, Loader2, 
  Scale, Calendar, CheckCircle2, ThermometerSun, AlertCircle, 
  ClipboardList, Activity, ChevronRight, ChevronDown, Users, User
} from 'lucide-react';
import { Animal } from '../../types';
import { supabase } from '../../lib/supabase';
import AnimalFormModal from '../animals/AnimalFormModal';
import { AnimalProfile } from '../animals/AnimalProfile';

const columnHelper = createColumnHelper<Animal>();
const EXOTIC_CATEGORIES = ['EXOTIC'];

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [isCreateAnimalModalOpen, setIsCreateAnimalModalOpen] = useState(false);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const { data: allAnimals = [], isLoading, error } = useQuery({
    queryKey: ['animals', 'dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Animal[];
    },
    meta: { persist: true },
  });

  const selectedAnimal = useMemo(() => {
    return selectedAnimalId ? allAnimals.find(a => a.id === selectedAnimalId) || null : null;
  }, [allAnimals, selectedAnimalId]);

  useEffect(() => {
    const channel = supabase
      .channel('animals-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'animals' },
        (payload) => {
          console.log('Realtime change detected:', payload);
          queryClient.invalidateQueries({ queryKey: ['animals', 'dashboard'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // TREE CONSTRUCTION ENGINE (Archive Segregation logic)
  const hierarchicalData = useMemo(() => {
    let baseData = allAnimals;

    if (activeTab === 'ARCHIVED') {
      // ONLY show archived records
      baseData = allAnimals.filter(a => a.status === 'ARCHIVED');
    } else if (activeTab === 'ALL') {
      // Show everything EXCEPT archived records
      baseData = allAnimals.filter(a => a.status !== 'ARCHIVED');
    } else {
      // Filter by Category AND ensure it is not archived
      baseData = allAnimals.filter(a => a.category === activeTab && a.status !== 'ARCHIVED');
    }

    const groups = baseData.filter(a => a.record_type === 'GROUP');
    const individuals = baseData.filter(a => a.record_type === 'INDIVIDUAL' || !a.record_type);
    const orphans: Animal[] = [];

    const groupMap = new Map(groups.map(g => [g.id, { ...g, subRows: [] as Animal[] }]));

    individuals.forEach(ind => {
      if (ind.parent_group_id && groupMap.has(ind.parent_group_id)) {
        groupMap.get(ind.parent_group_id)!.subRows!.push(ind);
      } else {
        orphans.push(ind);
      }
    });

    return [...Array.from(groupMap.values()), ...orphans];
  }, [allAnimals, activeTab]);

  const totalInView = hierarchicalData.length;
  const weighedToday = 0; 
  const fedToday = 0; 

  const columns = useMemo(() => {
    const baseColumns = [
      columnHelper.accessor('name', {
        header: 'Entity Details',
        cell: info => {
          const isGroup = info.row.original.record_type === 'GROUP';
          const canExpand = info.row.getCanExpand();
          
          return (
            <div 
              className="flex items-center gap-3" 
              style={{ paddingLeft: `${info.row.depth * 1.5}rem` }}
            >
              <div className="flex items-center justify-center w-5">
                {canExpand ? (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      info.row.toggleExpanded();
                    }} 
                    className="cursor-pointer text-slate-400 hover:text-slate-900 transition-colors p-1 rounded hover:bg-slate-200"
                  >
                    {info.row.getIsExpanded() ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                ) : null}
              </div>
              
              <div className={`p-1.5 rounded-lg shrink-0 ${isGroup ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                {isGroup ? <Users size={14} /> : <User size={14} />}
              </div>
              
              <div className="flex flex-col items-start">
                <button 
                  onClick={() => setSelectedAnimalId(info.row.original.id)}
                  className="font-bold text-slate-900 text-sm leading-tight hover:text-emerald-600 hover:underline text-left transition-colors"
                >
                  {info.getValue() || (isGroup ? 'Unnamed Group' : 'Unnamed Animal')}
                </button>
                <span className="text-xs text-slate-500 font-medium">{info.row.original.species || 'Unknown Species'}</span>
              </div>
            </div>
          );
        },
      }),
    ];

    if (EXOTIC_CATEGORIES.includes(activeTab)) {
      return [
        ...baseColumns,
        columnHelper.accessor('flying_weight', {
          header: 'Weight',
          cell: info => {
            const weight = info.getValue();
            if (!weight && info.row.original.record_type === 'GROUP') return <span className="text-[10px] text-slate-400 font-medium">N/A (Group)</span>;
            return (
              <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <Scale size={12} className="text-slate-400" />
                {weight ? `${weight}g` : '--'}
              </span>
            );
          },
        }),
        columnHelper.display({
          id: 'last_feed',
          header: 'Last Feed',
          cell: () => <span className="text-[10px] text-slate-400 italic font-medium uppercase tracking-widest">Pending Logs</span>,
        }),
        columnHelper.accessor('next_feed_date', {
          header: 'Next Feed',
          cell: info => {
            const date = info.getValue();
            if (!date) return <span className="text-slate-400">-</span>;
            return (
              <span className="font-bold text-slate-800 text-xs uppercase tracking-tight flex items-center gap-1.5">
                <Drumstick size={12} className="text-amber-500" />
                {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            );
          },
        }),
        columnHelper.accessor('target_day_temp_c', {
          header: 'Temperature',
          cell: info => {
            const day = info.getValue();
            const night = info.row.original.target_night_temp_c;
            const ambient = info.row.original.ambient_temp_only;
            if (!day && !night) return <span className="text-slate-400">--</span>;
            return (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-orange-600 flex items-center gap-1">
                  <ThermometerSun size={12} />
                  {ambient ? 'Ambient:' : 'Basking:'} {day}°C
                </span>
                {!ambient && night && (
                  <span className="text-[10px] text-blue-600 font-bold tracking-wide uppercase">
                    Night: {night}°C
                  </span>
                )}
              </div>
            );
          },
        }),
      ];
    }

    return [
      ...baseColumns,
      columnHelper.accessor('flying_weight', {
        header: 'Weight Matrix',
        cell: info => {
          const weight = info.getValue();
          const target = info.row.original.average_target_weight;
          
          if (!weight && !target && info.row.original.record_type === 'GROUP') {
            return <span className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">N/A (Group Level)</span>;
          }

          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <Scale size={12} className="text-slate-400" />
                {weight ? `${weight}g` : '--'}
              </span>
              {target && <span className="text-[10px] text-slate-400 font-bold tracking-wide uppercase">Target: {target}g</span>}
            </div>
          );
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status & ID',
        cell: info => {
          const status = info.getValue();
          
          let colorClass = 'bg-slate-100 text-slate-600 border-slate-200';
          let displayLabel = status || 'UNKNOWN';

          if (status === 'ON_DISPLAY') { colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200'; displayLabel = 'ON DISPLAY'; }
          else if (status === 'MEDICAL') { colorClass = 'bg-rose-50 text-rose-700 border-rose-200'; displayLabel = 'MEDICAL'; }
          else if (status === 'QUARANTINE') { colorClass = 'bg-amber-50 text-amber-700 border-amber-200'; displayLabel = 'QUARANTINE'; }
          else if (status === 'OFF_DISPLAY') { colorClass = 'bg-slate-100 text-slate-600 border-slate-300'; displayLabel = 'OFF DISPLAY'; }
          else if (status === 'OFFSITE') { colorClass = 'bg-blue-50 text-blue-700 border-blue-200'; displayLabel = 'OFFSITE'; }
          else if (status === 'ARCHIVED') { colorClass = 'bg-slate-800 text-slate-300 border-slate-600'; displayLabel = 'ARCHIVED'; }
          
          return (
            <div className="flex flex-col items-start gap-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${colorClass}`}>
                {displayLabel}
              </span>
              {info.row.original.record_type === 'INDIVIDUAL' && (
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                  {info.row.original.ring_number || info.row.original.microchip_id || 'NO ID'}
                </span>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor('next_feed_date', {
        header: 'Next Feed',
        cell: info => {
          const date = info.getValue();
          if (!date) return <span className="text-slate-400">-</span>;
          
          return (
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-slate-800 text-xs uppercase tracking-tight flex items-center gap-1.5">
                <Drumstick size={12} className="text-amber-500" />
                {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-tight">
                {info.row.original.next_feed_note ?? 'Scheduled'}
              </span>
            </div>
          );
        },
      }),
    ];
  }, [activeTab]);

  const table = useReactTable({
    data: hierarchicalData,
    columns,
    state: { sorting, globalFilter, expanded },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onExpandedChange: setExpanded,
    getSubRows: row => (row.subRows && row.subRows.length > 0 ? row.subRows : undefined),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const categories = ['ALL', 'OWL', 'RAPTOR', 'MAMMAL', 'EXOTIC', 'ARCHIVED'];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">
            Real-time husbandry overview
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="date" 
              value={viewDate}
              onChange={e => setViewDate(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
            />
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              placeholder="Search entities, IDs, species..." 
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
            />
          </div>
          
          <button 
            onClick={() => setIsCreateAnimalModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-50 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(16,185,129,0.15)] shrink-0"
          >
            <Plus size={16} /> Add Record
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-48">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <ClipboardList size={18} />
            </div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Active Tasks</h2>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
             <CheckCircle2 size={32} className="mb-3 opacity-20" />
             <p className="text-[10px] font-black uppercase tracking-widest">No pending tasks</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-48">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
              <Activity size={18} />
            </div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Health & Medical</h2>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
             <AlertCircle size={32} className="mb-3 opacity-20" />
             <p className="text-[10px] font-black uppercase tracking-widest">No active medical alerts</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white px-5 py-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100"><Scale size={18} /></div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Weighed Today</p>
                <p className="text-xl font-black text-slate-900 leading-none mt-1.5">
                  {weighedToday} <span className="text-xs text-slate-400 font-bold uppercase tracking-widest ml-1">/ {totalInView}</span>
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white px-5 py-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-100"><Drumstick size={18} /></div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fed Today</p>
                <p className="text-xl font-black text-slate-900 leading-none mt-1.5">
                  {fedToday} <span className="text-xs text-slate-400 font-bold uppercase tracking-widest ml-1">/ {totalInView}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveTab(category)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === category 
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm' 
                  : 'bg-white text-slate-500 border border-slate-200 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {category.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {error ? (
          <div className="p-10 text-center text-rose-600 bg-rose-50 font-bold flex flex-col items-center gap-3">
            <AlertCircle size={24} />
            Connection error: Ensure your database environment variables are set correctly and RLS policies allow read access.
          </div>
        ) : isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-4">
            <Loader2 size={28} className="text-emerald-500 animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Synchronizing with Cache...</span>
          </div>
        ) : (
          <div className="w-full overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest">
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th 
                        key={header.id} 
                        className="px-6 py-4 cursor-pointer hover:text-slate-700 transition-colors select-none group"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-2">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ArrowUpDown 
                            size={12} 
                            className={`opacity-0 group-hover:opacity-100 transition-opacity ${header.column.getIsSorted() ? 'opacity-100 text-emerald-500' : ''}`} 
                          />
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-20 text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 mb-4 shadow-inner">
                        <Scale size={24} className="text-slate-400" />
                      </div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">No Records Found</h3>
                      <p className="text-xs font-bold text-slate-500 mt-2">No entities match this category filter.</p>
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map(row => (
                    <tr 
                      key={row.id} 
                      className={`transition-colors group hover:bg-slate-50 ${row.original.record_type === 'GROUP' ? 'bg-slate-50/50' : 'bg-white'}`}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-6 py-4 whitespace-nowrap">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedAnimal && (
        <AnimalProfile 
          animal={selectedAnimal} 
          onClose={() => setSelectedAnimalId(null)} 
        />
      )}

      {isCreateAnimalModalOpen && (
        <AnimalFormModal 
          isOpen={isCreateAnimalModalOpen} 
          onClose={() => setIsCreateAnimalModalOpen(false)} 
        />
      )}
      
    </div>
  );
}