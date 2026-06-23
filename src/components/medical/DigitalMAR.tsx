import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { Check, X as XIcon, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';

interface DigitalMARProps {
  prescriptions: any[];
  isOnline: boolean;
}

export default function DigitalMAR({ prescriptions, isOnline }: DigitalMARProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  // 1. Fetch Today's Administration Logs using date-fns timezone bounds
  const { data: todaysLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['medication_administrations', 'today'],
    queryFn: async () => {
      const now = new Date();
      // Date-fns gives us absolute local midnight bounds
      const start = startOfDay(now).toISOString();
      const end = endOfDay(now).toISOString();

      const { data, error } = await supabase
        .from('medication_administrations')
        .select('*')
        .gte('administered_at', start)
        .lte('administered_at', end);
        
      if (error) throw error;
      return data;
    }
  });

  // 2. Strict Online-Only Mutation
  const logAdministration = useMutation({
    mutationFn: async (payload: { prescription_id: string, animal_id: string, status: string, notes?: string }) => {
      if (!isOnline) throw new Error("Cannot log administration while offline.");
      
      const { data, error } = await supabase.from('medication_administrations').insert([{
        ...payload,
        administered_by: user?.id,
        administered_at: new Date().toISOString() // Absolute execution time
      }]);
      
      if (error) throw error;
      return data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['medication_administrations'] })
  });

  if (loadingLogs) {
    return <div className="p-12 flex justify-center"><Loader2 size={32} className="animate-spin text-blue-500" /></div>;
  }

  if (prescriptions.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 shadow-sm">
        <Check size={48} className="mx-auto mb-4 text-slate-300" />
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">No Medications Due</h3>
        <p className="text-xs font-medium mt-1">There are no active prescriptions requiring administration today.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500 font-black text-[10px] uppercase tracking-widest border-b border-slate-200">
          <tr>
            <th className="p-4 w-1/4">Entity</th>
            <th className="p-4 w-1/3">Medication Order</th>
            <th className="p-4">Frequency</th>
            <th className="p-4 text-right">Digital Administration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {prescriptions.map((rx: any) => {
            // Check if it was given today
            // Note: For BID/TID drugs, this logic needs to be expanded to check for multiple logs
            const todaysLog = todaysLogs.find((l: any) => l.prescription_id === rx.id);
            const isCompleted = !!todaysLog;

            return (
              <tr key={rx.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-4 align-top">
                  <span className="font-bold text-slate-900 block leading-tight">{rx.animals?.name || 'Unknown Entity'}</span>
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{rx.animals?.location || 'No Location'}</span>
                </td>
                
                <td className="p-4 align-top">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-blue-700">{rx.drug_name}</span>
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100">{rx.dosage}</span>
                  </div>
                  <div className="flex gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">
                    <span>Route: {rx.route}</span>
                    {rx.is_prn && <span className="text-amber-600 flex items-center gap-1"><AlertTriangle size={10} /> PRN (As Needed)</span>}
                  </div>
                  {rx.special_instructions && (
                    <p className="text-xs font-medium text-slate-600 mt-2 bg-slate-50 p-2 rounded-lg border border-slate-100 italic">
                      "{rx.special_instructions}"
                    </p>
                  )}
                </td>
                
                <td className="p-4 align-top">
                  <span className="font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg text-xs uppercase tracking-widest">{rx.frequency}</span>
                </td>
                
                <td className="p-4 align-top text-right">
                  {isCompleted ? (
                    <div className="flex flex-col items-end">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                        todaysLog.status === 'GIVEN' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {todaysLog.status === 'GIVEN' ? <Check size={12} /> : <XIcon size={12} />} 
                        {todaysLog.status}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-1">
                        <Clock size={10} /> {format(new Date(todaysLog.administered_at), 'HH:mm')}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-2">
                      <button 
                        disabled={!isOnline || logAdministration.isPending}
                        onClick={() => logAdministration.mutate({ prescription_id: rx.id, animal_id: rx.animal_id, status: 'GIVEN' })}
                        className="w-24 flex justify-center py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-50 disabled:bg-slate-400 transition-colors shadow-sm"
                      >
                        {logAdministration.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Give Dose'}
                      </button>
                      <button 
                        disabled={!isOnline || logAdministration.isPending}
                        onClick={() => {
                          const note = window.prompt("Why was this medication not administered?");
                          if (note) logAdministration.mutate({ prescription_id: rx.id, animal_id: rx.animal_id, status: 'OMITTED', notes: note });
                        }}
                        className="w-24 flex justify-center py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 hover:border-rose-300 disabled:opacity-50 transition-colors"
                      >
                        Omit / Skip
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}