import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { BriefcaseMedical, Plus, X, Search, Activity, Save, Loader2, UserCircle, Ambulance, AlertTriangle, WifiOff, FileText } from 'lucide-react';
import { format, parseISO, formatISO, parse } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { firstAidService, StaffMember } from '../services/firstAidService';

// ------------------------------------------------------------------
// 1. STRICT ONLINE-ONLY QUERY OPTIONS
// ------------------------------------------------------------------
const firstAidLogsOptions = queryOptions({
  queryKey: ['first_aid_logs'],
  queryFn: () => firstAidService.getFirstAidLogs(),
  staleTime: 0,
  gcTime: 1000 * 60 * 5,
});

const staffMembersOptions = queryOptions({
  queryKey: ['staff_members'],
  queryFn: () => firstAidService.getStaffMembers(),
  staleTime: 0,
  gcTime: 1000 * 60 * 5,
});

// ------------------------------------------------------------------
// 2. ROUTE CONFIGURATION
// ------------------------------------------------------------------
export const Route = createFileRoute('/safety/first-aid')({
  loader: async ({ context: { queryClient } }) => {
    // AUDIT FIX 8: Defensive Try/Catch protecting the loader block
    try {
      if (queryClient) {
        await Promise.all([
          queryClient.ensureQueryData(firstAidLogsOptions),
          queryClient.ensureQueryData(staffMembersOptions)
        ]);
      }
    } catch (e) {
      console.error("Loader fetch failed. Lockout screen will catch it.");
    }
  },
  component: FirstAidPage,
});

// ------------------------------------------------------------------
// 3. MAIN COMPONENT
// ------------------------------------------------------------------
export function FirstAidPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rawSearch, setRawSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // AUDIT FIX 7 & 10: Strict Online-Only Heartbeat (60s interval)
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

  // AUDIT FIX 11: Debounce the search input to prevent virtualizer render thrashing
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(rawSearch); }, 300);
    return () => clearTimeout(handler);
  }, [rawSearch]);

  // AUDIT FIX 5 & 13: Parameterize channel name and restrict invalidations to active queries
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(`first-aid-db-changes-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'first_aid_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['first_aid_logs'], refetchType: 'active' });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, user?.id]);

  const { data: logs = [], isLoading } = useQuery({ ...firstAidLogsOptions, enabled: isOnline });
  const { data: staffMembers = [] } = useQuery({ ...staffMembersOptions, enabled: isOnline });

  const staffMap = useMemo(() => new Map(staffMembers.map((s: StaffMember) => [s.id, s])), [staffMembers]);

  const filteredLogs = useMemo(() => {
    if (!debouncedSearch) return logs;
    const lowerQuery = debouncedSearch.toLowerCase();
    return logs.filter((log: any) => 
      (log.person_involved_name || '').toLowerCase().includes(lowerQuery) ||
      (log.treatment_provided || '').toLowerCase().includes(lowerQuery)
    );
  }, [logs, debouncedSearch]);

  // AUDIT FIX 9 & 10: Swapped to local useVirtualizer with strict height estimates
  const rowVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 140, 
    overscan: 5,
  });

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
          <WifiOff size={64} className="mb-6 text-emerald-500" />
          <h2 className="text-3xl font-black uppercase tracking-widest mb-3">Safety Register Locked</h2>
          <p className="font-bold text-slate-400 max-w-lg text-sm leading-relaxed">
            To enforce legal audit trail integrity, this module requires an active database connection. All caches are suspended.
          </p>
          <div className="mt-8 px-6 py-3 bg-slate-800 rounded-xl text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-3 border border-slate-700">
            <Loader2 size={16} className="animate-spin text-emerald-500" /> Securing connection...
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
            <BriefcaseMedical className="text-emerald-600" size={24} /> First Aid Register
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Clinical Administration & Treatment Logging</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search patient or treatment..." 
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-sm" 
            />
          </div>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.15)]"
          >
            <Plus size={16} /> Log Treatment
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-16rem)] min-h-[500px]">
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-600 w-8 h-8" />
          </div>
        )}

        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10 min-w-[900px]">
          <div className="col-span-2">Date & Time</div>
          <div className="col-span-3">Patient Details</div>
          <div className="col-span-5">Clinical Description & Action</div>
          <div className="col-span-2 text-right">Attending Aider</div>
        </div>

        <div ref={scrollParentRef} className="overflow-auto flex-1 custom-scrollbar min-w-[900px] relative">
          {filteredLogs.length === 0 && !isLoading ? (
            <div className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No first aid logs found matching query.</div>
          ) : (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {virtualItems.map((virtualRow) => {
                const log = filteredLogs[virtualRow.index];
                const staff = staffMap.get(log.administered_by);

                return (
                  // AUDIT FIX 17: Accordion layout allows multi-line text to wrap seamlessly without line-clamping truncation
                  <div key={log.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="absolute top-0 left-0 w-full transition-colors border-b border-slate-100 hover:bg-slate-50/60" style={{ transform: `translateY(${virtualRow.start}px)` }}>
                    <div className="grid grid-cols-12 gap-4 px-6 py-5 h-full">
                      
                      <div className="col-span-2 flex flex-col items-start gap-1">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-black uppercase tracking-widest text-slate-600">
                          {log.incident_date ? format(parseISO(log.incident_date), 'dd MMM yyyy') : '--'}
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                          {log.incident_date ? format(parseISO(log.incident_date), 'HH:mm') : '--'}
                        </div>
                        {log.incident_id && (
                          <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-[8px] font-black uppercase tracking-widest text-amber-700 shadow-sm">
                            <AlertTriangle size={10} /> Esc
                          </div>
                        )}
                      </div>

                      <div className="col-span-3">
                        <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{log.person_involved_name}</p>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-emerald-50 text-emerald-700 border-emerald-200">
                          {log.person_type}
                        </span>
                        {log.referral_needed && (
                          <span className="inline-block mt-1 ml-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-rose-50 text-rose-700 border-rose-200">
                            HOSPITAL
                          </span>
                        )}
                      </div>

                      <div className="col-span-5 space-y-2 pr-4">
                        {log.injury_description && (
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Injury / Symptoms</p>
                            <p className="text-xs font-bold text-slate-900 leading-snug">{log.injury_description}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Treatment Provided</p>
                          <p className="text-[11px] font-medium text-slate-700 leading-snug whitespace-pre-wrap">{log.treatment_provided}</p>
                        </div>
                        {log.referral_details && (
                          <div className="mt-2 bg-rose-50 p-2 rounded-lg border border-rose-100">
                             <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-0.5 flex items-center gap-1"><Ambulance size={10}/> External Care Details</p>
                             <p className="text-[10px] font-bold text-rose-900">{log.referral_details}</p>
                          </div>
                        )}
                      </div>

                      <div className="col-span-2 flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-2 text-[10px] font-black text-emerald-700 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded border border-emerald-100 shadow-sm">
                          <UserCircle size={14} /> 
                          {staff?.name || 'Unknown'} {staff?.initials ? `(${staff.initials})` : ''}
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isModalOpen && <FirstAidModal onClose={() => setIsModalOpen(false)} staffMembers={staffMembers} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCHEMA-COMPLIANT TANSTACK FORM MODAL
// ---------------------------------------------------------------------------
function FirstAidModal({ onClose, staffMembers }: { onClose: () => void, staffMembers: StaffMember[] }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveCompoundMutation = useMutation({
    mutationFn: async ({ firstAid, incident }: { firstAid: any, incident?: any }) => {
      await firstAidService.commitFirstAidLog(firstAid, incident);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['first_aid_logs'] });
      // AUDIT FIX 18: Move onClose here so we don't close the modal if the background request fails
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to securely commit medical log.');
    }
  });

  const form = useForm({
    defaultValues: {
      incident_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      person_type: 'KEEPER',
      person_involved_name: '',
      injury_description: '',
      treatment_provided: '',
      administered_by: user?.id || '',
      referral_needed: false,
      referral_details: '',
      escalate_to_incident: false,
      incident_title: '',
      incident_type: 'ANIMAL_BEHAVIOR',
      severity: 'LOW',
      incident_description: '',
      immediate_action_taken: ''
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      
      try {
        if (!user?.id) throw new Error("Authentication required.");

        // AUDIT FIX 13: Local timezone fix. Force strict local parsing.
        const parsedDate = value.incident_date ? formatISO(parse(value.incident_date, "yyyy-MM-dd'T'HH:mm", new Date())) : formatISO(new Date());

        // AUDIT FIX 19: Unsanitized Form State Leaks. 
        // Only submit child properties if their parent boolean is active.
        const isEscalated = value.escalate_to_incident;
        const needsReferral = value.referral_needed;

        // SCHEMA NULL COMPLIANCE: If column is YES NULL, scrub empty strings to null.
        const firstAidPayload = {
          person_involved_name: value.person_involved_name, 
          incident_date: parsedDate, 
          person_type: value.person_type, 
          treatment_provided: value.treatment_provided, 
          administered_by: value.administered_by,
          created_by: user.id,
          // Scrubbing to NULL for schema compatibility
          injury_description: value.injury_description.trim() !== '' ? value.injury_description : null,
          referral_needed: needsReferral,
          referral_details: (needsReferral && value.referral_details.trim() !== '') ? value.referral_details : null,
        };

        const incidentPayload = isEscalated ? {
          title: value.incident_title, 
          incident_date: parsedDate, 
          incident_type: value.incident_type, 
          severity: value.severity, 
          description: value.incident_description, 
          created_by: user.id,
          reported_by: user.id,
          // Scrubbing to NULL for schema compatibility
          immediate_action_taken: value.immediate_action_taken.trim() !== '' ? value.immediate_action_taken : null,
        } : undefined;

        await saveCompoundMutation.mutateAsync({ firstAid: firstAidPayload, incident: incidentPayload });
      } catch (err: any) {
        setErrorMsg(err.message || "Failed validation or database submission.");
      }
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans overflow-y-auto custom-scrollbar">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl relative overflow-hidden my-auto">
        
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center z-20 shrink-0">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <BriefcaseMedical size={20} className="text-emerald-600" /> Clinical Assessment
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <form id="compound-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-6">
          
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs font-bold shadow-sm">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {errorMsg}
            </div>
          )}

          {/* AUDIT FIX 12: Exposed TanStack Form validation errors globally */}
          <form.Subscribe selector={(state) => state.meta.errors}>
             {(errors) => errors.length > 0 && (
               <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs font-bold flex gap-2">
                 <AlertCircle size={16} /> <span>Please complete all required fields.</span>
               </div>
             )}
          </form.Subscribe>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
            <form.Field name="incident_date" validators={{ onChange: ({ value }) => !value ? 'Required' : undefined }}>
              {(field) => (
                <div>
                  <label className={labelClass}>Date & Time of Treatment *</label>
                  <input type="datetime-local" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>

            <form.Field name="person_type" validators={{ onChange: ({ value }) => !value ? 'Required' : undefined }}>
              {(field) => (
                <div>
                  <label className={labelClass}>Patient Category *</label>
                  <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} required>
                    <option value="KEEPER">Staff / Keeper</option>
                    <option value="PUBLIC">Public / Visitor</option>
                    <option value="CONTRACTOR">Contractor</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="person_involved_name" validators={{ onChange: ({ value }) => !value.trim() ? 'Name required' : undefined }}>
              {(field) => (
                <div className="md:col-span-2">
                  <label className={labelClass}>Patient Full Name *</label>
                  <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. John Doe" className={inputClass} />
                </div>
              )}
            </form.Field>
          </div>

          <div className="space-y-5">
            <form.Field name="injury_description">
              {(field) => (
                <div>
                  <label className={labelClass}>Nature of Injury / Symptoms</label>
                  <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none h-20`} placeholder="E.g., Laceration on left index finger, approx 2cm long..." />
                </div>
              )}
            </form.Field>
            
            <form.Field name="treatment_provided" validators={{ onChange: ({ value }) => !value.trim() ? 'Treatment details required' : undefined }}>
              {(field) => (
                <div>
                  <label className={`${labelClass} flex items-center gap-2`}><Activity size={14} className="text-emerald-600" /> Treatment Administered & Kit Usage *</label>
                  <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} className={`${inputClass} resize-none h-24 bg-emerald-50/30 border-emerald-200 focus:border-emerald-500`} placeholder="E.g., Cleaned wound with sterile wipe, applied plaster. Patient rested for 10 mins..." />
                </div>
              )}
            </form.Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-4 border-t border-slate-100">
            <form.Field name="administered_by" validators={{ onChange: ({ value }) => !value ? 'Authorizer required' : undefined }}>
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
                    <span className="text-xs font-black text-rose-800 uppercase tracking-widest flex items-center gap-2"><Ambulance size={16} /> External Medical Care Required</span>
                  </label>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.referral_needed}>
                {(referralNeeded) => referralNeeded && (
                  // AUDIT FIX 16: Dynamic Field validation tied to condition
                  <form.Field name="referral_details" validators={{ onChange: ({ value }) => !value.trim() ? 'Hospital details required' : undefined }}>
                    {(field) => (
                      <div className="animate-in fade-in slide-in-from-top-2">
                        <label className={labelClass}>Hospital / Paramedic Details *</label>
                        <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="E.g., Ambulance called at 14:30..." className={`${inputClass} border-rose-200 focus:border-rose-500 focus:ring-rose-500/20`} />
                      </div>
                    )}
                  </form.Field>
                )}
              </form.Subscribe>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <form.Field name="escalate_to_incident">
              {(field) => (
                <label className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors shadow-sm">
                  <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.checked)} className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 bg-white" />
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-2">
                      <AlertTriangle size={16} /> Escalate to Critical Incident
                    </span>
                    <span className="text-[10px] font-bold text-amber-600 mt-0.5">Check this if the injury resulted from an animal attack, facility breach, or compliance failure.</span>
                  </div>
                </label>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => state.values.escalate_to_incident}>
              {(escalate) => escalate && (
                <div className="mt-4 p-5 bg-white border-2 border-amber-200 rounded-2xl shadow-sm space-y-5 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Linked Incident Report</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <form.Field name="incident_title" validators={{ onChange: ({ value }) => !value.trim() ? 'Title required' : undefined }}>
                      {(field) => (
                        <div className="md:col-span-2">
                          <label className={labelClass}>Incident Title *</label>
                          <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g., European Eagle Owl Strike in Aviary B" className={`${inputClass} border-amber-200 focus:border-amber-500 focus:ring-amber-500/20`} />
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="incident_type" validators={{ onChange: ({ value }) => !value ? 'Required' : undefined }}>
                      {(field) => (
                        <div>
                          <label className={labelClass}>Incident Classification *</label>
                          <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} border-amber-200 focus:border-amber-500`} required>
                            <option value="ANIMAL_BEHAVIOR">Animal Attack / Strike</option>
                            <option value="ESCAPE">Animal Escape</option>
                            <option value="INFRASTRUCTURE">Facility Failure / Equipment</option>
                            <option value="SLIP_TRIP_FALL">Slip, Trip, or Fall</option>
                            <option value="OTHER">Other Operational Breach</option>
                          </select>
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="severity" validators={{ onChange: ({ value }) => !value ? 'Required' : undefined }}>
                      {(field) => (
                        <div>
                          <label className={labelClass}>Severity Matrix *</label>
                          <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} border-amber-200 focus:border-amber-500`} required>
                            <option value="LOW">LOW - Minor disruption</option>
                            <option value="MEDIUM">MEDIUM - Controlled breach</option>
                            <option value="HIGH">HIGH - Severe incident</option>
                            <option value="CRITICAL">CRITICAL - Emergency protocols initiated</option>
                          </select>
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="incident_description" validators={{ onChange: ({ value }) => !value.trim() ? 'Required' : undefined }}>
                      {(field) => (
                        <div className="md:col-span-2">
                          <label className={labelClass}>Detailed Event Description *</label>
                          <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} className={`${inputClass} border-amber-200 focus:border-amber-500 focus:ring-amber-500/20 resize-none`} placeholder="Full narrative of the incident..." />
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="immediate_action_taken">
                      {(field) => (
                        <div className="md:col-span-2">
                          <label className={labelClass}>Immediate Actions Taken to Secure Site</label>
                          <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} border-amber-200 focus:border-amber-500 focus:ring-amber-500/20 resize-none`} placeholder="e.g., Aviary locked down, bird secured." />
                        </div>
                      )}
                    </form.Field>
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
                form="compound-form" 
                disabled={!canSubmit || isSubmitting as boolean || saveCompoundMutation.isPending} 
                className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
              >
                {(isSubmitting || saveCompoundMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                Commit Clinical Record
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}