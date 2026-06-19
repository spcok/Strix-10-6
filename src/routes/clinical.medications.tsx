import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { format, parseISO, formatISO } from 'date-fns';
import { Pill, Plus, X, Search, Save, Loader2, Calendar, FileText, Syringe, CheckCircle2, FileDown } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, PageBreak, BorderStyle, AlignmentType } from 'docx';

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS & 14-DAY RAM CAP
// ------------------------------------------------------------------
const medicationsOptions = queryOptions({
  queryKey: ['clinical_schedule'],
  queryFn: async () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('clinical_schedule')
      .select('*, animals(name, species)')
      .eq('is_deleted', false)
      .or(`status.eq.ACTIVE,start_date.gte.${fourteenDaysAgo}`)
      .order('start_date', { ascending: false });
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

export const Route = createFileRoute('/clinical/medications')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) {
      // @ts-ignore
      await Promise.all([ queryClient.ensureQueryData(medicationsOptions), queryClient.ensureQueryData(activeAnimalsOptions) ]);
    }
  },
  component: MedicationsPage,
});

export function MedicationsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'>('ACTIVE');
  const scrollParentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase.channel('medications-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clinical_schedule' }, () => {
        queryClient.invalidateQueries({ queryKey: ['clinical_schedule'] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: schedules = [], isLoading } = useQuery(medicationsOptions);
  const { data: animals = [] } = useQuery(activeAnimalsOptions);

  const filteredSchedules = useMemo(() => {
    let filtered = schedules;
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((s: any) => s.status === statusFilter);
    }
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter((s: any) => 
        (s.animals?.name || '').toLowerCase().includes(lower) ||
        (s.medication_name || '').toLowerCase().includes(lower) ||
        (s.instructions || '').toLowerCase().includes(lower)
      );
    }
    return filtered;
  }, [schedules, searchQuery, statusFilter]);

  const rowVirtualizer = useWindowVirtualizer({
    count: filteredSchedules.length,
    estimateSize: () => 140, 
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const { error } = await supabase.from('clinical_schedule').update({ 
        status, 
        modified_by: user!.id,
        updated_at: new Date().toISOString()
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clinical_schedule'] })
  });

  // ------------------------------------------------------------------
  // ENTERPRISE DOCX MAR ENGINE
  // ------------------------------------------------------------------
  const handleExportMAR = async () => {
    setIsGeneratingDoc(true);
    try {
      const activeMeds = schedules.filter((s: any) => s.status === 'ACTIVE');
      if (activeMeds.length === 0) {
        alert("No active medications to generate MAR charts for.");
        setIsGeneratingDoc(false);
        return;
      }

      // Group active meds by Animal ID
      const medsByAnimal = new Map<string, any[]>();
      activeMeds.forEach((s: any) => {
        if (!medsByAnimal.has(s.animal_id)) medsByAnimal.set(s.animal_id, []);
        medsByAnimal.get(s.animal_id)!.push(s);
      });

      const children: any[] = [];
      const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
      const tableBorders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle, insideHorizontal: borderStyle, insideVertical: borderStyle };

      Array.from(medsByAnimal.entries()).forEach(([animalId, meds], index) => {
        const animal = animals.find((a: any) => a.id === animalId);
        
        // Page break for each patient (except the first one)
        if (index > 0) children.push(new Paragraph({ children: [new PageBreak()] }));

        // Header
        children.push(new Paragraph({ text: `Medication Administration Record (MAR)`, heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }));
        children.push(new Paragraph({ children: [new TextRun({ text: "Patient: ", bold: true }), new TextRun(`${animal?.name || 'Unknown'} (${animal?.species || 'Unknown'})`)] }));
        children.push(new Paragraph({ children: [new TextRun({ text: "Week Commencing: ", bold: true }), new TextRun("______________________")], spacing: { after: 400 } }));

        // Grid Definition
        const table = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: tableBorders,
          rows: [
            // Table Header
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: "Medication & Instructions", alignment: AlignmentType.CENTER })], shading: { fill: "F3F4F6" }, width: { size: 30, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: "Dose", alignment: AlignmentType.CENTER })], shading: { fill: "F3F4F6" }, width: { size: 14, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: "Freq", alignment: AlignmentType.CENTER })], shading: { fill: "F3F4F6" }, width: { size: 14, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: "Mon", alignment: AlignmentType.CENTER })], shading: { fill: "F3F4F6" }, width: { size: 6, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: "Tue", alignment: AlignmentType.CENTER })], shading: { fill: "F3F4F6" }, width: { size: 6, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: "Wed", alignment: AlignmentType.CENTER })], shading: { fill: "F3F4F6" }, width: { size: 6, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: "Thu", alignment: AlignmentType.CENTER })], shading: { fill: "F3F4F6" }, width: { size: 6, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: "Fri", alignment: AlignmentType.CENTER })], shading: { fill: "F3F4F6" }, width: { size: 6, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: "Sat", alignment: AlignmentType.CENTER })], shading: { fill: "F3F4F6" }, width: { size: 6, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ text: "Sun", alignment: AlignmentType.CENTER })], shading: { fill: "F3F4F6" }, width: { size: 6, type: WidthType.PERCENTAGE } }),
              ]
            }),
            // Med Rows
            ...meds.map(med => new TableRow({
              children: [
                new TableCell({ 
                  children: [
                    new Paragraph({ children: [new TextRun({ text: med.medication_name, bold: true })] }),
                    new Paragraph({ text: med.instructions || '', style: "Intense Quote" })
                  ] 
                }),
                new TableCell({ children: [new Paragraph(med.dosage)] }),
                new TableCell({ children: [new Paragraph(med.frequency)] }),
                new TableCell({ children: [new Paragraph(" ")] }),
                new TableCell({ children: [new Paragraph(" ")] }),
                new TableCell({ children: [new Paragraph(" ")] }),
                new TableCell({ children: [new Paragraph(" ")] }),
                new TableCell({ children: [new Paragraph(" ")] }),
                new TableCell({ children: [new Paragraph(" ")] }),
                new TableCell({ children: [new Paragraph(" ")] }),
              ]
            }))
          ]
        });

        children.push(table);
      });

      const doc = new Document({ sections: [{ properties: {}, children }] });
      const blob = await Packer.toBlob(doc);
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `StrixOS_MAR_Charts_${format(new Date(), 'yyyy-MM-dd')}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (e) {
      console.error("Failed to generate DOCX", e);
      alert("Failed to generate MAR Chart document.");
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Pill className="text-rose-600" size={24} /> Medications & Treatments
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Active Prescriptions & Parasite Control</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="bg-slate-50 border border-slate-200 text-[10px] font-black text-slate-700 uppercase tracking-widest rounded-xl px-4 py-2 focus:outline-none focus:border-rose-500 shadow-sm w-full sm:w-auto">
            <option value="ACTIVE">Active Treatments</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="ALL">All Records</option>
          </select>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search drugs or patients..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-sm" />
          </div>

          <button 
            onClick={handleExportMAR} 
            disabled={isGeneratingDoc}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm border border-slate-200 disabled:opacity-50"
          >
            {isGeneratingDoc ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} 
            Export MAR
          </button>

          <button onClick={() => setIsModalOpen(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(225,29,72,0.15)]">
            <Plus size={16} /> Schedule Meds
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
        {isLoading && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-sm"><Loader2 className="animate-spin text-rose-600 w-8 h-8" /></div>}
        
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10 min-w-[900px]">
          <div className="col-span-3">Patient & Status</div>
          <div className="col-span-4">Prescription Details</div>
          <div className="col-span-3">Schedule Timeframe</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        <div className="overflow-auto h-[calc(100%-53px)] custom-scrollbar min-w-[900px]" ref={scrollParentRef}>
          {filteredSchedules.length === 0 && !isLoading ? (
            <div className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No scheduled medications found.</div>
          ) : (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {virtualItems.map((virtualRow) => {
                const schedule = filteredSchedules[virtualRow.index];
                const startDateObj = new Date(schedule.start_date);
                const endDateObj = schedule.end_date ? new Date(schedule.end_date) : null;
                const isActive = schedule.status === 'ACTIVE';

                return (
                  <div key={schedule.id} className="absolute top-0 left-0 w-full transition-colors border-b border-slate-100 hover:bg-slate-50/60" style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}>
                    <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center h-full">
                      
                      <div className="col-span-3">
                        <p className="text-sm font-black text-slate-900 uppercase tracking-tight truncate">{schedule.animals?.name || 'Unknown Patient'}</p>
                        <div className="flex gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-slate-100 text-slate-500 border-slate-300 truncate max-w-[120px]">
                            {schedule.animals?.species || 'Unknown'}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shadow-sm ${
                            isActive ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse' : 
                            schedule.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                            'bg-slate-100 text-slate-500 border-slate-300'
                          }`}>
                            {schedule.status}
                          </span>
                        </div>
                      </div>

                      <div className="col-span-4 space-y-1.5 pr-4">
                        <div className="flex items-center gap-1.5">
                           <Syringe size={12} className={isActive ? 'text-rose-500' : 'text-slate-400'} />
                           <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{schedule.medication_name}</span>
                           <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shadow-sm">{schedule.schedule_type.replace(/_/g, ' ')}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-600">
                          <span className="text-slate-400 font-medium mr-1">Dose:</span> {schedule.dosage} | 
                          <span className="text-slate-400 font-medium mx-1">Freq:</span> {schedule.frequency}
                        </p>
                        <p className="text-[10px] font-medium text-slate-500 line-clamp-2 italic">"{schedule.instructions}"</p>
                      </div>

                      <div className="col-span-3 flex flex-col gap-1.5">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 border border-slate-200 text-[9px] font-black text-slate-600 uppercase tracking-widest w-fit">
                          <Calendar size={10} /> Start: {format(startDateObj, 'dd MMM yyyy')}
                        </span>
                        {endDateObj ? (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest w-fit ${isActive ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                            <Calendar size={10} /> End: {format(endDateObj, 'dd MMM yyyy')}
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-1">Ongoing Treatment</span>
                        )}
                      </div>

                      <div className="col-span-2 flex justify-end gap-2">
                        {isActive ? (
                          <>
                            <button onClick={() => updateStatusMutation.mutate({ id: schedule.id, status: 'COMPLETED' })} disabled={updateStatusMutation.isPending} className="p-2 bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white border border-emerald-200 rounded-lg transition-colors shadow-sm disabled:opacity-50" title="Mark Completed">
                              <CheckCircle2 size={16} />
                            </button>
                            <button onClick={() => updateStatusMutation.mutate({ id: schedule.id, status: 'CANCELLED' })} disabled={updateStatusMutation.isPending} className="p-2 bg-slate-50 hover:bg-slate-200 text-slate-500 border border-slate-200 rounded-lg transition-colors shadow-sm disabled:opacity-50" title="Cancel Treatment">
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Locked</span>
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

      {isModalOpen && <MedicationModal onClose={() => setIsModalOpen(false)} animals={animals} userId={user!.id} />}
    </div>
  );
}

function MedicationModal({ onClose, animals, userId }: { onClose: () => void, animals: any[], userId: string }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('clinical_schedule').insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical_schedule'] });
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to schedule medication.')
  });

  const form = useForm({
    defaultValues: {
      animal_id: '',
      schedule_type: 'MEDICATION',
      medication_name: '',
      dosage: '',
      frequency: '',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: '',
      instructions: '',
      notes: ''
    },
    onSubmit: ({ value }) => {
      setErrorMsg(null);
      
      const parsedStartDate = formatISO(parseISO(value.start_date));
      const parsedEndDate = value.end_date ? formatISO(parseISO(value.end_date)) : null;

      const payload = {
        id: crypto.randomUUID(), 
        animal_id: value.animal_id,
        schedule_type: value.schedule_type,
        medication_name: value.medication_name,
        dosage: value.dosage,
        frequency: value.frequency,
        start_date: parsedStartDate,
        end_date: parsedEndDate,
        status: 'ACTIVE',
        instructions: value.instructions || null,
        notes: value.notes || null,
        is_deleted: false,
        created_by: userId,
        modified_by: userId
      };

      saveMutation.mutate(payload);
      onClose();
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto custom-scrollbar">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl relative my-auto">
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Syringe size={20} className="text-rose-600" /> Prescribe Medication
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"><X size={20} /></button>
        </div>

        <form id="medication-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-5">
          {errorMsg && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold shadow-sm">{errorMsg}</div>}

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

            <form.Field name="schedule_type">
              {(field) => (
                <div>
                  <label className={labelClass}>Treatment Type</label>
                  <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                    <option value="MEDICATION">Prescription Medication</option>
                    <option value="PARASITE_TREATMENT">Parasite / Worming Treatment</option>
                    <option value="VACCINE_BOOSTER">Vaccination Booster</option>
                    <option value="SUPPLEMENT">Dietary Supplement</option>
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="medication_name">
              {(field) => (
                <div>
                  <label className={labelClass}>Drug / Treatment Name *</label>
                  <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. Meloxicam" className={inputClass} />
                </div>
              )}
            </form.Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <form.Field name="dosage">
              {(field) => (
                <div>
                  <label className={labelClass}>Dosage *</label>
                  <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. 0.5ml / 2mg" className={inputClass} />
                </div>
              )}
            </form.Field>
            
            <form.Field name="frequency">
              {(field) => (
                <div>
                  <label className={labelClass}>Delivery Frequency *</label>
                  <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. SID (Once Daily) / PRN" className={inputClass} />
                </div>
              )}
            </form.Field>

            <form.Field name="start_date">
              {(field) => (
                <div>
                  <label className={labelClass}>Start Date *</label>
                  <input type="date" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>

            <form.Field name="end_date">
              {(field) => (
                <div>
                  <label className={labelClass}>Target End Date (Optional)</label>
                  <input type="date" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="instructions">
            {(field) => (
              <div>
                <label className={`${labelClass} flex items-center gap-1.5`}><FileText size={14} className="text-slate-400" /> Administration Instructions</label>
                <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="e.g. Administer orally with food. Do not give on empty stomach..." />
              </div>
            )}
          </form.Field>

        </form>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button type="submit" form="medication-form" disabled={!canSubmit || isSubmitting as boolean} className="px-8 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md">
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Prescription
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}