import React, { useState, useEffect } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Save, Loader2, AlertCircle, Plus, Trash2, Scale, Utensils, Thermometer, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { dailyLogService } from '../../services/dailyLogService';
import { Animal, DailyLog } from '../../types';

interface DailyLogFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  animal: Animal;
  mode: 'WEIGHT' | 'FEEDING' | 'TEMPERATURE' | 'OBSERVATION';
  initialLogData?: DailyLog;
}

interface MealInputRow {
  id: string;
  food_item: string;
  food_offered_g: string;
  food_consumed_g: string;
  calci_dust_added: boolean;
  time: string;
}

export default function DailyLogFormModal({ isOpen, onClose, animal, mode, initialLogData }: DailyLogFormModalProps) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mealsList, setMealsList] = useState<MealInputRow[]>([]);

  useEffect(() => {
    if (mode === 'FEEDING') {
      const existingMeals = initialLogData?.feed_details?.meals || [];
      if (existingMeals.length > 0) {
        setMealsList(
          existingMeals.map((m: any) => ({
            id: crypto.randomUUID(),
            food_item: m.food_item || '',
            food_offered_g: m.food_offered_g?.toString() || '',
            food_consumed_g: m.food_consumed_g?.toString() || '',
            calci_dust_added: !!m.calci_dust_added,
            time: m.time ? new Date(m.time).toTimeString().slice(0, 5) : new Date().toTimeString().slice(0, 5)
          }))
        );
      } else {
        setMealsList([
          {
            id: crypto.randomUUID(),
            food_item: '',
            food_offered_g: '',
            food_consumed_g: '',
            calci_dust_added: false,
            time: new Date().toTimeString().slice(0, 5)
          }
        ]);
      }
    }
  }, [mode, initialLogData]);

  const addMealRow = () => {
    setMealsList(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        food_item: '',
        food_offered_g: '',
        food_consumed_g: '',
        calci_dust_added: false,
        time: new Date().toTimeString().slice(0, 5)
      }
    ]);
  };

  const removeMealRow = (id: string) => {
    if (mealsList.length > 1) {
      setMealsList(prev => prev.filter(row => row.id !== id));
    }
  };

  const updateMealRow = (id: string, key: keyof MealInputRow, value: any) => {
    setMealsList(prev => prev.map(row => row.id === id ? { ...row, [key]: value } : row));
  };

  const unpackGramsToImperial = (grams: number | null, unit: string) => {
    if (!grams) return { lbs: '', oz: '', eighths: '0' };
    const totalOunces = grams / 28.3495;
    
    if (unit === 'lb') {
      const lbs = Math.floor(totalOunces / 16);
      const remainderOunces = totalOunces - (lbs * 16);
      const oz = Math.floor(remainderOunces);
      const eighths = Math.round((remainderOunces - oz) * 8);
      return {
        lbs: lbs.toString(),
        oz: oz.toString(),
        eighths: eighths === 8 ? '0' : eighths.toString()
      };
    } else if (unit === 'oz') {
      const oz = Math.floor(totalOunces);
      const eighths = Math.round((totalOunces - oz) * 8);
      return {
        lbs: '',
        oz: oz.toString(),
        eighths: eighths === 8 ? '0' : eighths.toString()
      };
    }
    return { lbs: '', oz: '', eighths: '0' };
  };

  const initialImperial = unpackGramsToImperial(initialLogData?.weight_grams || null, animal.weight_unit || 'g');

  const logMutation = useMutation({
    mutationFn: async (value: any) => {
      const combinedTimestamp = new Date(`${value.log_date}T${value.log_time || '12:00'}:00`).toISOString();
      let finalWeightGrams: number | null = null;

      if (mode === 'WEIGHT' && !value.weight_not_required) {
        if (animal.weight_unit === 'lb') {
          const lbs = Number(value.lbs || 0);
          const oz = Number(value.oz || 0);
          const eighths = Number(value.eighths || 0);
          finalWeightGrams = ((lbs * 16) + oz + (eighths / 8)) * 28.3495;
        } else if (animal.weight_unit === 'oz') {
          const oz = Number(value.oz || 0);
          const eighths = Number(value.eighths || 0);
          finalWeightGrams = (oz + (eighths / 8)) * 28.3495;
        } else if (animal.weight_unit === 'kg') {
          finalWeightGrams = Number(value.metric_weight || 0) * 1000;
        } else {
          finalWeightGrams = Number(value.metric_weight || null);
        }
        if (finalWeightGrams) finalWeightGrams = Number(finalWeightGrams.toFixed(2));
      }

      if (mode === 'FEEDING') {
        const formattedMeals = mealsList.map(m => ({
          time: new Date(`${value.log_date}T${m.time}:00`).toISOString(),
          food_item: m.food_item,
          food_offered_g: Number(m.food_offered_g || 0),
          food_consumed_g: Number(m.food_consumed_g || 0),
          calci_dust_added: m.calci_dust_added
        }));

        if (initialLogData?.id) {
          return await dailyLogService.updateLogDirect(initialLogData.id, {
            feed_details: { meals: formattedMeals },
            notes: value.notes || null,
            log_date: combinedTimestamp
          });
        } else {
          return await dailyLogService.commitLog({
            animal_id: animal.id,
            log_type: 'FEEDING',
            log_date: combinedTimestamp,
            notes: value.notes || null,
            feed_details: { meals: formattedMeals }
          });
        }
      }

      if (initialLogData?.id) {
        const updates: any = { 
          notes: value.notes || null,
          log_date: combinedTimestamp
        };
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
        return await dailyLogService.updateLogDirect(initialLogData.id, updates);
      } else {
        return await dailyLogService.commitLog({
          animal_id: animal.id,
          log_type: mode,
          log_date: combinedTimestamp,
          notes: value.notes || null,
          weight_grams: mode === 'WEIGHT' ? finalWeightGrams : undefined,
          weight_unit: mode === 'WEIGHT' ? animal.weight_unit : undefined,
          weight_not_required: mode === 'WEIGHT' ? value.weight_not_required : undefined,
          temperature_c: mode === 'TEMPERATURE' ? (value.temperature_c === '' ? null : Number(value.temperature_c)) : undefined,
          basking_temp_c: mode === 'TEMPERATURE' ? (value.basking_temp_c === '' ? null : Number(value.basking_temp_c)) : undefined,
          cool_temp_c: mode === 'TEMPERATURE' ? (value.cool_temp_c === '' ? null : Number(value.cool_temp_c)) : undefined,
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['daily_logs', 'date-view'] });
      queryClient.invalidateQueries({ queryKey: ['animal_logs', animal.id] });
      onClose();
    }
  });

  const form = useForm({
    defaultValues: {
      // Safe local date formatting
      log_date: initialLogData?.log_date ? format(new Date(initialLogData.log_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      log_time: initialLogData?.log_date ? new Date(initialLogData.log_date).toTimeString().slice(0, 5) : new Date().toTimeString().slice(0, 5),
      notes: initialLogData?.notes || '',
      
      lbs: initialImperial.lbs,
      oz: initialImperial.oz,
      eighths: initialImperial.eighths,
      metric_weight: animal.weight_unit === 'kg' && initialLogData?.weight_grams ? (initialLogData.weight_grams / 1000).toString() : initialLogData?.weight_grams || '',
      weight_not_required: initialLogData?.weight_not_required || false,
      
      temperature_c: initialLogData?.temperature_c || '',
      basking_temp_c: initialLogData?.basking_temp_c || '',
      cool_temp_c: initialLogData?.cool_temp_c || '',
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      try {
        await logMutation.mutateAsync(value);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to sync log parameter data.');
      }
    }
  });

  if (!isOpen) return null;

  const TextInput = ({ name, label, type = 'text', placeholder }: { name: any, label: string, type?: string, placeholder?: string }) => (
    <form.Field name={name}>
      {(field) => (
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
          {type === 'textarea' ? (
            <textarea
              value={field.state.value as string}
              onChange={(e) => field.handleChange(e.target.value as any)}
              placeholder={placeholder}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm font-medium shadow-inner h-20"
            />
          ) : (
            <input
              type={type}
              value={field.state.value as any}
              onChange={(e) => field.handleChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) as any : e.target.value as any)}
              placeholder={placeholder}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm font-medium shadow-inner"
            />
          )}
        </div>
      )}
    </form.Field>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col border border-slate-200">
        
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            {mode === 'WEIGHT' && <Scale size={16} className="text-emerald-600" />}
            {mode === 'FEEDING' && <Utensils size={16} className="text-amber-600" />}
            {mode === 'TEMPERATURE' && <Thermometer size={16} className="text-blue-600" />}
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
              {initialLogData ? `Amend ${mode}` : `Log ${mode}`} Parameters
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh] custom-scrollbar bg-white">
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs font-medium">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>{errorMsg}</div>
            </div>
          )}

          <form id="quick-log-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="space-y-4">
            
            <div className="grid grid-cols-2 gap-4">
              <TextInput name="log_date" label="Observation Date" type="date" />
              {mode !== 'FEEDING' && <TextInput name="log_time" label="Time of Log (HH:MM)" type="time" />}
            </div>

            {mode === 'WEIGHT' && (
              <div className="space-y-4">
                <form.Subscribe selector={(state) => state.values.weight_not_required}>
                  {(exempt) => !exempt && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      {animal.weight_unit === 'lb' && (
                        <div className="grid grid-cols-3 gap-2">
                          <TextInput name="lbs" label="Lbs" type="number" />
                          <TextInput name="oz" label="Oz" type="number" />
                          <form.Field name="eighths">
                            {(field) => (
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Eighths</label>
                                <select value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold shadow-sm">
                                  {[0,1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}/8</option>)}
                                </select>
                              </div>
                            )}
                          </form.Field>
                        </div>
                      )}

                      {animal.weight_unit === 'oz' && (
                        <div className="grid grid-cols-2 gap-3">
                          <TextInput name="oz" label="Ounces (Oz)" type="number" />
                          <form.Field name="eighths">
                            {(field) => (
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Eighths</label>
                                <select value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold shadow-sm">
                                  {[0,1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}/8</option>)}
                                </select>
                              </div>
                            )}
                          </form.Field>
                        </div>
                      )}

                      {(animal.weight_unit === 'g' || animal.weight_unit === 'kg' || !animal.weight_unit) && (
                        <TextInput name="metric_weight" label={`Mass in ${animal.weight_unit || 'g'}`} type="number" />
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
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                {animal.ambient_temp_only ? (
                  <TextInput name="temperature_c" label="Ambient Enclosure Temperature (°C)" type="number" />
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <TextInput name="basking_temp_c" label="Basking Spot Temperature (°C)" type="number" />
                    <TextInput name="cool_temp_c" label="Cool Zone / Escape Temperature (°C)" type="number" />
                  </div>
                )}
              </div>
            )}

            {mode === 'FEEDING' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Rations Logged</span>
                  <button
                    type="button"
                    onClick={addMealRow}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 transition-colors shadow-sm"
                  >
                    <Plus size={12} /> Add Another Feed Row
                  </button>
                </div>

                <div className="space-y-3 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
                  {mealsList.map((meal, index) => (
                    <div key={meal.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl relative space-y-3">
                      {mealsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMealRow(meal.id)}
                          className="absolute top-3 right-3 text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 flex flex-col gap-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Food Item ({index + 1})</label>
                          <input type="text" value={meal.food_item} onChange={(e) => updateMealRow(meal.id, 'food_item', e.target.value)} placeholder="e.g. DOC" className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none shadow-sm" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Feed Time</label>
                          <input type="time" value={meal.time} onChange={(e) => updateMealRow(meal.id, 'time', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none shadow-sm" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Offered mass (g)</label>
                          <input type="number" value={meal.food_offered_g} onChange={(e) => updateMealRow(meal.id, 'food_offered_g', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none shadow-sm" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Consumed mass (g)</label>
                          <input type="number" value={meal.food_consumed_g} onChange={(e) => updateMealRow(meal.id, 'food_consumed_g', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none shadow-sm" />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer pt-1">
                        <input type="checkbox" checked={meal.calci_dust_added} onChange={(e) => updateMealRow(meal.id, 'calci_dust_added', e.target.checked)} className="w-3.5 h-3.5 text-amber-600 border-slate-300 rounded focus:ring-amber-500" />
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Add Calci-Dust Modifier</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 border-dashed">
              <TextInput name="notes" label="Observation / Treatment Notes" type="textarea" placeholder="Enter notes here..." />
            </div>

          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end bg-slate-50 gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800 transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            form="quick-log-form"
            disabled={logMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-50 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-sm"
          >
            {logMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {initialLogData ? 'Save Amendments' : 'Commit Worksheet Logs'}
          </button>
        </div>

      </div>
    </div>
  );
}