import React, { useEffect, useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { X, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner'; 
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { feedingService } from '../../services/feedingService'; 
import { Animal } from '../../types';

const extractErrorText = (errors: any): string | null => {
  if (!errors) return null;
  const errArray = Array.isArray(errors) ? errors : [errors];
  if (errArray.length === 0) return null;
  
  const messages = errArray.map((e: any) => {
    if (typeof e === 'string') return e;
    if (e && typeof e.message === 'string') return e.message;
    return null;
  }).filter(Boolean);
  
  return messages.length > 0 ? messages.join(', ') : null;
};

const FieldError = ({ meta }: { meta: any }) => {
  if (!meta.errors || meta.errors.length === 0) return null;
  const text = extractErrorText(meta.errors);
  if (!text) return null;
  return <p className="text-xs text-red-500 mt-1 font-bold">{text}</p>;
};

const formatLocalDatetime = (dateString?: string) => {
  const d = dateString ? new Date(dateString) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const feedItemSchema = z.object({
  id: z.string().optional(), 
  food_item: z.string().min(1, 'Required'),
  feed_method: z.string().optional(),
  quantity: z.number().min(0.1, 'Required'),
  unit: z.enum(['grams', 'whole_item']),
  calci_dust_added: z.boolean().default(false),
});

const feedGroupSchema = z.object({
  recorded_by: z.string().min(2, 'Initials required').max(3),
  recorded_at: z.string().min(1, 'Date and Time required'),
  items: z.array(feedItemSchema).min(1, 'At least one food item required'),
});

type FeedFormValues = z.infer<typeof feedGroupSchema>;

interface FeedModalProps { isOpen: boolean; onClose: () => void; animalId: string; initialData?: any; }

export function FeedModal({ isOpen, onClose, animalId, initialData }: FeedModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  // 1. Fetch the exact Animal profile from the local cache
  const animal = useMemo(() => {
    const cachedAnimals = queryClient.getQueryData<Animal[]>(['animals', 'dashboard']) || [];
    return cachedAnimals.find(a => a.id === animalId);
  }, [queryClient, animalId]);

  // THE FIX: We specifically target the animal's DESCRIPTION field, normalized to uppercase
  const animalFilterKey = animal?.description?.toUpperCase().trim() || '';

  // 2. Fetch Operational Lists
  const { data: opLists = [] } = useQuery({
    queryKey: ['operational_lists'],
    queryFn: async () => {
      const { data } = await supabase.from('operational_lists').select('name, category, description').eq('is_deleted', false);
      return data || [];
    }
  });

  // 3. Smart Filtering Engine matching the exact requested schema
  const foodOptions = useMemo(() => {
    return opLists.filter(l => {
      // Look explicitly for 'food_type' in the operational list category
      const isFood = l.category?.toLowerCase() === 'food_type';
      if (!isFood) return false;
      
      // If the list item has a description, cross-reference it with the animal's description
      if (l.description && animalFilterKey) {
        const listDesc = l.description.toUpperCase();
        return listDesc.includes(animalFilterKey) || animalFilterKey.includes(listDesc);
      }
      
      // Global fallback: If the list item has no description, show it for all animals just in case
      return true;
    });
  }, [opLists, animalFilterKey]);

  const methodOptions = useMemo(() => {
    return opLists.filter(l => {
      // Look explicitly for 'feed_method' in the operational list category
      const isMethod = l.category?.toLowerCase() === 'feed_method';
      if (!isMethod) return false;
      
      if (l.description && animalFilterKey) {
        const listDesc = l.description.toUpperCase();
        return listDesc.includes(animalFilterKey) || animalFilterKey.includes(listDesc);
      }
      
      return true;
    });
  }, [opLists, animalFilterKey]);

  const insertFeedMutation = useMutation({
    mutationFn: async (values: FeedFormValues) => {
      const payloads = values.items.map(item => ({
        id: item.id || crypto.randomUUID(), 
        animal_id: animalId,
        recorded_by: values.recorded_by.toUpperCase(),
        recorded_at: new Date(values.recorded_at).toISOString(), 
        created_by: profile?.id,
        food_item: item.food_item,
        feed_method: item.feed_method || null,
        quantity: item.quantity,
        unit: item.unit,
        calci_dust_added: item.calci_dust_added,
      }));
      return await feedingService.insertFeedLog(payloads);
    },
    onSuccess: () => {
      toast.success(initialData ? 'Feed updated successfully' : 'Feed logged successfully');
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      onClose();
    },
    onError: (error) => toast.error(`Failed to log feed: ${error.message}`),
  });

  const form = useForm<FeedFormValues>({
    defaultValues: {
      recorded_by: initialData?.recorded_by || '', 
      recorded_at: formatLocalDatetime(initialData?.recorded_at || initialData?.time || initialData?.log_date),
      items: initialData ? [{
        id: initialData.id,
        food_item: initialData.food_item || '',
        feed_method: initialData.feed_method || '',
        quantity: initialData.quantity || initialData.quantity_consumed || initialData.food_consumed_g || 1,
        unit: (initialData.unit === 'grams' || initialData.unit === 'g') ? 'grams' : 'whole_item',
        calci_dust_added: initialData.calci_dust_added || false,
      }] : [{ food_item: '', feed_method: '', quantity: 1, unit: 'whole_item', calci_dust_added: false }]
    },
    validators: { onSubmit: feedGroupSchema },
    onSubmit: async ({ value }) => insertFeedMutation.mutate(value),
  });

  useEffect(() => {
    if (isOpen && !initialData) {
      form.reset();
      form.setFieldValue('recorded_at', formatLocalDatetime());
    }
  }, [isOpen, form, initialData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center p-4 border-b border-slate-100 flex-none">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
              {initialData ? 'Edit Feed' : 'Log Feed'}
            </h2>
            {/* UI HELPER: Displays the animal's description so the user knows what filter is active */}
            {animal?.description && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold tracking-widest uppercase">
                {animal.description}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="grid grid-cols-3 gap-4">
            <form.Field name="recorded_by">
              {(field) => (
                <div className="col-span-1 space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Initials</label>
                  <input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full px-3 py-3 border border-slate-200 rounded-lg text-base font-bold uppercase focus:ring-2 focus:ring-emerald-500 outline-none text-center"
                    placeholder="JM" maxLength={3}
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>

            <form.Field name="recorded_at">
              {(field) => (
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full px-3 py-3 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Feed Components</h3>
            
            <form.Field name="items">
              {(itemsField) => (
                <div className="space-y-4">
                  {itemsField.state.value.map((_, i) => (
                    <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-200 relative group">
                      
                      {i > 0 && (
                        <button 
                          type="button" 
                          onClick={() => {
                            const newItems = [...itemsField.state.value];
                            newItems.splice(i, 1);
                            itemsField.handleChange(newItems);
                          }}
                          className="absolute -top-3 -right-3 p-2 bg-white border border-slate-200 text-red-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}

                      <div className="space-y-4">
                        <form.Field name={`items[${i}].food_item`}>
                          {(field) => (
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Food Item</label>
                              <select
                                value={field.state.value as string}
                                onChange={(e) => field.handleChange(e.target.value)}
                                className="w-full px-3 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                              >
                                <option value="">Select Food...</option>
                                {foodOptions.map((opt, idx) => (
                                  <option key={idx} value={opt.name}>{opt.name}</option>
                                ))}
                                {initialData && initialData.food_item && !foodOptions.find(o => o.name === initialData.food_item) && (
                                  <option value={initialData.food_item}>{initialData.food_item}</option>
                                )}
                              </select>
                              <FieldError meta={field.state.meta} />
                            </div>
                          )}
                        </form.Field>

                        <div className="grid grid-cols-2 gap-4">
                          <form.Field name={`items[${i}].quantity`}>
                            {(field) => (
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Qty</label>
                                <input
                                  type="number" step="0.1"
                                  value={field.state.value as number}
                                  onChange={(e) => field.handleChange(parseFloat(e.target.value))}
                                  className="w-full px-3 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                                <FieldError meta={field.state.meta} />
                              </div>
                            )}
                          </form.Field>

                          <form.Field name={`items[${i}].unit`}>
                            {(field) => (
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Unit</label>
                                <select
                                  value={field.state.value as string}
                                  onChange={(e) => field.handleChange(e.target.value)}
                                  className="w-full px-3 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                >
                                  <option value="whole_item">Whole Item(s)</option>
                                  <option value="grams">Grams (g)</option>
                                </select>
                              </div>
                            )}
                          </form.Field>
                        </div>

                        <div className="flex items-center gap-4">
                          <form.Field name={`items[${i}].feed_method`}>
                            {(field) => (
                              <select
                                value={field.state.value as string}
                                onChange={(e) => field.handleChange(e.target.value)}
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                              >
                                <option value="">Select Method (Optional)</option>
                                {methodOptions.map((opt, idx) => (
                                  <option key={idx} value={opt.name}>{opt.name}</option>
                                ))}
                                {initialData && initialData.feed_method && !methodOptions.find(o => o.name === initialData.feed_method) && (
                                  <option value={initialData.feed_method}>{initialData.feed_method}</option>
                                )}
                              </select>
                            )}
                          </form.Field>

                          <form.Field name={`items[${i}].calci_dust_added`}>
                            {(field) => (
                              <label className="flex items-center gap-2 cursor-pointer flex-none">
                                <input
                                  type="checkbox"
                                  checked={field.state.value as boolean}
                                  onChange={(e) => field.handleChange(e.target.checked)}
                                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                />
                                <span className="text-xs font-bold text-slate-600">Calci-Dust</span>
                              </label>
                            )}
                          </form.Field>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => itemsField.handleChange([...itemsField.state.value, { food_item: '', feed_method: '', quantity: 1, unit: 'whole_item', calci_dust_added: false }])}
                    className="w-full py-3 border-2 border-dashed border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={16} /> Add Additional Component
                  </button>
                </div>
              )}
            </form.Field>
            
            <form.Subscribe
                selector={(state) => state.errorMap}
                children={(errorMap) => {
                  const text = extractErrorText(errorMap?.onSubmit);
                  if (!text) return null;
                  return (
                    <div className="col-span-full pt-1">
                      <p className="text-xs text-red-500 font-bold">{text}</p>
                    </div>
                  );
                }}
             />
          </div>
        </form>

        <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3 flex-none">
          <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <form.Subscribe
            selector={(state) => [state.isSubmitting]}
            children={([isSubmitting]) => (
              <button
                onClick={form.handleSubmit}
                disabled={insertFeedMutation.isPending}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {insertFeedMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {initialData ? 'Update Feed' : 'Save Feed'}
              </button>
            )}
          />
        </div>
      </div>
    </div>
  );
}