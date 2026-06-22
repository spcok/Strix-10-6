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
  initialData?: Animal; 
}

const TABS = [
  { id: 'core', label: 'Core Details' },
  { id: 'id', label: 'ID & Weight' },
  { id: 'husbandry', label: 'Husbandry & Env' },
  { id: 'safety', label: 'Safety & Origin' },
  { id: 'notes', label: 'Notes & Meta' }
] as const;

type TabId = typeof TABS[number]['id'];

// ------------------------------------------------------------------
// EXTRACTED COMPONENTS: Now equipped with Real-Time Validation & Disabled States
// ------------------------------------------------------------------
function FormInput({ field, label, type = 'text', placeholder, disabled = false }: { field: any; label: string; type?: string; placeholder?: string; disabled?: boolean }) {
  const hasError = field.state.meta.errors.length > 0 && field.state.meta.isTouched;
  
  return (
    <div className="flex flex-col gap-1.5">
      <label className={`text-[10px] font-black uppercase tracking-widest ${disabled ? 'text-slate-300' : 'text-slate-500'}`}>{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full p-2.5 rounded-xl outline-none transition-all text-sm font-medium shadow-sm h-24 custom-scrollbar resize-none ${
            disabled ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' :
            hasError ? 'bg-rose-50 border-rose-300 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-rose-900' : 
            'bg-white border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900'
          }`}
        />
      ) : (
        <input
          type={type}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full p-2.5 rounded-xl outline-none transition-all text-sm font-medium shadow-sm ${
            disabled ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' :
            hasError ? 'bg-rose-50 border-rose-300 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-rose-900' : 
            'bg-white border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900'
          }`}
        />
      )}
      {hasError && <span className="text-[10px] font-bold text-rose-500 mt-0.5">{field.state.meta.errors.join(', ')}</span>}
    </div>
  );
}

function FormSelect({ field, label, options, disabled = false }: { field: any; label: string; options: { value: string, label: string }[]; disabled?: boolean }) {
  const hasError = field.state.meta.errors.length > 0 && field.state.meta.isTouched;
  return (
    <div className="flex flex-col gap-1.5">
      <label className={`text-[10px] font-black uppercase tracking-widest ${disabled ? 'text-slate-300' : 'text-slate-500'}`}>{label}</label>
      <select
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        disabled={disabled}
        className={`w-full p-2.5 rounded-xl outline-none transition-all text-sm font-medium shadow-sm ${
          disabled ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' :
          hasError ? 'bg-rose-50 border-rose-300 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-rose-900' : 
          'bg-white border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900'
        }`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {hasError && <span className="text-[10px] font-bold text-rose-500 mt-0.5">{field.state.meta.errors.join(', ')}</span>}
    </div>
  );
}

function FormCheckbox({ field, label }: { field: any; label: string }) {
  return (
    <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
      <input
        type="checkbox"
        checked={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.checked)}
        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
      />
      <span className="text-xs font-bold text-slate-700 tracking-wide">{label}</span>
    </label>
  );
}

// ------------------------------------------------------------------
// MAIN MODAL COMPONENT
// ------------------------------------------------------------------
export default function AnimalFormModal({ isOpen, onClose, initialData }: AnimalFormModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('core');
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);

  const { data: existingGroups = [] } = useQuery({
    queryKey: ['animal-groups'],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('id, name, species').eq('record_type', 'GROUP').order('name');
      if (error) throw error;
      return data;
    }
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['operational_lists', 'location'],
    queryFn: async () => {
      const { data, error } = await supabase.from('operational_lists').select('id, name').eq('category', 'location').eq('is_deleted', false).order('name');
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
        const oldLocation = initialData.location;
        const newLocation = payload.location;

        const { data, error } = await supabase.from('animals').update(payload).eq('id', initialData.id).select().single();
        if (error) throw error;

        if (oldLocation !== newLocation && newLocation !== undefined) {
           await supabase.from('internal_movements').insert([{ animal_id: initialData.id, from_location: oldLocation || null, to_location: newLocation, movement_date: new Date().toISOString(), reason: 'Updated via Profile UI' }]);
        }
        return data;
      } else {
        const { data, error } = await supabase.from('animals').insert([payload]).select().single();
        if (error) throw error;

        if (payload.location) {
           await supabase.from('internal_movements').insert([{ animal_id: data.id, from_location: null, to_location: payload.location, movement_date: new Date().toISOString(), reason: 'Initial System Placement' }]);
        }
        return data;
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['animals'] });
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
      census_count: initialData?.census_count || 1, 
      category: initialData?.category || ('OWL' as AnimalCategory), 
      status: initialData?.status || ('ON_DISPLAY' as AnimalStatus), 
      gender: initialData?.gender || '', 
      date_of_birth: initialData?.date_of_birth || '', 
      is_dob_unknown: initialData?.is_dob_unknown || false, 
      profile_image_url: initialData?.profile_image_url || (null as string | Blob | null),
      microchip_id: initialData?.microchip_id || '', 
      ring_number: initialData?.ring_number || '', 
      has_no_id: initialData?.has_no_id || false, 
      flying_weight: initialData?.flying_weight || '', 
      winter_weight: initialData?.winter_weight || '', 
      average_target_weight: initialData?.average_target_weight || '', 
      weight_unit: initialData?.weight_unit || 'g',
      ambient_temp_only: initialData?.ambient_temp_only || false, 
      target_day_temp_c: initialData?.target_day_temp_c || '', 
      target_night_temp_c: initialData?.target_night_temp_c || '', 
      water_tipping_temp: initialData?.water_tipping_temp || '', 
      target_humidity_min_percent: initialData?.target_humidity_min_percent || '', 
      target_humidity_max_percent: initialData?.target_humidity_max_percent || '', 
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
      display_order: initialData?.display_order || ''
    },
    onSubmit: async ({ value }) => {
      setUploadErrorMsg(null);
      const rawPayload = { ...value };

      try {
        if (rawPayload.profile_image_url instanceof Blob) rawPayload.profile_image_url = await uploadToSupabase(rawPayload.profile_image_url, 'profiles');
        if (rawPayload.distribution_map_url instanceof Blob) rawPayload.distribution_map_url = await uploadToSupabase(rawPayload.distribution_map_url, 'maps');

        const convertToGrams = (weight: number | string | null, unit: string): number | null => {
          if (weight === '' || weight === null || weight === undefined) return null;
          const num = Number(weight);
          if (isNaN(num)) return null;
          let grams = num;
          if (unit === 'kg') grams = num * 1000;
          if (unit === 'oz') grams = num * 28.3495;
          if (unit === 'lb') grams = num * 453.592;
          return Number(grams.toFixed(2));
        };

        const unit = rawPayload.weight_unit;
        
        // Smart Data Cleanup on Save
        if (rawPayload.has_no_id) {
          rawPayload.microchip_id = '';
          rawPayload.ring_number = '';
        }
        
        const payload: Partial<Animal> = {
          record_type: rawPayload.record_type,
          parent_group_id: rawPayload.record_type === 'GROUP' || rawPayload.parent_group_id === '' ? null : rawPayload.parent_group_id,
          location: rawPayload.location === '' ? null : rawPayload.location,
          name: rawPayload.name,
          species: rawPayload.species,
          latin_name: rawPayload.latin_name === '' ? null : rawPayload.latin_name,
          census_count: Number(rawPayload.census_count),
          category: rawPayload.category as AnimalCategory,
          status: rawPayload.status as AnimalStatus,
          gender: rawPayload.gender,
          date_of_birth: rawPayload.date_of_birth === '' ? null : rawPayload.date_of_birth,
          is_dob_unknown: rawPayload.is_dob_unknown,
          profile_image_url: rawPayload.profile_image_url as string | null,
          microchip_id: rawPayload.microchip_id,
          ring_number: rawPayload.ring_number,
          has_no_id: rawPayload.has_no_id,
          flying_weight: convertToGrams(rawPayload.flying_weight, unit),
          winter_weight: convertToGrams(rawPayload.winter_weight, unit),
          average_target_weight: convertToGrams(rawPayload.average_target_weight, unit),
          weight_unit: rawPayload.weight_unit,
          ambient_temp_only: rawPayload.ambient_temp_only,
          target_day_temp_c: rawPayload.target_day_temp_c === '' ? null : Number(rawPayload.target_day_temp_c),
          target_night_temp_c: rawPayload.target_night_temp_c === '' ? null : Number(rawPayload.target_night_temp_c),
          water_tipping_temp: rawPayload.water_tipping_temp === '' ? null : Number(rawPayload.water_tipping_temp),
          target_humidity_min_percent: rawPayload.target_humidity_min_percent === '' ? null : Number(rawPayload.target_humidity_min_percent),
          target_humidity_max_percent: rawPayload.target_humidity_max_percent === '' ? null : Number(rawPayload.target_humidity_max_percent),
          misting_frequency: rawPayload.misting_frequency,
          special_requirements: rawPayload.special_requirements,
          critical_husbandry_notes: rawPayload.critical_husbandry_notes,
          hazard_rating: rawPayload.hazard_rating,
          is_venomous: rawPayload.is_venomous,
          red_list_status: rawPayload.red_list_status,
          acquisition_date: rawPayload.acquisition_date === '' ? null : rawPayload.acquisition_date,
          acquisition_type: rawPayload.acquisition_type,
          origin: rawPayload.origin,
          origin_location: rawPayload.origin_location,
          is_boarding: rawPayload.is_boarding,
          is_quarantine: rawPayload.is_quarantine,
          distribution_map_url: rawPayload.distribution_map_url as string | null,
          lineage_unknown: rawPayload.lineage_unknown,
          sire_id: rawPayload.sire_id === '' ? null : rawPayload.sire_id,
          dam_id: rawPayload.dam_id === '' ? null : rawPayload.dam_id,
          description: rawPayload.description,
          display_order: rawPayload.display_order === '' ? 0 : Number(rawPayload.display_order)
        };

        await saveAnimalMutation.mutateAsync(payload);
        onClose();
      } catch (err: unknown) {
        setUploadErrorMsg(err instanceof Error ? err.message : "Failed to process form uploads.");
      }
    },
  });

  // UX UPGRADE: Accidental Closure Protection
  const handleSafeClose = () => {
    if (form.state.isDirty) {
      if (window.confirm("You have unsaved changes. Are you sure you want to discard them?")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-full border border-slate-200">
        
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase">
              {initialData ? 'Edit Database Record' : 'Provision New Animal'}
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">StrixOS Data Matrix</p>
          </div>
          <button onClick={handleSafeClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex px-4 pt-2 border-b border-slate-100 bg-slate-50 shrink-0 overflow-x-auto custom-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
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
                          <button type="button" onClick={() => { field.handleChange('GROUP'); form.setFieldValue('gender', ''); }} className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${field.state.value === 'GROUP' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                            <Users size={14} /> Parent Group
                          </button>
                        </div>
                      </div>
                    )}
                  </form.Field>

                  <form.Subscribe selector={state => state.values.record_type}>
                    {(recordType) => recordType === 'INDIVIDUAL' && (
                      <div className="pt-2 border-t border-slate-200 border-dashed">
                        <form.Field name="parent_group_id">{(field) => <FormSelect field={field as any} label="Assign to Parent Group (Optional)" options={[{ value: '', label: '-- No Group Assignment --' }, ...existingGroups.map((g: any) => ({ value: g.id, label: `${g.name || 'Unnamed'} (${g.species || 'Unknown'})` }))]} />}</form.Field>
                      </div>
                    )}
                  </form.Subscribe>
                </div>

                {/* UX UPGRADE: Real-Time Validation on Name and Species */}
                <form.Field 
                  name="name"
                  validators={{ onChange: ({ value }) => !value ? 'Name is required' : undefined }}
                >
                  {(field) => <FormInput field={field as any} label="Animal / Group Name *" placeholder="e.g. Apollo" />}
                </form.Field>
                
                <form.Field name="location">
                  {(field) => (
                    <FormSelect 
                      field={field as any} 
                      label="Current Enclosure / Location" 
                      options={[{ value: '', label: '-- Unassigned --' }, ...locations.map((l: any) => ({ value: l.name, label: l.name }))]} 
                    />
                  )}
                </form.Field>
                
                <form.Field name="census_count">{(field) => <FormInput field={field as any} label="Census Count (Headcount)" type="number" />}</form.Field>
                
                <form.Field 
                  name="species"
                  validators={{ onChange: ({ value }) => !value ? 'Species is required' : undefined }}
                >
                  {(field) => <FormInput field={field as any} label="Common Species *" placeholder="e.g. Golden Eagle" />}
                </form.Field>
                
                <form.Field name="latin_name">{(field) => <FormInput field={field as any} label="Latin / Scientific Name" placeholder="e.g. Aquila chrysaetos" />}</form.Field>
                
                <form.Field name="category">{(field) => <FormSelect field={field as any} label="Category" options={[{ value: 'OWL', label: 'Owl' }, { value: 'RAPTOR', label: 'Raptor' }, { value: 'MAMMAL', label: 'Mammal' }, { value: 'EXOTIC', label: 'Exotic' }]} />}</form.Field>
                <form.Field name="status">{(field) => <FormSelect field={field as any} label="Initial Status" options={[{ value: 'ON_DISPLAY', label: 'On Display' }, { value: 'OFF_DISPLAY', label: 'Off Display' }, { value: 'QUARANTINE', label: 'Quarantine / Isolated' }, { value: 'MEDICAL', label: 'Medical - Off Display' }, { value: 'OFFSITE', label: 'Stored Offsite' }]} />}</form.Field>
                
                {/* UX UPGRADE: Smart Gender Interlocking for Groups */}
                <form.Subscribe selector={state => state.values.record_type}>
                  {(recordType) => (
                    <form.Field name="gender">
                      {(field) => <FormSelect field={field as any} label="Gender" disabled={recordType === 'GROUP'} options={[{ value: '', label: 'Unknown / Mixed / Not Recorded' }, { value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'U', label: 'Unsexed' }]} />}
                    </form.Field>
                  )}
                </form.Subscribe>

                <form.Field name="date_of_birth">{(field) => <FormInput field={field as any} label="Date of Birth / Est. Origin" type="date" />}</form.Field>

                <div className="sm:col-span-2 pt-4 border-t border-slate-100">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Profile Photo (4:3)</label>
                  <form.Field name="profile_image_url">
                    {(field) => (
                      <ImageUploader value={field.state.value} onChange={(file) => field.handleChange(file as any)} requireCrop={true} defaultAspect={4/3} allowToggle={false} />
                    )}
                  </form.Field>
                </div>

                <div className="sm:col-span-2">
                  <form.Field name="is_dob_unknown">{(field) => <FormCheckbox field={field as any} label="Date of Birth is Approximate / Unknown" />}</form.Field>
                </div>
              </div>
            </div>

            <div className={activeTab === 'id' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                
                {/* UX UPGRADE: Smart ID Field Interlocking */}
                <form.Subscribe selector={state => state.values.has_no_id}>
                  {(hasNoId) => (
                    <>
                      <form.Field name="ring_number">{(field) => <FormInput field={field as any} disabled={hasNoId} label="Ring Number" placeholder="e.g. A10-992" />}</form.Field>
                      <form.Field name="microchip_id">{(field) => <FormInput field={field as any} disabled={hasNoId} label="Microchip ID" />}</form.Field>
                    </>
                  )}
                </form.Subscribe>
                
                <div className="sm:col-span-2 pb-4 border-b border-slate-100">
                  <form.Field name="has_no_id">
                    {(field) => <FormCheckbox field={field as any} label="Entity holds no formal identification (Disables ID fields)" />}
                  </form.Field>
                </div>
                
                <form.Field name="flying_weight">{(field) => <FormInput field={field as any} label="Flying / Summer Weight" type="number" />}</form.Field>
                <form.Field name="winter_weight">{(field) => <FormInput field={field as any} label="Winter / Resting Weight" type="number" />}</form.Field>
                <form.Field name="average_target_weight">{(field) => <FormInput field={field as any} label="Target Average Weight" type="number" />}</form.Field>
                
                <form.Field name="weight_unit">{(field) => <FormSelect field={field as any} label="Input Unit (Converted to Grams on save)" options={[{ value: 'g', label: 'Grams (g)' }, { value: 'kg', label: 'Kilograms (kg)' }, { value: 'oz', label: 'Ounces (oz)' }, { value: 'lb', label: 'Pounds (lb)' }]} />}</form.Field>
              </div>
            </div>

            <div className={activeTab === 'husbandry' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2 pb-4 border-b border-slate-100">
                  <form.Field name="ambient_temp_only">{(field) => <FormCheckbox field={field as any} label="Requires Ambient Temperature Only (No localized basking)" />}</form.Field>
                </div>
                <form.Field name="target_day_temp_c">{(field) => <FormInput field={field as any} label="Target Day Temp (°C)" type="number" />}</form.Field>
                <form.Field name="target_night_temp_c">{(field) => <FormInput field={field as any} label="Target Night Temp (°C)" type="number" />}</form.Field>
                <form.Field name="target_humidity_min_percent">{(field) => <FormInput field={field as any} label="Min Humidity (%)" type="number" />}</form.Field>
                <form.Field name="target_humidity_max_percent">{(field) => <FormInput field={field as any} label="Max Humidity (%)" type="number" />}</form.Field>
                <form.Field name="water_tipping_temp">{(field) => <FormInput field={field as any} label="Water Tipping Threshold (°C)" type="number" />}</form.Field>
                <form.Field name="misting_frequency">{(field) => <FormInput field={field as any} label="Misting Frequency" placeholder="e.g. Twice Daily" />}</form.Field>
                <div className="sm:col-span-2">
                  <form.Field name="special_requirements">{(field) => <FormInput field={field as any} label="Special Dietary or Enclosure Requirements" type="textarea" />}</form.Field>
                </div>
                <div className="sm:col-span-2">
                  <form.Field name="critical_husbandry_notes">{(field) => <FormInput field={field as any} label="Critical Husbandry Warnings" type="textarea" />}</form.Field>
                </div>
              </div>
            </div>

            <div className={activeTab === 'safety' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <form.Field name="hazard_rating">{(field) => <FormSelect field={field as any} label="Hazard Rating" options={[{ value: 'LOW', label: 'Low Risk' }, { value: 'MEDIUM', label: 'Medium Risk' }, { value: 'HIGH', label: 'High Risk - DWA' }]} />}</form.Field>
                <form.Field name="red_list_status">{(field) => <FormSelect field={field as any} label="IUCN Red List Status" options={[{ value: 'NE', label: 'Not Evaluated (NE)' }, { value: 'DD', label: 'Data Deficient (DD)' }, { value: 'LC', label: 'Least Concern (LC)' }, { value: 'NT', label: 'Near Threatened (NT)' }, { value: 'VU', label: 'Vulnerable (VU)' }, { value: 'EN', label: 'Endangered (EN)' }, { value: 'CR', label: 'Critically Endangered (CR)' }, { value: 'EW', label: 'Extinct in the Wild (EW)' }, { value: 'EX', label: 'Extinct (EX)' }]} />}</form.Field>
                <div className="sm:col-span-2 pb-4 border-b border-slate-100">
                  <form.Field name="is_venomous">{(field) => <FormCheckbox field={field as any} label="Species is Venomous" />}</form.Field>
                </div>
                <form.Field name="acquisition_date">{(field) => <FormInput field={field as any} label="Acquisition Date" type="date" />}</form.Field>
                <form.Field name="acquisition_type">{(field) => <FormSelect field={field as any} label="Acquisition Type" options={[{ value: 'BRED', label: 'Captive Bred (Internal)' }, { value: 'PURCHASED', label: 'Purchased' }, { value: 'DONATED', label: 'Donated / Rescue' }, { value: 'LOAN', label: 'On Loan' }]} />}</form.Field>
                <form.Field name="origin">{(field) => <FormInput field={field as any} label="Breeder / Origin Source" />}</form.Field>
                <form.Field name="origin_location">{(field) => <FormInput field={field as any} label="Origin Location / Area" />}</form.Field>
                
                <div className="sm:col-span-2 pt-4 border-t border-slate-100">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Distribution Map</label>
                  <form.Field name="distribution_map_url">
                    {(field) => (
                      <ImageUploader value={field.state.value} onChange={(file) => field.handleChange(file as any)} requireCrop={true} defaultAspect={4/3} allowToggle={true} />
                    )}
                  </form.Field>
                </div>
                <div className="sm:col-span-2 grid grid-cols-2 gap-5 pt-2">
                  <form.Field name="is_boarding">{(field) => <FormCheckbox field={field as any} label="Currently Boarding (Not KOA Property)" />}</form.Field>
                  <form.Field name="is_quarantine">{(field) => <FormCheckbox field={field as any} label="Requires Strict Quarantine Protocol" />}</form.Field>
                </div>
              </div>
            </div>

            <div className={activeTab === 'notes' ? 'block' : 'hidden'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2">
                  <form.Field name="lineage_unknown">{(field) => <FormCheckbox field={field as any} label="Lineage/Parentage is Unknown" />}</form.Field>
                </div>
                
                <form.Subscribe selector={(state) => state.values.lineage_unknown}>
                  {(lineage_unknown) => (
                    <>
                      <form.Field name="sire_id">{(field) => <FormInput field={field as any} disabled={lineage_unknown} label="Sire UUID" />}</form.Field>
                      <form.Field name="dam_id">{(field) => <FormInput field={field as any} disabled={lineage_unknown} label="Dam UUID" />}</form.Field>
                    </>
                  )}
                </form.Subscribe>

                <div className="sm:col-span-2">
                  <form.Field name="description">{(field) => <FormInput field={field as any} label="General Description / Public Notes" type="textarea" />}</form.Field>
                </div>
                <form.Field name="display_order">{(field) => <FormInput field={field as any} label="Display Sequence (UI Override)" type="number" />}</form.Field>
              </div>
            </div>

          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">
            {activeTab} parameters active
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button type="button" onClick={handleSafeClose} className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">
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