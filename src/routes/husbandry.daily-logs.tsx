import React, { useState, useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery, queryOptions } from '@tanstack/react-query';
import { X, Save, Loader2, AlertCircle, Plus, Trash2, Scale, Utensils, Thermometer } from 'lucide-react';
import { format, parse } from 'date-fns';
import { dailyLogService } from '../../services/dailyLogService';
import { supabase } from '../../lib/supabase';
import { Animal, DailyLog } from '../../types';

const generateOfflineUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

interface DailyLogFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  animal: Animal;
  mode: 'WEIGHT' | 'FEEDING' | 'TEMPERATURE' | 'OBSERVATION';
  initialLogData?: DailyLog;
}

// UX FIX: Updated interface to support single quantity and unit selection
interface MealInput {
  id: string;
  food_item: string;
  feed_method: string;
  time: string;
  quantity: string | number;
  unit: 'Whole' | 'g';
  calci_dust_added: boolean;
}

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

function FormInput({ field, label, type = 'text', placeholder }: { field: any; label: string; type?: string; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          placeholder={placeholder}
          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm md:text-xs font-medium shadow-inner h-20 resize-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
        />
      ) : (
        <input
          type={type === 'number' ? 'text' : type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          placeholder={placeholder}
          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm md:text-xs font-medium shadow-inner focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
        />
      )}
    </div>
  );
}

function FormSelect({ field, label, options, placeholder }: { field: any; label: string; options: { value: string, label: string }[], placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
      <select
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm md:text-xs font-medium shadow-inner focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((opt, i) => (
          <option key={i} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

export default function DailyLogFormModal({ isOpen, onClose, animal, mode, initialLogData }: DailyLogFormModalProps) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: operationalLists = [] } = useQuery(operationalListsOptions);

  const taxonomicMatch = [animal.category, `${animal.category}S`, 'GENERAL'];
  const foodTypes = useMemo(() => operationalLists.filter((l: any) => l.category === 'food_type' && taxonomicMatch.includes(l.description)), [operationalLists, animal.category]);
  const feedMethods = useMemo(() => operationalLists.filter((l: any) => l.category === 'feed_method' && taxonomicMatch.includes(l.description)), [operationalLists, animal.category]);

  const unpackGramsToImperial = (grams: number | null, unit: string) => {
    if (!grams) return { lbs: '', oz: '', eighths: '0' };
    const totalOunces = grams / 28.3495;
    if (unit === 'lb') {
      const lbs = Math.floor(totalOunces / 16);
      const remainderOunces = totalOunces - (lbs * 16);
      let oz = Math.floor(remainderOunces);
      let eighths = Math.round((remainderOunces - oz) * 8);
      if (eighths >= 8) { oz += 1; eighths = 0; }
      return { lbs: lbs.toString(), oz: oz.toString(), eighths: eighths.toString() };
    } else if (unit === 'oz') {
      let oz = Math.floor(totalOunces);
      let eighths = Math.round((totalOunces - oz) * 8);
      if (eighths >= 8) { oz += 1; eighths = 0; }
      return { lbs: '', oz: oz.toString(), eighths: eighths.toString() };
    }
    return { lbs: '', oz: '', eighths: '0' };
  };

  const initialImperial = unpackGramsToImperial(initialLogData?.weight_grams || null, animal.weight_unit || 'g');

  const initialMeals = (): MealInput[] => {
    if (mode !== 'FEEDING') return [];
    const existing = initialLogData?.feed_details?.meals || [];
    if (existing.length > 0) {
      return existing.map((m: any) => ({
        id: generateOfflineUUID(),
        food_item: m.food_item || '',
        feed_method: m.feed_method || '',
        // Maps legacy quantity_consumed if old records are loaded, otherwise uses unified quantity
        quantity: m.quantity?.toString() || m.quantity_consumed?.toString() || m.food_consumed_g?.toString() || '',
        unit: m.unit || 'Whole',
        calci_dust_added: !!m.calci_dust_added,
        time: m.time ? format(new Date(m.time), 'HH:mm') : format(new Date(), 'HH:mm')
      }));
    }
    return [{ id: generateOfflineUUID(), food_item: '', feed_method: '', quantity: '', unit: 'Whole', calci_dust_added: false, time: format(new Date(), 'HH:mm') }];
  };

  const logMutation = useMutation({
    mutationFn: async (value: any) => {
      const safeTime = (value.log_time || '12:00').substring(0, 5); 
      const localDate = parse(`${value.log_date} ${safeTime}`, 'yyyy-MM-dd HH:mm', new Date());
      const combinedTimestamp = localDate.toISOString();

      let finalWeightGrams: number | null = null;
      if (mode === 'WEIGHT' && !value.weight_not_required) {
        const safeParse = (val: any) => parseFloat(String(val || '0').replace(/[^0-9.]/g, '')) || 0;
        
        if (animal.weight_unit === 'lb') {
          finalWeightGrams = ((safeParse(value.lbs) * 16) + safeParse(value.oz) + (safeParse(value.eighths) / 8)) * 28.3495;
        } else if (animal.weight_unit === 'oz') {
          finalWeightGrams = (safeParse(value.oz) + (safeParse(value.eighths) / 8)) * 28.3495;
        } else if (animal.weight_unit === 'kg') {
          finalWeightGrams = safeParse(value.metric_weight) * 1000;
        } else {
          finalWeightGrams = safeParse(value.metric_weight);
        }
        if (finalWeightGrams) finalWeightGrams = Number(finalWeightGrams.toFixed(2));
      }

      if (mode === 'FEEDING') {
        const formattedMeals = value.meals.map((m: MealInput) => {
          const mealLocalTime = parse(`${value.log_date} ${m.time.substring(0,5)}`, 'yyyy-MM-dd HH:mm', new Date());
          return {
            time: mealLocalTime.toISOString(),
            food_item: m.food_item,
            feed_method: m.feed_method,
            quantity: Number(String(m.quantity || '0').replace(/[^0-9.]/g, '')),
            unit: m.unit,
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

      const finalNotes = value.initials ? `[${value.initials}] ${value.notes || ''}`.trim() : value.notes || null;
      const updates: any = { notes: finalNotes, log_date: combinedTimestamp };

      if (mode === 'WEIGHT') {
        updates.weight_grams = finalWeightGrams;
        updates.weight_not_required = value.weight_not_required;
        updates.weight_unit = animal.weight_unit;
      }
      if (mode === 'TEMPERATURE') {
        const safeParse = (val: any) => val === '' ? null : parseFloat(String(val).replace(/[^0-9.]/g, ''));
        updates.temperature_c = safeParse(value.temperature_c);
        updates.basking_temp_c = safeParse(value.basking_temp_c);
        updates.cool_temp_c = safeParse(value.cool_temp_c);
      }

      if (initialLogData?.id) {
        return await dailyLogService.updateLogDirect(initialLogData.id, updates);
      } else {
        return await dailyLogService.commitLog({ id: value._optimisticId, animal_id: animal.id, log_type: mode, ...updates });
      }
    },
    
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['daily_logs'] });

      const previousDailyLogs = queryClient.getQueryData<DailyLog[]>(['daily_logs']);
      const optimisticId = generateOfflineUUID();
      variables._optimisticId = optimisticId; 
      
      const safeTime = (variables.log_time || '12:00').substring(0, 5); 
      const localDate = parse(`${variables.log_date} ${safeTime}`, 'yyyy-MM-dd HH:mm', new Date());
      const finalNotes = variables.initials && mode !== 'FEEDING' ? `[${variables.initials}] ${variables.notes || ''}`.trim() : variables.notes || '';
      
      let optimisticGrams = null;
      if (mode === 'WEIGHT' && !variables.weight_not_required) {
        const safeParse = (val: any) => parseFloat(String(val || '0').replace(/[^0-9.]/g, '')) || 0;
        if (animal.weight_unit === 'lb') optimisticGrams = ((safeParse(variables.lbs) * 16) + safeParse(variables.oz) + (safeParse(variables.eighths) / 8)) * 28.3495;
        else if (animal.weight_unit === 'oz') optimisticGrams = (safeParse(variables.oz) + (safeParse(variables.eighths) / 8)) * 28.3495;
        else if (animal.weight_unit === 'kg') optimisticGrams = safeParse(variables.metric_weight) * 1000;
        else optimisticGrams = safeParse(variables.metric_weight);
      }

      const optimisticRecord = {
        id: initialLogData?.id || optimisticId,
        animal_id: animal.id,
        log_type: mode,
        log_date: localDate.toISOString(),
        notes: finalNotes,
        weight_grams: mode === 'WEIGHT' ? optimisticGrams : initialLogData?.weight_grams,
        weight_not_required: mode === 'WEIGHT' ? variables.weight_not_required : initialLogData?.weight_not_required,
        temperature_c: mode === 'TEMPERATURE' ? parseFloat(variables.temperature_c || '0') : initialLogData?.temperature_c,
        feed_details: mode === 'FEEDING' ? { meals: variables.meals, initials: variables.initials } : initialLogData?.feed_details,
        _isOptimistic: true
      };

      queryClient.setQueryData<DailyLog[]>(['daily_logs'], (old) => {
        if (!old) return [optimisticRecord as DailyLog];
        
        if (initialLogData?.id) {
          return old.map(log => log.id === initialLogData.id ? { ...log, ...optimisticRecord } as DailyLog : log);
        }
        
        const existingIndex = old.findIndex(log => log.animal_id === animal.id);
        if (existingIndex > -1) {
          const newArray = [...old];
          newArray[existingIndex] = { ...newArray[existingIndex], ...optimisticRecord } as DailyLog;
          return newArray;
        }
        
        return [optimisticRecord as DailyLog, ...old];
      });

      return { previousDailyLogs };
    },
    
    onError: (err: any, variables, context) => {
      if (context?.previousDailyLogs) queryClient.setQueryData(['daily_logs'], context.previousDailyLogs);
      setErrorMsg(err.message || 'Failed to queue log data.');
    },
    
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['daily_logs'] });
    }
  });

  const form = useForm({
    defaultValues: {
      log_date: initialLogData?.log_date ? format(new Date(initialLogData.log_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      log_time: initialLogData?.log_date ? format(new Date(initialLogData.log_date), 'HH:mm') : format(new Date(), 'HH:mm'),
      initials: initialLogData?.feed_details?.initials || '',
      notes: initialLogData?.notes?.replace(/^\[.*?\]\s*/, '') || '',
      lbs: initialImperial.lbs, oz: initialImperial.oz, eighths: initialImperial.eighths,
      metric_weight: animal.weight_unit === 'kg' && initialLogData?.weight_grams ? (initialLogData.weight_grams / 1000).toString() : initialLogData?.weight_grams?.toString() || '',
      weight_not_required: initialLogData?.weight_not_required || false,
      temperature_c: initialLogData?.temperature_c?.toString() || '',
      basking_temp_c: initialLogData?.basking_temp_c?.toString() || '',
      cool_temp_c: initialLogData?.cool_temp_c?.toString() || '',
      meals: initialMeals(),
      _optimisticId: '' 
    },
    onSubmit: async ({ value }) => {
      if (logMutation.isPending) return;
      setErrorMsg(null);
      logMutation.mutate(value);
      onClose();
    }
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white w-full h-[100dvh] md:h-auto md:max-h-[90vh] md:max-w-xl md:rounded-2xl shadow-xl overflow-hidden flex flex-col border-0 md:border md:border-slate-200">
        
        <div className="px-4 py-3 md:px-5 md:py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            {mode === 'WEIGHT' && <Scale size={16} className="text-emerald-600" />}
            {mode === 'FEEDING' && <Utensils size={16} className="text-amber-600" />}
            {mode === 'TEMPERATURE' && <Thermometer size={16} className="text-blue-600" />}
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
              {initialLogData ? `Amend ${mode}` : `Log ${mode}`}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 md:p-5 overflow-y-auto custom-scrollbar bg-white flex-1 relative">
          {errorMsg && (
            <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs font-medium">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>{errorMsg}</div>
            </div>
          )}

          <form id="quick-log-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="space-y-5">
            
            <div className="flex flex-row items-end gap-2 md:gap-3 bg-slate-50 border border-slate-100 p-2 md:p-3 rounded-xl">
              <div className="flex-[2] min-w-0">
                <form.Field name="log_date">{(field) => <FormInput field={field} label="Date" type="date" />}</form.Field>
              </div>
              {mode !== 'FEEDING' && (
                <div className="flex-1 min-w-0">
                  <form.Field name="log_time">{(field) => <FormInput field={field} label="Time" type="time" />}</form.Field>
                </div>
              )}
              <div className="flex-[1.2] min-w-0">
                <form.Field name="initials">{(field) => <FormInput field={field} label="Initials" placeholder="e.g. JD" />}</form.Field>
              </div>
            </div>

            {mode === 'WEIGHT' && (
              <div className="space-y-3">
                <form.Subscribe selector={(state) => state.values.weight_not_required}>
                  {(exempt) => !exempt && (
                    <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                      {animal.weight_unit === 'lb' && (
                        <div className="grid grid-cols-3 gap-2">
                          <form.Field name="lbs">{(field) => <FormInput field={field} label="Lbs" type="number" />}</form.Field>
                          <form.Field name="oz">{(field) => <FormInput field={field} label="Oz" type="number" />}</form.Field>
                          <form.Field name="eighths">
                            {(field) => (
                              <div className="flex flex-col gap-1 w-full">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Eighths</label>
                                <select value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm md:text-xs font-bold shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
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
                              <div className="flex flex-col gap-1 w-full">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Eighths</label>
                                <select value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm md:text-xs font-bold shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
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
                        <span className="text-xs font-bold text-slate-600 tracking-wide">Weight Not Required</span>
                      </label>
                    )}
                  </form.Field>
                </div>
              </div>
            )}

            {mode === 'TEMPERATURE' && (
              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                {animal.ambient_temp_only ? (
                  <form.Field name="temperature_c">{(field) => <FormInput field={field} label="Ambient Enclosure (°C)" type="number" />}</form.Field>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <form.Field name="basking_temp_c">{(field) => <FormInput field={field} label="Basking Spot (°C)" type="number" />}</form.Field>
                    <form.Field name="cool_temp_c">{(field) => <FormInput field={field} label="Cool Zone (°C)" type="number" />}</form.Field>
                  </div>
                )}
              </div>
            )}

            {mode === 'FEEDING' && (
              <div className="space-y-3">
                <form.Field name="meals">
                  {(field) => (
                    <>
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded">Rations Logged</span>
                        <button
                          type="button"
                          onClick={() => field.pushValue({ id: generateOfflineUUID(), food_item: '', feed_method: '', quantity: '', unit: 'Whole', calci_dust_added: false, time: format(new Date(), 'HH:mm') })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 transition-colors shadow-sm"
                        >
                          <Plus size={12} /> Add Row
                        </button>
                      </div>

                      <div className="space-y-3 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
                        {field.state.value.map((_, index) => (
                          <div key={index} className="p-3 bg-white border border-slate-200 shadow-sm rounded-2xl relative space-y-3 group">
                            {field.state.value.length > 1 && (
                              <button type="button" onClick={() => field.removeValue(index)} className="absolute top-2 right-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors md:opacity-0 group-hover:opacity-100">
                                <Trash2 size={14} />
                              </button>
                            )}
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <form.Field name={`meals[${index}].food_item` as const}>
                                {(subField) => <FormSelect field={subField} label={`Food Item (${index + 1})`} placeholder="-- Select Food --" options={foodTypes.map((f: any) => ({ value: f.name, label: f.name }))} />}
                              </form.Field>
                              <form.Field name={`meals[${index}].feed_method` as const}>
                                {(subField) => <FormSelect field={subField} label="Feed Method" placeholder="-- Select Method --" options={feedMethods.map((f: any) => ({ value: f.name, label: f.name }))} />}
                              </form.Field>
                            </div>

                            {/* UI FIX: Single Quantity + Unit Selector */}
                            <div className="grid grid-cols-3 gap-2">
                              <form.Field name={`meals[${index}].time` as const}>{(subField) => <FormInput field={subField} label="Time" type="time" />}</form.Field>
                              <form.Field name={`meals[${index}].quantity` as const}>{(subField) => <FormInput field={subField} label="Qty" type="number" />}</form.Field>
                              <form.Field name={`meals[${index}].unit` as const}>
                                {(subField) => <FormSelect field={subField} label="Unit" options={[{ value: 'Whole', label: 'Whole' }, { value: 'g', label: 'Grams' }]} />}
                              </form.Field>
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                              <form.Field name={`meals[${index}].calci_dust_added` as const}>
                                {(subField) => (
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={Boolean(subField.state.value)} onChange={(e) => subField.handleChange(e.target.checked)} className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500" />
                                    <span className="text-[10px] md:text-[11px] font-bold text-slate-600 uppercase tracking-wide">Add Calci-Dust Modifier</span>
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

            <div className="pt-2 border-t border-slate-100 pb-8 md:pb-0">
              <form.Field name="notes">{(field) => <FormInput field={field} label="Observation / Treatment Notes" type="textarea" placeholder="Enter additional context here..." />}</form.Field>
            </div>

          </form>
        </div>

        <div className="mt-auto px-4 py-3 md:px-5 md:py-3 border-t border-slate-200 flex items-center justify-end bg-slate-50 gap-3 shrink-0 sticky bottom-0 z-10">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">
            Cancel
          </button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button
                type="submit"
                form="quick-log-form"
                disabled={!canSubmit || isSubmitting}
                className={`flex items-center justify-center gap-2 px-6 py-2.5 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-sm disabled:opacity-50 min-w-[120px] ${
                  mode === 'WEIGHT' ? 'bg-emerald-600 hover:bg-emerald-500' :
                  mode === 'FEEDING' ? 'bg-amber-600 hover:bg-amber-500' :
                  'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {initialLogData ? 'Save' : 'Commit'}
              </button>
            )}
          </form.Subscribe>
        </div>

      </div>
    </div>
  );
} 