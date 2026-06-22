import React, { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { 
  FileText, Stethoscope, ClipboardList, ArrowLeft, Edit2, Archive, 
  AlertTriangle, ShieldAlert, Scale, Thermometer, GitMerge
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { IUCNBadge } from './IUCNBadge';
import AnimalFormModal from './AnimalFormModal';
import MedicalRecords from '../medical/MedicalRecords';
import HusbandryLogs from '../husbandry/HusbandryLogs';

export interface Props {
  animalId?: string;
  onBack?: () => void;
}

// UI-Level formatting logic decoupled from services
const formatWeight = (val: number | null | undefined, unit?: string) => {
  if (val === null || val === undefined) return '--';
  return `${val}${unit || 'g'}`;
};

// EXPORT FIX: Exported as a named function for strict module resolution...
export function AnimalProfile({ animalId, onBack }: Props) {
  const params = useParams({ strict: false });
  const effectiveId = animalId || params.id || '';
  
  const [activeTab, setActiveTab] = useState<'profile' | 'medical' | 'husbandry'>('profile');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Core Data Engine
  const { data: animal, isLoading } = useQuery({
    queryKey: ['animal_profile', effectiveId],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*').eq('id', effectiveId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveId,
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
        <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Profile Not Found</h3>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 animate-in fade-in duration-300">
      
      {/* Navigation Layer */}
      <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {onBack ? (
          <button onClick={onBack} className="flex items-center gap-2 hover:text-slate-600 transition-colors">
            <ArrowLeft size={14} /> Back To Dashboard
          </button>
        ) : (
          <Link to="/reports" className="flex items-center gap-2 hover:text-slate-600 transition-colors">
            <ArrowLeft size={14} /> Back To Dashboard
          </Link>
        )}
      </div>

      {/* HERO CARD */}
      <div className="bg-white rounded-3xl p-5 flex flex-col md:flex-row gap-8 shadow-xl">
        {/* Profile Image */}
        <div className="w-full md:w-[280px] h-[280px] shrink-0 rounded-2xl overflow-hidden bg-slate-100 shadow-inner border border-slate-200">
          <img 
            src={animal.profile_image_url || '/offline-media-fallback.svg'} 
            alt={animal.name} 
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.src = '/offline-media-fallback.svg'; }}
          />
        </div>

        {/* Core Identity Matrix */}
        <div className="flex-1 flex flex-col pt-2 relative">
          
          {/* Top Right Action Buttons */}
          <div className="absolute top-0 right-0 flex items-center gap-2">
            <button 
              onClick={() => setIsEditModalOpen(true)}
              className="p-2.5 text-emerald-600 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-200 transition-all shadow-sm"
            >
              <Edit2 size={16} />
            </button>
            <button 
              className="p-2.5 text-rose-600 border border-slate-200 rounded-xl hover:bg-rose-50 hover:border-rose-200 transition-all shadow-sm"
            >
              <Archive size={16} />
            </button>
          </div>

          <div className="mb-8 pr-24">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2 truncate">{animal.name}</h1>
            <p className="text-[10px] font-bold text-slate-500 font-mono tracking-widest uppercase mb-1">
              ID: {animal.id.toUpperCase()}
            </p>
            <p className="text-[10px] font-bold text-slate-500 font-mono tracking-widest uppercase">
              RING: {animal.ring_number || 'UN-RINGED'} | CHIP: {animal.microchip_id || 'NONE'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-8">
            <div>
              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Species</span>
              <span className="text-sm font-bold text-slate-900">{animal.species}</span>
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Sex</span>
              <span className="text-sm font-bold text-slate-900">{animal.gender || 'Unknown'}</span>
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Origin</span>
              <span className="text-sm font-bold text-slate-900">{animal.origin || 'Not Recorded'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* LOWER MATRIX */}
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col min-h-[500px]">
        
        {/* Tab Header */}
        <div className="flex border-b border-slate-100 px-2 pt-2 bg-slate-50 shrink-0 overflow-x-auto custom-scrollbar">
          {[
            { id: 'profile', label: 'Profile Matrix', icon: FileText },
            { id: 'medical', label: 'Medical', icon: Stethoscope },
            { id: 'husbandry', label: 'Husbandry Logs', icon: ClipboardList },
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-4 text-[11px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${
                  isActive 
                    ? 'border-emerald-500 text-emerald-600 bg-white rounded-t-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]' 
                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 rounded-t-xl'
                }`}
              >
                <tab.icon size={14} /> {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content Area */}
        <div className="p-6 bg-white flex-1 overflow-y-auto custom-scrollbar">
          
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 auto-rows-min">
              
              {/* Left Column: Critical Notes & Weights */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Critical Notes Block */}
                <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-5 shadow-sm">
                  <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-rose-900 mb-4">
                    <AlertTriangle size={16} className="text-rose-600" />
                    Critical Husbandry Notes
                  </h3>
                  {animal.critical_husbandry_notes ? (
                     <div className="text-sm font-bold text-rose-800 space-y-2">
                       {Array.isArray(animal.critical_husbandry_notes) 
                         ? animal.critical_husbandry_notes.map((n, i) => <p key={i} className="flex gap-3"><span className="text-rose-500 font-black">-</span><span>{n}</span></p>)
                         : String(animal.critical_husbandry_notes).split('\n').map((n, i) => <p key={i} className="flex gap-3"><span className="text-rose-500 font-black">-</span><span>{n.replace(/^- /, '')}</span></p>)
                       }
                     </div>
                  ) : (
                    <p className="text-xs font-semibold text-rose-700 italic">No critical alerts logged.</p>
                  )}
                </div>

                {/* Weights Block */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm w-full md:w-[60%]">
                  <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-900 mb-4">
                    <Scale size={16} className="text-emerald-600" />
                    Weights
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                      <span className="text-sm font-bold text-slate-500">Flying Weight:</span>
                      <span className="text-sm font-black text-slate-900">
                        {formatWeight(animal.flying_weight, animal.weight_unit)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-500">Winter Weight:</span>
                      <span className="text-sm font-black text-slate-900">
                        {formatWeight(animal.winter_weight, animal.weight_unit)}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column: Safety & Extra Telemetry */}
              <div className="space-y-6">
                
                {/* Safety Block */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-900 mb-4">
                    <ShieldAlert size={16} className="text-amber-500" />
                    Safety
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-500">Hazard Rating:</span>
                    <span className={`text-sm font-black uppercase tracking-wide ${
                      animal.hazard_rating === 'HIGH' ? 'text-rose-600' : 
                      animal.hazard_rating === 'MEDIUM' ? 'text-amber-600' : 'text-slate-900'
                    }`}>
                      {animal.hazard_rating || 'LOW'}
                    </span>
                  </div>
                  {animal.is_venomous && (
                    <div className="mt-4 bg-rose-100 border border-rose-200 text-rose-800 text-[10px] font-black uppercase tracking-widest p-2 rounded text-center">
                      Venomous Species
                    </div>
                  )}
                </div>

                {/* Environmental Block */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-900 mb-4">
                    <Thermometer size={16} className="text-blue-500" />
                    Environment
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs font-bold text-slate-500">Day Target:</span>
                      <span className="text-xs font-black text-slate-900">{animal.target_day_temp_c ?? '--'}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs font-bold text-slate-500">Night Target:</span>
                      <span className="text-xs font-black text-slate-900">{animal.target_night_temp_c ?? '--'}°C</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="text-xs font-bold text-slate-500">Humidity:</span>
                      <span className="text-xs font-black text-slate-900">
                        {animal.target_humidity_min_percent ? `${animal.target_humidity_min_percent}% - ${animal.target_humidity_max_percent}%` : '--'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* IUCN / Registry Block */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-900 mb-4">
                    <GitMerge size={16} className="text-purple-500" />
                    Registry & IUCN
                  </h3>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-slate-500">Conservation:</span>
                    <IUCNBadge status={animal.red_list_status} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[10px] font-bold text-slate-400">Sire ID:</span>
                      <span className="text-[10px] font-mono text-slate-800 line-clamp-1 text-right">{animal.sire_id || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] font-bold text-slate-400">Dam ID:</span>
                      <span className="text-[10px] font-mono text-slate-800 line-clamp-1 text-right">{animal.dam_id || 'Unknown'}</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'medical' && <MedicalRecords animalId={animal.id} />}
          {activeTab === 'husbandry' && <HusbandryLogs animalId={animal.id} animal={animal} />}

        </div>
      </div>

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

// EXPORT FIX: ...and simultaneously exported as the default fallback.
export default AnimalProfile;