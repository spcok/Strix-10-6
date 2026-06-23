import React, { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { 
  FileText, Stethoscope, ClipboardList, ArrowLeft, Edit2, Archive, 
  AlertTriangle, ShieldAlert, Scale, Thermometer, GitMerge, X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { IUCNBadge } from './IUCNBadge';
import AnimalFormModal from './AnimalFormModal';
import MedicalRecords from '../medical/MedicalRecords';
import HusbandryLogs from '../husbandry/HusbandryLogs';

export interface Props {
  animalId?: string;
  id?: string;
  animal?: any;
  onBack?: () => void;
  onClose?: () => void;
}

const formatWeight = (val: number | null | undefined, unit?: string) => {
  if (val === null || val === undefined) return '--';
  return `${val}${unit || 'g'}`;
};

// Dual Export: Resolves the "does not provide an export named..." error
export function AnimalProfile({ animalId, id, animal: passedAnimal, onBack, onClose }: Props) {
  const params = useParams({ strict: false }) as Record<string, any>;
  const effectiveId = passedAnimal?.id || animalId || id || params.id || '';
  const handleClose = onClose || onBack;
  
  const [activeTab, setActiveTab] = useState<'profile' | 'medical' | 'husbandry'>('profile');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const { data: animal, isLoading } = useQuery({
    queryKey: ['animal_profile', effectiveId],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*').eq('id', effectiveId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveId,
    initialData: passedAnimal ? passedAnimal : undefined,
  });

  if (!effectiveId) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!animal) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <AlertTriangle className="text-rose-500 mx-auto mb-3" size={32} />
          <h3 className="text-base font-black text-slate-900 uppercase tracking-tight mb-4">Profile Not Found</h3>
          <button onClick={handleClose} className="px-6 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-200">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm overflow-y-auto pt-6 pb-12 px-4 custom-scrollbar">
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200 relative">
        
        {handleClose && (
          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-300">
            <button onClick={handleClose} className="flex items-center gap-2 hover:text-white transition-colors bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700">
              <ArrowLeft size={14} /> Back To Dashboard
            </button>
          </div>
        )}

        <div className="bg-white rounded-3xl p-5 flex flex-col md:flex-row gap-8 shadow-2xl">
          <div className="w-full md:w-[280px] h-[280px] shrink-0 rounded-2xl overflow-hidden bg-slate-100 shadow-inner border border-slate-200">
            <img 
              src={animal.profile_image_url || '/offline-media-fallback.svg'} 
              alt={animal.name} 
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.src = '/offline-media-fallback.svg'; }}
            />
          </div>

          <div className="flex-1 flex flex-col pt-2 relative">
            <div className="absolute top-0 right-0 flex items-center gap-2">
              <button onClick={() => setIsEditModalOpen(true)} className="p-2.5 text-emerald-600 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-200 transition-all shadow-sm bg-white">
                <Edit2 size={16} />
              </button>
              <button className="p-2.5 text-rose-600 border border-slate-200 rounded-xl hover:bg-rose-50 hover:border-rose-200 transition-all shadow-sm bg-white">
                <Archive size={16} />
              </button>
              {handleClose && (
                <button onClick={handleClose} className="p-2.5 text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-100 hover:text-slate-700 transition-all shadow-sm bg-white ml-2">
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="mb-8 pr-32">
              <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2 truncate">{animal.name}</h1>
              <p className="text-[10px] font-bold text-slate-500 font-mono tracking-widest uppercase mb-1">ID: {animal.id.toUpperCase()}</p>
              <p className="text-[10px] font-bold text-slate-500 font-mono tracking-widest uppercase">RING: {animal.ring_number || 'UN-RINGED'} | CHIP: {animal.microchip_id || 'NONE'}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Species</span>
                <span className="text-sm font-bold text-slate-900">{animal.species}</span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Latin Name</span>
                <span className="text-sm font-bold text-slate-900 italic">{animal.latin_name || 'N/A'}</span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">DOB</span>
                <span className="text-sm font-bold text-slate-900">{animal.date_of_birth ? new Date(animal.date_of_birth).toLocaleDateString() : 'Unknown'}</span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</span>
                <span className="text-sm font-bold text-slate-900">{animal.location || 'Unassigned'}</span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Acquired</span>
                <span className="text-sm font-bold text-slate-900">{animal.acquisition_date ? new Date(animal.acquisition_date).toLocaleDateString() : 'Unknown'}</span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Mob/Group</span>
                <span className="text-sm font-bold text-slate-900">{animal.parent_group_id || 'Individual'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col min-h-[500px]">
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
                    isActive ? 'border-emerald-500 text-emerald-600 bg-white rounded-t-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]' : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 rounded-t-xl'
                  }`}
                >
                  <tab.icon size={14} /> {tab.label}
                </button>
              )
            })}
          </div>

          <div className="p-6 bg-white flex-1 overflow-y-auto custom-scrollbar">
            {activeTab === 'profile' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-5 shadow-sm">
                    <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-rose-900 mb-4">
                      <AlertTriangle size={16} className="text-rose-600" /> Critical Husbandry Notes
                    </h3>
                    <div className="text-sm font-bold text-rose-800 space-y-2">
                      {animal.critical_husbandry_notes ? (
                        Array.isArray(animal.critical_husbandry_notes) 
                          ? animal.critical_husbandry_notes.map((n: string, i: number) => <p key={i} className="flex gap-3"><span className="text-rose-500 font-black">-</span><span>{n}</span></p>)
                          : String(animal.critical_husbandry_notes).split('\n').map((n, i) => <p key={i} className="flex gap-3"><span className="text-rose-500 font-black">-</span><span>{n.replace(/^- /, '')}</span></p>)
                      ) : 'No critical alerts logged.'}
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm w-full md:w-[60%]">
                    <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-900 mb-4">
                      <Scale size={16} className="text-emerald-600" /> Weights
                    </h3>
                    <div className="flex justify-between pb-2 border-b border-slate-200 mb-2"><span>Flying:</span> <b>{formatWeight(animal.flying_weight, animal.weight_unit)}</b></div>
                    <div className="flex justify-between"><span>Winter:</span> <b>{formatWeight(animal.winter_weight, animal.weight_unit)}</b></div>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-900 mb-4">
                      <ShieldAlert size={16} className="text-amber-500" /> Safety
                    </h3>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-500">Hazard Rating:</span>
                      <span className={`text-sm font-black uppercase tracking-wide ${animal.hazard_rating === 'HIGH' ? 'text-rose-600' : animal.hazard_rating === 'MEDIUM' ? 'text-amber-600' : 'text-slate-900'}`}>
                        {animal.hazard_rating || 'LOW'}
                      </span>
                    </div>
                    {animal.is_venomous && <div className="mt-4 bg-rose-100 border border-rose-200 text-rose-800 text-[10px] font-black uppercase tracking-widest p-2 rounded text-center">Venomous Species</div>}
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-900 mb-4">
                      <GitMerge size={16} className="text-purple-500" /> Registry & IUCN
                    </h3>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-slate-500">Conservation:</span>
                      <IUCNBadge status={animal.red_list_status} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between"><span className="text-[10px] font-bold text-slate-400">Sire ID:</span><span className="text-[10px] font-mono text-slate-800">{animal.sire_id || 'Unknown'}</span></div>
                      <div className="flex justify-between mt-1"><span className="text-[10px] font-bold text-slate-400">Dam ID:</span><span className="text-[10px] font-mono text-slate-800">{animal.dam_id || 'Unknown'}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'medical' && <MedicalRecords animalId={animal.id} />}
            {activeTab === 'husbandry' && <HusbandryLogs animalId={animal.id} animal={animal} />}
          </div>
        </div>
      </div>

      {isEditModalOpen && (
        <AnimalFormModal isOpen={isEditModalOpen} initialData={animal} onClose={() => setIsEditModalOpen(false)} />
      )}
    </div>
  );
}

// Dual Export fallback
export default AnimalProfile;