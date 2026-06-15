import React, { useState, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { format } from 'date-fns';
import { 
  Stethoscope, FileText, UploadCloud, File, Trash2, Loader2, 
  Search, AlertCircle, Syringe, Calendar, UserCheck, Paperclip, 
  ChevronRight, Clock
} from 'lucide-react';

// ------------------------------------------------------------------
// 1. QUERY OPTIONS (The Offline-First Standard)
// ------------------------------------------------------------------
const animalsQueryOptions = queryOptions({
  queryKey: ['clinical_animals_directory'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('animals')
      .select('id, name, species, category, ring_number, microchip_id')
      .eq('is_deleted', false)
      .order('name');
    if (error) throw error;
    return data;
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

// ------------------------------------------------------------------
// 2. ROUTE CONFIGURATION (Pre-fetching Loader)
// ------------------------------------------------------------------
export const Route = createFileRoute('/clinical/records')({
  loader: ({ context }) => {
    // Inject the loader to prevent waterfall spinners on navigation
    // @ts-ignore - Assuming queryClient is passed via router context in __root.tsx
    if (context.queryClient) context.queryClient.ensureQueryData(animalsQueryOptions);
  },
  component: ClinicalRecordsDashboard,
});

// ------------------------------------------------------------------
// 3. DASHBOARD COMPONENT
// ------------------------------------------------------------------
export function ClinicalRecordsDashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [selectedAnimal, setSelectedAnimal] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'timeline' | 'new'>('timeline');
  const [files, setFiles] = useState<File[]>([]); // Files remain in state as they are binary blobs, not text inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const { data: animals, isLoading: loadingAnimals } = useQuery(animalsQueryOptions);

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ['clinical_history', selectedAnimal],
    queryFn: async () => {
      if (!selectedAnimal) return [];
      const { data, error } = await supabase
        .from('clinical_records')
        .select(`*, clinical_attachments (*)`)
        .eq('animal_id', selectedAnimal)
        .eq('is_deleted', false)
        .order('record_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedAnimal,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 15,
    networkMode: 'offlineFirst',
    meta: { persist: true }
  });

  // ------------------------------------------------------------------
  // 4. VIRTUALIZER ENGINE (DOM Protection)
  // ------------------------------------------------------------------
  const rowVirtualizer = useVirtualizer({
    count: history?.length || 0,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 200, // Estimated pixel height of a single timeline card
    overscan: 4, // Pre-render 4 items off-screen for smooth scrolling
  });

  // ------------------------------------------------------------------
  // 5. TANSTACK FORM ENGINE (CPU Protection)
  // ------------------------------------------------------------------
  const submitRecordMutation = useMutation({
    mutationFn: async (formValues: any) => {
      if (!user?.id) throw new Error("Authentication error.");

      const recordPayload = {
        animal_id: selectedAnimal,
        record_date: new Date().toISOString(),
        record_type: formValues.recordType, 
        soap_subjective: formValues.subjective || null,
        soap_objective: formValues.objective || null,
        soap_assessment: formValues.assessment || null,
        soap_plan: formValues.plan || null,
        vet_name: formValues.vetName || null,
        created_by: user.id,
        modified_by: user.id,
        is_deleted: false
      };

      const { data: record, error: recordErr } = await supabase
        .from('clinical_records')
        .insert([recordPayload])
        .select('id')
        .single();

      if (recordErr) throw recordErr;

      // Handle External File Uploads Concurrently
      if (files.length > 0) {
        const uploadPromises = files.map(async (file) => {
          const fileExt = file.name.split('.').pop();
          const fileName = `${selectedAnimal}/${record.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          const { error: uploadErr } = await supabase.storage
            .from('clinical-documents')
            .upload(fileName, file, { cacheControl: '3600', upsert: false });
            if (uploadErr) throw uploadErr;

          const { data: publicUrl } = supabase.storage.from('clinical-documents').getPublicUrl(fileName);

          return {
            record_id: record.id,
            file_url: publicUrl.publicUrl,
            file_name: file.name,
            file_type: file.type || 'application/octet-stream',
            uploaded_by: user.id,
            is_deleted: false
          };
        });

        const attachments = await Promise.all(uploadPromises);
        const { error: attachErr } = await supabase.from('clinical_attachments').insert(attachments);
        if (attachErr) throw attachErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical_history', selectedAnimal] });
      setActiveTab('timeline');
      setFiles([]);
      form.reset();
    }
  });

  const form = useForm({
    defaultValues: {
      recordType: 'Clinical Assessment',
      vetName: '',
      subjective: '',
      objective: '',
      assessment: '',
      plan: ''
    },
    onSubmit: async ({ value }) => {
      await submitRecordMutation.mutateAsync(value);
    }
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files as FileList)]);
  };

  const filteredAnimals = animals?.filter((a: any) => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.species.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const activeAnimalDetails = animals?.find((a: any) => a.id === selectedAnimal);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20 font-sans h-[calc(100vh-6rem)] flex flex-col">
      
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm shrink-0">
        <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
          <Stethoscope className="text-indigo-600" /> Veterinary Documentation
        </h1>
        <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">SOAP Records & External Attachments</p>
      </div>

      <div className="lg:hidden p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 shadow-sm shrink-0">
        <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-amber-800">Mobile Restriction Active</p>
          <p className="text-xs font-medium text-amber-700 mt-1">Clinical data entry is restricted to desktop workstations.</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
        
        {/* Left Panel: Patient Selector */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
          <div className="p-4 border-b border-slate-200 bg-slate-50 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search Patients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {loadingAnimals ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-600" /></div>
            ) : filteredAnimals.map((animal: any) => (
              <button
                key={animal.id}
                onClick={() => { setSelectedAnimal(animal.id); setActiveTab('timeline'); }}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${
                  selectedAnimal === animal.id 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'hover:bg-slate-50 text-slate-900 border border-transparent hover:border-slate-200'
                }`}
              >
                <div>
                  <h3 className="text-sm font-black truncate">{animal.name}</h3>
                  <p className={`text-[10px] font-bold uppercase tracking-widest truncate mt-0.5 ${selectedAnimal === animal.id ? 'text-indigo-200' : 'text-slate-500'}`}>
                    {animal.species}
                  </p>
                </div>
                <ChevronRight size={16} className={selectedAnimal === animal.id ? 'text-white' : 'text-slate-300 group-hover:text-slate-500'} />
              </button>
            ))}
          </div>
        </div>

        {/* Right Panel: Records Matrix */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
          
          {!selectedAnimal ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-slate-400">
               <FileText size={48} className="mb-4 text-slate-200" />
               <p className="text-sm font-black uppercase tracking-widest">Select a patient to view clinical records</p>
            </div>
          ) : (
            <>
              {/* Patient Header Block */}
              <div className="p-6 border-b border-slate-200 bg-slate-900 text-white shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight">{activeAnimalDetails?.name}</h2>
                    <p className="text-xs font-bold tracking-widest text-slate-400 uppercase mt-1">
                      {activeAnimalDetails?.species} • {activeAnimalDetails?.category}
                    </p>
                  </div>
                  <div className="hidden lg:flex bg-slate-800 p-1 rounded-xl">
                    <button 
                      onClick={() => setActiveTab('timeline')}
                      className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'timeline' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                      <Clock size={14} /> History
                    </button>
                    <button 
                      onClick={() => setActiveTab('new')}
                      className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'new' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                      <FileText size={14} /> New Record
                    </button>
                  </div>
                </div>
              </div>

              {/* ----------------- VIRTUALIZED TIMELINE TAB ----------------- */}
              {activeTab === 'timeline' && (
                <div ref={scrollParentRef} className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 relative">
                  {loadingHistory ? (
                     <div className="flex justify-center p-10"><Loader2 className="animate-spin text-indigo-600" /></div>
                  ) : !history || history.length === 0 ? (
                     <div className="text-center p-10 text-slate-400 text-xs font-bold uppercase tracking-widest">No clinical records found.</div>
                  ) : (
                    <div
                      style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                      }}
                      className="max-w-4xl mx-auto py-6"
                    >
                      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const record = history[virtualRow.index];
                        return (
                          <div
                            key={virtualRow.key}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              transform: `translateY(${virtualRow.start}px)`,
                              paddingBottom: '24px' // Gap between cards
                            }}
                          >
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                                    <Syringe size={20} />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-black text-slate-900">{record.record_type}</h4>
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                                      <Calendar size={12} /> {format(new Date(record.record_date), 'dd MMM yyyy • HH:mm')}
                                      {record.vet_name && <><span className="text-slate-300">|</span> <UserCheck size={12} /> Vet: {record.vet_name}</>}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="p-5 space-y-4">
                                {record.soap_subjective && (
                                  <div><h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">Subjective</h5><p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">{record.soap_subjective}</p></div>
                                )}
                                {record.soap_objective && (
                                  <div><h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">Objective</h5><p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">{record.soap_objective}</p></div>
                                )}
                                {record.soap_assessment && (
                                  <div><h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">Assessment</h5><p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">{record.soap_assessment}</p></div>
                                )}
                                {record.soap_plan && (
                                  <div><h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">Plan</h5><p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">{record.soap_plan}</p></div>
                                )}
                              </div>

                              {record.clinical_attachments?.length > 0 && (
                                <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-3">
                                  {record.clinical_attachments.map((file: any) => (
                                    <a key={file.id} href={file.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:border-indigo-500 hover:text-indigo-600 transition-colors shadow-sm">
                                      <Paperclip size={14} /> {file.file_name}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ----------------- TANSTACK FORM TAB (Desktop Only) ----------------- */}
              {activeTab === 'new' && (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50">
                  <form 
                    onSubmit={(e) => { 
                      e.preventDefault(); 
                      e.stopPropagation(); 
                      form.handleSubmit(); 
                    }} 
                    className="hidden lg:block max-w-4xl mx-auto space-y-6"
                  >
                    
                    {submitRecordMutation.isError && (
                      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 shadow-sm">
                        <AlertCircle size={20} className="text-rose-600 shrink-0" />
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-rose-800">Transmission Failed</p>
                          <p className="text-sm font-medium text-rose-600 mt-1">{submitRecordMutation.error.message}</p>
                        </div>
                      </div>
                    )}

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                      <div className="grid grid-cols-2 gap-5">
                        <form.Field name="recordType">
                          {(field) => (
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Record / Encounter Type</label>
                              <input 
                                required
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => field.handleChange(e.target.value)}
                                placeholder="e.g. Clinical Assessment, X-Ray, Vet Report..."
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                              />
                            </div>
                          )}
                        </form.Field>

                        <form.Field name="vetName">
                          {(field) => (
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">External Vet Name (Optional)</label>
                              <input 
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => field.handleChange(e.target.value)}
                                placeholder="e.g. Dr. Sarah Jenkins"
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                              />
                            </div>
                          )}
                        </form.Field>
                      </div>

                      <div className="space-y-4">
                        <form.Field name="subjective">
                          {(field) => (
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Subjective (History & Observations)</label>
                              <textarea value={field.state.value} onBlur={field.handleBlur} onChange={(e) => field.handleChange(e.target.value)} rows={3} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none custom-scrollbar" />
                            </div>
                          )}
                        </form.Field>
                        <form.Field name="objective">
                          {(field) => (
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Objective (Physical Exam Findings)</label>
                              <textarea value={field.state.value} onBlur={field.handleBlur} onChange={(e) => field.handleChange(e.target.value)} rows={3} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none custom-scrollbar" />
                            </div>
                          )}
                        </form.Field>
                        <form.Field name="assessment">
                          {(field) => (
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Assessment (Diagnosis / Differentials)</label>
                              <textarea value={field.state.value} onBlur={field.handleBlur} onChange={(e) => field.handleChange(e.target.value)} rows={2} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none custom-scrollbar" />
                            </div>
                          )}
                        </form.Field>
                        <form.Field name="plan">
                          {(field) => (
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Plan (Treatment, Meds, Follow-up)</label>
                              <textarea value={field.state.value} onBlur={field.handleBlur} onChange={(e) => field.handleChange(e.target.value)} rows={3} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none custom-scrollbar" />
                            </div>
                          )}
                        </form.Field>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">External Documents & Imagery</label>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs font-black text-indigo-600 hover:text-indigo-700 flex items-center gap-1 uppercase tracking-widest">
                          <UploadCloud size={14} /> Attach Files
                        </button>
                        <input type="file" multiple ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".pdf,.jpg,.jpeg,.png,.docx" />
                      </div>

                      {files.length === 0 ? (
                        <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 hover:border-indigo-400 hover:text-indigo-500 transition-colors cursor-pointer">
                          <UploadCloud size={32} className="mb-2" />
                          <p className="text-xs font-black uppercase tracking-widest">Click to browse or drag files here</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {files.map((file, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                              <div className="flex items-center gap-3">
                                <File size={16} className="text-indigo-500" />
                                <span className="text-sm font-bold text-slate-700">{file.name}</span>
                                <span className="text-[10px] font-bold text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                              </div>
                              <button type="button" onClick={() => { setFiles(prev => prev.filter((_, i) => i !== index)) }} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <form.Subscribe
                      selector={(state) => [state.canSubmit, state.isSubmitting]}
                      children={([canSubmit, isSubmitting]) => (
                        <button 
                          type="submit" 
                          disabled={!canSubmit || isSubmitting || submitRecordMutation.isPending}
                          className="w-full p-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-emerald-500/20 flex justify-center items-center gap-2"
                        >
                          {(isSubmitting || submitRecordMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                          {(isSubmitting || submitRecordMutation.isPending) ? 'Committing Record to Database...' : 'Finalize & Save Record'}
                        </button>
                      )}
                    />
                  </form>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}