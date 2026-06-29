import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { reportExportService } from '../services/reportExportService';
import { format, parseISO, formatISO } from 'date-fns';
import { 
  ShieldAlert, Plus, X, Search, Save, Loader2, AlertCircle, 
  CheckCircle2, WifiOff, CalendarDays, FilterX, Download 
} from 'lucide-react';
import { Animal, IsolationLog, User } from '../types';

// ------------------------------------------------------------------
// STRICTLY ONLINE QUERY OPTIONS
// ------------------------------------------------------------------
const activeAnimalsOptions = queryOptions({
  queryKey: ['active_animals'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('id, name, species').eq('is_deleted', false).order('name');
    if (error) throw error;
    return data as Animal[];
  },
  staleTime: 0,
  gcTime: 1000 * 60 * 5
});

const staffUsersOptions = queryOptions({
  queryKey: ['staff_users'],
  queryFn: async () => {
    const { data, error } = await supabase.from('users').select('id, name, role').eq('is_deleted', false).eq('is_active', true);
    if (error) throw error;
    return data as User[];
  },
  staleTime: 0,
  gcTime: 1000 * 60 * 5
});

export const Route = createFileRoute('/clinical/isolation')({
  loader: async ({ context: { queryClient } }) => {
    if (queryClient) {
      await Promise.all([ 
        queryClient.ensureQueryData(activeAnimalsOptions),
        queryClient.ensureQueryData(staffUsersOptions)
      ]);
    }
  },
  component: ClinicalIsolationPage,
});

// ------------------------------------------------------------------
// MAIN COMPONENT
// ------------------------------------------------------------------
export function ClinicalIsolationPage() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  
  // --- STRICT NETWORK HEARTBEAT ---
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    let isMounted = true;
    const checkConnection = async () => {
      try {
        const { error } = await supabase.from('animals').select('id').limit(1);
        if (isMounted) setIsOnline(!error);
      } catch {
        if (isMounted) setIsOnline(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 15000); 

    const handleOnline = () => checkConnection();
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const scrollParentRef = useRef<HTMLDivElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- FACETED FILTER STATE ---
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const isolationTypes = ['MEDICAL_QUARANTINE', 'NEW_ARRIVAL', 'BEHAVIORAL_ISOLATION', 'INFECTIOUS_DISEASE'];

  const toggleType = (type: string) => {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const clearFilters = () => {
    setSelectedAnimalId('ALL');
    setStartDate('');
    setEndDate('');
    setSelectedTypes([]);
  };

  const { data: animals = [] } = useQuery({ ...activeAnimalsOptions, enabled: isOnline });
  const { data: staff = [] } = useQuery({ ...staffUsersOptions, enabled: isOnline });

  // --- INFINITE QUERY PIPELINE (UNBOUNDED SCALING) ---
  const { 
    data, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading 
  } = useInfiniteQuery({
    queryKey: ['isolation_logs_infinite', selectedAnimalId, startDate, endDate, selectedTypes],
    queryFn: async ({ pageParam = 0 }) => {
      const limit = 30;
      let query = supabase.from('isolation_logs').select('*, animals(name, species)').eq('is_deleted', false);
      
      if (selectedAnimalId !== 'ALL') query = query.eq('animal_id', selectedAnimalId);
      if (startDate) query = query.gte('start_date', new Date(startDate).toISOString());
      if (endDate) query = query.lte('start_date', new Date(endDate + 'T23:59:59').toISOString());
      if (selectedTypes.length > 0) query = query.in('isolation_type', selectedTypes);
      
      query = query.order('start_date', { ascending: false });
      query = query.range(pageParam * limit, (pageParam + 1) * limit - 1);
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    getNextPageParam: (lastPage, allPages) => lastPage.length === 30 ? allPages.length : undefined,
    initialPageParam: 0,
    enabled: isOnline
  });

  const logs = useMemo(() => data ? data.pages.flat() : [], [data]);

  // --- VIRTUALIZER DYNAMIC ESTIMATION ---
  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? logs.length + 1 : logs.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 110, 
    overscan: 5,
  });

  // --- INFINITE SCROLL LISTENER ---
  useEffect(() => {
    const [lastItem] = rowVirtualizer.getVirtualItems().slice(-1);
    if (!lastItem) return;
    if (lastItem.index >= logs.length - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, fetchNextPage, logs.length, isFetchingNextPage, rowVirtualizer.getVirtualItems()]);

  useEffect(() => {
    const handleResize = () => { rowVirtualizer.measure(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rowVirtualizer]);

  useEffect(() => {
    const channel = supabase.channel('isolation-logs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'isolation_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['isolation_logs_infinite'], refetchType: 'active' });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const completeIsolationMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error("Authentication required to complete isolation.");
      const { error } = await supabase.from('isolation_logs').update({ 
        end_date: new Date().toISOString(),
        modified_by: user.id 
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['isolation_logs_infinite'] }),
    onError: (err: any) => setErrorMsg(err.message || 'Failed to complete isolation period.')
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportData = logs.map((log: any) => {
        const staffName = staff.find(s => s.id === log.authorized_by)?.name || 'Unknown';
        return [
          log.start_date ? format(parseISO(log.start_date), 'dd MMM yyyy') : 'N/A',
          log.end_date ? format(parseISO(log.end_date), 'dd MMM yyyy') : 'Ongoing',
          log.animals?.name || 'Unknown Patient',
          (log.isolation_type || 'UNKNOWN').replace(/_/g, ' '),
          log.reason || 'N/A',
          staffName
        ];
      });

      await reportExportService.exportSingleReport({
        title: selectedAnimalId === 'ALL' ? "Global Biosecurity Logs" : `Quarantine History: ${logs[0]?.animals?.name}`,
        columns: ["Start Date", "End Date", "Patient", "Protocol", "Reason", "Authorized By"],
        data: exportData,
        generatorName: profile?.name || 'Veterinary Staff',
        dateRange: startDate && endDate ? `${startDate} to ${endDate}` : "Unbounded History"
      }, 'QUARANTINE_LOGS');
    } catch (error) {
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  // --- STRICT LOCKOUT RENDER ---
  if (!isOnline) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-32">
        <div className="bg-slate-900 text-white p-12 rounded-2xl shadow-2xl flex flex-col items-center justify-center text-center min-h-[60vh] border border-slate-800">
          <WifiOff size={64} className="mb-6 text-rose-500" />
          <h2 className="text-3xl font-black uppercase tracking-widest mb-3">Clinical Systems Locked</h2>
          <p className="font-bold text-slate-400 max-w-lg text-sm leading-relaxed">
            To enforce veterinary data integrity and prevent split-brain clinical errors, this module requires an active database connection. Offline caching is disabled.
          </p>
          <div className="mt-8 px-6 py-3 bg-slate-800 rounded-xl text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-3 border border-slate-700">
            <Loader2 size={16} className="animate-spin text-rose-500" /> Securing connection...
          </div>
        </div>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <ShieldAlert className="text-rose-600" size={24} /> Quarantine & Isolation
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Biosecurity & Medical Segregation</p>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={handleExport}
            disabled={isExporting || logs.length === 0}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2 bg-slate-100 text-slate-700 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-colors border border-slate-200 shadow-sm disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(225,29,72,0.15)]"
          >
            <Plus size={16} /> Log Isolation
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 p-3 rounded-xl text-rose-800 shadow-sm mx-1 animate-in fade-in">
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span className="text-xs font-bold">{errorMsg}</span>
        </div>
      )}

      {/* --- ADVANCED FACETED FILTER ENGINE --- */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 ml-1">Patient Context</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select 
                value={selectedAnimalId} 
                onChange={(e) => setSelectedAnimalId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 shadow-sm appearance-none cursor-pointer"
              >
                <option value="ALL">Global Facility View (All Animals)</option>
                {animals.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.species})</option>)}
              </select>
            </div>
          </div>
          <div className="md:w-1/3">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 ml-1">Start Date</label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 shadow-sm" />
            </div>
          </div>
          <div className="md:w-1/3">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 ml-1">End Date</label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 shadow-sm" />
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap gap-2">
            {isolationTypes.map(type => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border shadow-sm ${selectedTypes.includes(type) ? 'bg-rose-600 text-white border-rose-700' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                {type.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          {(selectedAnimalId !== 'ALL' || startDate || endDate || selectedTypes.length > 0) && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-800 px-3 py-1.5 bg-slate-100 rounded-lg transition-colors">
              <FilterX size={12} /> Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-22rem)] min-h-[500px]">
        {isLoading && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-sm"><Loader2 className="animate-spin text-rose-600 w-8 h-8" /></div>}
        
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10 min-w-[900px]">
          <div className="col-span-2">Status / Duration</div>
          <div className="col-span-3">Patient</div>
          <div className="col-span-5">Reason & Directives</div>
          <div className="col-span-2 text-right">Action</div>
        </div>

        <div ref={scrollParentRef} className="overflow-auto flex-1 custom-scrollbar min-w-[900px] relative">
          {logs.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <ShieldAlert size={48} className="mb-4 opacity-20" />
              <p className="text-xs font-black uppercase tracking-widest mb-1">No Quarantine Logs Found</p>
              <p className="text-xs font-medium">Try adjusting your filters or date range.</p>
            </div>
          ) : (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {virtualItems.map((virtualRow) => {
                const isLoaderRow = virtualRow.index > logs.length - 1;
                const log = logs[virtualRow.index];

                if (isLoaderRow) {
                  return (
                    <div key="loader" className="absolute top-0 left-0 w-full flex justify-center py-6" style={{ transform: `translateY(${virtualRow.start}px)` }}>
                      <Loader2 className="animate-spin text-rose-500" size={24} />
                    </div>
                  );
                }

                const isActive = !log.end_date;
                const isCompleting = completeIsolationMutation.isPending && completeIsolationMutation.variables === log.id;

                return (
                  <div key={log.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className={`absolute top-0 left-0 w-full transition-colors border-b border-slate-100 ${isActive ? 'bg-rose-50/20' : 'hover:bg-slate-50/60'}`} style={{ transform: `translateY(${virtualRow.start}px)` }}>
                    <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center h-full">
                      <div className="col-span-2 flex flex-col items-start gap-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${isActive ? 'bg-rose-100 text-rose-700 border-rose-200 shadow-sm' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {isActive ? 'ACTIVE ISOLATION' : 'COMPLETED'}
                        </span>
                        <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex flex-col gap-0.5 mt-1">
                          <span>Start: {log.start_date ? format(parseISO(log.start_date), 'dd MMM yy') : '--'}</span>
                          {log.end_date && <span>End: {format(parseISO(log.end_date), 'dd MMM yy')}</span>}
                        </div>
                      </div>
                      <div className="col-span-3">
                        <p className="text-sm font-black text-slate-900 uppercase tracking-tight truncate">{(log as any).animals?.name || 'Unknown Patient'}</p>
                        <div className="flex gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-slate-100 text-slate-500 border-slate-300 truncate max-w-[120px]">
                            {(log as any).animals?.species || 'Unknown'}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-amber-50 text-amber-700 border-amber-200 truncate">
                            {(log.isolation_type || 'UNKNOWN').replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-5 space-y-1 pr-4">
                        <p className="text-xs font-bold text-slate-900 leading-snug">{log.reason || 'No specific reason provided.'}</p>
                        {log.notes && <p className="text-[10px] font-medium text-slate-600 line-clamp-2 mt-1">{log.notes}</p>}
                      </div>
                      <div className="col-span-2 flex justify-end">
                        {isActive ? (
                          <button 
                            onClick={() => completeIsolationMutation.mutate(log.id)}
                            disabled={isCompleting}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-sm disabled:opacity-50"
                          >
                            {isCompleting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Clear
                          </button>
                        ) : (
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cleared</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isModalOpen && <IsolationModal onClose={() => setIsModalOpen(false)} animals={animals} staff={staff} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TANSTACK FORM MODAL (V3 SCHEMA COMPLIANT)
// ---------------------------------------------------------------------------
function IsolationModal({ onClose, animals, staff }: { onClose: () => void, animals: Animal[], staff: User[] }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<IsolationLog>) => {
      const { error } = await supabase.from('isolation_logs').insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isolation_logs_infinite'] });
    }
  });

  const form = useForm({
    defaultValues: {
      animal_id: '',
      isolation_type: 'MEDICAL_QUARANTINE',
      start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      reason: '',
      notes: '',
      authorized_by: '' 
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      
      try {
        if (!user?.id) throw new Error("Authentication required.");
        
        const parsedStartDate = value.start_date ? formatISO(parseISO(value.start_date)) : formatISO(new Date());

        const payload: Partial<IsolationLog> = {
          id: crypto.randomUUID(), 
          animal_id: value.animal_id,
          isolation_type: value.isolation_type,
          start_date: parsedStartDate,
          reason: value.reason,
          notes: value.notes || null,
          authorized_by: value.authorized_by,
          created_by: user.id,
          modified_by: user.id,
          is_deleted: false
        };

        await saveMutation.mutateAsync(payload);
        onClose(); 
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to securely log isolation. Please check connection.');
      }
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto custom-scrollbar">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl relative my-auto">
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <ShieldAlert size={20} className="text-rose-600" /> Initiate Quarantine/Isolation
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"><X size={20} /></button>
        </div>

        <form id="isolation-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-5">
          {errorMsg && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold shadow-sm"><AlertCircle className="inline mr-2" size={16} />{errorMsg}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-slate-50 p-5 rounded-2xl border border-slate-100">
            <form.Field name="animal_id">
              {(field) => (
                <div className="md:col-span-2">
                  <label className={labelClass}>Patient (Animal) *</label>
                  <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                    <option value="">-- Select Patient --</option>
                    {animals.map(a => <option key={a.id} value={a.id}>{a.name} ({a.species})</option>)}
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="start_date">
              {(field) => (
                <div>
                  <label className={labelClass}>Start Date & Time *</label>
                  <input type="datetime-local" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>

            <form.Field name="isolation_type">
              {(field) => (
                <div>
                  <label className={labelClass}>Isolation Protocol *</label>
                  <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                    <option value="MEDICAL_QUARANTINE">Medical Quarantine</option>
                    <option value="NEW_ARRIVAL">New Arrival (Standard 30-Day)</option>
                    <option value="BEHAVIORAL_ISOLATION">Behavioral Isolation</option>
                    <option value="INFECTIOUS_DISEASE">Infectious Disease Hold</option>
                  </select>
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="reason">
            {(field) => (
              <div>
                <label className={labelClass}>Primary Reason / Diagnosis *</label>
                <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. Suspected Avian Influenza exposure" className={inputClass} />
              </div>
            )}
          </form.Field>

          <form.Field name="notes">
            {(field) => (
              <div>
                <label className={labelClass}>Special Instructions / Biosecurity Notes</label>
                <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="Detailed notes on PPE required, feeding order, etc..." />
              </div>
            )}
          </form.Field>

          <div className="pt-3 border-t border-slate-100">
            <form.Field name="authorized_by">
              {(field) => (
                <div className="max-w-xs">
                  <label className={labelClass}>Authorized By (Veterinarian/Curator) *</label>
                  <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                    <option value="">-- Select Authorizing Staff --</option>
                    {staff.map(user => <option key={user.id} value={user.id}>{user.name} ({user.role})</option>)}
                  </select>
                </div>
              )}
            </form.Field>
          </div>
        </form>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button type="submit" form="isolation-form" disabled={!canSubmit || isSubmitting as boolean} className="px-8 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md">
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Initiate Isolation
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}