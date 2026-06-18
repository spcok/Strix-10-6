import React, { useMemo, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../lib/supabase';
import { ShieldAlert, Biohazard, Stethoscope, AlertTriangle, CheckCircle, Activity, Clock, Loader2, UserCheck, AlertOctagon } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../lib/auth';

// ------------------------------------------------------------------
// 1. QUERY OPTIONS (The Offline-First Standard)
// ------------------------------------------------------------------
const activeAnimalsOptions = queryOptions({
  queryKey: ['clinical_animals_active'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('id, name, species, category').eq('is_deleted', false).order('name');
    if (error) throw error;
    return data;
  },
  staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 60 * 24 * 15, networkMode: 'offlineFirst', meta: { persist: true }
});

const activeStaffOptions = queryOptions({
  queryKey: ['clinical_staff_active'],
  queryFn: async () => {
    const { data, error } = await supabase.from('users').select('id, name, role').eq('is_deleted', false).order('name');
    if (error) throw error;
    return data;
  },
  staleTime: 1000 * 60 * 60, gcTime: 1000 * 60 * 60 * 24 * 15, networkMode: 'offlineFirst', meta: { persist: true }
});

const isolationLogsOptions = queryOptions({
  queryKey: ['isolation_logs_complete'],
  queryFn: async () => {
    const { data, error } = await supabase.from('isolation_logs').select(`*, animals (name, species)`).eq('is_deleted', false).order('start_date', { ascending: false });
    if (error) throw error;
    return data;
  },
  staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 60 * 24 * 15, networkMode: 'offlineFirst', meta: { persist: true }
});

export const Route = createFileRoute('/clinical/isolation')({
  loader: ({ context }) => {
    // @ts-ignore
    if (context.queryClient) {
      // @ts-ignore
      context.queryClient.ensureQueryData(activeAnimalsOptions);
      // @ts-ignore
      context.queryClient.ensureQueryData(activeStaffOptions);
      // @ts-ignore
      context.queryClient.ensureQueryData(isolationLogsOptions);
    }
  },
  component: BiosecurityDashboard,
});

// ------------------------------------------------------------------
// 2. DASHBOARD COMPONENT
// ------------------------------------------------------------------
export function BiosecurityDashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const { data: animals, isLoading: loadingAnimals } = useQuery(activeAnimalsOptions);
  const { data: staff, isLoading: loadingStaff } = useQuery(activeStaffOptions);
  const { data: logs, isLoading: loadingLogs } = useQuery(isolationLogsOptions);

  const { activeThreats, historicalLogs } = useMemo(() => {
    if (!logs) return { activeThreats: [], historicalLogs: [] };
    const now = new Date();
    const active: typeof logs = [];
    const historical: typeof logs = [];

    logs.forEach(log => {
      const start = new Date(log.start_date);
      const end = log.end_date ? new Date(log.end_date) : null;
      if (start <= now && (end === null || end >= now)) {
        active.push(log);
      } else {
        historical.push(log);
      }
    });
    return { activeThreats: active, historicalLogs: historical };
  }, [logs]);

  const rowVirtualizer = useVirtualizer({
    count: historicalLogs.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 50,
    overscan: 10,
  });

  const initiateProtocol = useMutation({
    mutationFn: async (formValues: any) => {
      if (!user?.id) throw new Error("Authentication failure: Keeper UUID not found.");

      const payload = {
        animal_id: formValues.selectedAnimal,
        isolation_type: formValues.isolationType,
        reason: formValues.reason,
        notes: formValues.notes || null,
        start_date: new Date(formValues.startDate).toISOString(),
        end_date: formValues.endDate ? new Date(formValues.endDate).toISOString() : null,
        is_deleted: false,
        authorized_by: formValues.authorizedBy, // Replaced created_by with authorized_by
        modified_by: user.id
      };

      const { error } = await supabase.from('isolation_logs').insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isolation_logs_complete'] });
      queryClient.invalidateQueries({ queryKey: ['audit_records'] }); 
      form.reset();
    }
  });

  const standDownProtocol = useMutation({
    mutationFn: async (logId: string) => {
      if (!user?.id) throw new Error("Authentication failure.");
      const { error } = await supabase.from('isolation_logs').update({ end_date: new Date().toISOString(), modified_by: user.id }).eq('id', logId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isolation_logs_complete'] });
      queryClient.invalidateQueries({ queryKey: ['audit_records'] });
    }
  });

  const form = useForm({
    defaultValues: {
      selectedAnimal: '',
      authorizedBy: '',
      isolationType: 'ISOLATION' as 'ISOLATION' | 'QUARANTINE',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: '',
      reason: '',
      notes: ''
    },
    onSubmit: async ({ value }) => {
      await initiateProtocol.mutateAsync(value);
    }
  });

  const isFormLoading = loadingAnimals || loadingStaff;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20 font-sans">
      
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
            <ShieldAlert className="text-indigo-600" /> Biosecurity Control
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Triage & Containment Directives</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Active Threats & Historical */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-900">
                <Activity size={16} className="text-rose-500" /> Active Containment
              </h2>
              <span className="bg-rose-100 text-rose-700 py-1 px-3 rounded-lg text-[10px] font-black tracking-widest uppercase">
                {activeThreats.length} Active
              </span>
            </div>
            
            <div className="p-5 space-y-3">
              {loadingLogs ? (
                <div className="flex justify-center p-10"><Loader2 className="animate-spin text-indigo-600" /></div>
              ) : activeThreats.length === 0 ? (
                <div className="text-center p-10 text-xs font-bold text-slate-400 uppercase tracking-widest flex flex-col items-center gap-2">
                  <CheckCircle size={24} className="text-emerald-500 mb-2" />
                  No active biosecurity threats detected.
                </div>
              ) : (
                activeThreats.map((log: any) => (
                  <div key={log.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border border-slate-200 shadow-sm bg-white gap-4 relative overflow-hidden">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${log.isolation_type === 'QUARANTINE' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                    
                    <div className="flex items-center gap-4 pl-2">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${log.isolation_type === 'QUARANTINE' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                        {log.isolation_type === 'QUARANTINE' ? <Biohazard size={20} /> : <Stethoscope size={20} />}
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900">{log.animals?.name || 'Unknown'}</h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{log.isolation_type} • {log.animals?.species}</p>
                      </div>
                    </div>

                    <div className="flex-1 px-4 border-l border-slate-100 py-1">
                       <p className="text-xs font-bold text-slate-700">{log.reason}</p>
                       {log.notes && <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{log.notes}</p>}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                        <Clock size={12} /> Since {format(new Date(log.start_date), 'dd MMM yyyy')}
                      </span>
                      <button 
                        onClick={() => standDownProtocol.mutate(log.id)}
                        disabled={standDownProtocol.isPending}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors shadow-md disabled:opacity-50"
                      >
                        {standDownProtocol.isPending ? 'Processing...' : 'Clear Status'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-200 bg-slate-50">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-900">
                <Clock size={16} className="text-slate-500" /> Historical Encounters
              </h2>
            </div>
            
            <div className="grid grid-cols-12 gap-4 p-3 bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 sticky top-0 z-10">
              <div className="col-span-3">Patient</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-3">Duration</div>
              <div className="col-span-4">Reason</div>
            </div>

            <div ref={scrollParentRef} className="overflow-auto max-h-[400px] custom-scrollbar">
               {historicalLogs.length === 0 && !loadingLogs ? (
                 <div className="p-8 text-center text-xs font-bold uppercase tracking-widest text-slate-400">No historical records found.</div>
               ) : (
                 <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                   {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                     const log = historicalLogs[virtualRow.index];
                     return (
                       <div
                         key={virtualRow.key}
                         className="absolute top-0 left-0 w-full grid grid-cols-12 gap-4 p-3 border-b border-slate-100 hover:bg-slate-50 items-center"
                         style={{
                           height: `${virtualRow.size}px`,
                           transform: `translateY(${virtualRow.start}px)`,
                         }}
                       >
                         <div className="col-span-3 text-xs font-black text-slate-900 truncate">{log.animals?.name || 'Unknown'}</div>
                         <div className="col-span-2">
                           <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${log.isolation_type === 'QUARANTINE' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                             {log.isolation_type}
                           </span>
                         </div>
                         <div className="col-span-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                           {format(new Date(log.start_date), 'dd MMM yyyy')} - {log.end_date ? format(new Date(log.end_date), 'dd MMM yyyy') : 'Ongoing'}
                         </div>
                         <div className="col-span-4 text-xs font-medium text-slate-600 truncate" title={log.reason}>{log.reason}</div>
                       </div>
                     );
                   })}
                 </div>
               )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-6">
             <div className="p-5 border-b border-slate-200 bg-slate-900 text-white">
               <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                 <AlertTriangle size={16} className="text-amber-500" /> Initiate Protocol
               </h2>
               <p className="text-[10px] font-medium text-slate-400 mt-1">Deploy biosecurity flag to patient record.</p>
             </div>
             
             <form 
                onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} 
                className="p-5 space-y-5"
              >
               
               <form.Field name="selectedAnimal">
                 {(field) => (
                   <div>
                     <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Patient Selection</label>
                     <select 
                       required
                       value={field.state.value}
                       onBlur={field.handleBlur}
                       onChange={(e) => field.handleChange(e.target.value)}
                       disabled={isFormLoading}
                       className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer disabled:opacity-50"
                     >
                       <option value="" disabled>-- Select Patient --</option>
                       {animals?.map((animal: any) => (
                         <option key={animal.id} value={animal.id}>{animal.name} ({animal.species})</option>
                       ))}
                     </select>
                   </div>
                 )}
               </form.Field>

               <form.Field name="authorizedBy">
                 {(field) => (
                   <div>
                     <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1">
                       <UserCheck size={12} className="text-indigo-500" /> Authorized By
                     </label>
                     <select 
                       required
                       value={field.state.value}
                       onBlur={field.handleBlur}
                       onChange={(e) => field.handleChange(e.target.value)}
                       disabled={isFormLoading}
                       className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer disabled:opacity-50"
                     >
                       <option value="" disabled>-- Select Authorizing Staff --</option>
                       {staff?.map((keeper: any) => (
                         <option key={keeper.id} value={keeper.id}>{keeper.name} ({keeper.role})</option>
                       ))}
                     </select>
                   </div>
                 )}
               </form.Field>

               <form.Field name="isolationType">
                 {(field) => (
                   <div>
                     <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Protocol Directive</label>
                     <div className="grid grid-cols-2 gap-3">
                       <button
                         type="button"
                         onClick={() => field.handleChange('ISOLATION')}
                         className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${field.state.value === 'ISOLATION' ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'}`}
                       >
                         <Stethoscope size={20} />
                         <span className="text-[10px] font-black uppercase tracking-widest">Isolation</span>
                       </button>
                       <button
                         type="button"
                         onClick={() => field.handleChange('QUARANTINE')}
                         className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${field.state.value === 'QUARANTINE' ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'}`}
                       >
                         <Biohazard size={20} />
                         <span className="text-[10px] font-black uppercase tracking-widest">Quarantine</span>
                       </button>
                     </div>
                   </div>
                 )}
               </form.Field>

               <div className="grid grid-cols-2 gap-4">
                 <form.Field name="startDate">
                   {(field) => (
                     <div>
                       <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Start Date</label>
                       <input 
                         required
                         type="date"
                         value={field.state.value}
                         onBlur={field.handleBlur}
                         onChange={(e) => field.handleChange(e.target.value)}
                         className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                       />
                     </div>
                   )}
                 </form.Field>
                 <form.Field name="endDate">
                   {(field) => (
                     <div>
                       <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">End Date (Optional)</label>
                       <input 
                         type="date"
                         value={field.state.value}
                         onBlur={field.handleBlur}
                         onChange={(e) => field.handleChange(e.target.value)}
                         className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                       />
                     </div>
                   )}
                 </form.Field>
               </div>

               <form.Field name="reason">
                 {(field) => (
                   <div>
                     <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Primary Diagnosis / Reason</label>
                     <input 
                       required
                       type="text"
                       value={field.state.value}
                       onBlur={field.handleBlur}
                       onChange={(e) => field.handleChange(e.target.value)}
                       placeholder="e.g. Suspected bumblefoot..."
                       className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                     />
                   </div>
                 )}
               </form.Field>

               <form.Field name="notes">
                 {(field) => (
                   <div>
                     <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Clinical Notes (Optional)</label>
                     <textarea 
                       value={field.state.value}
                       onBlur={field.handleBlur}
                       onChange={(e) => field.handleChange(e.target.value)}
                       rows={4}
                       className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 custom-scrollbar resize-none"
                     />
                   </div>
                 )}
               </form.Field>

               {initiateProtocol.isError && (
                 <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                   <AlertOctagon size={16} className="text-rose-600 shrink-0 mt-0.5" />
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-rose-800">Database Rejection</p>
                     <p className="text-xs font-medium text-rose-600 mt-1">{initiateProtocol.error.message}</p>
                   </div>
                 </div>
               )}

               <form.Subscribe
                 selector={(state) => [state.canSubmit, state.isSubmitting, state.values]}
                 children={([canSubmit, isSubmitting, values]) => {
                   const isFormValid = values.selectedAnimal && values.authorizedBy && values.reason;
                   return (
                     <button 
                       type="submit" 
                       disabled={!canSubmit || isSubmitting || initiateProtocol.isPending || !isFormValid}
                       className="w-full p-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors shadow-md shadow-indigo-500/20 flex justify-center items-center gap-2"
                     >
                       {(isSubmitting || initiateProtocol.isPending) ? <Loader2 size={16} className="animate-spin" /> : <ShieldAlert size={16} />}
                       {(isSubmitting || initiateProtocol.isPending) ? 'Processing...' : 'Engage Protocol'}
                     </button>
                   );
                 }}
               />

             </form>
          </div>
        </div>

      </div>
    </div>
  );
}