import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Stethoscope, ClipboardList, AlertTriangle, ShieldAlert, Scale, Thermometer, GitMerge, Edit, Archive, RefreshCcw, Loader2, Plus, Calendar, X } from 'lucide-react';
import AnimalFormModal from './AnimalFormModal';
import DailyLogFormModal from './DailyLogFormModal';
import { dailyLogService } from '../../services/dailyLogService';
import { supabase } from '../../lib/supabase';
import { Animal, DailyLog } from '../../types';

interface AnimalProfileProps {
  animal: Animal;
  onClose: () => void;
}

export function AnimalProfile({ animal, onClose }: AnimalProfileProps) {
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<'profile' | 'medical' | 'husbandry'>('profile');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [editingLogTarget, setEditingLogTarget] = useState<DailyLog | undefined>(undefined);
  const [logModalMode, setLogModalMode] = useState<'WEIGHT' | 'FEEDING' | 'TEMPERATURE' | 'OBSERVATION'>('OBSERVATION');
  
  // Disposition / Archive State
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [dispositionType, setDispositionType] = useState('TRANSFER_OUT');
  const [dispositionDate, setDispositionDate] = useState(new Date().toISOString().split('T')[0]);
  const [destination, setDestination] = useState('');
  const [dispositionNotes, setDispositionNotes] = useState('');

  const { data: husbandryLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['animal_logs', animal?.id],
    queryFn: () => dailyLogService.getLogsByAnimal(animal.id),
    enabled: !!animal?.id && activeTab === 'husbandry'
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      // 1. ZLA Compliance: If transferred offsite, map to schema constraints
      if (dispositionType === 'TRANSFER_OUT') {
        const { error: transferError } = await supabase.from('external_transfers').insert([{
          animal_id: animal.id,
          transfer_type: dispositionType,
          transfer_date: dispositionDate,
          entity_name: destination || 'Unknown Institution', // required field in schema
          notes: dispositionNotes
        }]);
        if (transferError) throw transferError;
      }

      // 2. Archive the master record using the actual schema fields
      const archiveReasonString = `[${dispositionType}] ${destination && dispositionType === 'TRANSFER_OUT' ? 'To: ' + destination + ' - ' : ''}${dispositionNotes}`;
      
      const { error: updateError } = await supabase
        .from('animals')
        .update({ 
          status: 'ARCHIVED', 
          archive_reason: archiveReasonString 
        })
        .eq('id', animal.id);
        
      if (updateError) throw updateError;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['animals', 'dashboard'] });
      setIsArchiveModalOpen(false);
      setDispositionNotes('');
      setDestination('');
    }
  });

  const handleUnarchive = () => {
    supabase.from('animals').update({ status: 'OFF_DISPLAY', archive_reason: null }).eq('id', animal.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['animals', 'dashboard'] }));
  };

  const triggerEditLog = (log: DailyLog, mode: 'WEIGHT' | 'FEEDING' | 'TEMPERATURE' | 'OBSERVATION' = 'OBSERVATION') => {
    setEditingLogTarget(log);
    setLogModalMode(mode);
    setIsLogModalOpen(true);
  };

  if (!animal) return null;

  return (
    <div className="fixed inset-0 z-[40] bg-slate-900/40 backdrop-blur-sm overflow-y-auto custom-scrollbar p-4 md:p-6 flex items-start justify-center">
      <div className="w-full max-w-5xl space-y-4">
        
        <button onClick={onClose} className="flex items-center gap-2 text-white/80 hover:text-white font-bold text-xs uppercase tracking-widest mb-2 transition-colors drop-shadow-md">
          <ArrowLeft size={16} /> Back to Dashboard
        </button>

        <div className="bg-white border border-slate-200 rounded-3xl shadow-xl p-5 flex flex-col md:flex-row gap-6 relative overflow-hidden">
          <div className="w-full md:w-1/3 flex flex-col gap-4 relative z-10">
            <div className="relative w-full h-[300px] bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex items-center justify-center">
              {animal.profile_image_url ? (
                <img src={animal.profile_image_url as string} alt={animal.name || 'Animal'} className="w-full h-full object-cover" />
              ) : (
                <span className="text-slate-400 font-black text-xs uppercase tracking-widest">No Media</span>
              )}
            </div>
          </div>
          
          <div className="flex-1 flex flex-col justify-between relative z-10">
            <div>
              <div className="flex justify-between items-start mb-2">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">{animal.name || 'Unnamed'}</h1>
                <div className="flex gap-2">
                  {animal.status === 'ARCHIVED' && <span className="px-2.5 py-1 bg-slate-100 border border-slate-300 text-slate-600 text-[10px] font-black rounded-lg uppercase tracking-widest shadow-sm">Archived Record</span>}
                  {animal.is_boarding && <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black rounded-lg uppercase tracking-widest shadow-sm">Boarding</span>}
                  {animal.is_quarantine && <span className="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-black rounded-lg uppercase tracking-widest shadow-sm">Quarantine</span>}
                  
                  <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
                    <button onClick={() => setIsEditModalOpen(true)} className="p-2 bg-white border border-slate-200 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors shadow-sm">
                      <Edit size={16} />
                    </button>
                    {animal.status === 'ARCHIVED' ? (
                      <button onClick={handleUnarchive} className="p-2 bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shadow-sm">
                        <RefreshCcw size={16} />
                      </button>
                    ) : (
                      <button onClick={() => setIsArchiveModalOpen(true)} className="p-2 bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors shadow-sm">
                        <Archive size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col gap-1 mb-6">
                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">ID: {animal.id}</p>
                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">
                  Ring: <span className="text-slate-600">{animal.ring_number || 'Un-ringed'}</span> | Chip: <span className="text-slate-600">{animal.microchip_id || 'None'}</span>
                </p>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-6 gap-x-4">
                <div>
                  <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest block mb-1">Species</span>
                  <span className="text-sm font-bold text-slate-900">{animal.species || '--'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest block mb-1">Sex</span>
                  <span className="text-sm font-bold text-slate-900">{animal.gender || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest block mb-1">Origin</span>
                  <span className="text-sm font-bold text-slate-900">{animal.origin || 'Unknown'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden min-h-[400px] flex flex-col">
          <div className="border-b border-slate-100 bg-slate-50 px-4 pt-2 flex justify-between items-center overflow-x-auto custom-scrollbar">
            <div className="flex gap-4">
              {[{ id: 'profile', label: 'Profile Matrix', icon: FileText }, { id: 'medical', label: 'Medical', icon: Stethoscope }, { id: 'husbandry', label: 'Husbandry Logs', icon: ClipboardList }].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 pb-3 px-2 border-b-2 transition-all font-black text-xs uppercase tracking-widest whitespace-nowrap ${
                    activeTab === tab.id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'husbandry' && (
              <button
                onClick={() => { setEditingLogTarget(undefined); setLogModalMode('OBSERVATION'); setIsLogModalOpen(true); }}
                className="mb-2 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm shrink-0"
              >
                <Plus size={12} /> Log Metric
              </button>
            )}
          </div>

          <div className="p-6 flex-1 bg-white">
            {activeTab === 'profile' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                {animal.critical_husbandry_notes && (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 lg:col-span-1 xl:col-span-2 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <AlertTriangle className="text-rose-600" size={18} />
                      <h3 className="font-black text-rose-900 uppercase tracking-widest text-xs">Critical Husbandry Notes</h3>
                    </div>
                    <p className="text-sm font-bold text-rose-700 leading-relaxed whitespace-pre-wrap">{animal.critical_husbandry_notes}</p>
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldAlert className="text-amber-500" size={18} />
                    <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs">Safety</h3>
                  </div>
                  <div className="space-y-3 text-sm font-bold">
                    <div className="flex justify-between"><span className="text-slate-500">Hazard Rating:</span> <span className="text-slate-700">{animal.hazard_rating || 'None'}</span></div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <Scale className="text-emerald-500" size={18} />
                    <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs">Weights</h3>
                  </div>
                  <div className="space-y-3 text-sm font-bold">
                    <div className="flex justify-between"><span className="text-slate-500">Flying Weight:</span> <span className="text-slate-700">{animal.flying_weight ? `${animal.flying_weight}g` : '--'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Winter Weight:</span> <span className="text-slate-700">{animal.winter_weight ? `${animal.winter_weight}g` : '--'}</span></div>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'medical' && <div className="text-center py-10 text-slate-400 text-xs font-black uppercase tracking-widest">Medical Pending Deployment</div>}
            
            {activeTab === 'husbandry' && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {loadingLogs ? (
                  <div className="flex items-center justify-center h-48 text-slate-400 font-black text-xs uppercase tracking-widest animate-pulse">Syncing Log Archive...</div>
                ) : husbandryLogs.length === 0 ? (
                  <div className="text-center py-20 text-slate-400 text-xs font-black uppercase tracking-widest">No Logs Recorded For This Entity</div>
                ) : (
                  <div className="w-full overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black text-[9px] uppercase tracking-widest">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Weight</th>
                          <th className="px-4 py-3">Thermal Env</th>
                          <th className="px-4 py-3">Feeding / Meals Logs</th>
                          <th className="px-4 py-3">Observations</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                        {husbandryLogs.map((log) => {
                          const meals = log.feed_details?.meals || [];
                          return (
                            <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                                {new Date(log.log_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <button onClick={() => triggerEditLog(log, 'WEIGHT')} className="text-slate-900 font-black hover:text-emerald-600 hover:underline">
                                  {log.weight_not_required ? (
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Not Required</span>
                                  ) : log.weight_grams ? (
                                    `${log.weight_grams}${log.weight_unit || 'g'}`
                                  ) : (
                                    <span className="text-slate-300">--</span>
                                  )}
                                </button>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <button onClick={() => triggerEditLog(log, 'TEMPERATURE')} className="flex flex-col text-left gap-0.5 hover:text-emerald-600">
                                  {log.temperature_c && <span className="text-[10px] text-slate-600">Amb: {log.temperature_c}°C</span>}
                                  {log.basking_temp_c && <span className="text-[10px] text-amber-600 font-black">Bask: {log.basking_temp_c}°C</span>}
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1.5 min-w-[180px]">
                                  {meals.length === 0 ? (
                                    <span className="text-slate-300 italic text-[11px]">No meals fed</span>
                                  ) : (
                                    meals.map((meal: any, idx: number) => (
                                      <div key={idx} className="bg-slate-50 border border-slate-200 p-1.5 rounded-lg text-[10px] flex flex-col gap-0.5 shadow-sm">
                                        <div className="flex justify-between font-black text-slate-800">
                                          <span>{meal.food_item || 'Unknown'}</span>
                                          <span className="text-slate-400">{new Date(meal.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div className="text-slate-500 font-bold">
                                          Offered: {meal.food_offered_g}g | Consumed: <span className="text-emerald-600">{meal.food_consumed_g}g</span>
                                        </div>
                                        {meal.calci_dust_added && <span className="text-[9px] font-black tracking-widest uppercase text-amber-600 bg-amber-50 rounded px-1 w-max mt-0.5">Calci-Dust</span>}
                                      </div>
                                    ))
                                  )}
                                  <button onClick={() => { setEditingLogTarget(log); setLogModalMode('FEEDING'); setIsLogModalOpen(true); }} className="text-[9px] font-black text-slate-400 hover:text-amber-600 uppercase tracking-widest text-left mt-0.5">
                                    + Add Sub Meal
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 py-3 max-w-xs text-slate-500 font-medium leading-relaxed">
                                <button onClick={() => triggerEditLog(log, 'OBSERVATION')} className="text-left hover:text-slate-900 block w-full text-[11px]">
                                  {log.notes || <span className="text-slate-300 italic">No observation recorded</span>}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {isEditModalOpen && <AnimalFormModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} initialData={animal} />}
        
        {isLogModalOpen && (
          <DailyLogFormModal 
            isOpen={isLogModalOpen} 
            onClose={() => setIsLogModalOpen(false)} 
            animal={animal} 
            mode={logModalMode}
            initialLogData={editingLogTarget} 
          />
        )}

        {/* --- DISPOSITION WIZARD MODAL --- */}
        {isArchiveModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight text-rose-600">Process Animal Disposition</h2>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">Database Archiving</p>
                </div>
                <button onClick={() => setIsArchiveModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); archiveMutation.mutate(); }} className="p-6 space-y-5 bg-white">
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex gap-3 text-rose-800">
                  <AlertTriangle size={20} className="shrink-0" />
                  <p className="text-xs font-bold leading-relaxed">
                    Executing this transaction will permanently remove <span className="font-black uppercase">{animal.name}</span> from the active collection.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Disposition Type</label>
                    <select 
                      value={dispositionType} 
                      onChange={(e) => setDispositionType(e.target.value)} 
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-rose-500/20 outline-none"
                      required
                    >
                      <option value="TRANSFER_OUT">Transferred Out</option>
                      <option value="DECEASED">Deceased / Euthanasia</option>
                    </select>
                  </div>
                  
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Date of Disposition</label>
                    <input 
                      type="date" 
                      value={dispositionDate} 
                      onChange={(e) => setDispositionDate(e.target.value)} 
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-rose-500/20 outline-none"
                      required
                    />
                  </div>

                  {dispositionType === 'TRANSFER_OUT' && (
                    <div className="col-span-2">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Receiving Institution / Individual</label>
                      <input 
                        type="text" 
                        value={destination} 
                        onChange={(e) => setDestination(e.target.value)} 
                        placeholder="e.g. London Zoo"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-rose-500/20 outline-none"
                        required={dispositionType === 'TRANSFER_OUT'}
                      />
                    </div>
                  )}

                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Authorizing Notes / Incident Details</label>
                    <textarea 
                      value={dispositionNotes} 
                      onChange={(e) => setDispositionNotes(e.target.value)} 
                      placeholder={dispositionType === 'DECEASED' ? "Enter PM results or attending vet details..." : "Enter formal authorization notes..."}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-rose-500/20 outline-none h-24 resize-none custom-scrollbar"
                      required
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button type="button" onClick={() => setIsArchiveModalOpen(false)} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors">
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={archiveMutation.isPending}
                    className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-800 disabled:opacity-50 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(225,29,72,0.15)]"
                  >
                    {archiveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
                    {archiveMutation.isPending ? 'Processing...' : 'Confirm Disposition'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}