import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { format, parseISO, formatISO } from 'date-fns';
import { ShieldAlert, Plus, X, Search, Save, Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Animal, IsolationLog, User } from '../types';

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS & 14-DAY RAM CAP
// ------------------------------------------------------------------
const isolationLogsOptions = queryOptions({
  queryKey: ['isolation_logs'],
  queryFn: async () => {
    // AUDIT FIX 5: Deterministic 14-day boundary
    const boundary = new Date();
    boundary.setDate(boundary.getDate() - 14);
    boundary.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('isolation_logs')
      .select('*, animals(name, species)')
      .eq('is_deleted', false)
      .or(`end_date.is.null,start_date.gte.${boundary.toISOString()}`)
      .order('start_date', { ascending: false });
    if (error) throw error;
    return data as IsolationLog[];
  },
  staleTime: 1000 * 60 * 15,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const activeAnimalsOptions = queryOptions({
  queryKey: ['active_animals'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('id, name, species').eq('is_deleted', false).order('name');
    if (error) throw error;
    return data as Animal[];
  },
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

// Added to securely fetch staff UUIDs for "Authorized By" 
const staffUsersOptions = queryOptions({
  queryKey: ['staff_users'],
  queryFn: async () => {
    const { data, error } = await supabase.from('users').select('id, name, role').eq('is_deleted', false).eq('is_active', true);
    if (error) throw error;
    return data as User[];
  },
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/clinical/isolation')({
  loader: async ({ context: { queryClient } }) => {
    if (queryClient) {
      await Promise.all([ 
        queryClient.ensureQueryData(isolationLogsOptions), 
        queryClient.ensureQueryData(activeAnimalsOptions),
        queryClient.ensureQueryData(staffUsersOptions)
      ]);
    }
  },
  errorComponent: () => (
    <div className="max-w-7xl mx-auto p-6 mt-6 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col items-center justify-center text-rose-700 text-center shadow-sm">
      <AlertCircle size={32} className="mb-3 opacity-80" />
      <h3 className="text-sm font-black uppercase tracking-widest">Connection Error</h3>
      <p className="text-xs font-bold mt-2">Failed to sync isolation logs. Please verify your network connection.</p>
    </div>
  ),
  component: ClinicalIsolationPage,
});

// ------------------------------------------------------------------
// MAIN COMPONENT
// ------------------------------------------------------------------
export function ClinicalIsolationPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // AUDIT FIX 1: Explicit scroll parent ref for localized virtualization
  const scrollParentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase.channel('isolation-logs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'isolation_logs' }, () => {
        // AUDIT FIX 2: Restricted invalidation to active queries to prevent background thrashing
        queryClient.invalidateQueries({ queryKey: ['isolation_logs'], refetchType: 'active' });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: logs = [], isLoading } = useQuery(isolationLogsOptions);
  const { data: animals = [] } = useQuery(activeAnimalsOptions);
  const { data: staff = [] } = useQuery(staffUsersOptions);

  const filteredLogs = useMemo(() => {
    if (!searchQuery) return logs;
    const lower = searchQuery.toLowerCase();
    return logs.filter((log) => 
      ((log as any).animals?.name || '').toLowerCase().includes(lower) ||
      (log.reason || '').toLowerCase().includes(lower) ||
      (log.isolation_type || '').toLowerCase().includes(lower)
    );
  }, [logs, searchQuery]);

  // AUDIT FIX 4: Safety wrapper preventing null unwrap
  const completeIsolationMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error("Authentication required to complete isolation.");
      const { error } = await supabase.from('isolation_logs').update({ 
        end_date: new Date().toISOString(),
        modified_by: user.id 
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['isolation_logs'] }),
    onError: (err: any) => setErrorMsg(err.message || 'Failed to complete isolation period.')
  });

  // AUDIT FIX 1: Correctly use useVirtualizer attached to the localized scroll element
  const rowVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 110, 
    overscan: 5,
  });

  // AUDIT FIX 1: Window resize observer to force row recalibration on tablet rotation
  useEffect(() => {
    const handleResize = () => { rowVirtualizer.measure(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rowVirtualizer]);

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

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search logs..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-sm" 
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(225,29,72,0.15)]"
          >
            <Plus size={16} /> Log Isolation
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 p-3 rounded-xl text-rose-800 shadow-sm mx-1">
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span className="text-xs font-bold">{errorMsg}</span>
        </div>
      )}

      {/* AUDIT FIX 5: Added explicit UI warning for the 14-day memory cap limit */}
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-3 rounded-xl text-slate-600 shadow-sm mx-1">
        <Info size={16} className="text-slate-400 shrink-0" />
        <span className="text-xs font-bold">Displaying currently active quarantines and completed logs from the past 14 days.</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-18rem)] min-h-[500px]">
        {isLoading && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-sm"><Loader2 className="animate-spin text-rose-600 w-8 h-8" /></div>}
        
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10 min-w-[900px]">
          <div className="col-span-2">Status / Duration</div>
          <div className="col-span-3">Patient</div>
          <div className="col-span-5">Reason & Directives</div>
          <div className="col-span-2 text-right">Action</div>
        </div>

        <div ref={scrollParentRef} className="overflow-auto flex-1 custom-scrollbar min-w-[900px] relative">
          {filteredLogs.length === 0 && !isLoading ? (
            <div className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No isolation logs found matching query.</div>
          ) : (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {virtualItems.map((virtualRow) => {
                const log = filteredLogs[virtualRow.index];
                const isActive = !log.end_date;
                const isCompleting = completeIsolationMutation.isPending && completeIsolationMutation.variables === log.id;

                return (
                  // AUDIT FIX 1: Applied ref and data-index for dynamic element measuring
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
                            {/* AUDIT FIX 5: Defensive formatting against null strings */}
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
// TANSTACK FORM MODAL (V3 SCHEMA COMPLIANT & ASYNC SECURE)
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
      queryClient.invalidateQueries({ queryKey: ['isolation_logs'] });
    }
  });

  const form = useForm({
    defaultValues: {
      animal_id: '',
      isolation_type: 'MEDICAL_QUARANTINE',
      start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      reason: '',
      notes: '',
      authorized_by: '' // Requires UUID matching a User ID
    },
    // AUDIT FIX 3: Asynchronous submission explicitly blocking immediate unmount and data loss
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
          // AUDIT FIX 4: Explicitly required UUID
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