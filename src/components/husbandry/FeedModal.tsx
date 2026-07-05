import React, { useEffect } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { X, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner'; 
import { useAuth } from '../../lib/auth';
import { feedingService } from '../../services/feedingService'; 

const feedSchema = z.object({
  food_item: z.string().min(1, 'Food item is required'),
  feed_method: z.string().optional(),
  quantity: z.number().min(0.1, 'Quantity must be greater than 0'),
  unit: z.enum(['grams', 'whole_item']),
  calci_dust_added: z.boolean().default(false),
  recorded_by: z.string().min(2, 'Initials required').max(3),
});

type FeedFormValues = z.infer<typeof feedSchema>;

interface FeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  animalId: string;
}

export function FeedModal({ isOpen, onClose, animalId }: FeedModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const insertFeedMutation = useMutation({
    mutationFn: async (values: FeedFormValues) => {
      const payload = {
        id: crypto.randomUUID(), 
        animal_id: animalId,
        recorded_by: values.recorded_by.toUpperCase(),
        recorded_at: new Date().toISOString(),
        created_by: profile?.id,
        food_item: values.food_item,
        feed_method: values.feed_method || null,
        quantity: values.quantity,
        unit: values.unit,
        calci_dust_added: values.calci_dust_added,
      };

      return await feedingService.insertFeedLog(payload);
    },
    onSuccess: () => {
      toast.success('Feed logged successfully');
      queryClient.invalidateQueries({ queryKey: ['feeds', animalId] });
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to log feed: ${error.message}`);
    },
  });

  const form = useForm<FeedFormValues>({
    defaultValues: {
      food_item: '',
      feed_method: '',
      quantity: 1,
      unit: 'whole_item',
      calci_dust_added: false,
      recorded_by: '', // Strictly empty to force intentional entry
    },
    validators: {
      onChange: feedSchema,
    },
    onSubmit: async ({ value }) => {
      insertFeedMutation.mutate(value);
    },
  });

  // Reset form when modal opens to ensure a completely fresh state
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
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Log Feed</h2>
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
          className="p-6 space-y-4"
        >
          {/* Initials & Food Item */}
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

            <form.Field name="food_item">
              {(field) => (
                <div className="col-span-3 space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Food Item</label>
                  <input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full px-3 py-3 border border-slate-200 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="e.g. Day Old Chick"
                  />
                  {field.state.meta.errors ? <p className="text-xs text-red-500">{field.state.meta.errors}</p> : null}
                </div>
              )}
            </form.Field>
          </div>

          {/* Quantity & Unit */}
          <div className="grid grid-cols-2 gap-4">
            <form.Field name="quantity">
              {(field) => (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quantity</label>
                  <input
                    type="number"
                    step="0.1"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(parseFloat(e.target.value))}
                    className="w-full px-3 py-3 border border-slate-200 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="unit">
              {(field) => (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Unit</label>
                  <select
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value as 'grams' | 'whole_item')}
                    className="w-full px-3 py-3 border border-slate-200 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                  >
                    <option value="whole_item">Whole Item(s)</option>
                    <option value="grams">Grams (g)</option>
                  </select>
                </div>
              )}
            </form.Field>
          </div>

          {/* Feed Method & Supplements */}
          <div className="space-y-4 pt-2">
            <form.Field name="feed_method">
              {(field) => (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Feed Method (Optional)</label>
                  <select
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full px-3 py-3 border border-slate-200 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                  >
                    <option value="">Select Method...</option>
                    <option value="On Glove">On Glove</option>
                    <option value="Lure">Lure</option>
                    <option value="Aviary Drop">Aviary Drop</option>
                    <option value="Block/Bow">Block/Bow</option>
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="calci_dust_added">
              {(field) => (
                <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={field.state.value}
                    onChange={(e) => field.handleChange(e.target.checked)}
                    className="w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-base font-bold text-slate-700">Calci-Dust Added</span>
                </label>
              )}
            </form.Field>
          </div>

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
                  disabled={!canSubmit || insertFeedMutation.isPending}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {insertFeedMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Log Feed
                </button>
              )}
            />
          </div>
        </form>
      </div>
    </div>
  );
}