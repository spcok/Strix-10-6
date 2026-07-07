import React, { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { Stethoscope, X, Search, Loader2 } from 'lucide-react';

// ------------------------------------------------------------------
// 1. STRICT V3 SCHEMA ALIGNMENT
// ------------------------------------------------------------------
const ClinicalRecordSchema = z.object({
  animal_id: z.string().uuid("Animal selection is required."),
  record_date: z.string().min(1, "Date is required."),
  record_type: z.string().min(1, "Record type is required."),
  encounter_type: z.string().optional().nullable(),
  weight_grams: z.number().min(0, "Weight is required."),
  
  // SOAP Format (Required NOT NULL by V3)
  soap_subjective: z.string().min(1, "Subjective observation is required."),
  soap_objective: z.string().min(1, "Objective observation is required."),
  soap_assessment: z.string().min(1, "Assessment is required."),
  soap_plan: z.string().min(1, "Plan is required."),
  
  conductor_role: z.string().min(1, "Conductor role is required."),
  conducted_by: z.string().uuid("Conductor is required."),
  
  external_vet_name: z.string().optional().nullable(),
  external_vet_clinic: z.string().optional().nullable(),
});

// ------------------------------------------------------------------
// 2. BULLETPROOF QUERY OPTIONS
// ------------------------------------------------------------------
const clinicalRecordsOptions = queryOptions({
  queryKey: ['clinical_records'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('clinical_records')
      // FIX: Removed the users join to prevent foreign key/column crashes
      .select('*, animals(name, species)')
      .eq('is_deleted', false)
      .order('record_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  staleTime: 1000 * 60 * 5,
  networkMode: 'offlineFirst',
});

const activeAnimalsOptions = queryOptions({
  queryKey: ['active_animals'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('id, name, species').neq('status', 'ARCHIVED').order('name');
    if (error) throw error;
    return data || [];
  },
});

const activeUsersOptions = queryOptions({
  queryKey: ['active_users'],
  queryFn: async () => {
    // FIX: Select all columns to completely avoid the "column does not exist" crash
    const { data, error } = await supabase.from('users').select('*');
    if (error) throw error;
    return data || [];
  }
});

export const Route = createFileRoute('/clinical/records')({
  loader: async ({ context: { queryClient } }) => {
    if (queryClient) {
      await Promise.all([
        queryClient.ensureQueryData(clinicalRecordsOptions),
        queryClient.ensureQueryData(activeAnimalsOptions),
        queryClient.ensureQueryData(activeUsersOptions)
      ]);
    }
  },
  component: ClinicalRecordsPage,
});

// ------------------------------------------------------------------
// 3. THE COMPLIANT MODAL
// ------------------------------------------------------------------
function ClinicalRecordModal({ onClose, animals, users }: { onClose: () => void, animals: any[], users: any[] }) {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('clinical_records').insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical_records'] });
      onClose();
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to save clinical record.')
  });

  const form = useForm({
    defaultValues: {
      animal_id: '',
      record_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      record_type: 'CLINICAL',
      encounter_type: 'ROUTINE_CHECK',
      weight_grams: 0,
      soap_subjective: '',
      soap_objective: '',
      soap_assessment: '',
      soap_plan: '',
      conductor_role: 'INTERNAL_VET',
      conducted_by: authUser?.id || '',
      external_vet_name: '',
      external_vet_clinic: ''
    },
    onSubmit: async ({ value }) => {
      if (!authUser?.id) { setErrorMsg("User authentication required."); return; }
      setErrorMsg(null);
      
      const validation = ClinicalRecordSchema.safeParse(value);
      if (!validation.success) {
        setErrorMsg(validation.error.issues[0].message);
        return;
      }

      const payload = {
        ...validation.data,
        record_date: new Date(value.record_date).toISOString(),
        is_deleted: false,
        created_by: authUser.id,
        modified_by: authUser.id,
      };

      saveMutation.mutate(payload);
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl flex flex-col shadow-2xl my-auto">
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center shrink-0 rounded-t-2xl">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Stethoscope size={20} className="text-teal-600" /> Log Clinical Record (SOAP)
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl"><X size={20} /></button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-6 overflow-y-auto custom-scrollbar max-h-[75vh]">
          {errorMsg && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">{errorMsg}</div>}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <form.Field name="animal_id" children={(field) => (
              <div className="md:col-span-2">
                <label className={labelClass}>Patient *</label>
                <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                  <option value="">-- Select Patient --</option>
                  {animals.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.species})</option>)}
                </select>
              </div>
            )}/>
            
            <form.Field name="record_date" children={(field) => (
              <div>
                <label className={labelClass}>Date & Time *</label>
                <input type="datetime-local" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
              </div>
            )}/>

            <form.Field name="encounter_type" children={(field) => (
              <div>
                <label className={labelClass}>Encounter Type *</label>
                <select required value={field.state.value || ''} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                  <option value="ROUTINE_CHECK">Routine Check</option>
                  <option value="ILLNESS_INJURY">Illness / Injury</option>
                  <option value="SURGERY">Surgery</option>
                  <option value="FOLLOW_UP">Follow Up</option>
                </select>
              </div>
            )}/>

            <form.Field name="conducted_by" children={(field) => (
              <div>
                <label className={labelClass}>Conducted By *</label>
                <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                  <option value="">-- Select Staff --</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {/* FIX: Safely parse whatever naming column your schema uses */}
                      {u.name || u.full_name || u.email || u.id}
                    </option>
                  ))}
                </select>
              </div>
            )}/>

            <form.Field name="conductor_role" children={(field) => (
              <div>
                <label className={labelClass}>Conductor Role *</label>
                <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                  <option value="INTERNAL_VET">Internal Vet</option>
                  <option value="EXTERNAL_VET">External Vet</option>
                  <option value="KEEPER">Keeper</option>
                  <option value="CURATOR">Curator</option>
                </select>
              </div>
            )}/>

            <form.Field name="weight_grams" children={(field) => (
              <div className="md:col-span-2">
                <label className={labelClass}>Weight (grams) *</label>
                <input type="number" required min="0" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(Number(e.target.value))} className={inputClass} />
              </div>
            )}/>

            {/* SOAP Section */}
            <div className="md:col-span-2 grid grid-cols-1 gap-5 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">SOAP Notes</h3>
              
              <form.Field name="soap_subjective" children={(field) => (
                <div>
                  <label className={labelClass}>Subjective (History, observations) *</label>
                  <textarea required rows={2} value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}/>
              
              <form.Field name="soap_objective" children={(field) => (
                <div>
                  <label className={labelClass}>Objective (Physical exam findings, vitals) *</label>
                  <textarea required rows={2} value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}/>
              
              <form.Field name="soap_assessment" children={(field) => (
                <div>
                  <label className={labelClass}>Assessment (Diagnosis, differentials) *</label>
                  <textarea required rows={2} value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}/>
              
              <form.Field name="soap_plan" children={(field) => (
                <div>
                  <label className={labelClass}>Plan (Treatments, medications, follow-up) *</label>
                  <textarea required rows={2} value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}/>
            </div>
          </div>
          
          <button type="submit" disabled={saveMutation.isPending} className="w-full mt-6 py-3.5 bg-teal-600 text-white rounded-xl font-black uppercase text-sm tracking-widest hover:bg-teal-700 flex items-center justify-center gap-2 transition-colors">
            {saveMutation.isPending ? <Loader2 className="animate-spin" size={18}/> : 'Save Clinical Record'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// 4. MAIN PAGE RENDERER
// ------------------------------------------------------------------
export function ClinicalRecordsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: records = [], isLoading } = useQuery(clinicalRecordsOptions);
  const { data: animals = [] } = useQuery(activeAnimalsOptions);
  const { data: users = [] } = useQuery(activeUsersOptions);

  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;
    const lower = searchQuery.toLowerCase();
    return records.filter((r: any) => 
      (r.animals?.name || '').toLowerCase().includes(lower) ||
      (r.soap_assessment || '').toLowerCase().includes(lower) ||
      (r.soap_plan || '').toLowerCase().includes(lower)
    );
  }, [records, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Stethoscope className="text-teal-600" size={24} /> Veterinary Records
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Clinical Examinations (SOAP)</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search assessment..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" 
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            Log Record
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin text-teal-600 w-8 h-8" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-4 w-40">Date</th>
                  <th className="px-6 py-4 w-48">Patient</th>
                  <th className="px-6 py-4">Assessment / Plan</th>
                  <th className="px-6 py-4 w-48">Encounter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.length === 0 ? (
                  <tr><td colSpan={4} className="p-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No clinical records found.</td></tr>
                ) : (
                  filteredRecords.map((r: any) => {
                    // FIX: Safe in-memory user matching
                    const conductor = users.find((u: any) => u.id === r.conducted_by);
                    const conductorName = conductor ? (conductor.name || conductor.full_name || conductor.email || 'Staff') : r.conductor_role?.replace('_', ' ');

                    return (
                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-xs font-bold text-slate-900 whitespace-nowrap align-top">
                          {r.record_date ? format(parseISO(r.record_date), 'dd MMM yyyy HH:mm') : '--'}
                        </td>
                        <td className="px-6 py-4 align-top">
                          <span className="text-sm font-black text-slate-900 block">{r.animals?.name || 'Unknown'}</span>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{r.animals?.species || '--'}</span>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <p className="text-xs font-bold text-slate-900 line-clamp-2"><span className="text-teal-600 mr-1">A:</span>{r.soap_assessment}</p>
                          <p className="text-[11px] font-medium text-slate-600 line-clamp-2 mt-1"><span className="text-teal-600 mr-1">P:</span>{r.soap_plan}</p>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <span className="text-[9px] font-bold text-slate-700 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded inline-block">{r.encounter_type?.replace('_', ' ') || 'CLINICAL'}</span>
                          <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                            {conductorName}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && <ClinicalRecordModal onClose={() => setIsModalOpen(false)} animals={animals} users={users} />}
    </div>
  );
}