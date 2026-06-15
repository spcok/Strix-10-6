import React, { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ShieldAlert, Biohazard, Stethoscope, AlertTriangle, CheckCircle, Activity, Clock, Loader2, RefreshCw, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../lib/auth';

export const Route = createFileRoute('/clinical/isolation')({
  component: BiosecurityDashboard,
});

export function BiosecurityDashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [selectedAnimal, setSelectedAnimal] = useState<string>('');
  const [isolationType, setIsolationType] = useState<'ISOLATION' | 'QUARANTINE'>('ISOLATION');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');
  const [authorizedBy, setAuthorizedBy] = useState<string>('');

  // Parallel Fetch 1: Active Animals
  const { data: animals, isLoading: loadingAnimals } = useQuery({
    queryKey: ['clinical_animals_active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('id, name, species, category')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 15,
    networkMode: 'offlineFirst',
    meta: { persist: true }
  });

  // Parallel Fetch 2: Active Keepers (For Authorization Dropdown)
  const { data: staff, isLoading: loadingStaff } = useQuery({
    queryKey: ['clinical_staff_active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role')
        .eq('is_active', true)
        .eq('is_deleted', false)
        .order('name');
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 1000 * 60 * 60, // Staff list rarely changes, safe to cache longer
    gcTime: 1000 * 60 * 60 * 24 * 15,
    networkMode: 'offlineFirst',
    meta: { persist: true }
  });

  // Parallel Fetch 3: Logs with Cache-Level Transformation (TanStack Best Practice)
  const { data: processedLogs, isLoading: loadingLogs, refetch } = useQuery({
    queryKey: ['isolation_logs_complete'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('isolation_logs')
        .select(`*, animals (name, species)`)
        .eq('is_deleted', false)
        .order('start_date', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
    select: (logs) => {
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
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 15,
    networkMode: 'offlineFirst',
    meta: { persist: true }
  });

  const initiateProtocol = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Keeper UUID not found. Please log in.");

      const { error } = await supabase
        .from('isolation_logs')
        .insert([{
          animal_id: selectedAnimal,
          isolation_type: isolationType,
          reason: reason,
          notes: notes || null,
          start_date: new Date(startDate).toISOString(),
          end_date: endDate ? new Date(endDate).toISOString() : null,
          is_deleted: false,
          created_by: user.id,
          modified_by: user.id,
          authorized_by: authorizedBy 
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isolation_logs_complete'] });
      queryClient.invalidateQueries({ queryKey: ['audit_records'] }); 
      
      // Reset Form State
      setSelectedAnimal('');
      setReason('');
      setNotes('');
      setStartDate(format(new Date(), 'yyyy-MM-dd'));
      setEndDate('');
      setAuthorizedBy('');
    }
  });

  const standDownProtocol = useMutation({
    mutationFn: async (logId: string) => {
      if (!user?.id) throw new Error("Keeper UUID not found. Please log in.");

      const { error } = await supabase
        .from('isolation_logs')
        .update({ 
          end_date: new Date().toISOString(),
          modified_by: user.id 
        })
        .eq('id', logId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isolation_logs_complete'] });
      queryClient.invalidateQueries({ queryKey: ['audit_records'] });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnimal || !reason || !authorizedBy) return;
    initiateProtocol.mutate();
  };

  const isFormValid = selectedAnimal && reason && authorizedBy;
  const isFormLoading = loadingAnimals || loadingStaff;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20 font-sans">
      
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
            <ShieldAlert className="text-indigo-600" /> Biosecurity Control
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Triage & Containment Directives</p>
        </div>
        <button onClick={() => refetch()} className="p-2.5 text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded-xl transition-colors border border-slate-200" title="Force Sync">
           <RefreshCw size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Active Threats & Historical */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active Threats */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-900">
                <Activity size={16} className="text-rose-500" /> Active Containment
              </h2>
              <span className="bg-rose-100 text-rose-700 py-1 px-3 rounded-lg text-[10px] font-black tracking-widest uppercase">
                {processedLogs?.activeThreats.length || 0} Active
              </span>
            </div>
            
            <div className="p-5 space-y-3">
              {loadingLogs ? (
                <div className="flex justify-center p-10"><Loader2 className="animate-spin text-indigo-600" /></div>
              ) : !processedLogs?.activeThreats.length ? (
                <div className="text-center p-10 text-xs font-bold text-slate-400 uppercase tracking-widest flex flex-col items-center gap-2">
                  <CheckCircle size={24} className="text-emerald-500 mb-2" />
                  No active biosecurity threats detected.
                </div>
              ) : (
                processedLogs.activeThreats.map((log: any) => (
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

          {/* Historical Logs */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-200 bg-slate-50">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-900">
                <Clock size={16} className="text-slate-500" /> Historical Encounters
              </h2>
            </div>
            <div className="p-0 overflow-auto max-h-[400px] custom-scrollbar">
               <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                   <tr>
                     <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">Patient</th>
                     <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">Type</th>
                     <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">Duration</th>
                     <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">Reason</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {processedLogs?.historicalLogs.slice(0, 50).map((log: any) => (
                     <tr key={log.id} className="hover:bg-slate-50">
                       <td className="p-3 text-xs font-black text-slate-900">{log.animals?.name || 'Unknown'}</td>
                       <td className="p-3">
                         <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${log.isolation_type === 'QUARANTINE' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                           {log.isolation_type}
                         </span>
                       </td>
                       <td className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                         {format(new Date(log.start_date), 'dd MMM yyyy')} - {log.end_date ? format(new Date(log.end_date), 'dd MMM yyyy') : 'Ongoing'}
                       </td>
                       <td className="p-3 text-xs font-medium text-slate-600 truncate max-w-[200px]" title={log.reason}>{log.reason}</td>
                     </tr>
                   ))}
                   {(!processedLogs?.historicalLogs || processedLogs.historicalLogs.length === 0) && !loadingLogs && (
                      <tr><td colSpan={4} className="p-8 text-center text-xs font-bold uppercase tracking-widest text-slate-400">No historical records found.</td></tr>
                   )}
                 </tbody>
               </table>
            </div>
          </div>
        </div>

        {/* Right Column: Trigger Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-6">
             <div className="p-5 border-b border-slate-200 bg-slate-900 text-white">
               <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                 <AlertTriangle size={16} className="text-amber-500" /> Initiate Protocol
               </h2>
               <p className="text-[10px] font-medium text-slate-400 mt-1">Deploy biosecurity flag to patient record.</p>
             </div>
             <form onSubmit={handleSubmit} className="p-5 space-y-5">
               
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Patient Selection</label>
                 <select 
                   required
                   value={selectedAnimal}
                   onChange={(e) => setSelectedAnimal(e.target.value)}
                   disabled={isFormLoading}
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer disabled:opacity-50"
                 >
                   <option value="" disabled>-- Select Patient --</option>
                   {animals?.map((animal: any) => (
                     <option key={animal.id} value={animal.id}>{animal.name} ({animal.species})</option>
                   ))}
                 </select>
               </div>

               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1">
                   <UserCheck size={12} className="text-indigo-500" /> Authorized By
                 </label>
                 <select 
                   required
                   value={authorizedBy}
                   onChange={(e) => setAuthorizedBy(e.target.value)}
                   disabled={isFormLoading}
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer disabled:opacity-50"
                 >
                   <option value="" disabled>-- Select Authorizing Staff --</option>
                   {staff?.map((keeper: any) => (
                     <option key={keeper.id} value={keeper.id}>{keeper.name} ({keeper.role})</option>
                   ))}
                 </select>
               </div>

               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Protocol Directive</label>
                 <div className="grid grid-cols-2 gap-3">
                   <button
                     type="button"
                     onClick={() => setIsolationType('ISOLATION')}
                     className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${isolationType === 'ISOLATION' ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'}`}
                   >
                     <Stethoscope size={20} />
                     <span className="text-[10px] font-black uppercase tracking-widest">Isolation</span>
                   </button>
                   <button
                     type="button"
                     onClick={() => setIsolationType('QUARANTINE')}
                     className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${isolationType === 'QUARANTINE' ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'}`}
                   >
                     <Biohazard size={20} />
                     <span className="text-[10px] font-black uppercase tracking-widest">Quarantine</span>
                   </button>
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Start Date</label>
                   <input 
                     required
                     type="date"
                     value={startDate}
                     onChange={(e) => setStartDate(e.target.value)}
                     className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                   />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">End Date (Optional)</label>
                   <input 
                     type="date"
                     value={endDate}
                     onChange={(e) => setEndDate(e.target.value)}
                     className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                   />
                 </div>
               </div>

               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Primary Diagnosis / Reason</label>
                 <input 
                   required
                   type="text"
                   value={reason}
                   onChange={(e) => setReason(e.target.value)}
                   placeholder="e.g. Suspected bumblefoot, awaiting vet triage..."
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                 />
               </div>

               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Clinical Notes (Optional)</label>
                 <textarea 
                   value={notes}
                   onChange={(e) => setNotes(e.target.value)}
                   rows={4}
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 custom-scrollbar resize-none"
                 />
               </div>

               <button 
                 type="submit" 
                 disabled={initiateProtocol.isPending || !isFormValid}
                 className="w-full p-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors shadow-md shadow-indigo-500/20 flex justify-center items-center gap-2"
               >
                 {initiateProtocol.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldAlert size={16} />}
                 {initiateProtocol.isPending ? 'Processing...' : 'Engage Protocol'}
               </button>

             </form>
          </div>
        </div>

      </div>
    </div>
  );
}