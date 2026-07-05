import React, { useEffect } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { X, Save, Loader2, Thermometer } from 'lucide-react';
import { toast } from 'sonner'; 
import { useAuth } from '../../lib/auth';
// Route this through the offline-capable service layer
import { temperatureService } from '../../services/temperatureService'; 

// 1. Zod Schema
// We use .optional() on the numbers so empty fields don't throw immediate NaN errors while typing
const temperatureSchema = z.object({
  recorded_by: z.string().min(2, 'Initials required').max(3),
  temp_ambient: z.number().optional(),
  temp_basking: z.number().optional(),
  temp_cool: z.number().optional(),
}).refine((data) => {
  // Ensure at least ONE temperature is actually logged before submitting
  return data.temp_ambient !== undefined || data.temp_basking !== undefined || data.temp_cool !== undefined;
}, {
  message: "Please enter a valid temperature reading.",
  path: ["temp_ambient"] 
});

type TemperatureFormValues = z.infer<typeof temperatureSchema>;

interface TemperatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  animalId: string;
  ambientOnly: boolean; // Passed down from the animal's profile data
}

export function TemperatureModal({ isOpen, onClose, animalId, ambientOnly }: TemperatureModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  // 2. Mutation with Offline Queue Support
  const insertTempMutation = useMutation({
    mutationFn: async (values: TemperatureFormValues) => {
      // Auto-calculate the average if both basking and cool are provided
      let tempAverage = null;
      if (values.temp_basking !== undefined && values.temp_cool !== undefined) {
        // Round to 1 decimal place
        tempAverage = Math.round(((values.temp_basking + values.temp_cool) / 2) * 10) / 10;
      }

      const payload = {
        id: crypto.randomUUID(), // Client-side UUID for offline queueing
        animal_id: animalId,
        recorded_by: values.recorded_by.toUpperCase(),
        recorded_at: new Date().toISOString(),
        created_by: profile?.id,
        temp_ambient: values.temp_ambient ?? null,
        temp_basking: values.temp_basking ?? null,
        temp_cool: values.temp_cool ?? null,
        temp_average: tempAverage,
      };

      return await temperatureService.insertTemperatureLog(payload);
    },
    onSuccess: () => {
      toast.success('Temperature logged successfully');
      queryClient.invalidateQueries({ queryKey: ['temperatures', animalId] });
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to log temperature: ${error.message}`);
    },
  });

  // 3. TanStack Form Initialization
  const form = useForm<TemperatureFormValues>({
    defaultValues: {
      recorded_by: '', // Strictly empty for compliance
      temp_ambient: undefined,
      temp_basking: undefined,
      temp_cool: undefined,
    },
    validators: {
      onChange: temperatureSchema,
    },
    onSubmit: async ({ value }) => {
      insertTempMutation.mutate(value);
    },
  });

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Thermometer size={20} className="text-orange-500" />
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Log Temperature</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="p-6 space-y-5"
        >
          {/* Initials Row */}
          <form.Field name="recorded_by">
            {(field) => (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Initials</label>
                <input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="w-24 px-3 py-3 border border-slate-200 rounded-lg text-base font-bold uppercase focus:ring-2 focus:ring-orange-500 outline-none text-center block"
                  placeholder="JM"
                  maxLength={3}
                />
                {field.state.meta.errors ? <p className="text-xs text-red-500">{field.state.meta.errors}</p> : null}
              </div>
            )}
          </form.Field>

          {/* Conditional Rendering Based on Animal Setup */}
          {ambientOnly ? (
            // AMBIENT ONLY LAYOUT (Standard Weathering/Aviary)
            <form.Field name="temp_ambient">
              {(field) => (
                <div className="space-y-1 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ambient Temperature</label>
                  <div className="relative w-full sm:w-1/2">
                    <input
                      type="number"
                      step="0.1"
                      value={field.state.value === undefined ? '' : field.state.value}
                      onChange={(e) => field.handleChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      className="w-full pl-3 pr-12 py-3 border border-slate-200 rounded-lg text-xl font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                      placeholder="0.0"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">°C</span>
                  </div>
                  {field.state.meta.errors ? <p className="text-xs text-red-500">{field.state.meta.errors}</p> : null}
                </div>
              )}
            </form.Field>
          ) : (
            // GRADIENT LAYOUT (Clinical / Indoor with Heat Source)
            <div className="space-y-4 bg-orange-50/50 p-4 rounded-xl border border-orange-100">
              <div className="grid grid-cols-2 gap-4">
                <form.Field name="temp_basking">
                  {(field) => (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span> Basking End
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={field.state.value === undefined ? '' : field.state.value}
                          onChange={(e) => field.handleChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          className="w-full pl-3 pr-10 py-3 border border-orange-200 rounded-lg text-lg font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                          placeholder="0.0"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-400 font-bold">°C</span>
                      </div>
                    </div>
                  )}
                </form.Field>

                <form.Field name="temp_cool">
                  {(field) => (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span> Cool End
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={field.state.value === undefined ? '' : field.state.value}
                          onChange={(e) => field.handleChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          className="w-full pl-3 pr-10 py-3 border border-blue-200 rounded-lg text-lg font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="0.0"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 font-bold">°C</span>
                      </div>
                    </div>
                  )}
                </form.Field>
              </div>

              {/* Dynamic Average Readout */}
              <form.Subscribe
                selector={(state) => ({
                  basking: state.values.temp_basking,
                  cool: state.values.temp_cool,
                })}
              >
                {({ basking, cool }) => {
                  const hasBoth = basking !== undefined && cool !== undefined;
                  const avg = hasBoth ? ((basking + cool) / 2).toFixed(1) : '--';
                  
                  return (
                    <div className="pt-3 border-t border-orange-200/50 flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Calculated Average</span>
                      <span className={`text-xl font-black ${hasBoth ? 'text-slate-800' : 'text-slate-300'}`}>
                        {avg} <span className="text-sm text-slate-400">°C</span>
                      </span>
                    </div>
                  );
                }}
              </form.Subscribe>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <button
                  type="submit"
                  disabled={!canSubmit || insertTempMutation.isPending}
                  className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {insertTempMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Log Temp
                </button>
              )}
            />
          </div>
        </form>
      </div>
    </div>
  );
}