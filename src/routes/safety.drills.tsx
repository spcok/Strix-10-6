import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Siren, Plus, X, Search, Save, Loader2, AlertCircle, 
  WifiOff, Clock, FileText, CheckCircle2, ShieldAlert, Users
} from 'lucide-react';
import { format, parseISO, parse, formatISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { safetyDrillService } from '../services/safetyDrillService';
import { SafetyDrill } from '../types';

// ------------------------------------------------------------------
// STRICT ONLINE-ONLY QUERY OPTIONS
// ------------------------------------------------------------------
const safetyDrillsOptions = queryOptions({
  queryKey: ['safety_drills_logs'],
  queryFn: () => safetyDrillService.getDrills(),
  staleTime: 0, // AUDIT FIX 6: Aggressive stale time for compliance
  gcTime: 1000 * 60 * 5,
});

const activeTimesheetsOptions = queryOptions({
  queryKey: ['active_timesheets'],
  queryFn: () => safetyDrillService.getActiveTimesheets(),
  staleTime: 0,
  gcTime: 1000 * 60 * 5,
});

export const Route = createFileRoute('/safety/drills')({
  loader: async ({ context: { queryClient } }) => {
    // AUDIT FIX 7: Defensive Try/Catch protecting the loader block
    try {
      if (queryClient) {
        await Promise.all([
          queryClient.ensureQueryData(safetyDrillsOptions),
          queryClient.ensureQueryData(activeTimesheetsOptions)
        ]);
      }
    } catch (e) {
      console.error("Loader fetch failed. Lockout screen will intercept.");
    }
  },
  component: SafetyDrillsPage,
});

export function SafetyDrillsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rawSearch, setRawSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // AUDIT FIX 18: Strict Network Lockout
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
    const interval = setInterval(checkConnection, 60000); 

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

  // AUDIT FIX 17: Debounce search input to prevent virtualizer render thrashing
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(rawSearch); }, 300);
    return () => clearTimeout(handler);
  }, [rawSearch]);

  // AUDIT FIX 8 & 9: Secure dynamic channel mapping & active invalidation scoping
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(`safety-drills-changes-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_drills' }, () => {
        queryClient.invalidateQueries({ queryKey: ['safety_drills_logs'], refetchType: 'active' });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, user?.id]);

  const { data: drills = [], isLoading } = useQuery({ ...safetyDrillsOptions, enabled: isOnline });
  const { data: timesheets = [] } = useQuery({ ...activeTimesheetsOptions, enabled: isOnline });

  const filteredDrills = useMemo(() => {
    if (!debouncedSearch) return drills;
    const lowerQuery = debouncedSearch.toLowerCase();
    return drills.filter((drill: SafetyDrill) => 
      (drill.scenario_description || '').toLowerCase().includes(lowerQuery) ||
      (drill.drill_type || '').toLowerCase().includes(lowerQuery) ||
      (drill.areas_involved || '').toLowerCase().includes(lowerQuery)
    );
  }, [drills, debouncedSearch]);

  // AUDIT FIX 14 & 15: Localized Virtualizer with dynamic measurement scaling
  const rowVirtualizer = useVirtualizer({
    count: filteredDrills.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 180, 
    overscan: 5,
  });

  // AUDIT FIX 16: Immediate dimension recalculation on screen rotation
  useEffect(() => {
    const handleResize = () => { rowVirtualizer.measure(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rowVirtualizer]);

  // --- STRICT LOCKOUT RENDER ---
  if (!isOnline) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-32">
        <div className="bg-slate-900 text-white p-12 rounded-2xl shadow-2xl flex flex-col items-center justify-center text-center min-h-[60vh] border border-slate-800">
          <WifiOff size={64} className="mb-6 text-rose-500" />
          <h2 className="text-3xl font-black uppercase tracking-widest mb-3">Compliance Register Locked</h2>
          <p className="font-bold text-slate-400 max-w-lg text-sm leading-relaxed">
            To enforce legal audit trail integrity, this module requires an active database connection. All caches are suspended.
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
            <Siren className="text-rose-600" size={24} /> Safety & Emergency Drills
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Protocol Testing & Incident Response Logs</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search scenarios or areas..." 
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-sm" 
            />
          </div>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(225,29,72,0.15)]"
          >
            <Plus size={16} /> Log Drill/Event
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-16rem)] min-h-[500px]">
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
            <Loader2 className="animate-spin text-rose-600 w-8 h-8" />
          </div>
        )}

        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10 min-w-[900px]">
          <div className="col-span-2">Date & Status</div>
          <div className="col-span-3">Scenario Protocol</div>
          <div className="col-span-5">Performance & Observations</div>
          <div className="col-span-2 text-right">Metrics</div>
        </div>

        <div ref={scrollParentRef} className="overflow-auto flex-1 custom-scrollbar min-w-[900px] relative">
          {filteredDrills.length === 0 && !isLoading ? (
            <div className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No safety records found.</div>
          ) : (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {virtualItems.map((virtualRow) => {
                const drill = filteredDrills[virtualRow.index];
                const isLive = drill.is_simulation === false;

                return (
                  // AUDIT FIX 20: Visually isolating True Emergencies with heavy contrast hierarchy
                  <div key={drill.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className={`absolute top-0 left-0 w-full transition-colors border-b ${isLive ? 'bg-rose-50/40 border-rose-200' : 'border-slate-100 hover:bg-slate-50/60'}`} style={{ transform: `translateY(${virtualRow.start}px)` }}>
                    <div className="grid grid-cols-12 gap-4 px-6 py-5 h-full items-start">
                      
                      <div className="col-span-2 flex flex-col items-start gap-2">
                        {/* AUDIT FIX 13: Arbitrary string fallback on Date processing */}
                        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border shadow-sm ${isLive ? 'bg-rose-600 text-white border-rose-700' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {drill.drill_date ? format(parseISO(drill.drill_date), 'dd MMM yyyy') : '--'}
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                          {drill.drill_date ? format(parseISO(drill.drill_date), 'HH:mm') : '--'}
                        </div>
                        {isLive ? (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-rose-300 bg-rose-100 text-[8px] font-black uppercase tracking-widest text-rose-800 shadow-sm animate-pulse">
                            <ShieldAlert size={10} /> LIVE EMERGENCY
                          </div>
                        ) : (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-[8px] font-black uppercase tracking-widest text-blue-700">
                            <Clock size={10} /> SIMULATION
                          </div>
                        )}
                      </div>

                      <div className="col-span-3">
                        <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{drill.drill_type?.replace(/_/g, ' ')}</p>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-slate-50 text-slate-500 border-slate-200">
                          {drill.areas_involved || 'Unknown Area'}
                        </span>
                      </div>

                      <div className="col-span-5 space-y-3 pr-4">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Scenario Context</p>
                          <p className="text-xs font-bold text-slate-900 leading-snug">{drill.scenario_description}</p>
                        </div>
                        {drill.issues_observed && (
                          <div className="bg-amber-50 p-2 rounded-lg border border-amber-100">
                             <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-0.5 flex items-center gap-1"><AlertCircle size={10}/> Observations / Failures</p>
                             <p className="text-[11px] font-bold text-amber-900 leading-snug">{drill.issues_observed}</p>
                          </div>
                        )}
                        {drill.corrective_actions && (
                          <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                             <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-0.5 flex items-center gap-1"><CheckCircle2 size={10}/> Corrective Directives</p>
                             <p className="text-[11px] font-bold text-emerald-900 leading-snug">{drill.corrective_actions}</p>
                          </div>
                        )}
                      </div>

                      <div className="col-span-2 flex flex-col items-end gap-2">
                         <div className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-center min-w-[80px]">
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Duration</p>
                           <p className="text-xs font-black text-slate-700">{drill.duration_seconds ? `${Math.floor(drill.duration_seconds / 60)}m ${drill.duration_seconds % 60}s` : '--'}</p>
                         </div>
                         {drill.roll_call_completed && (
                           <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1 mt-1">
                             <CheckCircle2 size={10} /> Roll Call Verified
                           </span>
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

      {isModalOpen && <DrillModal onClose={() => setIsModalOpen(false)} activeTimesheetsCount={timesheets.length} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCHEMA-COMPLIANT TANSTACK FORM MODAL
// ---------------------------------------------------------------------------
function DrillModal({ onClose, activeTimesheetsCount }: { onClose: () => void, activeTimesheetsCount: number }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveDrillMutation = useMutation({
    mutationFn: async (payload: Partial<SafetyDrill>) => {
      await safetyDrillService.saveDrill(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety_drills_logs'], refetchType: 'active' });
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to securely commit compliance log.');
    }
  });

  const form = useForm({
    defaultValues: {
      drill_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      drill_type: 'ANIMAL_ESCAPE',
      is_simulation: true,
      scenario_description: '',
      areas_involved: '',
      duration_minutes: 0,
      duration_seconds: 0,
      roll_call_completed: false,
      issues_observed: '',
      corrective_actions: ''
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      
      try {
        if (!user?.id) throw new Error("Authentication context lost. Cannot attribute audit log.");

        // AUDIT FIX 10: Enforce strict timezone-aware local parsing to prevent offset drift
        const parsedDate = value.drill_date ? formatISO(parse(value.drill_date, "yyyy-MM-dd'T'HH:mm", new Date())) : formatISO(new Date());

        const totalDurationSeconds = (Number(value.duration_minutes) * 60) + Number(value.duration_seconds);

        // AUDIT FIX 4 & 12: Applied `created_by` attribution and sanitized empty strings to strict NULL mapping
        const payload: Partial<SafetyDrill> = {
          drill_date: parsedDate,
          drill_type: value.drill_type,
          is_simulation: value.is_simulation,
          scenario_description: value.scenario_description,
          areas_involved: value.areas_involved,
          duration_seconds: totalDurationSeconds,
          roll_call_completed: value.roll_call_completed,
          issues_observed: value.issues_observed.trim() !== '' ? value.issues_observed : null,
          corrective_actions: value.corrective_actions.trim() !== '' ? value.corrective_actions : null,
          created_by: user.id,
          status: 'COMPLETED',
          is_deleted: false
        };

        await saveDrillMutation.mutateAsync(payload);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed validation or database submission.");
      }
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans overflow-y-auto custom-scrollbar">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl relative overflow-hidden my-auto">
        
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center z-20 shrink-0">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Siren size={20} className="text-rose-600" /> Post-Incident / Drill Report
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <form id="drill-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-6">
          
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold shadow-sm flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" /> {errorMsg}
            </div>
          )}

          {/* AUDIT FIX 11: Global Exposure for form validation errors */}
          <form.Subscribe selector={(state) => state.meta.errors}>
             {(errors) => errors.length > 0 && (
               <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs font-bold flex items-center gap-2 shadow-sm">
                 <AlertCircle size={16} /> <span>Please complete all required fields.</span>
               </div>
             )}
          </form.Subscribe>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
            <form.Field name="drill_date" validators={{ onChange: ({ value }) => !value ? 'Date required' : undefined }}>
              {(field) => (
                <div>
                  <label className={labelClass}>Date & Time of Event *</label>
                  <input type="datetime-local" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>

            <form.Field name="drill_type" validators={{ onChange: ({ value }) => !value ? 'Protocol Type required' : undefined }}>
              {(field) => (
                <div>
                  <label className={labelClass}>Protocol Classification *</label>
                  <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} required>
                    <option value="ANIMAL_ESCAPE">Code Red: Animal Escape</option>
                    <option value="FIRE_EVACUATION">Code Fire: Evacuation</option>
                    <option value="MEDICAL_EMERGENCY">Code Blue: Medical Emergency</option>
                    <option value="INTRUDER">Code Black: Intruder / Lockdown</option>
                    <option value="SEVERE_WEATHER">Severe Weather Protocol</option>
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="is_simulation">
              {(field) => (
                <div className="md:col-span-2">
                  <label className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors shadow-sm">
                    <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 bg-white" />
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                        Simulated Drill Event
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 mt-0.5">Uncheck this if this was a true, live emergency response.</span>
                    </div>
                  </label>
                </div>
              )}
            </form.Field>
          </div>

          <div className="space-y-5">
            <form.Field name="scenario_description" validators={{ onChange: ({ value }) => !value.trim() ? 'Description required' : undefined }}>
              {(field) => (
                <div>
                  <label className={labelClass}>Event Narrative / Scenario Description *</label>
                  <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} className={`${inputClass} resize-none h-24`} placeholder="Outline the scenario execution..." />
                </div>
              )}
            </form.Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <form.Field name="areas_involved" validators={{ onChange: ({ value }) => !value.trim() ? 'Areas required' : undefined }}>
                {(field) => (
                  <div>
                    <label className={labelClass}>Zones / Areas Involved *</label>
                    <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. Aviary B, Public Walkway" className={inputClass} />
                  </div>
                )}
              </form.Field>

              <div className="flex gap-3">
                <form.Field name="duration_minutes">
                  {(field) => (
                    <div className="flex-1">
                      <label className={labelClass}>Duration (Mins)</label>
                      <input type="number" min="0" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                    </div>
                  )}
                </form.Field>
                <form.Field name="duration_seconds">
                  {(field) => (
                    <div className="flex-1">
                      <label className={labelClass}>(Secs)</label>
                      <input type="number" min="0" max="59" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                    </div>
                  )}
                </form.Field>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm space-y-5">
              <div className="flex justify-between items-center">
                 <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><FileText size={16}/> After-Action Review</h3>
                 
                 {/* AUDIT FIX 19: Operational Integration of Clocked-In timesheets for roll-call auditing */}
                 <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-lg">
                    <Users size={12} className="text-blue-600"/>
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{activeTimesheetsCount} Staff Clocked In</span>
                 </div>
              </div>

              <form.Field name="roll_call_completed">
                {(field) => (
                  <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors shadow-sm">
                    <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 bg-white" />
                    <span className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">Roll Call Completed & 100% Verified</span>
                  </label>
                )}
              </form.Field>

              <form.Field name="issues_observed">
                {(field) => (
                  <div>
                    <label className={labelClass}>Observations / Points of Failure</label>
                    <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} border-amber-200 focus:border-amber-500 focus:ring-amber-500/20 resize-none h-16`} placeholder="E.g., North gate radio communication failed..." />
                  </div>
                )}
              </form.Field>

              <form.Field name="corrective_actions">
                {(field) => (
                  <div>
                    <label className={labelClass}>Corrective Actions & Policy Updates</label>
                    <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20 resize-none h-16`} placeholder="E.g., Replace batteries in Zone 3 radios..." />
                  </div>
                )}
              </form.Field>
            </div>
          </div>

        </form>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 z-20 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button 
                type="submit" 
                form="drill-form" 
                disabled={!canSubmit || isSubmitting as boolean || saveDrillMutation.isPending} 
                className="px-8 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
              >
                {(isSubmitting || saveDrillMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                Commit Compliance Log
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}