import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { 
  CheckCircle2, AlertCircle, Droplets, Lock, HeartPulse, 
  ChevronLeft, ChevronRight, Loader2, Edit3, X, Save
} from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { dailyRoundsService } from '../services/dailyRoundsService';
import { Animal, DailyRound } from '../types';

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const getAnimalsOptions = () => queryOptions({
  queryKey: ['animals', 'dashboard'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('*').order('name');
    if (error) throw error;
    return data as Animal[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const getRoundsOptions = (date: string, shift: string) => queryOptions({
  queryKey: ['daily_rounds', date, shift],
  queryFn: () => dailyRoundsService.getRoundsByDateAndShift(date, shift),
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

// ------------------------------------------------------------------
// 2. ROUTE CONFIGURATION (Pre-fetching Loaders)
// ------------------------------------------------------------------
export const Route = createFileRoute('/husbandry/rounds')({
  loader: async ({ context: { queryClient } }) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const defaultShift = 'Morning';
    
    // @ts-ignore
    if (queryClient) {
      // @ts-ignore
      await Promise.all([
        queryClient.ensureQueryData(getAnimalsOptions()),
        queryClient.ensureQueryData(getRoundsOptions(today, defaultShift))
      ]);
    }
  },
  component: DailyRoundsPage,
});

const SECTION_BAR = [
  { id: 'ALL', label: 'All' },
  { id: 'OWL', label: 'Owls' },
  { id: 'RAPTOR', label: 'Raptors' },
  { id: 'MAMMAL', label: 'Mammal' },
  { id: 'EXOTIC', label: 'Exotic' }
] as const;

const SHIFT_OPTIONS = ['Morning', 'Afternoon'];

// ------------------------------------------------------------------
// 3. MAIN COMPONENT
// ------------------------------------------------------------------
export function DailyRoundsPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  
  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );
  
  const [activeSection, setActiveSection] = useState<string>('ALL');
  const [activeShift, setActiveShift] = useState<string>('Morning');
  
  const [draftRounds, setDraftRounds] = useState<Record<string, Partial<DailyRound>>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [initials, setInitials] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [noteModalState, setNoteModalState] = useState<{
    isOpen: boolean;
    animal: Animal | null;
    round: DailyRound | null;
    currentNote: string;
  }>({
    isOpen: false,
    animal: null,
    round: null,
    currentNote: ''
  });

  // ------------------------------------------------------------------
  // SUPABASE REALTIME CACHE INVALIDATION (GHOST RECORD FIX)
  // ------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('rounds-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_rounds' },
        (payload) => {
          console.log('[Sync Engine] External mutation detected. Purging local cache:', payload);
          queryClient.invalidateQueries({ queryKey: ['daily_rounds'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  React.useEffect(() => {
    if (profile?.initials) {
      setInitials(profile.initials);
    }
  }, [profile]);

  React.useEffect(() => {
    setDraftRounds({});
    setHasUnsavedChanges(false);
    setSubmissionStatus(null);
  }, [selectedDate, activeShift]);

  const { data: animals = [], isLoading: loadingAnimals } = useQuery(getAnimalsOptions());
  const { data: rounds = [], isLoading: loadingRounds, error: roundsError } = useQuery(getRoundsOptions(selectedDate, activeShift));

  const filteredWorksheetRecords = useMemo(() => {
    const cleanAnimals = animals.filter(a => {
      if (a.status === 'ARCHIVED') return false;
      if (activeSection === 'ALL') return true;
      return a.category === activeSection;
    });

    const roundMap = new Map<string, DailyRound>();
    rounds.forEach(r => {
      roundMap.set(r.animal_id, r);
    });

    return cleanAnimals.map(animal => {
      const dbRound = roundMap.get(animal.id) || null;
      const draft = draftRounds[animal.id];
      const mergedRound = draft ? { ...dbRound, ...draft } as DailyRound : dbRound;

      return {
        animal,
        round: mergedRound
      };
    });
  }, [animals, rounds, activeSection, draftRounds]);

  const shiftDate = (days: number) => {
    const current = parseISO(selectedDate);
    const nextDate = addDays(current, days);
    setSelectedDate(format(nextDate, 'yyyy-MM-dd'));
  };

  const handleToggle = (animal: Animal, currentRound: DailyRound | null, field: 'is_alive' | 'water_checked' | 'locks_secured') => {
    const currentAlive = currentRound ? currentRound.is_alive : false;
    const currentWater = currentRound ? currentRound.water_checked : false;
    const currentLocks = currentRound ? currentRound.locks_secured : false;

    const newAliveState = field === 'is_alive' ? !currentAlive : currentAlive;
    const newWaterState = field === 'water_checked' ? !currentWater : currentWater;
    const newLocksState = field === 'locks_secured' ? !currentLocks : currentLocks;

    setDraftRounds(prev => ({
      ...prev,
      [animal.id]: {
        ...prev[animal.id],
        animal_id: animal.id,
        is_alive: newAliveState,
        water_checked: newWaterState,
        locks_secured: newLocksState,
        animal_issue_note: prev[animal.id]?.animal_issue_note !== undefined ? prev[animal.id].animal_issue_note : (currentRound?.animal_issue_note || null)
      }
    }));
    setHasUnsavedChanges(true);
    setSubmissionStatus(null);
  };

  const handleSubmitBulk = async () => {
    if (Object.keys(draftRounds).length === 0 || !initials.trim()) return;

    setIsSubmitting(true);
    setSubmissionStatus(null);
    try {
      const payloads = Object.values(draftRounds).map(draft => {
        const animal = animals.find(a => a.id === draft.animal_id);
        const dbRound = rounds.find(r => r.animal_id === draft.animal_id);
        
        return {
          animal_id: draft.animal_id!,
          date: selectedDate,
          shift: activeShift,
          section: animal?.category || null,
          is_alive: draft.is_alive ?? (dbRound?.is_alive ?? false),
          water_checked: draft.water_checked ?? (dbRound?.water_checked ?? false),
          locks_secured: draft.locks_secured ?? (dbRound?.locks_secured ?? false),
          animal_issue_note: draft.animal_issue_note !== undefined ? draft.animal_issue_note : (dbRound?.animal_issue_note || null)
        };
      });

      await dailyRoundsService.bulkUpsertRounds(payloads);
      
      await queryClient.invalidateQueries({ queryKey: ['daily_rounds', selectedDate, activeShift] });
      
      setDraftRounds({});
      setHasUnsavedChanges(false);
      setSubmissionStatus({
        type: 'success',
        message: `Welfare sheet updated: Synchronized ${payloads.length} shift rounds.`
      });
      
      setTimeout(() => {
        setSubmissionStatus(prev => prev?.type === 'success' ? null : prev);
      }, 6000);
    } catch (err: any) {
      console.error("Batch upload failed", err);
      setSubmissionStatus({
        type: 'error',
        message: err.message || 'Database synchronization failure. Please verify network links.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ------------------------------------------------------------------
  // 4. WINDOW VIRTUALIZER (DOM PROTECTION WITHOUT UI/UX SHIFT)
  // ------------------------------------------------------------------
  const rowVirtualizer = useWindowVirtualizer({
    count: filteredWorksheetRecords.length,
    estimateSize: () => 80, // Approximate row height for welfare checks
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;


  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm col-span-full">
        <div className="flex items-center justify-between xl:justify-start gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Daily Welfare Rounds</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">
              Visual Health, Hydration & Security Checklist
            </p>
          </div>
          
          {hasUnsavedChanges && (
            <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-[9px] font-black uppercase tracking-widest animate-pulse flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block"></span>
              Unsaved Draft Workspace
            </div>
          )}
        </div>
        
        <div className="flex flex-col lg:flex-row items-center gap-4 self-center xl:self-auto w-full xl:w-auto">
          
          <div className="flex gap-1 bg-slate-100 p-1 border rounded-xl shadow-inner w-full lg:w-auto overflow-x-auto custom-scrollbar shrink-0">
            {SHIFT_OPTIONS.map(shift => (
              <button
                key={shift}
                onClick={() => setActiveShift(shift)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex-1 lg:flex-none ${
                  activeShift === shift 
                    ? 'bg-blue-600 text-white shadow-sm border border-blue-500' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {shift} SHIFT
              </button>
            ))}
          </div>

          <div className="flex gap-1 bg-slate-100 p-1 border rounded-xl shadow-inner overflow-x-auto w-full lg:w-auto custom-scrollbar shrink-0">
            {SECTION_BAR.map(btn => (
              <button
                key={btn.id}
                onClick={() => setActiveSection(btn.id)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                  activeSection === btn.id 
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner w-full lg:w-auto justify-between lg:justify-start shrink-0">
            <button onClick={() => shiftDate(-1)} className="p-2 text-slate-600 hover:bg-white hover:text-slate-900 rounded-lg transition-all shadow-sm">
              <ChevronLeft size={14} />
            </button>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-xs font-black uppercase tracking-widest text-slate-700 outline-none text-center px-2 w-32"
            />
            <button onClick={() => shiftDate(1)} className="p-2 text-slate-600 hover:bg-white hover:text-slate-900 rounded-lg transition-all shadow-sm">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {hasUnsavedChanges && (
        <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-xl text-xs font-bold text-amber-800 flex items-center gap-3">
          <AlertCircle size={18} className="text-amber-600 shrink-0" />
          <span>
            Notice: You have <strong>{Object.keys(draftRounds).length} unsaved animal welfare record change(s)</strong>. Changes are kept in local draft memory and will be permanently committed to the database server in bulk once signed off and submitted below. Switching dates or shifts will flush the draft.
          </span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {roundsError ? (
          <div className="p-10 text-center text-rose-600 bg-rose-50 font-bold flex flex-col items-center gap-3">
            <AlertCircle size={24} />
            Database link exception. Verify network availability to sync rounds.
          </div>
        ) : loadingAnimals || loadingRounds ? (
          <div className="h-64 flex flex-col items-center justify-center gap-4">
            <Loader2 size={24} className="text-blue-500 animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Synchronizing Shift Matrix...</span>
          </div>
        ) : (
          <div className="w-full overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4 min-w-[200px]">Entity Matrix</th>
                  <th className="px-4 py-4 w-32 text-center">Visual Health</th>
                  <th className="px-4 py-4 w-32 text-center">Water Quality</th>
                  <th className="px-4 py-4 w-32 text-center">Lock Security</th>
                  <th className="px-6 py-4">Welfare / Issue Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700 bg-white">
                {filteredWorksheetRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-slate-400 font-black uppercase tracking-widest bg-slate-50/30">
                      No active records match the current section parameters.
                    </td>
                  </tr>
                ) : (
                  <>
                    {paddingTop > 0 && <tr><td colSpan={5} style={{ height: `${paddingTop}px` }} /></tr>}
                    {virtualItems.map((virtualRow) => {
                      const { animal, round } = filteredWorksheetRecords[virtualRow.index];
                      const isAlive = round?.is_alive || false;
                      const isWater = round?.water_checked || false;
                      const isLocked = round?.locks_secured || false;
                      const isComplete = isAlive && isWater && isLocked;
                      const isDraft = draftRounds[animal.id] !== undefined;

                      return (
                        <tr 
                          key={animal.id} 
                          ref={rowVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          className={`transition-colors duration-150 group ${isComplete ? 'bg-emerald-50/30 hover:bg-emerald-100/40' : 'bg-white hover:bg-slate-100'}`}
                        >
                          
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="font-black text-slate-900 text-sm leading-tight flex items-center gap-2">
                                {animal.name}
                                {isComplete && <CheckCircle2 size={14} className="text-emerald-500" />}
                                {isDraft && <span className="bg-amber-100 text-amber-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Draft</span>}
                              </span>
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">
                                {animal.species}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            <button
                              onClick={() => handleToggle(animal, round, 'is_alive')}
                              className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center transition-all shadow-md border-2 ${
                                isAlive 
                                  ? 'bg-emerald-600 border-emerald-700 text-white shadow-emerald-600/30 hover:bg-emerald-700' 
                                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700'
                              }`}
                            >
                              <HeartPulse size={24} className={isAlive ? 'scale-110' : 'opacity-80'} />
                            </button>
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            <button
                              onClick={() => handleToggle(animal, round, 'water_checked')}
                              className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center transition-all shadow-md border-2 ${
                                isWater 
                                  ? 'bg-blue-600 border-blue-700 text-white shadow-blue-600/30 hover:bg-blue-700' 
                                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700'
                              }`}
                            >
                              <Droplets size={24} className={isWater ? 'scale-110' : 'opacity-80'} />
                            </button>
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            <button
                              onClick={() => handleToggle(animal, round, 'locks_secured')}
                              className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center transition-all shadow-md border-2 ${
                                isLocked 
                                  ? 'bg-amber-500 border-amber-600 text-white shadow-amber-500/30 hover:bg-amber-600' 
                                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700'
                              }`}
                            >
                              <Lock size={22} className={isLocked ? 'scale-110' : 'opacity-80'} />
                            </button>
                          </td>

                          <td className="px-6 py-4 max-w-xs text-slate-500 font-medium leading-relaxed">
                            <button
                              onClick={() => setNoteModalState({ isOpen: true, animal, round, currentNote: round?.animal_issue_note || '' })}
                              className={`w-full text-left p-3 rounded-xl transition-colors min-h-[56px] flex items-start border ${
                                round?.animal_issue_note 
                                  ? 'bg-rose-50 border-rose-200 hover:bg-rose-100' 
                                  : 'bg-slate-50/50 border-dashed border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {round?.animal_issue_note ? (
                                <span className="text-[11px] leading-normal block font-bold text-rose-700">
                                  {round.animal_issue_note}
                                </span>
                              ) : (
                                <div className="flex items-center gap-2 text-slate-400">
                                  <Edit3 size={14} className="opacity-50" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Log Issue / Alert</span>
                                </div>
                              )}
                            </button>
                          </td>

                        </tr>
                      );
                    })}
                    {paddingBottom > 0 && <tr><td colSpan={5} style={{ height: `${paddingBottom}px` }} /></tr>}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-slate-950 text-white rounded-2xl border border-slate-800 shadow-xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1.5 text-center md:text-left flex-1">
          <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400 flex items-center justify-center md:justify-start gap-2">
            <CheckCircle2 size={16} />
            Welfare Sheet Certification
          </h3>
          <p className="text-xs text-slate-300 font-medium max-w-xl">
            Authorize and upload the visual checks, hydration checklist, and cage locking controls for <strong>{activeShift} Shift</strong> on <strong>{selectedDate}</strong>.
          </p>
          
          {submissionStatus && (
            <div className={`mt-3 p-3 rounded-xl text-xs font-semibold border ${
              submissionStatus.type === 'success' 
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' 
                : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
            }`}>
              {submissionStatus.message}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-end gap-4 w-full md:w-auto shrink-0">
          <div className="flex flex-col w-full sm:w-auto">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Staff Signature Initials</label>
            <input 
              type="text"
              value={initials}
              onChange={(e) => {
                setInitials(e.target.value.toUpperCase().slice(0, 4));
                setSubmissionStatus(null);
              }}
              placeholder="..."
              maxLength={4}
              className="px-4 py-2.5 bg-slate-900 border border-slate-700 text-white font-black text-sm rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-center w-full sm:w-24 tracking-widest uppercase transition-all"
            />
          </div>

          <button
            onClick={handleSubmitBulk}
            disabled={isSubmitting || Object.keys(draftRounds).length === 0 || !initials.trim()}
            className={`w-full sm:w-auto px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg ${
              isSubmitting 
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : Object.keys(draftRounds).length === 0
                ? 'bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed'
                : !initials.trim()
                ? 'bg-slate-900 text-slate-500 border border-slate-700 cursor-not-allowed hover:border-amber-400'
                : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-emerald-500/10 active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Signing Off...
              </>
            ) : (
              <>
                <Save size={16} />
                Submit {Object.keys(draftRounds).length} Rounds
              </>
            )}
          </button>
        </div>
      </div>

      {noteModalState.isOpen && noteModalState.animal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-rose-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="text-rose-600" size={18} />
                <h2 className="text-sm font-black text-rose-900 uppercase tracking-widest">Welfare Alert Notes</h2>
              </div>
              <button onClick={() => setNoteModalState({ isOpen: false, animal: null, round: null, currentNote: '' })} className="text-rose-400 hover:text-rose-700">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                Entity: {noteModalState.animal.name} ({activeShift} Shift)
              </p>
              <textarea 
                value={noteModalState.currentNote}
                onChange={(e) => setNoteModalState(s => ({ ...s, currentNote: e.target.value }))}
                placeholder="Log physical issues, damages, or behavioral abnormalities here..."
                className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-sm font-medium text-slate-900 h-32 outline-none shadow-inner"
                autoFocus
              />
            </div>
            
            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button 
                type="button" 
                onClick={() => setNoteModalState({ isOpen: false, animal: null, round: null, currentNote: '' })} 
                className="flex-1 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={() => {
                  const animalId = noteModalState.animal!.id;
                  const trimmed = noteModalState.currentNote.trim() || null;
                  
                  setDraftRounds(prev => {
                    const existingDraft = prev[animalId];
                    const dbRound = rounds.find(r => r.animal_id === animalId);
                    const merged = existingDraft ? { ...dbRound, ...existingDraft } : dbRound;

                    return {
                      ...prev,
                      [animalId]: {
                        ...prev[animalId],
                        animal_id: animalId,
                        is_alive: merged?.is_alive !== undefined ? merged.is_alive : true,
                        water_checked: merged?.water_checked !== undefined ? merged.water_checked : false,
                        locks_secured: merged?.locks_secured !== undefined ? merged.locks_secured : false,
                        animal_issue_note: trimmed
                      }
                    };
                  });
                  setHasUnsavedChanges(true);
                  setSubmissionStatus(null);
                  setNoteModalState({ isOpen: false, animal: null, round: null, currentNote: '' });
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <Save size={16} />
                Save Draft Note
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}