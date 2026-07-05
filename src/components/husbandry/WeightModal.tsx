import React, { useEffect } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { X, Save, Loader2, Scale } from 'lucide-react';
import { toast } from 'sonner'; 
import { useAuth } from '../../lib/auth';
// Route this through the offline-capable service layer
import { weightService } from '../../services/weightService'; 

// 1. Strict Zod Schema
const weightSchema = z.object({
  weight_grams: z.number().min(1, 'Weight must be greater than 0'),
  am_pm: z.enum(['AM', 'PM']),
  has_cast: z.boolean().default(false),
  recorded_by: z.string().min(2, 'Initials required').max(3),
});

type WeightFormValues = z.infer<typeof weightSchema>;

interface WeightModalProps {
  isOpen: boolean;
  onClose: () => void;
  animalId: string;
}

export function WeightModal({ isOpen, onClose, animalId }: WeightModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  // 2. Mutation with Offline Queue Support
  const insertWeightMutation = useMutation({
    mutationFn: async (values: WeightFormValues) => {
      const payload = {
        id: crypto.randomUUID(), // Client-side UUID for offline queueing
        animal_id: animalId,
        recorded_by: values.recorded_by.toUpperCase(),
        recorded_at: new Date().toISOString(),
        created_by: profile?.id,
        weight_grams: values.weight_grams,
        am_pm: values.am_pm,
        has_cast: values.has_cast,
      };

      return await weightService.insertWeightLog(payload);
    },
    onSuccess: () => {
      toast.success('Weight logged successfully');
      queryClient.invalidateQueries({ queryKey: ['weights', animalId] });
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to log weight: ${error.message}`);
    },
  });

  // 3. TanStack Form Initialization
  const form = useForm<WeightFormValues>({
    defaultValues: {
      weight_grams: 0,
      am_pm: new Date().getHours() < 12 ? 'AM' : 'PM', // Smart default based on current real-world time
      has_cast: false,
      recorded_by: '', // Strictly empty for compliance
    },
    validators: {
      onChange: weightSchema,
    },
    onSubmit: async ({ value }) => {
      insertWeightMutation.mutate(value);
    },
  });

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      form.reset();
      // Re-evaluate the AM/PM default just in case they left the app open
      form.setFieldValue('am_pm', new Date().getHours() < 12 ? 'AM' : 'PM');
    }
  }, [isOpen, form]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Scale size={20} className="text-slate-700" />
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Log Weight</h2>
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
          {/* Initials & Weight Row */}
          <div className="grid grid-cols-4 gap-4">
            <form.Field name="recorded_by">
              {(field) => (
                <div className="col-span-1 space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Initials</label>
                  <input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full px-3 py-3 border border-slate-200 rounded-lg text-base font-bold uppercase focus:ring-2 focus:ring-emerald-500 outline-none text-center"
                    placeholder="JM"
                    maxLength={3}
                  />
                  {field.state.meta.errors ? <p className="text-xs text-red-500">{field.state.meta.errors}</p> : null}
                </div>
              )}
            </form.Field>

            <form.Field name="weight_grams">
              {(field) => (
                <div className="col-span-3 space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Weight (Grams)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      value={field.state.value || ''}
                      onChange={(e) => field.handleChange(parseFloat(e.target.value))}
                      className="w-full pl-3 pr-10 py-3 border border-slate-200 rounded-lg text-lg font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="0"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">g</span>
                  </div>
                  {field.state.meta.errors ? <p className="text-xs text-red-500">{field.state.meta.errors}</p> : null}
                </div>
              )}
            </form.Field>
          </div>

          {/* AM/PM Ergonomic Segmented Control */}
          <form.Field name="am_pm">
            {(field) => (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Time of Day</label>
                <div className="flex gap-2">
                  <label 
                    className={`flex-1 py-3 text-center rounded-lg border-2 font-black transition-all cursor-pointer ${
                      field.state.value === 'AM' 
                        ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm' 
                        : 'border-slate-100 text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      className="hidden"
                      value="AM"
                      checked={field.state.value === 'AM'}
                      onChange={() => field.handleChange('AM')}
                    />
                    AM Weight
                  </label>
                  
                  <label 
                    className={`flex-1 py-3 text-center rounded-lg border-2 font-black transition-all cursor-pointer ${
                      field.state.value === 'PM' 
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm' 
                        : 'border-slate-100 text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      className="hidden"
                      value="PM"
                      checked={field.state.value === 'PM'}
                      onChange={() => field.handleChange('PM')}
                    />
                    PM Weight
                  </label>
                </div>
              </div>
            )}
          </form.Field>

          {/* Has Cast Toggle */}
          <form.Field name="has_cast">
            {(field) => (
              <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors mt-2">
                <input
                  type="checkbox"
                  checked={field.state.value}
                  onChange={(e) => field.handleChange(e.target.checked)}
                  className="w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <span className="text-base font-bold text-slate-700">Bird has cast pellet</span>
              </label>
            )}
          </form.Field>

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
                  disabled={!canSubmit || insertWeightMutation.isPending}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {insertWeightMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Log Weight
                </button>
              )}
            />
          </div>
        </form>
      </div>
    </div>
  );
}