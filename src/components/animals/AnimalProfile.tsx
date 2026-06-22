import React, { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { 
  FileText, Stethoscope, ClipboardList, ArrowLeft, ShieldAlert, 
  Thermometer, Scale, AlertTriangle, GitMerge, Edit2, Archive, 
  MapPin, Hash, Info, Lock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { IUCNBadge } from './IUCNBadge';
import AnimalFormModal from './AnimalFormModal';
import MedicalRecords from '../medical/MedicalRecords';
import HusbandryLogs from '../husbandry/HusbandryLogs';
import { formatWeightDisplay } from '../../services/weightUtils';

// ------------------------------------------------------------------
// UTILITY: High-Density Age Calculator
// ------------------------------------------------------------------
const calculateAge = (dobString: string | null) => {
  if (!dobString) return 'Unknown Age';
  const birth = new Date(dobString);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) {
    years--;
    months += 12;
  }
  if (years === 0) return `${months} Months`;
  return `${years} Yrs ${months} Mos`;
};

export interface Props {
  animalId?: string;
  onBack?: () => void;
}

export default function AnimalProfile({ animalId, onBack }: Props) {
  // Use TanStack Router's dynamic param (fallback to prop if nested)
  const params = useParams({ strict: false });
  const effectiveId = animalId || params.id || '';
  
  const [activeTab, setActiveTab] = useState<'profile' | 'medical' | 'husbandry'>('profile');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // ------------------------------------------------------------------
  // MODERNIZED TANSTACK QUERY v5
  // Replaces the opaque 'useAnimalProfileData' legacy hook
  // ------------------------------------------------------------------
  const { data: animal, isLoading } = useQuery({
    queryKey: ['animal_profile', effectiveId],
    queryFn: async () => {
      if (!effectiveId) throw new Error("No Animal ID provided");
      
      const { data, error } = await supabase
        .from('animals')
        .select('*')
        .eq('id', effectiveId)
        .single();
        
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveId,
    staleTime: 1000 * 60 * 5, // Cache profile for 5 minutes before background refetch
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!animal) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center bg-white border border-slate-200 rounded-2xl shadow-sm mt-8">
        <AlertTriangle className="text-rose-500 mx-auto mb-3" size={32} />
        <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Animal Profile Resolution Failed</h3>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Entity ID {effectiveId} does not exist in local cache or remote tables.</p>
      </div>
    );
  }

  const tabs = [
    { id: 'profile', label: 'Profile Matrix', icon: FileText },
    { id: 'medical', label: 'Medical Records', icon: Stethoscope },
    { id: 'husbandry', label: 'Husbandry Logs', icon: ClipboardList },
  ] as const;

  return (
    <div className="max-w-[1920px] mx-auto space-y-6 animate-in fade-in duration-300 pb-24">
      
      {/* Back Link Wrapper */}
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft size={14} /> Back To Overview
        </button>
      )}

      {/* HERO REGISTRY CARD */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col lg:flex-row gap-6 relative">
        
        {/* Absolute Floating Badges & Quick Action Control Group */}
        <div className="absolute top-6 right-6 flex items-center gap-3 z-20">
          <div className="flex gap-1.5 shadow-sm rounded-lg overflow-hidden">
            {animal.is_boarding && (
              <span className="px-2.5 py-1.5 bg-amber-50 text-amber-700 text-[9px] font-black border border-amber-200 uppercase tracking-widest">Boarding</span>
            )}
            {animal.is_deleted && (
              <span className="px-2.5 py-1.5 bg-rose-50 text-rose-700 text-[9px] font-black border border-rose-200 uppercase tracking-widest">Archived</span>
            )}
            <IUCNBadge status={animal.red_list_status} />
          </div>
          <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
            <button 
              onClick={() => setIsEditModalOpen(true)}
              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 rounded-xl transition-all"
              title="Edit Profile"
            >
              <Edit2 size={16} />
            </button>
            <button 
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xl transition-all"
              title="Archive Profile"
            >
              <Archive size={16} />
            </button>
          </div>
        </div>

        {/* Left Hand: High-Res Profile Image Frame */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="relative w-full aspect-square lg:h-64 lg:w-64 rounded-2xl overflow-hidden border border-slate-200 shadow-inner bg-slate-50 mx-auto lg:mx-0">
            <img
              src={animal.profile_image_url || '/offline-media-fallback.svg'}
              alt={animal.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.src = '/offline-media-fallback.svg'; }}
            />
          </div>
        </div>
        
        {/* Right Hand: High-Density Telemetry Matrix */}
        <div className="flex-grow flex flex-col justify-between pt-2">
          <div>
            <div className="space-y-1 mb-6">
              <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none">{animal.name}</h1>
              {animal.latin_name && (
                <p className="text-sm font-bold text-slate-400 italic tracking-wide">{animal.latin_name}</p>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-6 gap-x-6">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Taxon / Species</span>
                <span className="text-sm font-bold text-slate-800">{animal.species}</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Sex Identity</span>
                <span className="text-sm font-bold text-slate-800">{animal.gender || 'Determining'}</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Computed Age</span>
                <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-200 rounded inline-block">{calculateAge(animal.date_of_birth)}</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Operational Location</span>
                <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin size={14} className="text-slate-400" /> {animal.location || 'Staging / Isolation'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Acquisition Source</span>
                <span className="text-sm font-bold text-slate-800">{animal.origin || 'Captive Bred'}</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Hatch / Birth Date</span>
                <span className="text-sm font-semibold text-slate-600 font-mono">
                  {animal.date_of_birth ? new Date(animal.date_of_birth).toLocaleDateString() : 'Unrecorded'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Entry To Station</span>
                <span className="text-sm font-semibold text-slate-600 font-mono">
                  {animal.acquisition_date ? new Date(animal.acquisition_date).toLocaleDateString() : 'Unrecorded'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Disposition Status</span>
                <span className="text-sm font-bold text-slate-800">{animal.status || 'Active Collection'}</span>
              </div>
            </div>
          </div>

          {/* Sub-Header Physical Tracking Identifiers */}
          <div className="mt-8 pt-4 border-t border-slate-100 flex flex-wrap gap-x-8 gap-y-2 text-slate-500 font-mono text-xs font-bold">
            <span className="flex items-center gap-2"><Hash size={14} className="text-slate-400" /> Internal ID: <span className="text-slate-800">{animal.id.split('-')[0]}</span></span>
            <span className="flex items-center gap-2"><Info size={14} className="text-slate-400" /> Ring Code: <span className="text-slate-800">{animal.ring_number || 'UN-RINGED'}</span></span>
            <span className="flex items-center gap-2"><Lock size={14} className="text-slate-400" /> Microchip Transponder: <span className="text-slate-800">{animal.microchip_id || 'NONE DETECTED'}</span></span>
          </div>
        </div>

      </div>

      {/* TAB SYSTEM LAYER */}
      <div className="border-b-2 border-slate-200">
        <nav className="flex gap-8">
          {tabs.map((tab) => {
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 pb-4 px-2 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${
                  isTabActive 
                    ? 'border-emerald-600 text-emerald-700' 
                    : 'border-transparent text-slate-400 hover:text-slate-800'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* DYNAMIC SUB-CONTENT ROUTING */}
      <div className="min-h-[400px]">
        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            
            {/* CRITICAL HUSBANDRY NOTES PANEL */}
            <div className="bg-rose-50/50 border border-rose-200 rounded-2xl p-6 md:col-span-2 xl:col-span-3">
              <div className="flex items-center gap-3 mb-4 border-b border-rose-100 pb-3">
                <AlertTriangle className="text-rose-600" size={20} />
                <h3 className="text-sm font-black text-rose-900 uppercase tracking-widest">Critical Husbandry Alerts</h3>
              </div>
              {animal.critical_husbandry_notes ? (
                <div className="text-sm font-bold text-rose-800 leading-relaxed whitespace-pre-wrap">
                  {/* Assumes the DB stores this as text or JSON array. If JSON array, map it. If text, render it. */}
                  {Array.isArray(animal.critical_husbandry_notes) 
                    ? animal.critical_husbandry_notes.map((n, i) => <p key={i} className="flex gap-2"><span className="text-rose-500">•</span>{n}</p>)
                    : animal.critical_husbandry_notes}
                </div>
              ) : (
                <p className="text-xs font-semibold text-rose-700 italic">No historical or behavior constraint alerts logged for this animal.</p>
              )}
            </div>

            {/* WEIGHT TARGET CONFIGURATOR CARD */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-3">
                <Scale className="text-emerald-600" size={18} />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Weight Management Boundaries</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Flying Weight</span>
                  <span className="text-sm font-black text-emerald-700">
                    {animal.flying_weight !== null ? formatWeightDisplay(animal.flying_weight, animal.weight_unit) : 'Not Configured'}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Winter Weight</span>
                  <span className="text-sm font-black text-slate-800">
                    {animal.winter_weight !== null ? formatWeightDisplay(animal.winter_weight, animal.weight_unit) : 'Not Configured'}
                  </span>
                </div>
              </div>
            </div>

            {/* ENVIRONMENTAL TELEMETRY TARGETS CARD */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-3">
                <Thermometer className="text-emerald-600" size={18} />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Environmental Thresholds</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Day Target</p>
                  <p className="text-sm font-black text-slate-800">{animal.target_day_temp_c ?? 'N/A'}°C</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Night Target</p>
                  <p className="text-sm font-black text-slate-800">{animal.target_night_temp_c ?? 'N/A'}°C</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2 text-center flex justify-between items-center px-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Humidity Spectrum</p>
                  <p className="text-sm font-bold text-slate-800">
                    {animal.target_humidity_min_percent && animal.target_humidity_max_percent ? `${animal.target_humidity_min_percent}% - ${animal.target_humidity_max_percent}%` : 'Unregulated'}
                  </p>
                </div>
              </div>
            </div>

            {/* GENETIC LINEAGE & CONTROLS CARD */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-3">
                <GitMerge className="text-emerald-600" size={18} />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Lineage & Genetics</h3>
              </div>
              <div className="space-y-3.5 text-xs font-bold">
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-black text-[10px] uppercase tracking-widest text-slate-400">Sire Lineage ID</span>
                  <span className="font-mono text-slate-900 bg-slate-50 px-2 py-1 rounded border border-slate-100">{animal.sire_id ?? 'Wild Hatch / Unknown'}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-black text-[10px] uppercase tracking-widest text-slate-400">Dam Lineage ID</span>
                  <span className="font-mono text-slate-900 bg-slate-50 px-2 py-1 rounded border border-slate-100">{animal.dam_id ?? 'Wild Hatch / Unknown'}</span>
                </div>
                <div className="pt-3 mt-1 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <ShieldAlert size={12} className="text-slate-400" /> Safety Rating
                  </span>
                  <span className={`text-[10px] font-black px-2.5 py-1 border rounded uppercase tracking-widest ${
                    animal.hazard_rating === 'HIGH' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    animal.hazard_rating === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {animal.hazard_rating || 'LOW'}
                  </span>
                </div>
                {animal.is_venomous && (
                   <div className="bg-rose-100 text-rose-800 px-3 py-2 rounded-lg text-[10px] font-black flex items-center justify-center gap-2 uppercase tracking-widest mt-2 border border-rose-200">
                     <AlertTriangle size={14} /> VENOMOUS SPECIES
                   </div>
                )}
              </div>
            </div>

          </div>
        )}

        {activeTab === 'medical' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <MedicalRecords animalId={animal.id} variant="quick-view" />
          </div>
        )}

        {activeTab === 'husbandry' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <HusbandryLogs 
              animalId={animal.id} 
              weightUnit={animal.weight_unit || 'g'} 
              animal={animal} 
            />
          </div>
        )}
      </div>

      {/* EDIT OVERLAY MODAL ROUTER */}
      {isEditModalOpen && (
        <AnimalFormModal
          isOpen={isEditModalOpen}
          initialData={animal}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
      
    </div>
  );
}