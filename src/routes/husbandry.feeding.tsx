import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CalendarClock, Plus, Trash2, Loader2, Utensils, RefreshCw, Calendar as CalIcon, Filter, AlertCircle } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Animal, FeedingSchedule as FeedingScheduleType, OperationalList } from '../types';
import { feedingService } from '../services/feedingService';

const getAnimalsOptions = () => queryOptions({
  queryKey: ['animals', 'dashboard'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('*').eq('archived', false);
    if (error) throw error;
    return data as Animal[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const getSchedulesOptions = () => queryOptions({
  queryKey: ['feeding_schedules'],
  queryFn: async () => {
    const maxDateStr = format(addDays(new Date(), 30), 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('feeding_schedules')
      .select('*')
      .eq('is_deleted', false)
      .lte('scheduled_date', maxDateStr);
    if (error) throw error;
    return data as FeedingScheduleType[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const getFoodOptions = () => queryOptions({
  queryKey: ['operational_lists', 'FOOD_TYPE'],
  queryFn: async () => {
    const { data, error } = await supabase.from('operational_lists').select('*').eq('category', 'FOOD_TYPE').eq('is_deleted', false);
    if (error) throw error;
    return data as OperationalList[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/husbandry/feeding')({
  loader: async ({ context: { queryClient } }) => {
    if (queryClient) {
      await Promise.all([
        queryClient.ensureQueryData(getAnimalsOptions()),
        queryClient.ensureQueryData(getSchedulesOptions()),
        queryClient.ensureQueryData(getFoodOptions())
      ]);
    }
  },
  component: FeedingSchedulePage,
});

const getLocalDateString = () => format(new Date(), 'yyyy-MM-dd');

export function FeedingSchedulePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  
  const [activeTab, setActiveTab] = useState<string>('EXOTIC');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const categories = ['OWL', 'RAPTOR', 'MAMMAL', 'EXOTIC'];

  const [filterAnimalId, setFilterAnimalId] = useState<string>('ALL');
  const [viewLayout, setViewLayout] = useState<'individual' | 'grouped'>('individual');

  useEffect(() => {
    const channel = supabase
      .channel('feeding-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feeding_schedules' },
        (payload) => {
          // AUDIT FIX 2A: Restrict invalidation to active queries to prevent cache thrashing
          queryClient.invalidateQueries({ queryKey: ['feeding_schedules'], refetchType: 'active' });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: animals = [], isLoading: loadingAnimals } = useQuery(getAnimalsOptions());
  const { data: schedules = [], isLoading: loadingSchedules } = useQuery(getSchedulesOptions());
  const { data: foodOptions = [], isLoading: loadingFood } = useQuery(getFoodOptions());

  const deleteSingleMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      if (!user?.id) throw new Error('Unauthorized');
      await feedingService.deleteSchedule(scheduleId, user.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] })
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (scheduleIds: string[]) => {
      if (!user?.id) throw new Error('Unauthorized');
      await Promise.all(scheduleIds.map(id => feedingService.deleteSchedule(id, user.id)));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] })
  });

  const filteredAnimals = useMemo(() => 
    animals.filter(a => (a.category || '').toUpperCase() === activeTab),
  [animals, activeTab]);

  const upcomingSchedules = useMemo(() => 
    [...schedules].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
  [schedules]);

  const displayedSchedules = useMemo(() => {
      let filtered = upcomingSchedules;
      if (filterAnimalId !== 'ALL') {
          filtered = filtered.filter(s => s.animal_id === filterAnimalId);
      }
      return filtered;
  }, [upcomingSchedules, filterAnimalId]);

  const groupedSchedules = useMemo(() => {
      const groups = new Map();
      displayedSchedules.forEach(schedule => {
          const isNotRequired = schedule.notes === 'FAST DAY / NOT REQUIRED';
          const supplementKey = schedule.supplements || 'none';
          const key = `${schedule.animal_id}_${schedule.food_type}_${schedule.quantity}_${supplementKey}_${isNotRequired}`;
          
          if (!groups.has(key)) {
              groups.set(key, { 
                  ...schedule, count: 1, end_date: schedule.scheduled_date, start_date: schedule.scheduled_date, child_ids: [schedule.id],
                  feed_not_required: isNotRequired
              });
          } else {
              const existing = groups.get(key);
              existing.count += 1;
              if (schedule.scheduled_date > existing.end_date) existing.end_date = schedule.scheduled_date;
              if (schedule.scheduled_date < existing.start_date) existing.start_date = schedule.scheduled_date;
              existing.child_ids.push(schedule.id);
          }
      });
      return Array.from(groups.values());
  }, [displayedSchedules]);

  const form = useForm({
    defaultValues: {
      animal_id: '',
      food_type: '',
      quantity: 1,
      calci_dust: false,
      feed_not_required: false,
      schedule_mode: 'single' as 'single' | 'interval',
      target_date: getLocalDateString(),
      interval_days: 3,
      occurrences: 5
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      try {
        let datesToSchedule: string[] = [];

        // AUDIT FIX 1A: Strict local Date math decoupling to prevent UTC timezone drift
        if (value.schedule_mode === 'single') {
            datesToSchedule.push(value.target_date);
        } else {
            const [y, m, d] = value.target_date.split('-').map(Number);
            const startDate = new Date(y, m - 1, d);
            
            // AUDIT FIX 3B: Hard cap on occurrences to prevent UI/DB flooding
            const safeOccurrences = Math.min(value.occurrences, 60);

            for (let i = 0; i < safeOccurrences; i++) {
                const nextDate = new Date(startDate);
                nextDate.setDate(startDate.getDate() + (i * value.interval_days));
                
                const ny = nextDate.getFullYear();
                const nm = String(nextDate.getMonth() + 1).padStart(2, '0');
                const nd = String(nextDate.getDate()).padStart(2, '0');
                datesToSchedule.push(`${ny}-${nm}-${nd}`);
            }
        }

        const newSchedules: Partial<FeedingScheduleType>[] = datesToSchedule.map(date => ({
            animal_id: value.animal_id,
            scheduled_date: date,
            food_type: value.feed_not_required ? 'NOT REQUIRED' : value.food_type,
            quantity: value.feed_not_required ? 0 : value.quantity,
            quantity_unit: 'item', 
            status: 'PENDING',
            supplements: value.calci_dust ? 'Calci-Dust' : null,
            notes: value.feed_not_required ? 'FAST DAY / NOT REQUIRED' : null,
            presentation_method: null,
            is_deleted: false,
        }));

        if (!user?.id) throw new Error('User context unavailable');
        
        await feedingService.bulkCreateSchedules(newSchedules as any, user.id);
        queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] });
        form.reset();

      } catch (err: any) {
        console.error('Failed to generate schedules:', err);
        setErrorMsg(err.message || 'Failed to generate feeding schedules. Please check connection.');
      }
    }
  });

  const inputClass = "w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-sm";

  const activeList = viewLayout === 'individual' ? displayedSchedules : groupedSchedules;

  const rowVirtualizer = useVirtualizer({
    count: activeList.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 64,
    overscan: 5,
  });

  // AUDIT FIX 2B: Ensure resizing the browser/tablet dynamically recalibrates the layout
  useEffect(() => {
    const handleResize = () => { rowVirtualizer.measure(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rowVirtualizer]);

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            Feeding Schedule
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Plan & Forecast Animal Diets</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        
        {/* LEFT: FORM */}
        <div className="xl:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
           <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
              <Plus size={16} className="text-emerald-600"/> Generate Schedules
           </h4>

           {errorMsg && (
             <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs font-medium">
               <AlertCircle size={16} className="shrink-0 mt-0.5" />
               <div>{errorMsg}</div>
             </div>
           )}

           <div className="flex overflow-x-auto scrollbar-hide bg-slate-50 p-1.5 rounded-xl gap-1 mb-5 border border-slate-200">
              {categories.map(cat => (
                  <button 
                      key={cat} onClick={() => { setActiveTab(cat); form.setFieldValue('animal_id', ''); }}
                      className={`flex-1 min-w-[70px] py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === cat ? 'bg-white text-emerald-700 border border-emerald-200 shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}
                  >
                      {cat}
                  </button>
              ))}
           </div>

           <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="space-y-4">
              <form.Field name="animal_id" children={(field) => (
                  <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Animal *</label>
                      <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} disabled={loadingAnimals} required>
                          <option value="">{loadingAnimals ? 'Loading animals...' : 'Select Animal...'}</option>
                          {filteredAnimals.map(a => <option key={a.id} value={a.id!}>{a.name} ({a.species})</option>)}
                      </select>
                  </div>
              )}/>

              <form.Field name="feed_not_required" children={(field) => (
                  <div className="flex items-center gap-3 bg-rose-50 p-3 rounded-xl border border-rose-200">
                      <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.checked)} className="w-4 h-4 text-rose-600 bg-white rounded border-rose-300 focus:ring-rose-500/50" />
                      <span className="text-xs font-bold text-rose-700 uppercase tracking-widest">Fast Day / Not Required</span>
                  </div>
              )}/>

              <form.Subscribe selector={(state) => state.values.feed_not_required} children={(notRequired) => (
                !notRequired ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                        <form.Field name="food_type" children={(field) => (
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Food Type *</label>
                                {foodOptions.length > 0 ? (
                                    <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} disabled={loadingFood} required>
                                        <option value="">{loadingFood ? 'Loading...' : 'Select...'}</option>
                                        {foodOptions.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                                    </select>
                                ) : (
                                    <input value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} placeholder="E.g. Mice" required />
                                )}
                            </div>
                        )}/>
                        <form.Field name="quantity" children={(field) => (
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Quantity *</label>
                                <input type="number" step="0.1" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(parseFloat(e.target.value))} className={inputClass} required />
                            </div>
                        )}/>
                    </div>

                    <form.Field name="calci_dust" children={(field) => (
                        <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                            <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.checked)} className="w-4 h-4 text-emerald-600 bg-white rounded border-slate-300 focus:ring-emerald-500/50" />
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Include Calci-Dust</span>
                        </div>
                    )}/>
                  </>
                ) : null
              )}/>

              <div className="pt-4 border-t border-slate-100">
                  <form.Field name="schedule_mode" children={(field) => (
                      <div className="flex bg-slate-50 p-1.5 rounded-xl border border-slate-200 mb-4">
                          <button type="button" onClick={() => field.handleChange('single')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${field.state.value === 'single' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}>Single Feed</button>
                          <button type="button" onClick={() => field.handleChange('interval')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1.5 ${field.state.value === 'interval' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}><RefreshCw size={12}/> Auto-Interval</button>
                      </div>
                  )}/>

                  <form.Subscribe selector={(state) => state.values.schedule_mode} children={(mode) => (
                      <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                          <form.Field name="target_date" children={(field) => (
                              <div>
                                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">{mode === 'interval' ? 'Start Date' : 'Target Date'} *</label>
                                  <input type="date" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} required/>
                              </div>
                          )}/>
                          
                          {mode === 'interval' && (
                              <div className="grid grid-cols-2 gap-4">
                                  <form.Field name="interval_days" children={(field) => (
                                      <div>
                                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Repeat Every (Days)</label>
                                          <input type="number" min="1" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(parseInt(e.target.value))} className={inputClass} required/>
                                      </div>
                                  )}/>
                                  <form.Field name="occurrences" children={(field) => (
                                      <div>
                                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Occurrences</label>
                                          <input type="number" min="1" max="60" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(parseInt(e.target.value))} className={inputClass} required/>
                                      </div>
                                  )}/>
                              </div>
                          )}
                      </div>
                  )}/>
              </div>

              <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]} children={([canSubmit, isSubmitting]) => (
                  <button type="submit" disabled={!canSubmit || isSubmitting as boolean || loadingSchedules} className="w-full mt-4 bg-emerald-600 text-white py-3.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center justify-center gap-2">
                      {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
                      {isSubmitting ? 'SCHEDULING...' : 'CONFIRM SCHEDULE'}
                  </button>
              )}/>
           </form>
        </div>

        {/* RIGHT: TABLE */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-10rem)] min-h-[600px] overflow-hidden">
           
           <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
               <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      <Utensils size={16} className="text-emerald-600"/> Scheduled Feeds
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-widest">{displayedSchedules.length} Pending Feeds</p>
               </div>

               <div className="flex flex-wrap items-center gap-3">
                   <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
                       <Filter size={14} className="text-slate-400 ml-2" />
                       <select 
                          value={filterAnimalId} 
                          onChange={(e) => setFilterAnimalId(e.target.value)}
                          className="bg-transparent text-[10px] font-black text-slate-700 uppercase tracking-widest border-none focus:ring-0 cursor-pointer outline-none py-1 pr-2 w-32 truncate"
                       >
                           <option value="ALL">All Animals</option>
                           {animals.map(a => <option key={a.id} value={a.id!}>{a.name}</option>)}
                       </select>
                   </div>

                   <div className="bg-slate-100 p-1.5 rounded-xl flex border border-slate-200">
                       <button onClick={() => setViewLayout('individual')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewLayout === 'individual' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}>Individual</button>
                       <button onClick={() => setViewLayout('grouped')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewLayout === 'grouped' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}>Grouped</button>
                   </div>
               </div>
           </div>

           <div ref={scrollParentRef} className="flex-1 overflow-y-auto relative custom-scrollbar">
              {loadingSchedules && (
                <div className="absolute inset-0 z-20 bg-white/50 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="animate-spin text-emerald-600 w-8 h-8" />
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Syncing Data...</span>
                    </div>
                </div>
              )}
              <table className="w-full text-left min-w-[600px]">
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/4">Date</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/3">Animal</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/3">Diet specifics</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Action</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {!loadingSchedules && activeList.length === 0 ? (
                           <tr><td colSpan={4} className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No upcoming schedules found.</td></tr>
                      ) : (
                          <>
                              {paddingTop > 0 && <tr><td colSpan={4} style={{ height: `${paddingTop}px` }} /></tr>}
                              {virtualItems.map((virtualRow) => {
                                  const item = activeList[virtualRow.index];
                                  
                                  if (viewLayout === 'individual') {
                                      const schedule = item as FeedingScheduleType;
                                      const animal = animals.find(a => a.id === schedule.animal_id);
                                      const [y, m, d] = schedule.scheduled_date.split('-').map(Number);
                                      const dateObj = new Date(y, m - 1, d);
                                      const isToday = schedule.scheduled_date === getLocalDateString();
                                      const isNotRequired = schedule.notes === 'FAST DAY / NOT REQUIRED';
                                      
                                      // AUDIT FIX 1B: Explicit row-level lock check
                                      const isDeleting = deleteSingleMutation.isPending && deleteSingleMutation.variables === schedule.id;

                                      return (
                                          <tr key={schedule.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50 transition-colors group">
                                              <td className="px-6 py-4">
                                                  <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-[10px] font-black uppercase tracking-widest ${isToday ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                                                      <CalIcon size={12}/> {format(dateObj, 'd MMM')}
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <p className="text-xs font-bold text-slate-900 uppercase tracking-tight">{animal?.name || 'Unknown'}</p>
                                              </td>
                                              <td className="px-6 py-4">
                                                  {isNotRequired ? (
                                                    <p className="text-xs font-bold text-rose-600 uppercase tracking-widest">NOT REQUIRED</p>
                                                  ) : (
                                                    <>
                                                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">{schedule.quantity}x {schedule.food_type}</p>
                                                      {schedule.supplements && <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 block">+ {schedule.supplements}</span>}
                                                    </>
                                                  )}
                                              </td>
                                              <td className="px-6 py-4 text-right">
                                                  <button 
                                                    onClick={() => deleteSingleMutation.mutate(schedule.id!)}
                                                    disabled={isDeleting}
                                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                                  >
                                                      {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                                  </button>
                                              </td>
                                          </tr>
                                      );
                                  } else {
                                      const group = item as any;
                                      const animal = animals.find(a => a.id === group.animal_id);
                                      const [sy, sm, sd] = group.start_date.split('-').map(Number);
                                      const startDateObj = new Date(sy, sm - 1, sd);
                                      const [ey, em, ed] = group.end_date.split('-').map(Number);
                                      const endDateObj = new Date(ey, em - 1, ed);

                                      // AUDIT FIX 1B: Group-level specific locking
                                      const isDeletingGroup = deleteGroupMutation.isPending && deleteGroupMutation.variables === group.child_ids;

                                      return (
                                          <tr key={virtualRow.index} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50 transition-colors group">
                                              <td className="px-6 py-4">
                                                  <div className="flex flex-col gap-1">
                                                      <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md border bg-slate-100 border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest w-fit">
                                                          Start: {format(startDateObj, 'd MMM')}
                                                      </div>
                                                      {group.count > 1 && (
                                                          <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md border bg-slate-100 border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest w-fit">
                                                              End: {format(endDateObj, 'd MMM')}
                                                          </div>
                                                      )}
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <p className="text-xs font-bold text-slate-900 uppercase tracking-tight">{animal?.name || 'Unknown'}</p>
                                              </td>
                                              <td className="px-6 py-4">
                                                  {group.feed_not_required ? (
                                                    <p className="text-xs font-bold text-rose-600 uppercase tracking-widest">NOT REQUIRED</p>
                                                  ) : (
                                                    <>
                                                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">{group.quantity}x {group.food_type} <span className="text-slate-400">({group.count} feeds)</span></p>
                                                      {group.supplements && <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 block">+ {group.supplements}</span>}
                                                    </>
                                                  )}
                                              </td>
                                              <td className="px-6 py-4 text-right">
                                                  <button 
                                                    onClick={() => deleteGroupMutation.mutate(group.child_ids)}
                                                    disabled={isDeletingGroup}
                                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50" 
                                                    title="Delete entire group"
                                                  >
                                                      {isDeletingGroup ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                                  </button>
                                              </td>
                                          </tr>
                                      );
                                  }
                              })}
                              {paddingBottom > 0 && <tr><td colSpan={4} style={{ height: `${paddingBottom}px` }} /></tr>}
                          </>
                      )}
                  </tbody>
              </table>
           </div>
        </div>
      </div>
    </div>
  );
}