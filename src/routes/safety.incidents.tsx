import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TriangleAlert, Plus, X, Search, CheckCircle2, ShieldAlert, Loader2, AlertCircle, WifiOff, HeartPulse } from 'lucide-react';
import { format, parseISO, parse, formatISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { incidentService, IncidentSummary } from '../services/incidentService';
import { firstAidService, StaffMember } from '../services/firstAidService';

// ------------------------------------------------------------------
// ONLINE-ONLY QUERY OPTIONS
// ------------------------------------------------------------------
const incidentsOptions = queryOptions({
  queryKey: ['incidents_logs'],
  queryFn: () => incidentService.getIncidents(),
  staleTime: 0,
  gcTime: 1000 * 60 * 5,
});

const staffMembersOptions = queryOptions({
  queryKey: ['staff_members'],
  queryFn: () => firstAidService.getStaffMembers(),
  staleTime: 0,
  gcTime: 1000 * 60 * 5,
});

export const Route = createFileRoute('/safety/incidents')({
  loader: async ({ context: { queryClient } }) => {
    // AUDIT FIX 1: Defensive loader blocks
    try {
      if (queryClient) {
        await Promise.all([
          queryClient.ensureQueryData(incidentsOptions),
          queryClient.ensureQueryData(staffMembersOptions)
        ]);
      }
    } catch (e) {
      console.error("Loader failed, deferring to Lockout Engine");
    }
  },
  component: IncidentsPage,
});

export function IncidentsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [resolvingIncidentId, setResolvingIncidentId] = useState<string | null>(null);
  
  const [rawSearch, setRawSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // AUDIT FIX 2: Strict Network Lockout
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

  // AUDIT FIX 16: Debounced Search Input
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(rawSearch); }, 300);
    return () => clearTimeout(handler);
  }, [rawSearch]);

  // AUDIT FIX 9: Reinstated Real-time Subscription Channel
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(`incidents-changes-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => {
        // AUDIT FIX 10: Strict Refetch Typing
        queryClient.invalidateQueries({ queryKey: ['incidents_logs'], refetchType: 'active' });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, user?.id]);

  const { data: logs = [], isLoading } = useQuery({ ...incidentsOptions, enabled: isOnline });
  const { data: staffMembers = [] } = useQuery({ ...staffMembersOptions, enabled: isOnline });

  const filteredLogs = useMemo(() => {
    if (!debouncedSearch) return logs;
    const lowerQuery = debouncedSearch.toLowerCase();
    return logs.filter((log: IncidentSummary) => 
      (log.title || '').toLowerCase().includes(lowerQuery) ||
      (log.description || '').toLowerCase().includes(lowerQuery) ||
      (log.incident_type || '').toLowerCase().includes(lowerQuery)
    );
  }, [logs, debouncedSearch]);

  // AUDIT FIX 17: Local Virtualizer with strict measure properties
  const rowVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 180, 
    overscan: 5,
  });

  useEffect(() => {
    const handleResize = () => { rowVirtualizer.measure(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rowVirtualizer]);

  if (!isOnline) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-32">
        <div className="bg-slate-900 text-white p-12 rounded-2xl shadow-2xl flex flex-col items-center justify-center text-center min-h-[60vh] border border-slate-800">
          <WifiOff size={64} className="mb-6 text-amber-500" />
          <h2 className="text-3xl font-black uppercase tracking-widest mb-3">Compliance Register Locked</h2>
          <p className="font-bold text-slate-400 max-w-lg text-sm leading-relaxed">
            To enforce legal audit trail integrity, this module requires an active database connection. All caches are suspended.
          </p>
          <div className="mt-8 px-6 py-3 bg-slate-800 rounded-xl text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-3 border border-slate-700">
            <Loader2 size={16} className="animate-spin text-amber-500" /> Securing connection...
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
            <TriangleAlert className="text-amber-600" size={24} /> Operational Incidents
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Health, Safety & Critical Event Logging</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search incidents..." 
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-sm" 
            />
          </div>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(245,158,11,0.15)]"
          >
            <Plus size={16} /> Log Incident
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-16rem)] min-h-[500px]">
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
            <Loader2 className="animate-spin text-amber-600 w-8 h-8" />
          </div>
        )}

        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10 min-w-[900px]">
          <div className="col-span-2">Date & Risk Level</div>
          <div className="col-span-8">Description & Actions</div>
          <div className="col-span-2 text-right">Status</div>
        </div>

        <div ref={scrollParentRef} className="overflow-auto flex-1 custom-scrollbar min-w-[900px] relative">
          {filteredLogs.length === 0 && !isLoading ? (
            <div className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No operational incidents found.</div>
          ) : (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {virtualItems.map((virtualRow) => {
                const log = filteredLogs[virtualRow.index];
                const isOpen = log.status !== 'CLOSED';

                return (
                  <div key={log.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className={`absolute top-0 left-0 w-full transition-colors border-b border-slate-100 ${isOpen ? 'bg-amber-50/10' : 'hover:bg-slate-50/60'}`} style={{ transform: `translateY(${virtualRow.start}px)` }}>
                    <div className="grid grid-cols-12 gap-4 px-6 py-6 h-full">
                      
                      <div className="col-span-2 flex flex-col items-start gap-1">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-black uppercase tracking-widest text-slate-600">
                          {log.incident_date ? format(parseISO(log.incident_date), 'dd MMM yyyy') : '--'}
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                          {log.incident_date ? format(parseISO(log.incident_date), 'HH:mm') : '--'}
                        </div>
                        
                        <div className={`mt-3 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shadow-sm ${
                          log.severity === 'CRITICAL' ? 'bg-rose-600 text-white border-rose-700' :
                          log.severity === 'HIGH' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                          log.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                          'bg-emerald-100 text-emerald-700 border-emerald-200'
                        }`}>
                          Risk: {log.severity}
                        </div>
                      </div>

                      <div className="col-span-8 pr-6 space-y-3">
                        <div>
                           <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">{log.title}</h3>
                           <span className="inline-block mt-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-slate-50 text-slate-500 border-slate-200">
                             {log.incident_type?.replace(/_/g, ' ')}
                           </span>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Narrative Description</p>
                          <p className="text-xs font-bold text-slate-900 leading-snug whitespace-pre-wrap">{log.description}</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {log.immediate_action_taken && (
                             <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                                <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-0.5 flex items-center gap-1"><ShieldAlert size={10}/> Initial Containment</p>
                                <p className="text-[11px] font-bold text-slate-800 leading-snug">{log.immediate_action_taken}</p>
                             </div>
                           )}
                           {log.resolution_notes && (
                             <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-0.5 flex items-center gap-1"><CheckCircle2 size={10}/> Resolution Action</p>
                                <p className="text-[11px] font-bold text-slate-800 leading-snug">{log.resolution_notes}</p>
                             </div>
                           )}
                        </div>
                      </div>

                      <div className="col-span-2 flex flex-col justify-start items-end gap-2">
                        {isOpen ? (
                          <>
                            <span className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 border border-amber-200 shadow-sm flex items-center gap-1.5">
                              <AlertCircle size={12} /> OPEN ACTION
                            </span>
                            <button onClick={() => setResolvingIncidentId(log.id)} className="mt-2 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors">
                              Mark Resolved
                            </button>
                          </>
                        ) : (
                          <span className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 border border-slate-200">
                            RESOLVED
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

      {isModalOpen && <CompoundIncidentModal onClose={() => setIsModalOpen(false)} staffMembers={staffMembers} />}
      {resolvingIncidentId && <ResolutionModal incidentId={resolvingIncidentId} onClose={() => setResolvingIncidentId(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COMPOUND FORM MODAL (STRICT VALIDATION)
// ---------------------------------------------------------------------------
function CompoundIncidentModal({ onClose, staffMembers }: { onClose: () => void, staffMembers: StaffMember[] }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveCompoundMutation = useMutation({
    mutationFn: async ({ incident, firstAid }: { incident: any, firstAid?: any }) => {
      await incidentService.commitIncident(incident, firstAid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents_logs'], refetchType: 'active' });
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to securely commit operational log.');
    }
  });

  const form = useForm({
    defaultValues: {
      incident_title: '',
      incident_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      incident_type: 'INFRASTRUCTURE',
      severity: 'LOW',
      incident_description: '',
      immediate_action_taken: '',
      requires_first_aid: false,
      person_type: 'KEEPER',
      person_involved_name: '',
      injury_description: '',
      treatment_provided: '',
      administered_by: user?.id || '',
      referral_needed: false,
      referral_details: ''
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      
      try {
        if (!user?.id) throw new Error("Authentication required to log incident.");

        // AUDIT FIX 7: Safe local parsing
        const parsedDate = value.incident_date ? formatISO(parse(value.incident_date, "yyyy-MM-dd'T'HH:mm", new Date())) : formatISO(new Date());

        // AUDIT FIX 8 & 14: Scrubbing empty strings to explicit NULLs
        const incidentPayload = {
          title: value.incident_title, 
          incident_date: parsedDate, 
          incident_type: value.incident_type, 
          severity: value.severity, 
          description: value.incident_description,
          reported_by: user.id,
          created_by: user.id,
          immediate_action_taken: value.immediate_action_taken.trim() !== '' ? value.immediate_action_taken : null,
        };

        let firstAidPayload = undefined;
        if (value.requires_first_aid) {
           const needsReferral = value.referral_needed;
           firstAidPayload = {
             person_involved_name: value.person_involved_name, 
             incident_date: parsedDate, 
             person_type: value.person_type, 
             treatment_provided: value.treatment_provided, 
             administered_by: value.administered_by,
             created_by: user.id,
             injury_description: value.injury_description.trim() !== '' ? value.injury_description : null,
             referral_needed: needsReferral,
             referral_details: (needsReferral && value.referral_details.trim() !== '') ? value.referral_details : null,
           };
        }

        await saveCompoundMutation.mutateAsync({ incident: incidentPayload, firstAid: firstAidPayload });
      } catch (err: any) {
        setErrorMsg(err.message || "Failed validation or database submission.");
      }
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans overflow-y-auto custom-scrollbar">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl relative overflow-hidden my-auto">
        
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center z-20 shrink-0">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <TriangleAlert size={20} className="text-amber-600" /> Log Operational Incident
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <form id="incident-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-6">
          
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs font-bold shadow-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" /> {errorMsg}
            </div>
          )}

          {/* AUDIT FIX 13: Global Exposure for form validation errors */}
          <form.Subscribe selector={(state) => state.meta.errors}>
             {(errors) => errors.length > 0 && (
               <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-bold flex gap-2 shadow-sm">
                 <AlertCircle size={16} className="shrink-0" /> <span>Please correct the missing required fields below.</span>
               </div>
             )}
          </form.Subscribe>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
            <form.Field name="incident_title" validators={{ onChange: ({ value }) => !value.trim() ? 'Title Required' : undefined }}>
              {(field) => (
                <div className="md:col-span-2">
                  <label className={labelClass}>Incident Title *</label>
                  <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g., Eagle Owl Escaped Enclosure" className={inputClass} />
                </div>
              )}
            </form.Field>

            <form.Field name="incident_date" validators={{ onChange: ({ value }) => !value ? 'Date Required' : undefined }}>
              {(field) => (
                <div>
                  <label className={labelClass}>Date & Time of Discovery *</label>
                  <input type="datetime-local" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>

            <form.Field name="incident_type" validators={{ onChange: ({ value }) => !value ? 'Type Required' : undefined }}>
              {(field) => (
                <div>
                  <label className={labelClass}>Classification *</label>
                  <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} required>
                    <option value="ANIMAL_BEHAVIOR">Animal Attack / Strike</option>
                    <option value="ESCAPE">Animal Escape</option>
                    <option value="INFRASTRUCTURE">Facility Failure / Equipment</option>
                    <option value="SLIP_TRIP_FALL">Slip, Trip, or Fall</option>
                    <option value="OTHER">Other Operational Breach</option>
                  </select>
                </div>
              )}
            </form.Field>
          </div>

          <div className="space-y-5">
            <form.Field name="severity" validators={{ onChange: ({ value }) => !value ? 'Severity Required' : undefined }}>
              {(field) => (
                <div>
                  <label className={labelClass}>Severity Matrix *</label>
                  <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} required>
                    <option value="LOW">LOW - Minor disruption / No critical risk</option>
                    <option value="MEDIUM">MEDIUM - Controlled breach / Requires repair</option>
                    <option value="HIGH">HIGH - Severe incident / Major structural failure</option>
                    <option value="CRITICAL">CRITICAL - Emergency protocols / Loss of life risk</option>
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="incident_description" validators={{ onChange: ({ value }) => !value.trim() ? 'Description Required' : undefined }}>
              {(field) => (
                <div>
                  <label className={labelClass}>Detailed Event Narrative *</label>
                  <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} className={`${inputClass} resize-none h-24`} placeholder="E.g., Found front padlock sheared off, bird absent from primary weathering..." />
                </div>
              )}
            </form.Field>

            <form.Field name="immediate_action_taken">
              {(field) => (
                <div>
                  <label className={labelClass}>Immediate Actions Taken to Secure Site</label>
                  <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none h-16`} placeholder="E.g., Locked outer gates, informed curator." />
                </div>
              )}
            </form.Field>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <form.Field name="requires_first_aid">
              {(field) => (
                <label className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors shadow-sm">
                  <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.checked)} className="w-5 h-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 bg-white" />
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-emerald-800 uppercase tracking-widest flex items-center gap-2">
                      <HeartPulse size={16} /> Link Clinical First Aid Report
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 mt-0.5">Check this if a keeper, public member, or contractor was injured during this incident.</span>
                  </div>
                </label>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => state.values.requires_first_aid}>
              {(requiresFirstAid) => requiresFirstAid && (
                <div className="mt-4 p-5 bg-white border-2 border-emerald-200 rounded-2xl shadow-sm space-y-5 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Medical Log Attachment</h3>
                  </div>

                  {/* AUDIT FIX 12: Conditional Field Required constraints */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <form.Field name="person_type" validators={{ onChange: ({ value }) => !value ? 'Required' : undefined }}>
                      {(field) => (
                        <div>
                          <label className={labelClass}>Patient Category *</label>
                          <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} border-emerald-200 focus:border-emerald-500`} required>
                            <option value="KEEPER">Staff / Keeper</option>
                            <option value="PUBLIC">Public / Visitor</option>
                            <option value="CONTRACTOR">Contractor</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="person_involved_name" validators={{ onChange: ({ value }) => !value.trim() ? 'Name Required' : undefined }}>
                      {(field) => (
                        <div>
                          <label className={labelClass}>Patient Full Name *</label>
                          <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. John Doe" className={`${inputClass} border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20`} />
                        </div>
                      )}
                    </form.Field>
                  </div>

                  <form.Field name="injury_description" validators={{ onChange: ({ value }) => !value.trim() ? 'Description Required' : undefined }}>
                    {(field) => (
                      <div>
                        <label className={labelClass}>Nature of Injury / Symptoms *</label>
                        <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20 resize-none h-16`} placeholder="E.g., Talons struck left shoulder." />
                      </div>
                    )}
                  </form.Field>

                  <form.Field name="treatment_provided" validators={{ onChange: ({ value }) => !value.trim() ? 'Treatment Required' : undefined }}>
                    {(field) => (
                      <div>
                        <label className={labelClass}>Treatment Administered *</label>
                        <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20 resize-none h-16`} placeholder="E.g., Cleaned wound, bandaged." />
                      </div>
                    )}
                  </form.Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                    <form.Field name="administered_by" validators={{ onChange: ({ value }) => !value ? 'Authorizer Required' : undefined }}>
                      {(field) => (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                          <label className={`${labelClass} text-emerald-700`}><UserCircle size={14} className="inline mr-1 mb-0.5" /> Attending First Aider *</label>
                          <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} required className={inputClass}>
                            <option value="">-- Select First Aider --</option>
                            {staffMembers.map((staff: StaffMember) => (
                              <option key={staff.id} value={staff.id}>
                                {staff.name || staff.email} {staff.initials ? `(${staff.initials})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </form.Field>

                    <div className="space-y-4">
                      <form.Field name="referral_needed">
                        {(field) => (
                          <label className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl cursor-pointer hover:bg-rose-100 transition-colors shadow-sm">
                            <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.checked)} className="w-5 h-5 rounded border-rose-300 text-rose-600 focus:ring-rose-500 bg-white" />
                            <span className="text-xs font-black text-rose-800 uppercase tracking-widest flex items-center gap-2"><Ambulance size={16} /> External Medical Care</span>
                          </label>
                        )}
                      </form.Field>

                      <form.Subscribe selector={(state) => state.values.referral_needed}>
                        {(referralNeeded) => referralNeeded && (
                          <form.Field name="referral_details" validators={{ onChange: ({ value }) => !value.trim() ? 'Details Required' : undefined }}>
                            {(field) => (
                              <div className="animate-in fade-in slide-in-from-top-2">
                                <label className={labelClass}>Hospital / Paramedic Details *</label>
                                <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="E.g., Ambulance called..." className={`${inputClass} border-rose-200 focus:border-rose-500 focus:ring-rose-500/20`} />
                              </div>
                            )}
                          </form.Field>
                        )}
                      </form.Subscribe>
                    </div>
                  </div>

                </div>
              )}
            </form.Subscribe>
          </div>

        </form>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 z-20 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button 
                type="submit" 
                form="incident-form" 
                disabled={!canSubmit || isSubmitting as boolean || saveCompoundMutation.isPending} 
                className="px-8 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
              >
                {(isSubmitting || saveCompoundMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                Commit Incident
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RESOLUTION MODAL
// ---------------------------------------------------------------------------
function ResolutionModal({ incidentId, onClose }: { incidentId: string, onClose: () => void }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  
  // AUDIT FIX 3: Global exposure of resolution error states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resolveMutation = useMutation({
    mutationFn: async () => {
      await incidentService.resolveIncident(incidentId, notes);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents_logs'], refetchType: 'active' });
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to update database resolution status.');
    }
  });

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        
        <div className="bg-emerald-50 border-b border-emerald-100 p-5 flex justify-between items-center">
          <h2 className="text-base font-black text-emerald-800 uppercase tracking-tight flex items-center gap-2">
            <CheckCircle2 size={18} /> Resolve Incident
          </h2>
          <button onClick={onClose} className="text-emerald-400 hover:text-emerald-700 transition-colors"><X size={20} /></button>
        </div>

        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-bold flex items-start gap-2 shadow-sm">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> {errorMsg}
            </div>
          )}

          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Resolution Action Notes *</label>
          <textarea 
            required 
            value={notes} 
            onChange={(e) => setNotes(e.target.value)} 
            rows={4} 
            placeholder="Document exactly what was done to secure the facility and close this incident..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-sm resize-none"
          />
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          <button 
            onClick={() => resolveMutation.mutate()} 
            disabled={!notes.trim() || resolveMutation.isPending}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center gap-2"
          >
            {resolveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Close Incident
          </button>
        </div>

      </div>
    </div>
  );
}