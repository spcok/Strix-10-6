import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { format, parseISO, formatISO } from 'date-fns';
import { Stethoscope, Plus, X, Search, Save, Loader2, Calendar, FileText, Syringe, Activity, AlertCircle, Info, Scale } from 'lucide-react';

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS & 14-DAY RAM CAP
// ------------------------------------------------------------------
const clinicalRecordsOptions = queryOptions({
  queryKey: ['clinical_records'],
  queryFn: async () => {
    const boundary = new Date();
    boundary.setDate(boundary.getDate() - 14);
    boundary.setHours(0, 0, 0, 0);
    
    const { data, error } = await supabase
      .from('clinical_records')
      .select('*, animals(name, species)')
      .eq('is_deleted', false)
      .gte('record_date', boundary.toISOString())
      .order('record_date', { ascending: false });
    if (error) throw error;
    return data || [];
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
    return data || [];
  },
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/clinical/records')({
  loader: async ({ context: { queryClient } }) => {
    if (queryClient) {
      await Promise.all([ queryClient.ensureQueryData(clinicalRecordsOptions), queryClient.ensureQueryData(activeAnimalsOptions) ]);
    }
  },
  component: ClinicalRecordsPage,
});

// ------------------------------------------------------------------
// MAIN COMPONENT
// ------------------------------------------------------------------
export function ClinicalRecordsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const scrollParentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase.channel('clinical-records-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clinical_records' }, () => {
        queryClient.invalidateQueries({ queryKey: ['clinical_records'], refetchType: 'active' });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: records = [], isLoading } = useQuery(clinicalRecordsOptions);
  const { data: animals = [] } = useQuery(activeAnimalsOptions);

  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;
    const lower = searchQuery.toLowerCase();
    return records.filter((r: any) => 
      (r.animals?.name || '').toLowerCase().includes(lower) ||
      (r.soap_assessment || '').toLowerCase().includes(lower) ||
      (r.soap_plan || '').toLowerCase().includes(lower) ||
      // V3 SCHEMA FIX: Search against external_vet_name instead of UUID
      (r.external_vet_name || '').toLowerCase().includes(lower)
    );
  }, [records, searchQuery]);

  const rowVirtualizer = useVirtualizer({
    count: filteredRecords.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 140, 
    overscan: 5,
  });

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
            <Stethoscope className="text-teal-600" size={24} /> Veterinary Records
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Clinical Examinations & Treatments</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search patient or diagnosis..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 transition-all shadow-sm" 
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-teal-600 hover:bg-teal-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(13,148,136,0.15)]"
          >
            <Plus size={16} /> Log Examination
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 p-3 rounded-xl text-teal-800 shadow-sm mx-1">
        <Info size={16} className="text-teal-600 shrink-0" />
        <span className="text-xs font-bold">Displaying recent clinical records from the past 14 days. For comprehensive lifetime medical history, view the individual animal's profile.</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-16rem)] min-h-[500px]">
        {isLoading && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-sm"><Loader2 className="animate-spin text-teal-600 w-8 h-8" /></div>}
        
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10 min-w-[900px]">
          <div className="col-span-2">Date</div>
          <div className="col-span-3">Patient</div>
          <div className="col-span-4">SOAP Assessment & Plan</div>
          <div className="col-span-3 text-right">Attending Vet</div>
        </div>

        <div ref={scrollParentRef} className="overflow-auto flex-1 custom-scrollbar min-w-[900px] relative">
          {filteredRecords.length === 0 && !isLoading ? (
            <div className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No clinical records found matching query.</div>
          ) : (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {virtualItems.map((virtualRow) => {
                const record = filteredRecords[virtualRow.index];

                return (
                  <div key={record.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="absolute top-0 left-0 w-full transition-colors border-b border-slate-100 hover:bg-slate-50/60" style={{ transform: `translateY(${virtualRow.start}px)` }}>
                    <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center h-full">
                      <div className="col-span-2">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                          {record.record_date ? format(parseISO(record.record_date), 'dd MMM yyyy') : '--'}
                        </div>
                        {/* V3 SCHEMA FIX: Successfully displays mandatory weight metric */}
                        <div className="text-[10px] font-bold text-slate-500 mt-2 flex items-center gap-1">
                          <Scale size={10} /> {record.weight_grams}g
                        </div>
                      </div>
                      <div className="col-span-3">
                        <p className="text-sm font-black text-slate-900 uppercase tracking-tight truncate">{record.animals?.name || 'Unknown Patient'}</p>
                        <div className="flex gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-slate-100 text-slate-500 border-slate-300 truncate max-w-[120px]">
                            {record.animals?.species || 'Unknown'}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${record.record_type === 'ROUTINE' ? 'bg-blue-50 text-blue-700 border-blue-200' : record.record_type === 'INJURY' ? 'bg-amber-50 text-amber-700 border-amber-200' : record.record_type === 'ILLNESS' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {record.record_type || 'EXAM'}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-4 space-y-1">
                        <p className="text-xs font-bold text-slate-900 line-clamp-1"><Activity size={12} className="inline mr-1 text-slate-400" />{record.soap_assessment || 'No assessment recorded.'}</p>
                        <p className="text-[10px] font-medium text-slate-600 line-clamp-2">{record.soap_plan || 'No treatment plan documented.'}</p>
                      </div>
                      <div className="col-span-3 flex flex-col items-end gap-1.5">
                        {/* V3 SCHEMA FIX: Correctly maps to text field so it renders a name instead of a UUID hash */}
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Vet: {record.external_vet_name || 'Staff Vet'}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isModalOpen && <ClinicalRecordModal onClose={() => setIsModalOpen(false)} animals={animals} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TANSTACK FORM MODAL (V3 SCHEMA COMPLIANT)
// ---------------------------------------------------------------------------
function ClinicalRecordModal({ onClose, animals }: { onClose: () => void, animals: any[] }) {
  const queryClient = useQueryClient();
  const { user } = useAuth(); // V3 SCHEMA FIX: Fetched auth context for mandatory UUIDs
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('clinical_records').insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical_records'] });
    }
  });

  const form = useForm({
    defaultValues: {
      animal_id: '',
      record_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      record_type: 'ROUTINE',
      weight_grams: '', // V3 SCHEMA FIX: Mandatory NOT NULL field
      soap_subjective: '',
      soap_objective: '',
      soap_assessment: '',
      soap_plan: '',
      external_vet_name: '' // V3 SCHEMA FIX: Replaced conducted_by text field mapping
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      
      try {
        if (!user?.id) throw new Error("Authentication required to sign medical records.");
        
        const parsedRecordDate = value.record_date ? formatISO(parseISO(value.record_date)) : formatISO(new Date());

        const payload = {
          id: crypto.randomUUID(), 
          animal_id: value.animal_id,
          record_date: parsedRecordDate,
          record_type: value.record_type,
          
          // V3 SCHEMA FIX: Mandatory fields explicitly populated
          weight_grams: Number(value.weight_grams),
          conductor_role: 'VETERINARIAN',
          conducted_by: user.id, // Must be UUID
          created_by: user.id,
          modified_by: user.id,
          
          // V3 SCHEMA FIX: Map text input to external_vet_name
          external_vet_name: value.external_vet_name || null,
          
          // V3 SCHEMA FIX: Use empty strings instead of null for NOT NULL text columns
          soap_subjective: value.soap_subjective || '',
          soap_objective: value.soap_objective || '',
          soap_assessment: value.soap_assessment,
          soap_plan: value.soap_plan,
          
          is_deleted: false
        };

        await saveMutation.mutateAsync(payload);
        onClose(); 
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to securely save clinical record. Please check connection.');
      }
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto custom-scrollbar">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl relative my-auto">
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Stethoscope size={20} className="text-teal-600" /> Log Clinical SOAP Record
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"><X size={20} /></button>
        </div>

        <form id="clinical-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-5">
          {errorMsg && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold shadow-sm"><AlertCircle className="inline mr-2" size={16} />{errorMsg}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-slate-50 p-5 rounded-2xl border border-slate-100">
            <form.Field name="animal_id">
              {(field) => (
                <div className="md:col-span-2">
                  <label className={labelClass}>Patient (Animal) *</label>
                  <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                    <option value="">-- Select Patient --</option>
                    {animals.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.species})</option>)}
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="record_date">
              {(field) => (
                <div>
                  <label className={labelClass}>Examination Date & Time *</label>
                  <input type="datetime-local" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>

            <form.Field name="record_type">
              {(field) => (
                <div>
                  <label className={labelClass}>Examination Type *</label>
                  <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                    <option value="ROUTINE">Routine Health Check</option>
                    <option value="ILLNESS">Illness / Disease</option>
                    <option value="INJURY">Injury</option>
                    <option value="VACCINATION">Vaccination</option>
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="weight_grams">
              {(field) => (
                <div className="md:col-span-2">
                  <label className={labelClass}>Current Bio-Weight (Grams) *</label>
                  <input type="number" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. 1250" className={inputClass} />
                </div>
              )}
            </form.Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <form.Field name="soap_subjective">
              {(field) => (
                <div>
                  <label className={labelClass}>Subjective (History/Symptoms)</label>
                  <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="Keeper observations..." />
                </div>
              )}
            </form.Field>

            <form.Field name="soap_objective">
              {(field) => (
                <div>
                  <label className={labelClass}>Objective (Clinical Findings)</label>
                  <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="Physical exam results..." />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="soap_assessment">
            {(field) => (
              <div>
                <label className={labelClass}>Assessment (Diagnosis) *</label>
                <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. Early stage Bumblefoot (Pododermatitis)" className={inputClass} />
              </div>
            )}
          </form.Field>

          <form.Field name="soap_plan">
            {(field) => (
              <div>
                <label className={labelClass}>Plan (Treatment & Prescriptions) *</label>
                <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="Detailed treatment, medications prescribed, and follow-up notes..." />
              </div>
            )}
          </form.Field>

          <div className="pt-3">
            <form.Field name="external_vet_name">
              {(field) => (
                <div>
                  <label className={labelClass}>Attending Veterinarian Name</label>
                  <input type="text" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="Dr. Name (Leave blank if self)" className={inputClass} />
                </div>
              )}
            </form.Field>
          </div>
        </form>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button type="submit" form="clinical-form" disabled={!canSubmit || isSubmitting as boolean} className="px-8 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md">
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save SOAP Record
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}