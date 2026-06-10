import React, { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, Save, Loader2, AlertCircle, Users, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { AnimalCategory, AnimalStatus, RecordType, Animal } from '../../types';
import { ImageUploader } from '../ui/ImageUploader';

interface AnimalFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: any; 
}

const TABS = [
  { id: 'core', label: 'Core Details' },
  { id: 'id', label: 'ID & Weight' },
  { id: 'husbandry', label: 'Husbandry & Env' },
  { id: 'safety', label: 'Safety & Origin' },
  { id: 'notes', label: 'Notes & Meta' }
] as const;

type TabId = typeof TABS[number]['id'];

export default function AnimalFormModal({ isOpen, onClose, initialData }: AnimalFormModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('core');
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);

  const { data: existingGroups = [] } = useQuery({
    queryKey: ['animal-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('id, name, species')
        .eq('record_type', 'GROUP')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['operational_lists', 'LOCATION'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operational_lists')
        .select('id, name')
        .eq('category', 'LOCATION')
        .eq('is_deleted', false)
        .order('display_order');
      if (error) throw error;
      return data;
    }
  });

  const uploadToSupabase = async (file: Blob, folder: string): Promise<string> => {
    const fileExt = file.type === 'image/png' ? 'png' : 'jpg';
    const fileName = `${folder}/${crypto.randomUUID()}.${fileExt}`;
    const { error } = await supabase.storage.from('media').upload(fileName, file, { contentType: file.type || 'image/jpeg' });
    if (error) throw error;
    const { data } = supabase.storage.from('media').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const saveAnimalMutation = useMutation({
    mutationFn: async (payload: Partial<Animal>) => {
      if (initialData?.id) {
        // 1. Check if location changed for Internal Movement Audit
        const oldLocation = initialData.location;
        const newLocation = payload.location;

        const { data, error } = await supabase.from('animals').update(payload).eq('id', initialData.id).select().single();
        if (error) throw error;

        // 2. Trigger Movement Log if a move occurred (matching new schema)
        if (oldLocation !== newLocation && newLocation !== undefined) {
           const { error: moveError } = await supabase.from('internal_movements').insert([{
              animal_id: initialData.id,
              from_location: oldLocation || null,
              to_location: newLocation,
              movement_date: new Date().toISOString(),
              reason: 'Updated via Profile UI'
           }]);
           if (moveError) console.error("[Audit Engine] Failed to log internal movement:", moveError);
        }
        return data;
      } else {
        const { data, error } = await supabase.from('animals').insert([payload]).select().single();
        if (error) throw error;

        if (payload.location) {
           await supabase.from('internal_movements').insert([{
              animal_id: data.id,
              from_location: null,
              to_location: payload.location,
              movement_date: new Date().toISOString(),
              reason: 'Initial System Placement'
           }]);
        }
        return data;
      }
    },
    onMutate: async (newAnimal) => {
      await queryClient.cancelQueries({ queryKey: ['animals', 'dashboard'] });
      const previousAnimals = queryClient.getQueryData(['animals', 'dashboard']);
      
      queryClient.setQueryData(['animals', 'dashboard'], (old: any) => {
        if (initialData?.id) {
          return old?.map((a: any) => a.id === initialData.id ? { ...a, ...newAnimal } : a) || [];
        } else {
          const optimisticRecord = { ...newAnimal, id: crypto.randomUUID(), status: newAnimal.status || 'ON_DISPLAY' };
          return [...(old || []), optimisticRecord];
        }
      });
      return { previousAnimals };
    },
    onError: (err, newAnimal, context) => {
      console.error('Failed to sync animal record:', err);
      if (context?.previousAnimals) {
        queryClient.setQueryData(['animals', 'dashboard'], context.previousAnimals);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['animals', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['animal-groups'] });
    },
  });

  const form = useForm({
    defaultValues: {
      record_type: initialData?.record_type || ('INDIVIDUAL' as RecordType),
      parent_group_id: initialData?.parent_group_id || '',
      location: initialData?.location || '', 
      name: initialData?.name || '', 
      species: initialData?.species || '', 
      latin_name: initialData?.latin_name || '', 
      census_count: initialData?.census_count || (1 as number | ''), 
      category: initialData?.category || ('OWL' as AnimalCategory), 
      status: initialData?.status || ('ON_DISPLAY' as AnimalStatus), 
      gender: initialData?.gender || '', 
      date_of_birth: initialData?.date_of_birth || '', 
      is_dob_unknown: initialData?.is_dob_unknown || false, 
      profile_image_url: initialData?.profile_image_url || (null as string | Blob | null),
      
      microchip_id: initialData?.microchip_id || '', 
      ring_number: initialData?.ring_number || '', 
      has_no_id: initialData?.has_no_id || false, 
      flying_weight: initialData?.flying_weight || ('' as number | ''), 
      winter_weight: initialData?.winter_weight || ('' as number | ''), 
      average_target_weight: initialData?.average_target_weight || ('' as number | ''), 
      weight_unit: initialData?.weight_unit || 'g',
      
      ambient_temp_only: initialData?.ambient_temp_only || false, 
      target_day_temp_c: initialData?.target_day_temp_c || ('' as number | ''), 
      target_night_temp_c: initialData?.target_night_temp_c || ('' as number | ''), 
      water_tipping_temp: initialData?.water_tipping_temp || ('' as number | ''), 
      target_humidity_min_percent: initialData?.target_humidity_min_percent || ('' as number | ''), 
      target_humidity_max_percent: initialData?.target_humidity_max_percent || ('' as number | ''), 
      misting_frequency: initialData?.misting_frequency || '', 
      special_requirements: initialData?.special_requirements || '', 
      critical_husbandry_notes: initialData?.critical_husbandry_notes || '',
      
      hazard_rating: initialData?.hazard_rating || 'LOW', 
      is_venomous: initialData?.is_venomous || false, 
      red_list_status: initialData?.red_list_status || 'LC', 
      acquisition_date: initialData?.acquisition_date || '', 
      acquisition_type: initialData?.acquisition_type || 'BRED', 
      origin: initialData?.origin || '', 
      origin_location: initialData?.origin_location || '', 
      is_boarding: initialData?.is_boarding || false, 
      is_quarantine: initialData?.is_quarantine || false, 
      distribution_map_url: initialData?.distribution_map_url || (null as string | Blob | null),
      
      lineage_unknown: initialData?.lineage_unknown || false, 
      sire_id: initialData?.sire_id || '', 
      dam_id: initialData?.dam_id || '', 
      description: initialData?.description || '', 
      display_order: initialData?.display_order || ('' as number | '')
    },
    onSubmit: async ({ value }) => {
      setUploadErrorMsg(null);
      const payload: any = { ...value };

      try {
        if (payload.profile_image_url instanceof Blob) {
          payload.profile_image_url = await uploadToSupabase(payload.profile_image_url, 'profiles');
        }
        if (payload.distribution_map_url instanceof Blob) {
          payload.distribution_map_url = await uploadToSupabase(payload.distribution_map_url, 'maps');
        }

        const convertToGrams = (weight: number | string | null, unit: string) => {
          if (weight === '' || weight === null || weight === undefined) return null;
          const num = Number(weight);
          if (isNaN(num)) return null;
          
          let grams = num;
          if (unit === 'kg') grams = num * 1000;
          if (unit === 'oz') grams = num * 28.3495;
          if (unit === 'lb') grams = num * 453.592;
          
          return Number(grams.toFixed(2));
        };

        const unit = payload.weight_unit;
        payload.flying_weight = convertToGrams(payload.flying_weight, unit);
        payload.winter_weight = convertToGrams(payload.winter_weight, unit);
        payload.average_target_weight = convertToGrams(payload.average_target_weight, unit);

        const numericFields = [
          'census_count', 'target_day_temp_c', 'target_night_temp_c', 'water_tipping_temp', 
          'target_humidity_min_percent', 'target_humidity_max_percent', 'display_order'
        ];
        numericFields.forEach(field => { 
          payload[field] = payload[field] === '' ? null : Number(payload[field]); 
        });

        const stringOrNullFields = [
          'parent_group_id', 'location', 'latin_name', 'date_of_birth', 'acquisition_date', 
          'sire_id', 'dam_id', 'profile_image_url', 'distribution_map_url'
        ];
        stringOrNullFields.forEach(field => { 
          payload[field] = payload[field] === '' ? null : payload[field]; 
        });
        
        if (payload.record_type === 'GROUP') {
          payload.parent_group_id = null;
        }

        await saveAnimalMutation.mutateAsync(payload);
        onClose();

      } catch (err: any) {
        console.error("Submission Sequence Failed:", err);
        setUploadErrorMsg(err.message || "Failed to process form uploads.");
      }
    },
  });

  if (!isOpen) return null;

  const TextInput = ({ name, label, type = 'text', placeholder }: { name: any, label: string, type?: 'text' | 'number' | 'date' | 'textarea', placeholder?: string }) => (
    <form.Field name={name}>
      {(field) => (
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
          {type === 'textarea' ? (
            <textarea
              value={field.state.value as string}
              onChange={(e) => field.handleChange(e.target.value as any)}
              placeholder={placeholder}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 outline-none transition-all text-sm font-medium shadow-sm h-24 custom-scrollbar"
            />
          ) : (
            <input
              type={type}
              value={field.state.value as any}
              onChange={(e) => field.handleChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) as any : e.target.value as any)}
              placeholder={placeholder}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 outline-none transition-all text-sm font-medium shadow-sm"
            />
          )}
        </div>
      )}
    </form.Field>
  );

  const SelectInput = ({ name, label, options }: { name: any, label: string, options: { value: string, label: string }[] }) => (
    <form.Field name={name}>
      {(field) => (
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
          <select
            value={field.state.value as string}
            onChange={(e) => field.handleChange(e.target.value as any)}
            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 outline-none transition-all text-sm font-medium shadow-sm"
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}
    </form.Field>
  );

  const CheckboxInput = ({ name, label }: { name: any, label: string }) => (
    <form.Field name={name}>
      {(field) => (
        <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
          <input
            type="checkbox"
            checked={field.state.value as boolean}
            onChange={(e) => field.handleChange(e.target.checked as any)}
            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
          />
          <span className="text-xs font-bold text-slate-700 tracking-wide">{label}</span>
        </label>
      )}
    </form.Field>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-full border border-slate-200">
        
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              {initialData ? 'Edit Database Record' : 'Add New Record'}
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">StrixOS Database Matrix</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex px-4 pt-2 border-b border-slate-100 bg-slate-50 shrink-0 overflow-x-auto custom-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-white">
          {(saveAnimalMutation.isError || uploadErrorMsg) && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div className="text-sm font-medium">{uploadErrorMsg || 'Failed to save database record.'}</div>
            </div>
          )}

          <form id="animal-mutation-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="space-y-6">
            
            <div className={activeTab === 'core' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2 p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col gap-4">
                  <form.Field name="record_type">
                    {(field) => (
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Record Scope</label>
                        <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                          <button type="button" onClick={() => field.handleChange('INDIVIDUAL')} className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${field.state.value === 'INDIVIDUAL' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                            <User size={14} /> Individual
                          </button>
                          <button type="button" onClick={() => field.handleChange('GROUP')} className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${field.state.value === 'GROUP' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                            <Users size={14} /> Parent Group
                          </button>
                        </div>
                      </div>
                    )}
                  </form.Field>

                  <form.Subscribe selector={state => state.values.record_type}>
                    {(recordType) => recordType === 'INDIVIDUAL' && (
                      <div className="pt-2 border-t border-slate-200 border-dashed">
                        <SelectInput name="parent_group_id" label="Assign to Parent Group (Optional)" options={[{ value: '', label: '-- No Group Assignment --' }, ...existingGroups.map((g: any) => ({ value: g.id, label: `${g.name || 'Unnamed'} (${g.species || 'Unknown'})` }))]} />
                      </div>
                    )}
                  </form.Subscribe>
                </div>

                <TextInput name="name" label="Animal / Group Name" placeholder="e.g. Apollo" />
                <SelectInput 
                   name="location" 
                   label="Current Enclosure / Location" 
                   options={[{ value: '', label: '-- Unassigned --' }, ...locations.map((l: any) => ({ value: l.id, label: l.name }))]} 
                />
                
                <TextInput name="census_count" label="Census Count (Headcount)" type="number" />
                <TextInput name="species" label="Common Species" placeholder="e.g. Golden Eagle" />
                <TextInput name="latin_name" label="Latin / Scientific Name" placeholder="e.g. Aquila chrysaetos" />
                
                <SelectInput name="category" label="Category" options={[{ value: 'OWL', label: 'Owl' }, { value: 'RAPTOR', label: 'Raptor' }, { value: 'MAMMAL', label: 'Mammal' }, { value: 'EXOTIC', label: 'Exotic' }]} />
                <SelectInput name="status" label="Initial Status" options={[{ value: 'ON_DISPLAY', label: 'On Display' }, { value: 'OFF_DISPLAY', label: 'Off Display' }, { value: 'QUARANTINE', label: 'Quarantine / Isolated' }, { value: 'MEDICAL', label: 'Medical - Off Display' }, { value: 'OFFSITE', label: 'Stored Offsite' }]} />
                <SelectInput name="gender" label="Gender" options={[{ value: '', label: 'Unknown / Mixed / Not Recorded' }, { value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'U', label: 'Unsexed' }]} />
                <TextInput name="date_of_birth" label="Date of Birth / Est. Origin" type="date" />

                <div className="sm:col-span-2 pt-4 border-t border-slate-100">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Profile Photo (4:3)</label>
                  <form.Field name="profile_image_url">
                    {(field) => (
                      <ImageUploader value={field.state.value} onChange={(file) => field.handleChange(file as any)} requireCrop={true} defaultAspect={4/3} allowToggle={false} />
                    )}
                  </form.Field>
                </div>

                <div className="sm:col-span-2">
                  <CheckboxInput name="is_dob_unknown" label="Date of Birth is Approximate / Unknown" />
                </div>
              </div>
            </div>

            <div className={activeTab === 'id' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <TextInput name="ring_number" label="Ring Number" placeholder="e.g. A10-992" />
                <TextInput name="microchip_id" label="Microchip ID" />
                
                <div className="sm:col-span-2 pb-4 border-b border-slate-100">
                  <CheckboxInput name="has_no_id" label="Entity holds no formal identification" />
                </div>
                
                <TextInput name="flying_weight" label="Flying / Summer Weight" type="number" />
                <TextInput name="winter_weight" label="Winter / Resting Weight" type="number" />
                <TextInput name="average_target_weight" label="Target Average Weight" type="number" />
                
                <SelectInput name="weight_unit" label="Input Unit (Converted to Grams on save)" options={[{ value: 'g', label: 'Grams (g)' }, { value: 'kg', label: 'Kilograms (kg)' }, { value: 'oz', label: 'Ounces (oz)' }, { value: 'lb', label: 'Pounds (lb)' }]} />
              </div>
            </div>

            <div className={activeTab === 'husbandry' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2 pb-4 border-b border-slate-100">
                  <CheckboxInput name="ambient_temp_only" label="Requires Ambient Temperature Only (No localized basking)" />
                </div>
                <TextInput name="target_day_temp_c" label="Target Day Temp (°C)" type="number" />
                <TextInput name="target_night_temp_c" label="Target Night Temp (°C)" type="number" />
                <TextInput name="target_humidity_min_percent" label="Min Humidity (%)" type="number" />
                <TextInput name="target_humidity_max_percent" label="Max Humidity (%)" type="number" />
                <TextInput name="water_tipping_temp" label="Water Tipping Threshold (°C)" type="number" />
                <TextInput name="misting_frequency" label="Misting Frequency" placeholder="e.g. Twice Daily" />
                <div className="sm:col-span-2">
                  <TextInput name="special_requirements" label="Special Dietary or Enclosure Requirements" type="textarea" />
                </div>
                <div className="sm:col-span-2">
                  <TextInput name="critical_husbandry_notes" label="Critical Husbandry Warnings" type="textarea" />
                </div>
              </div>
            </div>

            <div className={activeTab === 'safety' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <SelectInput name="hazard_rating" label="Hazard Rating" options={[{ value: 'LOW', label: 'Low Risk' }, { value: 'MEDIUM', label: 'Medium Risk' }, { value: 'HIGH', label: 'High Risk - DWA' }]} />
                <SelectInput name="red_list_status" label="IUCN Red List Status" options={[{ value: 'NE', label: 'Not Evaluated (NE)' }, { value: 'DD', label: 'Data Deficient (DD)' }, { value: 'LC', label: 'Least Concern (LC)' }, { value: 'NT', label: 'Near Threatened (NT)' }, { value: 'VU', label: 'Vulnerable (VU)' }, { value: 'EN', label: 'Endangered (EN)' }, { value: 'CR', label: 'Critically Endangered (CR)' }, { value: 'EW', label: 'Extinct in the Wild (EW)' }]} />
                <div className="sm:col-span-2 pb-4 border-b border-slate-100">
                  <CheckboxInput name="is_venomous" label="Species is Venomous" />
                </div>
                <TextInput name="acquisition_date" label="Acquisition Date" type="date" />
                <SelectInput name="acquisition_type" label="Acquisition Type" options={[{ value: 'BRED', label: 'Captive Bred (Internal)' }, { value: 'PURCHASED', label: 'Purchased' }, { value: 'DONATED', label: 'Donated / Rescue' }, { value: 'LOAN', label: 'On Loan' }]} />
                <TextInput name="origin" label="Breeder / Origin Source" />
                <TextInput name="origin_location" label="Origin Location / Area" />
                
                <div className="sm:col-span-2 pt-4 border-t border-slate-100">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Distribution Map</label>
                  <form.Field name="distribution_map_url">
                    {(field) => (
                      <ImageUploader value={field.state.value} onChange={(file) => field.handleChange(file as any)} requireCrop={true} defaultAspect={4/3} allowToggle={true} />
                    )}
                  </form.Field>
                </div>
                <div className="sm:col-span-2 grid grid-cols-2 gap-5 pt-2">
                  <CheckboxInput name="is_boarding" label="Currently Boarding (Not KOA Property)" />
                  <CheckboxInput name="is_quarantine" label="Requires Strict Quarantine Protocol" />
                </div>
              </div>
            </div>

            <div className={activeTab === 'notes' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2">
                  <CheckboxInput name="lineage_unknown" label="Lineage/Parentage is Unknown" />
                </div>
                <form.Subscribe selector={(state) => state.values.lineage_unknown}>
                  {(lineage_unknown) => (
                    <>
                      <TextInput name="sire_id" label="Sire UUID" />
                      <TextInput name="dam_id" label="Dam UUID" />
                      {lineage_unknown && (
                        <div className="sm:col-span-2 mt-[-10px] text-[10px] text-amber-600 font-bold tracking-wide">
                          Warning: Parentage fields should be ignored if lineage is marked unknown.
                        </div>
                      )}
                    </>
                  )}
                </form.Subscribe>
                <div className="sm:col-span-2">
                  <TextInput name="description" label="General Description / Public Notes" type="textarea" />
                </div>
                <TextInput name="display_order" label="Display Sequence (UI Override)" type="number" />
              </div>
            </div>

          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">
            {activeTab} parameters active
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button type="button" onClick={onClose} className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">
              Cancel
            </button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <button
                  type="submit"
                  form="animal-mutation-form"
                  disabled={!canSubmit || isSubmitting || saveAnimalMutation.isPending}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:opacity-50 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                >
                  {(isSubmitting || saveAnimalMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {(isSubmitting || saveAnimalMutation.isPending) ? 'Processing...' : (initialData ? 'Update Record' : 'Commit Record')}
                </button>
              )}
            </form.Subscribe>
          </div>
        </div>

      </div>
    </div>
  );
}