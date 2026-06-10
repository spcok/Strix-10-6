import React, { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { 
  ClipboardList, Scale, Thermometer, Utensils, 
  ChevronLeft, ChevronRight, Plus, Edit3, Loader2, AlertCircle 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { dailyLogService } from '../services/dailyLogService';
import { Animal, DailyLog } from '../types';
import DailyLogFormModal from '../components/animals/DailyLogFormModal';

export const Route = createFileRoute('/husbandry/daily-logs')({
  component: DailyLogsPage,
});

// MANDATE MATCH: Strictly exact custom strings configured for button controls
const SECTION_BAR = [
  { id: 'ALL', label: 'All' },
  { id: 'OWL', label: 'Owls' },
  { id: 'RAPTOR', label: 'Raptors' },
  { id: 'MAMMAL', label: 'Mammal' },
  { id: 'EXOTIC', label: 'Exotic' }
] as const;

export function DailyLogsPage() {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [activeSection, setActiveSection] = useState<string>('ALL');
  
  const [logModalState, setLogModalState] = useState<{
    isOpen: boolean;
    animal: Animal | null;
    mode: 'WEIGHT' | 'FEEDING' | 'TEMPERATURE' | 'OBSERVATION';
    initialData: DailyLog | undefined;
  }>({
    isOpen: false,
    animal: null,
    mode: 'OBSERVATION',
    initialData: undefined,
  });

  const { data: animals = [], isLoading: loadingAnimals } = useQuery({
    queryKey: ['animals', 'dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Animal[];
    },
    staleTime: Infinity,
  });

  const { data: todaysLogs = [], isLoading: loadingLogs, error: logsError } = useQuery({
    queryKey: ['daily_logs', 'date-view', selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('is_deleted', false)
        .gte('log_date', `${selectedDate}T00:00:00.000Z`)
        .lte('log_date', `${selectedDate}T23:59:59.999Z`);
      if (error) throw error;
      return data as DailyLog[];
    }
  });

  const filteredWorksheetRecords = useMemo(() => {
    const cleanAnimals = animals.filter(a => {
      if (a.status === 'ARCHIVED') return false;
      if (activeSection === 'ALL') return true;
      return a.category === activeSection;
    });

    const logMap = new Map<string, DailyLog>();
    todaysLogs.forEach(log => {
      logMap.set(log.animal_id, log);
    });

    return cleanAnimals.map(animal => ({
      animal,
      log: logMap.get(animal.id)
    }));
  }, [animals, todaysLogs, activeSection]);

  const shiftDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const triggerLogForm = (animal: Animal, mode: 'WEIGHT' | 'FEEDING' | 'TEMPERATURE' | 'OBSERVATION', existingLog?: DailyLog) => {
    setLogModalState({
      isOpen: true,
      animal,
      mode,
      initialData: existingLog,
    });
  };

  const renderWorksheetWeight = (grams: number | null, preferredUnit: string | null) => {
    if (!grams) return null;
    const totalOz = grams / 28.3495;
    
    if (preferredUnit === 'lb') {
      const lbs = Math.floor(totalOz / 16);
      const remOz = totalOz - (lbs * 16);
      const oz = Math.floor(remOz);
      const eighths = Math.round((remOz - oz) * 8);
      const eighthsStr = eighths > 0 ? ` ${eighths}/8` : '';
      return `${lbs}lb ${oz}oz${eighthsStr}`;
    } else if (preferredUnit === 'oz') {
      const oz = Math.floor(totalOz);
      const eighths = Math.round((totalOz - oz) * 8);
      const eighthsStr = eighths > 0 ? ` ${eighths}/8` : '';
      return `${oz}oz${eighthsStr}`;
    } else if (preferredUnit === 'kg') {
      return `${(grams / 1000).toFixed(2)}kg`;
    }
    return `${grams}g`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Husbandry Entry Sheet</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">
            Day-To-Day Husbandry Logs Entry Matrix
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 self-center md:self-auto w-full sm:w-auto">
          {/* Customized Section Selection Grid */}
          <div className="flex gap-1 bg-slate-100 p-1 border rounded-xl shadow-inner overflow-x-auto w-full sm:w-auto custom-scrollbar">
            {SECTION_BAR.map(btn => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setActiveSection(btn.id)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                  activeSection === btn.id 
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner w-full sm:w-auto justify-between sm:justify-start">
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

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {logsError ? (
          <div className="p-10 text-center text-rose-600 bg-rose-50 font-bold flex flex-col items-center gap-3">
            <AlertCircle size={24} />
            Database link exception. Verify network availability.
          </div>
        ) : (loadingAnimals || loadingLogs) && filteredWorksheetRecords.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-4">
            <Loader2 size={24} className="text-emerald-500 animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Syncing active workbook metrics...</span>
          </div>
        ) : (
          <div className="w-full overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4 min-w-[180px]">Entity Matrix</th>
                  <th className="px-6 py-4 w-44">Target Bio-Weight</th>
                  <th className="px-6 py-4 w-44">Thermal Parameters</th>
                  <th className="px-6 py-4 min-w-[280px]">Multi-Feeding Event Pipeline</th>
                  <th className="px-6 py-4">Daily Descriptive Observations</th>
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
                  filteredWorksheetRecords.map(({ animal, log }) => {
                    const meals = log?.feed_details?.meals || [];
                    const logTimeStr = log?.log_date ? new Date(log.log_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
                    
                    return (
                      <tr key={animal.id} className="hover:bg-slate-50/40 transition-colors group">
                        
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-black text-slate-900 text-sm leading-tight">{animal.name}</span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">
                              {animal.species}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => triggerLogForm(animal, 'WEIGHT', log)}
                            className={`w-full min-h-[46px] p-2 rounded-xl border border-dashed text-center flex flex-col justify-center items-center transition-all ${
                              log?.weight_not_required
                                ? 'bg-slate-100 border-slate-200 text-slate-400'
                                : log?.weight_grams
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 shadow-sm'
                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:border-slate-300'
                            }`}
                          >
                            {log?.weight_not_required ? (
                              <span className="text-[9px] font-black uppercase tracking-widest">Exempt</span>
                            ) : log?.weight_grams ? (
                              <>
                                <span className="text-sm font-black tracking-tight">{renderWorksheetWeight(log.weight_grams, animal.weight_unit)}</span>
                                <span className="text-[8px] text-slate-400 font-bold mt-0.5">Logged: {logTimeStr}</span>
                              </>
                            ) : (
                              <>
                                <Scale size={14} className="opacity-40 mb-1" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Log Wt</span>
                              </>
                            )}
                          </button>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => triggerLogForm(animal, 'TEMPERATURE', log)}
                            className={`w-full min-h-[46px] p-2 rounded-xl border border-dashed text-left transition-all flex flex-col justify-center ${
                              log?.temperature_c || log?.basking_temp_c || log?.cool_temp_c
                                ? 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100 shadow-sm'
                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:border-slate-300 items-center'
                            }`}
                          >
                            {log?.temperature_c || log?.basking_temp_c || log?.cool_temp_c ? (
                              <div className="w-full space-y-0.5 font-bold text-[9px] tracking-tight">
                                {animal.ambient_temp_only ? (
                                  log.temperature_c && <div className="flex justify-between text-slate-600"><span>Amb:</span><span>{log.temperature_c}°C</span></div>
                                ) : (
                                  <>
                                    {log.basking_temp_c && <div className="flex justify-between text-orange-600 font-black"><span>Bask:</span><span>{log.basking_temp_c}°C</span></div>}
                                    {log.cool_temp_c && <div className="flex justify-between text-blue-600"><span>Cool:</span><span>{log.cool_temp_c}°C</span></div>}
                                  </>
                                )}
                              </div>
                            ) : (
                              <>
                                <Thermometer size={14} className="opacity-40 mb-1" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Log Temp</span>
                              </>
                            )}
                          </button>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-2">
                            {meals.length > 0 && (
                              <div className="flex flex-col gap-1">
                                {meals.map((meal: any, idx: number) => (
                                  <div 
                                    key={idx}
                                    onClick={() => triggerLogForm(animal, 'FEEDING', log)}
                                    className="bg-amber-50/60 border border-amber-200/70 p-2 rounded-xl text-[10px] flex flex-col gap-0.5 shadow-sm cursor-pointer hover:bg-amber-100/50 transition-colors"
                                  >
                                    <div className="flex justify-between font-black text-slate-800 tracking-tight">
                                      <span>{meal.food_item || 'Diet Apportion'}</span>
                                      <span className="text-amber-700 font-bold">
                                        {new Date(meal.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                    <div className="text-slate-500 font-bold tracking-tight">
                                      Offered: {meal.food_offered_g}g | Consumed: <span className="text-emerald-600 font-black">{meal.food_consumed_g}g</span>
                                    </div>
                                    {meal.calci_dust_added && <span className="text-[8px] font-black uppercase tracking-widest text-amber-700 mt-0.5">Calci-Dust</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => triggerLogForm(animal, 'FEEDING', log)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-amber-700 hover:border-amber-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all w-max shadow-sm"
                            >
                              <Plus size={10} /> Add Feeding Event
                            </button>
                          </div>
                        </td>

                        <td className="px-6 py-4 max-w-xs text-slate-500 font-medium leading-relaxed">
                          <button
                            type="button"
                            onClick={() => triggerLogForm(animal, 'OBSERVATION', log)}
                            className="w-full text-left hover:bg-slate-100/50 p-2 rounded-xl transition-colors min-h-[44px] flex items-start"
                          >
                            <span className="text-[11px] leading-normal block">
                              {log?.notes || <span className="text-slate-300 italic">No notes entered for this date...</span>}
                            </span>
                          </button>
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

      {logModalState.isOpen && logModalState.animal && (
        <DailyLogFormModal
          isOpen={logModalState.isOpen}
          animal={logModalState.animal}
          mode={logModalState.mode}
          initialLogData={logModalState.initialData}
          onClose={() => setLogModalState({ isOpen: false, animal: null, mode: 'OBSERVATION', initialData: undefined })}
        />
      )}

    </div>
  );
}