import React, { useState, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { format } from 'date-fns';
import { 
  Stethoscope, FileText, UploadCloud, File, Trash2, Loader2, 
  Search, AlertCircle, Syringe, Calendar, UserCheck, Paperclip, 
  ChevronRight, Clock
} from 'lucide-react';

export const Route = createFileRoute('/clinical/records')({
  component: ClinicalRecordsDashboard,
});

export function ClinicalRecordsDashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [selectedAnimal, setSelectedAnimal] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'timeline' | 'new'>('timeline');

  // Form State
  const [recordType, setRecordType] = useState('Clinical Assessment');
  const [vetName, setVetName] = useState('');
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch Animals (Left Sidebar)
  const { data: animals, isLoading: loadingAnimals } = useQuery({
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
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24 * 15,
    networkMode: 'offlineFirst',
    meta: { persist: true }
  });

  // 2. Fetch Selected Animal's History (Timeline)
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
    networkMode: 'offlineFirst',
  });

  // 3. Multi-part File Upload Mutation (SOAP + PDFs)
  const submitRecord = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Authentication error.");

      const recordPayload: any = {
        animal_id: selectedAnimal,
        record_date: new Date().toISOString(),
        record_type: recordType, 
        soap_subjective: subjective || null,
        soap_objective: objective || null,
        soap_assessment: assessment || null,
        soap_plan: plan || null,
        vet_name: vetName || null,
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

      // Process External File Uploads Concurrently
      if (files.length > 0) {
        const uploadPromises = files.map(async (file) => {
          const fileExt = file.name.split('.').pop();
          const fileName = `${selectedAnimal}/${record.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          const { error: uploadErr } = await supabase.storage
            .from('clinical-documents')
            .upload(fileName, file, { cacheControl: '3600', upsert: false });
            
          if (uploadErr) throw uploadErr;

          const { data: publicUrl } = supabase.storage
            .from('clinical-documents')
            .getPublicUrl(fileName);

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

        const { error: attachErr } = await supabase
          .from('clinical_attachments')
          .insert(attachments);

        if (attachErr) throw attachErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical_history', selectedAnimal] });
      setActiveTab('timeline');
      // Reset Form
      setRecordType('Clinical Assessment');
      setSubjective(''); setObjective(''); setAssessment(''); setPlan('');
      setVetName(''); setFiles([]);
    }
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files as FileList)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
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

      {/* Mobile-Only Warning */}
      <div className="lg:hidden p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 shadow-sm shrink-0">
        <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-amber-800">Mobile Restriction Active</p>
          <p className="text-xs font-medium text-amber-700 mt-1">Clinical data entry is restricted to desktop workstations. You may view historical timelines only.</p>
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
                  {/* Desktop Only Tabs */}
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

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50">
                
                {/* -----------------