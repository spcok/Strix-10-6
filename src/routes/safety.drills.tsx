import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Siren, Plus, X, Search, Save, Loader2, Users, AlertTriangle, ShieldCheck } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { safetyDrillService } from '../services/safetyDrillService';

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const safetyDrillsOptions = queryOptions({
  queryKey: ['safety_drills'],
  queryFn: () => safetyDrillService.getDrills(),
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const staffMembersOptions = queryOptions({
  queryKey: ['staff_members'],
  queryFn: () => safetyDrillService.getStaffMembers(),
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const activeTimesheetsOptions = queryOptions({
  queryKey: ['active_timesheets_rollcall'],
  queryFn: () => safetyDrillService.getActiveTimesheets(),
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

// ------------------------------------------------------------------
// 2. ROUTE CONFIGURATION (Pre-fetching)
// ------------------------------------------------------------------
export const Route = createFileRoute('/safety/drills')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) {
      // @ts-ignore
      await Promise.all([
        queryClient.ensureQueryData(safetyDrillsOptions),
        queryClient.ensureQueryData(staffMembersOptions),
        queryClient.ensureQueryData(activeTimesheetsOptions)
      ]);
    }
  },
  component: SafetyDrillsPage,
});

// ------------------------------------------------------------------
// 3. MAIN COMPONENT
// ------------------------------------------------------------------
export function SafetyDrillsPage() {
  const queryClient = useQueryClient();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ------------------------------------------------------------------
  // SUPABASE REALTIME CACHE INVALIDATION
  // ------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('drills-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_drills' },
        (payload) => {
          console.log('[Sync Engine] External mutation detected. Purging local cache:', payload);
          queryClient.invalidateQueries({ queryKey: ['safety_drills'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: drills = [], isLoading } = useQuery(safetyDrillsOptions);

  const filteredDrills = useMemo(() => {
    if (!searchQuery) return drills;
    const lower = searchQuery.toLowerCase();
    return drills.filter((drill: any) => 
      (drill.drill_type || '').toLowerCase().includes(lower) ||
      (drill.scenario_description || '').toLowerCase().includes(lower)
    );
  }, [drills, searchQuery]);

  // ------------------------------------------------------------------
  // 4. WINDOW VIRTUALIZER (DOM PROTECTION WITHOUT UI/UX SHIFT)
  // ------------------------------------------------------------------
  const rowVirtualizer = useWindowVirtualizer({
    count: filteredDrills.length,
    estimateSize: () => 80, // Estimated pixel height of a drill record row
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Siren className="text-rose-600" size={24} /> Safety Drills
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Live Crisis Tracking & ZLA Compliance</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search scenarios or types..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-sm" 
            />
          </div>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(225,29,72,0.15)]"
          >
            <Plus size={16} /> Log Emergency Event
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
        <div className="w-full overflow-x-auto relative flex-1">
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
              <Loader2 className="animate-spin text-rose-600 w-8 h-8" />
            </div>
          )}

          <table className="w-full text-left min-w-[900px]">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Type & Nature</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/3">Scenario Details</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Duration</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDrills.length === 0 && !isLoading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No protocol records found.</td></tr>
              ) : (
                <>
                  {paddingTop > 0 && <tr><td colSpan={5} style={{ height: `${paddingTop}px` }} /></tr>}
                  {virtualItems.map((virtualRow) => {
                    const drill = filteredDrills[virtualRow.index];
                    const dateObj = new Date(drill.drill_date);
                    return (
                      <tr key={drill.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-4 text-xs font-bold text-slate-600 whitespace-nowrap">
                          {format(dateObj, 'dd MMM yyyy')} | {format(dateObj, 'HH:mm')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 mb-1.5">
                            {!drill.is_simulation && <span className="px-2 py-0.5 bg-rose-600 text-white text-[8px] font-black uppercase tracking-widest rounded shadow-sm animate-pulse">REAL EVENT</span>}
                            {drill.is_simulation && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[8px] font-black uppercase tracking-widest rounded shadow-sm">SIMULATION</span>}
                          </div>
                          <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{drill.drill_type.replace(/_/g, ' ')}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-slate-700 line-clamp-2">{drill.scenario_description}</p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Area: {drill.areas_involved}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 border border-indigo-200 rounded-md">
                            {Math.floor(drill.duration_seconds / 60)}m {drill.duration_seconds % 60}s
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md border shadow-sm ${
                            drill.status === 'REVIEW_REQUIRED' ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          }`}>
                            {drill.status.replace(/_/g, ' ')}
                          </span>
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
      </div>

      {isModalOpen && <SafetyDrillModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DRILL MODAL COMPONENT (Unchanged - already built on React 19 State)
// ---------------------------------------------------------------------------
function SafetyDrillModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: staffMembers = [] } = useQuery({
    queryKey: ['staff_members'],
    queryFn: () => safetyDrillService.getStaffMembers(),
  });

  const { data: activeTimesheets = [] } = useQuery({
    queryKey: ['active_timesheets_rollcall'],
    queryFn: () => safetyDrillService.getActiveTimesheets(),
  });

  const activeStaffIds = useMemo(() => new Set(activeTimesheets.map((t: any) => t.user_id)), [activeTimesheets]);
  const activeStaffList = useMemo(() => staffMembers.filter((s: any) => activeStaffIds.has(s.id)), [staffMembers, activeStaffIds]);
  const inactiveStaffList = useMemo(() => staffMembers.filter((s: any) => !activeStaffIds.has(s.id)), [staffMembers, activeStaffIds]);

  const [isSimulation, setIsSimulation] = useState(true);
  const [drillDate, setDrillDate] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [drillType, setDrillType] = useState('FIRE_EVACUATION');
  const [scenarioDescription, setScenarioDescription] = useState('');
  const [areasInvolved, setAreasInvolved] = useState('');
  
  const [durationMins, setDurationMins] = useState(0);
  const [durationSecs, setDurationSecs] = useState(0);
  const [issuesObserved, setIssuesObserved] = useState('');
  const [correctiveActions, setCorrectiveActions] = useState('');
  const [status, setStatus] = useState('COMPLETED');

  const [accountedStaffIds, setAccountedStaffIds] = useState<Set<string>>(new Set());
  const [visitorCount, setVisitorCount] = useState(0);
  const [manualStaffOverrideId, setManualStaffOverrideId] = useState('');

  const toggleAccountedStaff = (id: string) => {
    setAccountedStaffIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const totalDurationSeconds = (durationMins * 60) + durationSecs;
      let finalIssues = issuesObserved;
      let rollCallCompleted = false;

      if (drillType === 'FIRE_EVACUATION') {
        rollCallCompleted = true;
        const unaccounted = activeStaffList.filter((s: any) => !accountedStaffIds.has(s.id));
        const manuallyAdded = inactiveStaffList.filter((s: any) => accountedStaffIds.has(s.id));

        let rollCallText = `\n\n[SYSTEM GENERATED ROLL CALL AUDIT]\n- Visitors/Contractors Headcount: ${visitorCount}\n`;
        
        if (unaccounted.length > 0) {
          rollCallText += `- UNACCOUNTED FOR (Clocked In): ${unaccounted.map((s: any) => s.name || s.email).join(', ')}\n`;
        } else {
          rollCallText += `- All actively clocked-in staff accounted for.\n`;
        }

        if (manuallyAdded.length > 0) {
          rollCallText += `- PRESENT BUT NOT CLOCKED IN: ${manuallyAdded.map((s: any) => s.name || s.email).join(', ')}\n`;
        }

        finalIssues = (finalIssues ? finalIssues + '\n' : '') + rollCallText;
      }

      await safetyDrillService.saveDrill({
        drill_date: parseISO(drillDate).toISOString(),
        drill_type: drillType,
        scenario_description: scenarioDescription,
        areas_involved: areasInvolved,
        duration_seconds: totalDurationSeconds,
        roll_call_completed: rollCallCompleted,
        issues_observed: finalIssues,
        corrective_actions: correctiveActions,
        status: status,
        is_simulation: isSimulation,
      });

      queryClient.invalidateQueries({ queryKey: ['safety_drills'] });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save emergency protocol record");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans overflow-y-auto custom-scrollbar">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl flex flex-col shadow-2xl relative overflow-hidden my-auto">
        
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 z-20 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Siren size={20} className="text-rose-600" /> Protocol Form
            </h2>
            
            <button 
              type="button"
              onClick={() => setIsSimulation(!isSimulation)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                isSimulation 
                  ? 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 shadow-sm' 
                  : 'bg-rose-600 text-white shadow-[0_0_15px_rgba(225,29,72,0.4)] animate-pulse'
              }`}
            >
              {isSimulation ? 'Mode: Training Simulation' : 'MODE: REAL EMERGENCY'}
            </button>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {errorMsg && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold shadow-sm">{errorMsg}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div>
              <label className={labelClass}>Protocol Type</label>
              <select value={drillType} onChange={e => setDrillType(e.target.value)} className={inputClass} required>
                <option value="FIRE_EVACUATION">Fire / Structural Evacuation (Live Roll Call)</option>
                <option value="ANIMAL_ESCAPE">Animal Escape / Retrieval</option>
                <option value="PUBLIC_INCIDENT">Major Public Incident / Lockdown</option>
                <option value="OTHER">Other Emergency Protocol</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Date & Time of Event</label>
              <input type="datetime-local" required value={drillDate} onChange={e => setDrillDate(e.target.value)} className={inputClass} />
            </div>
            
            <div className="md:col-span-2">
              <label className={labelClass}>Scenario Description</label>
              <input type="text" required value={scenarioDescription} onChange={e => setScenarioDescription(e.target.value)} placeholder="E.g., Eagle Owl untethered in public viewing area" className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Areas / Zones Affected</label>
              <input type="text" required value={areasInvolved} onChange={e => setAreasInvolved(e.target.value)} placeholder="E.g., Flying Field, Reception" className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Response Duration</label>
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <input type="number" min="0" required value={durationMins} onChange={e => setDurationMins(parseInt(e.target.value) || 0)} className={`${inputClass} pr-12`} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">Mins</span>
                </div>
                <div className="flex-1 relative">
                  <input type="number" min="0" max="59" required value={durationSecs} onChange={e => setDurationSecs(parseInt(e.target.value) || 0)} className={`${inputClass} pr-12`} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">Secs</span>
                </div>
              </div>
            </div>
          </div>

          {drillType === 'FIRE_EVACUATION' && (
            <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl space-y-6 shadow-sm relative overflow-hidden">
              <div className="flex items-center gap-3 relative z-10">
                <Users className="text-rose-600" size={20} />
                <h3 className="font-black text-rose-900 uppercase tracking-widest text-sm">Emergency Roll Call (Live Timesheet Matrix)</h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-rose-800 uppercase tracking-widest border-b border-rose-200 pb-2">Currently Clocked-In Staff</p>
                  {activeStaffList.length === 0 ? (
                    <div className="text-xs font-bold text-amber-700 flex items-center gap-2 bg-amber-50 p-3 rounded-xl border border-amber-200 shadow-sm">
                      <AlertTriangle size={14} /> No staff currently clocked into the system.
                    </div>
                  ) : (
                    activeStaffList.map((staff: any) => (
                      <label key={staff.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-rose-300 transition-colors shadow-sm">
                        <span className="text-sm font-bold text-slate-900">{staff.name || staff.email}</span>
                        <input 
                          type="checkbox" 
                          checked={accountedStaffIds.has(staff.id)}
                          onChange={() => toggleAccountedStaff(staff.id)}
                          className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 bg-slate-50" 
                        />
                      </label>
                    ))
                  )}
                </div>

                <div className="space-y-6">
                  <div>
                    <label className={labelClass}>Non-Staff / Visitor Headcount</label>
                    <input type="number" min="0" value={visitorCount} onChange={e => setVisitorCount(parseInt(e.target.value) || 0)} className={inputClass} placeholder="Enter number of visitors at assembly point" />
                  </div>

                  <div>
                    <label className={labelClass}>Manual Staff Override (Forgot to clock in)</label>
                    <div className="flex gap-2">
                      <select value={manualStaffOverrideId} onChange={e => setManualStaffOverrideId(e.target.value)} className={inputClass}>
                        <option value="">Select off-duty staff present...</option>
                        {inactiveStaffList.map((staff: any) => (
                          <option key={staff.id} value={staff.id}>{staff.name || staff.email}</option>
                        ))}
                      </select>
                      <button 
                        type="button"
                        onClick={() => {
                          if (manualStaffOverrideId && !accountedStaffIds.has(manualStaffOverrideId)) {
                            toggleAccountedStaff(manualStaffOverrideId);
                            setManualStaffOverrideId('');
                          }
                        }}
                        disabled={!manualStaffOverrideId}
                        className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        <ShieldCheck size={18} />
                      </button>
                    </div>
                  </div>

                  {inactiveStaffList.filter((s: any) => accountedStaffIds.has(s.id)).length > 0 && (
                    <div className="space-y-2 mt-4">
                      <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest border-b border-emerald-200 pb-2">Manual Overrides Accounted For</p>
                      {inactiveStaffList.filter((s: any) => accountedStaffIds.has(s.id)).map((staff: any) => (
                        <div key={staff.id} className="flex justify-between items-center text-xs font-bold text-slate-700 bg-emerald-50/50 px-3 py-2 rounded-xl border border-emerald-100">
                          {staff.name || staff.email}
                          <button type="button" onClick={() => toggleAccountedStaff(staff.id)} className="text-rose-500 hover:text-rose-700"><X size={14}/></button>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}

          <div className="space-y-6 pt-4 border-t border-slate-100">
            <div>
              <label className={labelClass}>Issues / Failures Observed</label>
              <textarea value={issuesObserved} onChange={e => setIssuesObserved(e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="E.g., Fire door in reception failed to close, radio comms unclear..." />
            </div>
            
            <div>
              <label className={labelClass}>Corrective Actions Required (Plan of Action)</label>
              <textarea value={correctiveActions} onChange={e => setCorrectiveActions(e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="E.g., Maintenance ticket logged for door hinge, staff retraining scheduled..." />
            </div>

            <div className="md:w-1/3">
              <label className={labelClass}>Protocol Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={inputClass}>
                <option value="COMPLETED">COMPLETED - Successful</option>
                <option value="REVIEW_REQUIRED">REVIEW REQUIRED - Major Failures</option>
                <option value="PLANNED">PLANNED - Scheduled Drill</option>
              </select>
            </div>
          </div>

        </form>
        
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 z-20 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          <button type="submit" onClick={handleSubmit} disabled={isSubmitting} className={`px-8 py-2.5 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 shadow-sm ${isSimulation ? 'bg-blue-600 hover:bg-blue-500' : 'bg-rose-600 hover:bg-rose-500'}`}>
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isSimulation ? 'Commit Training Log' : 'Commit Emergency Record'}
          </button>
        </div>
      </div>
    </div>
  );
}