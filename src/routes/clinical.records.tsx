import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { reportExportService } from '../services/reportExportService';
import { format, parseISO, formatISO } from 'date-fns';
import { 
  Stethoscope, Plus, X, Search, Save, Loader2, Activity, AlertCircle, 
  Scale, WifiOff, CalendarDays, FilterX, Download, Clock 
} from 'lucide-react';

export const Route = createFileRoute('/clinical/records')({
  component: ClinicalRecordsPage,
});

export function ClinicalRecordsPage() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  
  // --- STRICT NETWORK HEARTBEAT ---
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
    const interval = setInterval(checkConnection, 15000); 

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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const scrollParentRef = useRef<HTMLDivElement>(null);

  // --- FACETED FILTER STATE ---
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const recordTypes = ['ROUTINE', 'ILLNESS', 'INJURY', 'VACCINATION'];

  const toggleType = (type: string) => {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const clearFilters = () => {
    setSelectedAnimalId('ALL');
    setStartDate('');
    setEndDate('');
    setSelectedTypes([]);
  };

  const { data: animals = [] } = useQuery({
    queryKey: ['active_animals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('id, name, species').eq('is_deleted', false).order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: isOnline
  });

  // --- INFINITE QUERY PIPELINE (UNBOUNDED SCALING) ---
  const { 
    data, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading 
  } = useInfiniteQuery({
    queryKey: ['clinical_records_infinite', selectedAnimalId, startDate, endDate, selectedTypes],
    queryFn: async ({ pageParam = 0 }) => {
      const limit = 30;
      let query = supabase.from('clinical_records').select('*, animals(name, species)').eq('is_deleted', false);
      
      if (selectedAnimalId !== 'ALL') query = query.eq('animal_id', selectedAnimalId);
      if (startDate) query = query.gte('record_date', new Date(startDate).toISOString());
      if (endDate) query = query.lte('record_date', new Date(endDate + 'T23:59:59').toISOString());
      if (selectedTypes.length > 0) query = query.in('record_type', selectedTypes);
      
      query = query.order('record_date', { ascending: false });
      query = query.range(pageParam * limit, (pageParam + 1) * limit - 1);
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    getNextPageParam: (lastPage, allPages) => lastPage.length === 30 ? allPages.length : undefined,
    initialPageParam: 0,
    enabled: isOnline
  });

  const records = useMemo(() => data ? data.pages.flat() : [], [data]);

  // --- VIRTUALIZER DYNAMIC HEIGHT ESTIMATION ---
  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? records.length + 1 : records.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => selectedAnimalId === 'ALL' ? 120 : 280, // Taller nodes for timeline narratives
    overscan: 5,
  });

  // --- INFINITE SCROLL LISTENER ---
  useEffect(() => {
    const [lastItem] = rowVirtualizer.getVirtualItems().slice(-1);
    if (!lastItem) return;
    if (lastItem.index >= records.length - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, fetchNextPage, records.length, isFetchingNextPage, rowVirtualizer.getVirtualItems()]);

  useEffect(() => {
    const handleResize = () => { rowVirtualizer.measure(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rowVirtualizer]);

  // --- REAL-TIME INVALIDATION ---
  useEffect(() => {
    const channel = supabase.channel('clinical-records-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clinical_records' }, () => {
        queryClient.invalidateQueries({ queryKey: ['clinical_records_infinite'], refetchType: 'active' });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportData = records.map((r: any) => [
        r.record_date ? format(parseISO(r.record_date), 'dd MMM yyyy HH:mm') : 'N/A',
        r.animals?.name || 'Unknown',
        r.record_type || 'EXAM',
        r.soap_assessment || 'N/A',
        r.soap_plan || 'N/A',
        r.external_vet_name || 'Staff Vet'
      ]);

      await reportExportService.exportSingleReport({
        title: selectedAnimalId === 'ALL' ? "Global Clinical Logs" : `Patient Chart: ${records[0]?.animals?.name}`,
        columns: ["Date", "Patient", "Type", "Diagnosis", "Plan", "Attending Vet"],
        data: exportData,
        generatorName: profile?.name || 'Veterinary Staff',
        dateRange: startDate && endDate ? `${startDate} to ${endDate}` : "Unbounded History"
      }, 'CLINICAL_RECORDS');
    } catch (error) {
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  // --- STRICT LOCKOUT RENDER ---
  if (!isOnline) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-32">
        <div className="bg-slate-900 text-white p-12 rounded-2xl shadow-2xl flex flex-col items-center justify-center text-center min-h-[60vh] border border-slate-800">
          <WifiOff size={64} className="mb-6 text-rose-500" />
          <h2 className="text-3xl font-black uppercase tracking-widest mb-3">Clinical Systems Locked</h2>
          <p className="font-bold text-slate-400 max-w-lg text-sm leading-relaxed">
            To enforce veterinary data integrity and prevent split-brain clinical errors, this module requires an active database connection. Offline caching is disabled.
          </p>
          <div className="mt-8 px-6 py-3 bg-slate-800 rounded-xl text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-3 border border-slate-700">
            <Loader2 size={16} className="animate-spin text-teal-500" /> Securing connection...
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
            <Stethoscope className="text-teal-600" size={24} /> Veterinary Records
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Clinical Patient Charting</p>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={handleExport}
            disabled={isExporting || records.length === 0}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2 bg-slate-100 text-slate-700 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-colors border border-slate-200 shadow-sm disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-teal-600 hover:bg-teal-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(13,148,136,0.15)]"
          >
            <Plus size={16} /> Log Exam
          </button>
        </div>
      </div>

      {/* --- ADVANCED FACETED FILTER ENGINE --- */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 ml-1">Patient Context</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select 
                value={selectedAnimalId} 
                onChange={(e) => setSelectedAnimalId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 shadow-sm appearance-none cursor-pointer"
              >
                <option value="ALL">Global Facility View (All Animals)</option>
                {animals.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.species})</option>)}
              </select>
            </div>
          </div>
          <div className="md:w-1/3">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 ml-1">Start Date</label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 shadow-sm" />
            </div>
          </div>
          <div className="md:w-1/3">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 ml-1">End Date</label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 shadow-sm" />
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap gap-2">
            {recordTypes.map(type => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border shadow-sm ${selectedTypes.includes(type) ? 'bg-teal-600 text-white border-teal-700' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                {type}
              </button>
            ))}
          </div>
          {(selectedAnimalId !== 'ALL' || startDate || endDate || selectedTypes.length > 0) && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-rose-600 hover:text-rose-700 px-3 py-1.5 bg-rose-50 rounded-lg transition-colors">
              <FilterX size={12} /> Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-20rem)] min-h-[500px]">
        {isLoading && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-sm"><Loader2 className="animate-spin text-teal-600 w-8 h-8" /></div>}
        
        {/* --- DUAL MODE RENDER ENGINE --- */}
        {selectedAnimalId === 'ALL' && (
          <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10 min-w-[900px]">
            <div className="col-span-2">Date</div>
            <div className="col-span-3">Patient</div>
            <div className="col-span-5">Primary Diagnosis (Assessment)</div>
            <div className="col-span-2 text-right">Attending</div>
          </div>
        )}

        <div ref={scrollParentRef} className="overflow-auto flex-1 custom-scrollbar min-w-[900px] relative">
          {records.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Stethoscope size={48} className="mb-4 opacity-20" />
              <p className="text-xs font-black uppercase tracking-widest mb-1">No Clinical Records Found</p>
              <p className="text-xs font-medium">Try adjusting your filters or date range.</p>
            </div>
          ) : (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {virtualItems.map((virtualRow) => {
                const isLoaderRow = virtualRow.index > records.length - 1;
                const record = records[virtualRow.index];

                if (isLoaderRow) {
                  return (
                    <div key="loader" className="absolute top-0 left-0 w-full flex justify-center py-6" style={{ transform: `translateY(${virtualRow.start}px)` }}>
                      <Loader2 className="animate-spin text-teal-500" size={24} />
                    </div>
                  );
                }

                // --- MODE A: COMMAND GRID (Facility View) ---
                if (selectedAnimalId === 'ALL') {
                  return (
                    <div key={record.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="absolute top-0 left-0 w-full transition-colors border-b border-slate-100 hover:bg-slate-50/60" style={{ transform: `translateY(${virtualRow.start}px)` }}>
                      <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center h-full">
                        <div className="col-span-2">
                          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            {record.record_date ? format(parseISO(record.record_date), 'dd MMM yy') : '--'}
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
                        <div className="col-span-5 pr-4">
                          <p className="text-xs font-bold text-slate-900 line-clamp-2">{record.soap_assessment || 'No diagnosis recorded.'}</p>
                        </div>
                        <div className="col-span-2 flex flex-col items-end gap-1.5">
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Dr. {record.external_vet_name || 'Staff'}</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                // --- MODE B: CLINICAL TIMELINE (Doctor's Notes View) ---
                return (
                  <div key={record.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="absolute top-0 left-0 w-full px-8 py-6" style={{ transform: `translateY(${virtualRow.start}px)` }}>
                    <div className="relative pl-8 border-l-2 border-slate-100">
                      
                      {/* Timeline Node Icon */}
                      <div className={`absolute top-0 left-[-17px] w-8 h-8 rounded-full border-4 border-white shadow-sm flex items-center justify-center ${record.record_type === 'ROUTINE' ? 'bg-blue-500' : record.record_type === 'INJURY' ? 'bg-amber-500' : record.record_type === 'ILLNESS' ? 'bg-rose-500' : 'bg-emerald-500'}`}>
                        {record.record_type === 'ROUTINE' ? <Activity size={12} className="text-white" /> : <Stethoscope size={12} className="text-white" />}
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 border-b border-slate-200 pb-4">
                          <div>
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                              {record.record_date ? format(parseISO(record.record_date), 'dd MMMM yyyy HH:mm') : 'Unknown Date'}
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${record.record_type === 'ROUTINE' ? 'bg-blue-100 text-blue-700 border-blue-200' : record.record_type === 'INJURY' ? 'bg-amber-100 text-amber-700 border-amber-200' : record.record_type === 'ILLNESS' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                                {record.record_type}
                              </span>
                            </h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 flex items-center gap-3">
                              <span>Attending: Dr. {record.external_vet_name || 'Staff'}</span>
                              <span className="flex items-center gap-1"><Scale size={10} /> {record.weight_grams}g</span>
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {(record.soap_subjective || record.soap_objective) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {record.soap_subjective && (
                                <div>
                                  <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Subjective (History)</h4>
                                  <p className="text-xs font-medium text-slate-700 leading-relaxed">{record.soap_subjective}</p>
                                </div>
                              )}
                              {record.soap_objective && (
                                <div>
                                  <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Objective (Findings)</h4>
                                  <p className="text-xs font-medium text-slate-700 leading-relaxed">{record.soap_objective}</p>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="bg-white border border-slate-200 p-4 rounded-xl">
                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Assessment (Diagnosis)</h4>
                            <p className="text-sm font-black text-slate-900">{record.soap_assessment || 'No formal assessment.'}</p>
                          </div>
                          <div>
                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Plan (Treatment & Prescriptions)</h4>
                            <p className="text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{record.soap_plan || 'No treatment plan documented.'}</p>
                          </div>
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

      {isModalOpen && <ClinicalRecordModal onClose={() => setIsModalOpen(false)} animals={animals} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// V3 STRICT SCHEMA MODAL (UNCHANGED INTEGRITY)
// ---------------------------------------------------------------------------
function ClinicalRecordModal({ onClose, animals }: { onClose: () => void, animals: any[] }) {
  const queryClient = useQueryClient();
  const { user } = useAuth(); 
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('clinical_records').insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical_records_infinite'] });
    }
  });

  const form = useForm({
    defaultValues: {
      animal_id: '',
      record_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      record_type: 'ROUTINE',
      weight_grams: '', 
      soap_subjective: '',
      soap_objective: '',
      soap_assessment: '',
      soap_plan: '',
      external_vet_name: '' 
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
          weight_grams: Number(value.weight_grams),
          conductor_role: 'VETERINARIAN',
          conducted_by: user.id,
          created_by: user.id,
          modified_by: user.id,
          external_vet_name: value.external_vet_name || null,
          soap_subjective: value.soap_subjective || '',
          soap_objective: value.soap_objective || '',
          soap_assessment: value.soap_assessment,
          soap_plan: value.soap_plan,
          is_deleted: false
        };

        await saveMutation.mutateAsync(payload);
        onClose(); 
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to securely save clinical record. Check constraints.');
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