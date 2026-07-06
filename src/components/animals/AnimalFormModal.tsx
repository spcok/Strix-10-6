import React, { useState, useEffect, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { X, Save, AlertCircle, Search, ChevronDown, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { Animal } from '../../types';

// ============================================================================
// VALIDATION SCHEMA (Zod)
// ============================================================================
const animalSchema = z.object({
  name: z.string().min(1, "Entity name is required"),
  species: z.string().min(1, "Species is required"),
  latin_name: z.string().optional().nullable(),
  category: z.enum(['OWL', 'RAPTOR', 'MAMMAL', 'EXOTIC']),
  location: z.string().min(1, "Location is required"),
  gender: z.enum(['MALE', 'FEMALE', 'UNKNOWN']),
  date_of_birth: z.string().optional().nullable(),
  is_dob_unknown: z.boolean().default(false),
  is_dob_estimated: z.boolean().default(false), // NEW
  weight_unit: z.enum(['g', 'kg', 'lb', 'oz']),
  flying_weight: z.number().positive("Weight must be greater than 0").optional().nullable(),
  microchip_id: z.string().optional().nullable(),
  ring_number: z.string().optional().nullable(),
  sire_id: z.string().uuid().optional().nullable(),
  dam_id: z.string().uuid().optional().nullable(),
  
  // Exotics specific
  target_day_temp_c: z.number().optional().nullable(),
  target_night_temp_c: z.number().optional().nullable(),
  target_humidity_min_percent: z.number().optional().nullable(),
  target_humidity_max_percent: z.number().optional().nullable(),
  misting_frequency: z.string().optional().nullable(),
  misting_not_required: z.boolean().default(false), // NEW
});

type AnimalFormData = z.infer<typeof animalSchema>;

// ============================================================================
// UI COMPONENT: Searchable Combobox for Sire/Dam UUIDs
// ============================================================================
function SearchableSelect({ value, onChange, options, placeholder, error }: { value: string | null | undefined, onChange: (val: string | null) => void, options: Animal[], placeholder: string, error?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedAnimal = options.find(o => o.id === value);
  const filteredOptions = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()) || o.species.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div onClick={() => setIsOpen(!isOpen)} className={`flex items-center justify-between w-full px-3 py-2 bg-slate-50 border ${error ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'} rounded-xl text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors`}>
        <span className={selectedAnimal ? "text-slate-900 font-bold" : "text-slate-400"}>{selectedAnimal ? selectedAnimal.name : placeholder}</span>
        {value ? (
          <X size={16} className="text-slate-400 hover:text-slate-600" onClick={(e) => { e.stopPropagation(); onChange(null); }} />
        ) : <ChevronDown size={16} className="text-slate-400" />}
      </div>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input type="text" autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or species..." className="w-full bg-transparent text-sm focus:outline-none" />
          </div>
          <div className="overflow-y-auto custom-scrollbar p-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400 font-bold">No entities found</div>
            ) : (
              filteredOptions.map(option => (
                <div key={option.id} onClick={() => { onChange(option.id); setIsOpen(false); setSearch(''); }} className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-800 leading-tight">{option.name}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{option.species}</span>
                  </div>
                  {value === option.id && <Check size={16} className="text-emerald-600" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {error && <span className="text-xs font-bold text-red-500 mt-1 block">{error}</span>}
    </div>
  );
}

// ============================================================================
// MAIN MODAL COMPONENT
// ============================================================================
export default function AnimalFormModal({ isOpen, onClose, initialData }: { isOpen: boolean; onClose: () => void; initialData?: Animal }) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch all animals for the Sire/Dam comboboxes
  const { data: allAnimals = [] } = useQuery({
    queryKey: ['animals_list_for_dropdown'],
    queryFn: async () => {
      const { data } = await supabase.from('animals').select('id, name, species, gender');
      return data || [];
    },
    enabled: isOpen
  });

  const { register, handleSubmit, control, watch, setValue, reset, formState: { errors } } = useForm<AnimalFormData>({
    resolver: zodResolver(animalSchema),
    defaultValues: {
      name: '', species: '', latin_name: '', category: 'OWL', location: '', gender: 'UNKNOWN',
      date_of_birth: null, is_dob_unknown: false, is_dob_estimated: false,
      weight_unit: 'g', flying_weight: null, microchip_id: '', ring_number: '', sire_id: null, dam_id: null,
      target_day_temp_c: null, target_night_temp_c: null, target_humidity_min_percent: null, target_humidity_max_percent: null, misting_frequency: '', misting_not_required: false
    }
  });

  // Safe Initialization: Prevents "reading '0'" crashes
  useEffect(() => {
    if (isOpen && initialData) {
      reset({
        name: initialData.name || '',
        species: initialData.species || '',
        latin_name: initialData.latin_name || '',
        category: (initialData.category as any) || 'OWL',
        location: initialData.location || '',
        gender: (initialData.gender as any) || 'UNKNOWN',
        date_of_birth: initialData.date_of_birth || null,
        is_dob_unknown: initialData.is_dob_unknown || false,
        is_dob_estimated: (initialData as any).is_dob_estimated || false,
        weight_unit: (initialData.weight_unit as any) || 'g',
        flying_weight: initialData.flying_weight || null,
        microchip_id: initialData.microchip_id || '',
        ring_number: initialData.ring_number || '',
        sire_id: initialData.sire_id || null,
        dam_id: initialData.dam_id || null,
        target_day_temp_c: initialData.target_day_temp_c || null,
        target_night_temp_c: initialData.target_night_temp_c || null,
        target_humidity_min_percent: initialData.target_humidity_min_percent || null,
        target_humidity_max_percent: initialData.target_humidity_max_percent || null,
        misting_frequency: initialData.misting_frequency || '',
        misting_not_required: (initialData as any).misting_not_required || false,
      });
    }
  }, [isOpen, initialData, reset]);

  const watchCategory = watch('category');
  const watchDobUnknown = watch('is_dob_unknown');

  // Logic Rule: If Unknown DOB is checked, clear the date field
  useEffect(() => {
    if (watchDobUnknown) setValue('date_of_birth', null);
  }, [watchDobUnknown, setValue]);

  if (!isOpen) return null;

  // The submit handler
  const onSubmit = async (data: AnimalFormData) => {
    try {
      setIsSubmitting(true);
      const payload = { ...data, updated_at: new Date().toISOString() };

      if (initialData?.id) {
        const { error } = await supabase.from('animals').update(payload).eq('id', initialData.id);
        if (error) throw error;
        toast.success(`${data.name} updated successfully!`);
      } else {
        const { error } = await supabase.from('animals').insert([payload]);
        if (error) throw error;
        toast.success(`${data.name} added to the matrix!`);
      }

      queryClient.invalidateQueries({ queryKey: ['animals'] });
      onClose();
    } catch (error: any) {
      console.error('Error saving animal:', error);
      toast.error(`Database Error: ${error.message || 'Failed to save entity.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // The Validation Error Catch: Fires if Zod rejects the data before it hits onSubmit
  const onInvalid = (errors: any) => {
    toast.error('Validation Error: Please correct the fields marked in red.', { icon: <AlertCircle className="text-red-500" /> });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">{initialData ? 'Edit Entity Profile' : 'New Entity Profile'}</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Matrix Registration</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/30">
          <form id="animal-form" onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-8">
            
            {/* CORE DETAILS SECTION */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2 mb-4">Core Demographics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Given Name <span className="text-red-500">*</span></label>
                  <input {...register('name')} type="text" className={`w-full px-4 py-2.5 bg-slate-50 border ${errors.name ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'} rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition-all`} placeholder="e.g. Teacup" />
                  {errors.name && <p className="text-xs font-bold text-red-500 mt-1">{errors.name.message}</p>}
                </div>

                {/* Location */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Location <span className="text-red-500">*</span></label>
                  <input {...register('location')} type="text" className={`w-full px-4 py-2.5 bg-slate-50 border ${errors.location ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'} rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition-all`} placeholder="e.g. Aviary Block A" />
                  {errors.location && <p className="text-xs font-bold text-red-500 mt-1">{errors.location.message}</p>}
                </div>

                {/* Species */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Common Species <span className="text-red-500">*</span></label>
                  <input {...register('species')} type="text" className={`w-full px-4 py-2.5 bg-slate-50 border ${errors.species ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'} rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition-all`} placeholder="e.g. Barn Owl" />
                  {errors.species && <p className="text-xs font-bold text-red-500 mt-1">{errors.species.message}</p>}
                </div>

                {/* Latin Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Latin Taxonomy</label>
                  <input {...register('latin_name')} type="text" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 italic outline-none focus:ring-2 focus:ring-emerald-500 transition-all" placeholder="e.g. Tyto alba" />
                </div>

                {/* Category & Gender */}
                <div className="grid grid-cols-2 gap-4 col-span-1 md:col-span-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Category <span className="text-red-500">*</span></label>
                    <select {...register('category')} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition-all">
                      <option value="OWL">Owl</option><option value="RAPTOR">Raptor</option><option value="MAMMAL">Mammal</option><option value="EXOTIC">Exotic</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Gender <span className="text-red-500">*</span></label>
                    <select {...register('gender')} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition-all">
                      <option value="UNKNOWN">Unknown</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
                    </select>
                  </div>
                </div>

              </div>
            </div>

            {/* DATE OF BIRTH SECTION */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2 mb-4">Age & Lineage</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* DOB Logic */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Date of Birth</label>
                  <input {...register('date_of_birth')} type="date" disabled={watchDobUnknown} className={`w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${watchDobUnknown ? 'opacity-50 cursor-not-allowed grayscale' : ''}`} />
                  <div className="flex gap-4 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input {...register('is_dob_estimated')} type="checkbox" disabled={watchDobUnknown} className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 disabled:opacity-50" />
                      <span className={`text-xs font-bold text-slate-600 group-hover:text-slate-900 ${watchDobUnknown ? 'opacity-50' : ''}`}>Approximate</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input {...register('is_dob_unknown')} type="checkbox" className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" />
                      <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900">Unknown</span>
                    </label>
                  </div>
                </div>

                {/* Sire / Dam Comboboxes */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sire (Father)</label>
                    <Controller control={control} name="sire_id" render={({ field, fieldState }) => (
                      <SearchableSelect value={field.value} onChange={field.onChange} options={allAnimals.filter(a => a.gender === 'MALE' || a.gender === 'UNKNOWN')} placeholder="Select Sire..." error={fieldState.error?.message} />
                    )} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Dam (Mother)</label>
                    <Controller control={control} name="dam_id" render={({ field, fieldState }) => (
                      <SearchableSelect value={field.value} onChange={field.onChange} options={allAnimals.filter(a => a.gender === 'FEMALE' || a.gender === 'UNKNOWN')} placeholder="Select Dam..." error={fieldState.error?.message} />
                    )} />
                  </div>
                </div>

              </div>
            </div>

            {/* WEIGHT & IDS SECTION */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2 mb-4">Biometrics & Identification</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Profile Weight</label>
                    <input {...register('flying_weight', { valueAsNumber: true })} type="number" step="0.1" className={`w-full px-4 py-2.5 bg-slate-50 border ${errors.flying_weight ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'} rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition-all`} placeholder="0" />
                    {errors.flying_weight && <p className="text-xs font-bold text-red-500 mt-1">{errors.flying_weight.message}</p>}
                  </div>
                  <div className="col-span-1 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Unit</label>
                    <select {...register('weight_unit')} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="g">g</option><option value="kg">kg</option><option value="lb">lb</option><option value="oz">oz</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Microchip ID</label>
                    <input {...register('microchip_id')} type="text" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition-all" placeholder="Optional" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ring Number</label>
                    <input {...register('ring_number')} type="text" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition-all" placeholder="Optional" />
                  </div>
                </div>
              </div>
            </div>

            {/* CONDITIONAL EXOTICS SECTION */}
            {watchCategory === 'EXOTIC' && (
              <div className="bg-orange-50/50 p-5 rounded-2xl border border-orange-200 shadow-sm space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-orange-600 border-b border-orange-200/50 pb-2 mb-4">Exotic Husbandry Parameters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Temperature */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1.5"><ThermometerSun size={12} /> Thermal Gradient (°C)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Day / Basking Target</label>
                        <input {...register('target_day_temp_c', { valueAsNumber: true })} type="number" step="0.1" className={`w-full px-4 py-2.5 bg-white border ${errors.target_day_temp_c ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'} rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500 transition-all`} placeholder="e.g. 32" />
                        {errors.target_day_temp_c && <p className="text-xs font-bold text-red-500 mt-1">{errors.target_day_temp_c.message}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Night Target</label>
                        <input {...register('target_night_temp_c', { valueAsNumber: true })} type="number" step="0.1" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500 transition-all" placeholder="e.g. 24" />
                      </div>
                    </div>
                  </div>

                  {/* Humidity & Misting */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Humidity & Moisture</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Min Humidity (%)</label>
                        <input {...register('target_humidity_min_percent', { valueAsNumber: true })} type="number" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="e.g. 60" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Max Humidity (%)</label>
                        <input {...register('target_humidity_max_percent', { valueAsNumber: true })} type="number" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="e.g. 80" />
                      </div>
                      <div className="col-span-2 space-y-1.5 pt-2 border-t border-orange-200/50">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Misting Routine</label>
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input {...register('misting_not_required')} type="checkbox" className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest group-hover:text-slate-900">Not Required</span>
                          </label>
                        </div>
                        <input {...register('misting_frequency')} disabled={watch('misting_not_required')} type="text" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50 disabled:bg-slate-100" placeholder="e.g. Twice daily, heavy spray" />
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

          </form>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" form="animal-form" disabled={isSubmitting} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50">
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {initialData ? 'Update Profile' : 'Register Entity'}
          </button>
        </div>

      </div>
    </div>
  );
}