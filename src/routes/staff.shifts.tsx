import React, { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wrench, Plus, Loader2, Calendar, PlayCircle, UserCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { rotaService } from '../services/rotaService';

export const Route = createFileRoute('/staff/shifts')({
  component: ShiftManagerPage,
});

export function ShiftManagerPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deployingId, setDeployingId] = useState<string | null>(null);

  const { data: staffMembers = [] } = useQuery({
    queryKey: ['staff_roster'],
    queryFn: () => rotaService.getStaffRoster()
  });

  const { data: patterns = [], isLoading } = useQuery({
    queryKey: ['shift_patterns'],
    queryFn: () => rotaService.getShiftPatterns()
  });

  const deployMutation = useMutation({
    mutationFn: async ({ pattern, days }: { pattern: any, days: number }) => {
      return rotaService.deployPattern(
        pattern.id, 
        pattern.user_id, 
        pattern, 
        format(new Date(), 'yyyy-MM-dd'), 
        days
      );
    },
    onMutate: (vars) => setDeployingId(vars.pattern.id),
    onSettled: () => setDeployingId(null)
  });

  const getStaffName = (id: string) => {
    const staff = staffMembers.find((s: any) => s.id === id);
    return staff ? staff.name : 'Unknown Keeper';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
            <Wrench className="text-indigo-600" /> Shift Patterns
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Keeper Configuration & Deployment</p>
        </div>
        
        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm">
          <Plus size={16} /> Assign Pattern
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Staff Member</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Working Days</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={3} className="p-10 text-center"><Loader2 className="animate-spin text-indigo-600 mx-auto" /></td></tr>
              ) : patterns.length === 0 ? (
                <tr><td colSpan={3} className="p-10 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No patterns configured.</td></tr>
              ) : (
                patterns.map((pattern: any) => {
                  const activeDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                    .filter(day => pattern[day]);
                  
                  return (
                    <tr key={pattern.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <UserCircle size={18} />
                          </div>
                          <span className="text-xs font-black text-slate-900">{getStaffName(pattern.user_id)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                            <span key={day} className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${
                              pattern[day] 
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                                : 'bg-slate-50 border-slate-200 text-slate-400 opacity-50'
                            }`}>
                              {day.substring(0, 3)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => deployMutation.mutate({ pattern, days: 28 })}
                          disabled={deployingId === pattern.id}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-[10px] uppercase tracking-widest rounded-lg transition-all border border-emerald-200 disabled:opacity-50"
                        >
                          {deployingId === pattern.id ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                          Deploy 28 Days
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && <PatternModal onClose={() => setIsModalOpen(false)} staff={staffMembers} />}
    </div>
  );
}

// ============================================================================
// MODAL: CONFIGURE KEEPER PATTERN
// ============================================================================
function PatternModal({ onClose, staff }: { onClose: () => void, staff: any[] }) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [userId, setUserId] = useState('');
  
  const [weekDays, setWeekDays] = useState({
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false
  });

  const toggleDay = (day: keyof typeof weekDays) => {
    setWeekDays(prev => ({ ...prev, [day]: !prev[day] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      setErrorMsg("Please select a Keeper.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await rotaService.savePattern({
        user_id: userId,
        // Optional fallback in case the database strictly enforces NOT NULL on this column
        pattern_name: `Pattern_${userId}`, 
        effective_from: format(new Date(), 'yyyy-MM-dd'),
        start_time: '09:00',
        end_time: '17:00',
        ...weekDays 
      });
      queryClient.invalidateQueries({ queryKey: ['shift_patterns'] });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to assign pattern.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col my-auto">
        <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <Wrench size={16} className="text-indigo-600"/> Assign Keeper Pattern
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-900">
            <Trash2 size={16} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errorMsg && <div className="p-3 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl border border-rose-200">{errorMsg}</div>}
          
          <div>
            <label className={labelClass}>Assign Staff Member</label>
            <select required value={userId} onChange={e => setUserId(e.target.value)} className={inputClass}>
              <option value="">Select Keeper...</option>
              {staff.map((s: any) => <option key={s.id} value={s.id}>{s.name || s.email}</option>)}
            </select>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <label className={labelClass}>Active Working Days</label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {(Object.keys(weekDays) as Array<keyof typeof weekDays>).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                    weekDays[day] 
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {day.substring(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button type="submit" disabled={isSubmitting} className="w-full py-3 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 shadow-sm flex items-center justify-center gap-2">
              {isSubmitting && <Loader2 size={14} className="animate-spin"/>} Save Pattern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}