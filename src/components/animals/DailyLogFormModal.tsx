import React, { useState, useMemo } from 'react';
import { useForm, FieldApi } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery, queryOptions } from '@tanstack/react-query';
import { X, Save, Loader2, AlertCircle, Plus, Trash2, Scale, Utensils, Thermometer } from 'lucide-react';
import { format, parse } from 'date-fns';
import { dailyLogService } from '../../services/dailyLogService';
import { supabase } from '../../lib/supabase';
import { Animal, DailyLog } from '../../types';

interface DailyLogFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  animal: Animal;
  mode: 'WEIGHT' | 'FEEDING' | 'TEMPERATURE' | 'OBSERVATION';
  initialLogData?: DailyLog;
}

interface MealInput {
  id: string;
  food_item: string;
  feed_method: string;
  time: string;
  quantity_offered: string | number;
  quantity_consumed: string | number;
  calci_dust_added: boolean;
}

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS FOR DICTIONARY
// ------------------------------------------------------------------
const operationalListsOptions = queryOptions({
  queryKey: ['operational_lists'],
  queryFn: async () => {
    const { data, error } = await supabase.from('operational_lists').select('*').eq('is_deleted', false);
    if (error) throw error;
    return data || [];
  },
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

// ------------------------------------------------------------------
// EXTRACTED COMPONENTS
// ------------------------------------------------------------------
function FormInput({ field, label, type = 'text', placeholder }: { field: any; label: string; type?: string; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          placeholder={placeholder}
          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm font-medium shadow-inner h-20 custom-scrollbar resize-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
        />
      ) : (
        <input
          type={type}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
          placeholder={placeholder}
          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm font-medium shadow-inner focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
        />
      )}
    </div>
  );
}

function FormSelect({ field, label, options, placeholder }: { field: any; label: string; options: { value: string, label: string }[], placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
      <select
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm font-medium shadow-inner focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((opt, i) => (
          <option key={i} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// ------------------------------------------------------------------
// MAIN MODAL COMPONENT
// ------------------------------------------------------------------
export default function DailyLogFormModal({ isOpen, onClose, animal, mode, initialLogData }: DailyLogFormModalProps) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load routing dictionaries
  const { data: operationalLists = [] } = useQuery(operationalListsOptions);

  // Isolate and taxonomically scope the dictionaries (forgiving singular/plural match)
  const taxonomicMatch = [animal.category, `${animal.category}S`, 'GENERAL'];
  const foodTypes = useMemo(() => operationalLists.filter((l: any) => l.category === 'food_type' && taxonomicMatch.includes(l.description)), [operationalLists, animal.category]);
  const feedMethods = useMemo(() => operationalLists.filter((l: any) => l.category === 'feed_method' && taxonomicMatch.includes(l.description)), [operationalLists, animal.category]);

  const unpackGramsToImperial = (grams: number | null, unit: string) => {
    if (!grams) return { lbs: '', oz: '', eighths: '0' };
    const totalOunces = grams / 28.3495;
    if (unit === 'lb') {
      const lbs = Math.floor(totalOunces / 16);
      const remainderOunces = totalOunces - (lbs * 16);
      const oz = Math.floor(remainderOunces);
      const eighths = Math.round((remainderOunces - oz) * 8);
      return { lbs: lbs.toString(), oz: oz.toString(), eighths: eighths === 8 ? '0' : eighths.toString() };
    } else if (unit === 'oz') {
      const oz = Math.floor(totalOunces);
      const eighths = Math.round((totalOunces - oz) * 8);
      return { lbs: '', oz: oz.toString(), eighths: eighths === 8 ? '0' : eighths.toString() };
    }
    return { lbs: '', oz: '', eighths: '0' };
  };

  const initialImperial = unpackGramsToImperial(initialLogData?.weight_grams || null, animal.weight_unit || 'g');

  const initialMeals = (): MealInput[] => {
    if (mode !== 'FEEDING') return [];
    const existing = initialLogData?.feed_details?.meals || [];
    if (existing.length > 0) {
      return existing.map((m: any) => ({
        id: crypto.randomUUID(),
        food_item: m.food_item || '',
        feed_method: m.feed_method || '',
        quantity_offered: m.quantity_offered?.toString() || m.food_offered_g?.toString() || '',
        quantity_consumed: m.quantity_consumed?.toString() || m.food_consumed_g?.toString() || '',
        calci_dust_added: !!m.calci_dust_added,
        time: m.time ? format(new Date(m.time), 'HH:mm') : format(new Date(), 'HH:mm')
      }));
    }
    return [{ id: crypto.randomUUID(), food_item: '', feed_method: '', quantity_offered: '', quantity_consumed: '', calci_dust_added: false, time: format(new Date(), 'HH:mm') }];
  };

  const logMutation = useMutation({
    mutationFn: async (value: any) => {
      const localDate = parse(`${value.log_date} ${value.log_time || '12:00'}`, 'yyyy-MM-dd HH:mm', new Date());
      const combinedTimestamp = localDate.toISOString();

      let finalWeightGrams: number | null = null;
      if (mode === 'WEIGHT' && !value.weight_not_required) {
        if (animal.weight_unit === 'lb') {
          finalWeightGrams = ((Number(value.lbs || 0) * 16) + Number(value.oz || 0) + (Number(value.eighths || 0) / 8)) * 28.3495;
        } else if (animal.weight_unit === 'oz') {
          finalWeightGrams = (Number(value.oz || 0) + (Number(value.eighths || 0) / 8)) * 28.3495;
        } else if (animal.weight_unit === 'kg') {
          finalWeightGrams = Number(value.metric_weight || 0) * 1000;
        } else {
          finalWeightGrams = Number(value.metric_weight || null);
        }
        if (finalWeightGrams) finalWeightGrams = Number(finalWeightGrams.toFixed(2));
      }

      if (mode === 'FEEDING') {
        const formattedMeals = value.meals.map((m: MealInput) => {
          const mealLocalTime = parse(`${value.log_date} ${m.time}`, 'yyyy-MM-dd HH:mm', new Date());
          return {
            time: mealLocalTime.toISOString(),
            food_item: m.food_item,
            feed_method: m.feed_method,
            quantity_offered: Number(m.quantity_offered || 0),
            quantity_consumed: Number(m.quantity_consumed || 0),
            calci_dust_added: m.calci_dust_added
          };
        });

        if (initialLogData?.id) {
          return await dailyLogService.updateLogDirect(initialLogData.id, {
            feed_details: { meals: formattedMeals, initials: value.initials },
            notes: value.notes || null,
            log_date: combinedTimestamp
          });
        } else {
          return await dailyLogService.commitLog({
            id: value._optimisticId, 
            animal_id: animal.id,
            log_type: 'FEEDING',
            log_date: combinedTimestamp,
            notes: value.notes || null,
            feed_details: { meals: formattedMeals, initials: value.initials }
          });
        }
      }

      // ENTERPRISE FIX: Secure initials for non-feeding generic logs by prepending to the notes
      const finalNotes = value.initials ? `[${value.initials}] ${value.notes || ''}`.trim() : value.notes || null;
      const updates: any = { notes: finalNotes, log_date: combinedTimestamp };

      if (mode === 'WEIGHT') {
        updates.weight_grams = finalWeightGrams;
        updates.weight_not_required = value.weight_not_required;
        updates.weight_unit = animal.weight_unit;
      }
      if (mode === 'TEMPERATURE') {
        updates.temperature_c = value.temperature_c === '' ? null : Number(value.temperature_c);
        updates.basking_temp_c = value.basking_temp_c === '' ? null : Number(value.basking_temp_c);
        updates.cool_temp_c = value.cool_temp_c === '' ? null : Number(value.cool_temp_c);
      }

      if (initialLogData?.id) {
        return await dailyLogService.updateLogDirect(initialLogData.id, updates);
      } else {
        return await dailyLogService.commitLog({ id: value._optimisticId, animal_id: animal.id, log_type: mode, ...updates });
      }
    },
    
    // ENTERPRISE FIX: Optimistic UI Updates
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['daily_logs'] });
      await queryClient.cancelQueries({ queryKey: ['animal_logs', animal.id] });

      const previousDailyLogs = queryClient.getQueryData(['daily_logs']);
      const previousAnimalLogs = queryClient.getQueryData(['animal_logs', animal.id]);

      const optimisticId = crypto.randomUUID();
      variables._optimisticId = optimisticId; 
      
      const localDate = parse(`${variables.log_date} ${variables.log_time || '12:00'}`, 'yyyy-MM-dd HH:mm', new Date());
      const finalNotes = variables.initials && mode !== 'FEEDING' ? `[${variables.initials}] ${variables.notes || ''}`.trim() : variables.notes || '';
      
      const optimisticRecord = {
        id: optimisticId,
        animal_id: animal.id,
        log_type: mode,
        log_date: localDate.toISOString(),
        notes: finalNotes,
        _isOptimistic: true
      };

      const injectRecord = (old: any) => Array.isArray(old) ? [optimisticRecord, ...old] : [optimisticRecord];
      queryClient.setQueryData(['daily_logs'], injectRecord);
      queryClient.setQueryData(['animal_logs', animal.id], injectRecord);

      return { previousDailyLogs, previousAnimalLogs };
    },
    
    onError: (err: any, variables, context) => {
      if (context?.previousDailyLogs) queryClient.setQueryData(['daily_logs'], context.previousDailyLogs);
      if (context?.previousAnimalLogs) queryClient.setQueryData(['animal_logs', animal.id], context.previousAnimalLogs);
      setErrorMsg(err.message || 'Failed to queue log data.');
    },
    
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['daily_logs'] });
      queryClient.invalidateQueries({ queryKey: ['animal_logs', animal.id] });
    }
  });

  const form = useForm({
    defaultValues: {
      log_date: initialLogData?.log_date ? format(new Date(initialLogData.log_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      log_time: initialLogData?.log_date ? format(new Date(initialLogData.log_date), 'HH:mm') : format(new Date(), 'HH:mm'),
      initials: initialLogData?.feed_details?.initials || '',
      notes: initialLogData?.notes?.replace(/^\[.*?\]\s*/, '') || '', // Strips existing initials from notes field for clean editing
      lbs: initialImperial.lbs, oz: initialImperial.oz, eighths: initialImperial.eighths,
      metric_weight: animal.weight_unit === 'kg' && initialLogData?.weight_grams ? (initialLogData.weight_grams / 1000).toString() : initialLogData?.weight_grams || '',
      weight_not_required: initialLogData?.weight_not_required || false,
      temperature_c: initialLogData?.temperature_c || '',
      basking_temp_c: initialLogData?.basking_temp_c || '',
      cool_temp_c: initialLogData?.cool_temp_c || '',
      meals: initialMeals(),
      _optimisticId: '' 
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      logMutation.mutate(value);
      onClose();
    }
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col border border-slate-200">
        
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            {mode === 'WEIGHT' && <Scale size={16} className="text-emerald-600" />}
            {mode === 'FEEDING' && <Utensils size={16} className="text-amber-600" />}
            {mode === 'TEMPERATURE' && <Thermometer size={16} className="text-blue-600" />}
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
              {initialLogData ? `Amend ${mode}` : `Log ${mode}`} Parameters
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[75vh] custom-scrollbar bg-white flex-1">
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs font-medium">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>{errorMsg}</div>
            </div>
          )}

          <form id="quick-log-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="space-y-5">
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50 border border-slate-100 p-4 rounded-xl">
              <form.Field name="log_date">{(field) => <FormInput field={field} label="Date" type="date" />}</form.Field>
              {mode !== 'FEEDING' && <form.Field name="log_time">{(field) => <FormInput field={field} label="Time" type="time" />}</form.Field>}
              <form.Field name="initials">{(field) => <FormInput field={field} label="Keeper Initials" placeholder="e.g. JD" />}</form.Field>
            </div>

            {mode === 'WEIGHT' && (
              <div className="space-y-4">
                <form.Subscribe selector={(state) => state.values.weight_not_required}>
                  {(exempt) => !exempt && (
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                      {animal.weight_unit === 'lb' && (
                        <div className="grid grid-cols-3 gap-2">
                          <form.Field name="lbs">{(field) => <FormInput field={field} label="Lbs" type="number" />}</form.Field>
                          <form.Field name="oz">{(field) => <FormInput field={field} label="Oz" type="number" />}</form.Field>
                          <form.Field name="eighths">
                            {(field) => (
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Eighths</label>
                                <select value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
                                  {[0,1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}/8</option>)}
                                </select>
                              </div>
                            )}
                          </form.Field>
                        </div>
                      )}

                      {animal.weight_unit === 'oz' && (
                        <div className="grid grid-cols-2 gap-3">
                          <form.Field name="oz">{(field) => <FormInput field={field} label="Ounces (Oz)" type="number" />}</form.Field>
                          <form.Field name="eighths">
                            {(field) => (
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Eighths</label>
                                <select value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
                                  {[0,1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}/8</option>)}
                                </select>
                              </div>
                            )}
                          </form.Field>
                        </div>
                      )}

                      {(animal.weight_unit === 'g' || animal.weight_unit === 'kg' || !animal.weight_unit) && (
                        <form.Field name="metric_weight">{(field) => <FormInput field={field} label={`Mass in ${animal.weight_unit || 'g'}`} type="number" />}</form.Field>
                      )}
                    </div>
                  )}
                </form.Subscribe>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <form.Field name="weight_not_required">
                    {(field) => (
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={field.state.value} onChange={(e) => field.handleChange(e.target.checked)} className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500" />
                        <span className="text-xs font-bold text-slate-600 tracking-wide">Weight Not Required Today</span>
                      </label>
                    )}
                  </form.Field>
                </div>
              </div>
            )}

            {mode === 'TEMPERATURE' && (
              <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                {animal.ambient_temp_only ? (
                  <form.Field name="temperature_c">{(field) => <FormInput field={field} label="Ambient Enclosure (°C)" type="number" />}</form.Field>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <form.Field name="basking_temp_c">{(field) => <FormInput field={field} label="Basking Spot (°C)" type="number" />}</form.Field>
                    <form.Field name="cool_temp_c">{(field) => <FormInput field={field} label="Cool Zone (°C)" type="number" />}</form.Field>
                  </div>
                )}
              </div>
            )}

            {mode === 'FEEDING' && (
              <div className="space-y-4">
                <form.Field name="meals">
                  {(field) => (
                    <>
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded">Active Rations Logged</span>
                        <button
                          type="button"
                          onClick={() => field.pushValue({ id: crypto.randomUUID(), food_item: '', feed_method: '', quantity_offered: '', quantity_consumed: '', calci_dust_added: false, time: format(new Date(), 'HH:mm') })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 transition-colors shadow-sm"
                        >
                          <Plus size={12} /> Add Row
                        </button>
                      </div>

                      <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                        {field.state.value.map((_, index) => (
                          <div key={index} className="p-4 bg-white border border-slate-200 shadow-sm rounded-2xl relative space-y-4 group">
                            {field.state.value.length > 1 && (
                              <button type="button" onClick={() => field.removeValue(index)} className="absolute top-3 right-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                <Trash2 size={14} />
                              </button>
                            )}
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <form.Field name={`meals[${index}].food_item` as const}>
                                {(subField) => <FormSelect field={subField} label={`Food Item (${index + 1})`} placeholder="-- Select Food --" options={foodTypes.map((f: any) => ({ value: f.name, label: f.name }))} />}
                              </form.Field>
                              <form.Field name={`meals[${index}].feed_method` as const}>
                                {(subField) => <FormSelect field={subField} label="Feed Method" placeholder="-- Select Method --" options={feedMethods.map((f: any) => ({ value: f.name, label: f.name }))} />}
                              </form.Field>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                              <form.Field name={`meals[${index}].time` as const}>{(subField) => <FormInput field={subField} label="Time" type="time" />}</form.Field>
                              <form.Field name={`meals[${index}].quantity_offered` as const}>{(subField) => <FormInput field={subField} label="Offered Qty" type="number" />}</form.Field>
                              <form.Field name={`meals[${index}].quantity_consumed` as const}>{(subField) => <FormInput field={subField} label="Consumed Qty" type="number" />}</form.Field>
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                              <form.Field name={`meals[${index}].calci_dust_added` as const}>
                                {(subField) => (
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={Boolean(subField.state.value)} onChange={(e) => subField.handleChange(e.target.checked)} className="w-3.5 h-3.5 text-amber-600 border-slate-300 rounded focus:ring-amber-500" />
                                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Add Calci-Dust Modifier</span>
                                  </label>
                                )}
                              </form.Field>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </form.Field>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <form.Field name="notes">{(field) => <FormInput field={field} label="Observation / Treatment Notes" type="textarea" placeholder="Enter additional context here..." />}</form.Field>
            </div>

          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end bg-slate-50 gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">
            Cancel
          </button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button
                type="submit"
                form="quick-log-form"
                disabled={!canSubmit || isSubmitting}
                className={`flex items-center gap-2 px-6 py-2.5 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-sm disabled:opacity-50 ${
                  mode === 'WEIGHT' ? 'bg-emerald-600 hover:bg-emerald-500' :
                  mode === 'FEEDING' ? 'bg-amber-600 hover:bg-amber-500' :
                  'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {initialLogData ? 'Save Amendments' : 'Commit Log'}
              </button>
            )}
          </form.Subscribe>
        </div>

      </div>
    </div>
  );
}