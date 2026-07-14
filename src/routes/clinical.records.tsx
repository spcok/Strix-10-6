import React, { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Stethoscope, Search, Plus, Activity, 
  ShieldAlert, FileText, ChevronRight, X, Loader2, UserRound
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { toast } from 'sonner';

export const Route = createFileRoute('/clinical/records')({
  component: ClinicalRecordsModule,
});

function ClinicalRecordsModule() {
  const { hasPermission } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // --- QUERIES ---
  const { data: animals = [], isLoading: isLoadingAnimals } = useQuery({
    queryKey: ['clinical_animals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('id, name, species, ring_number, average_target_weight')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  const { data: records = [], isLoading: isLoadingRecords } = useQuery({
    queryKey: ['clinical_records', selectedAnimalId],
    enabled: !!selectedAnimalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinical_records')
        .select(`
          *,
          users!clinical_records_conducted_by_fkey(name, initials)
        `)
        .eq('animal_id', selectedAnimalId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const selectedAnimal = animals.find(a => a.id === selectedAnimalId);
  const filteredAnimals = animals.filter(a => 
    a.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    a.ring_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-6rem)] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
      
      {/* LEFT PANEL: The Ward / Patient List */}
      <div className="w-1/3 lg:w-1/4 border-r border-slate-200 flex flex-col bg-slate-50 shrink-0">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-3">
            <Stethoscope className="text-emerald-600" size={18} /> Patient Roster
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search by name or ring ID..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {isLoadingAnimals ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-emerald-500" size={24} /></div>
          ) : (
            filteredAnimals.map(animal => (
              <button
                key={animal.id}
                onClick={() => setSelectedAnimalId(animal.id)}
                className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-all ${
                  selectedAnimalId === animal.id 
                    ? 'bg-emerald-500 text-white shadow-md' 
                    : 'hover:bg-slate-200 text-slate-700'
                }`}
              >
                <div>
                  <p className="font-bold text-sm">{animal.name}</p>
                  <p className={`text-[10px] uppercase tracking-widest font-black ${selectedAnimalId === animal.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {animal.species} • {animal.ring_number || 'NO RING'}
                  </p>
                </div>
                <ChevronRight size={16} className={selectedAnimalId === animal.id ? 'text-white' : 'text-slate-300'} />
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Master Patient File */}
      <div className="flex-1 flex flex-col relative bg-slate-50/50">
        {!selectedAnimal ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <Stethoscope size={48} className="mb-4 opacity-20" />
            <p className="text-sm font-black uppercase tracking-widest">Select a Patient to view Medical Records</p>
          </div>
        ) : (
          <>
            {/* 1. The Vitals Ribbon */}
            <div className="bg-white border-b border-slate-200 p-6 shrink-0 shadow-sm z-10 relative">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">{selectedAnimal.name}</h1>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500 mt-1">
                    {selectedAnimal.species} • ID: {selectedAnimal.ring_number || 'N/A'}
                  </p>
                </div>
                {hasPermission('clinical:write') && (
                  <button 
                    onClick={() => setIsModalOpen(true)}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-colors shadow-sm"
                  >
                    <Plus size={16} /> New Clinical Entry
                  </button>
                )}
              </div>

              {/* Status Badges */}
              <div className="flex gap-3">
                <div className="flex items-center gap-2 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-slate-200">
                  <Activity size={14} /> Target Weight: {selectedAnimal.average_target_weight || 'N/A'}g
                </div>
                <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-200">
                  <ShieldAlert size={14} /> View Active MARs
                </div>
              </div>
            </div>

            {/* 2. The Chronological SOAP Timeline */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {isLoadingRecords ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>
              ) : records.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <FileText size={32} className="mx-auto mb-3 opacity-20" />
                  <p className="text-xs font-black uppercase tracking-widest">No Clinical Records Found</p>
                </div>
              ) : (
                <div className="space-y-6 pl-4 border-l-2 border-slate-200 ml-4">
                  {records.map((record) => (
                    <div key={record.id} className="relative pl-6">
                      <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full border-4 border-white bg-emerald-500 shadow-sm" />
                      
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        
                        {/* Record Header */}
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm">
                              {new Date(record.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' })}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                              {record.encounter_type || 'Routine Exam'}
                            </span>
                          </div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                            {record.conductor_role === 'EXTERNAL_VET' ? (
                              <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">
                                External: Dr. {record.external_vet_name} ({record.external_vet_clinic})
                              </span>
                            ) : (
                              <span>Dr./Vet: {record.users?.name || 'Unknown'}</span>
                            )}
                            <span className="text-slate-300">|</span> 
                            <span>{record.weight_grams}g</span>
                          </div>
                        </div>

                        {/* Strict SOAP Formatting */}
                        <div className="p-4 space-y-4">
                          <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Subjective (History/Obs)</p>
                            <p className="text-sm text-slate-700 leading-relaxed">{record.soap_subjective}</p>
                          </div>
                          <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Objective (Exam/Vitals)</p>
                            <p className="text-sm text-slate-700 leading-relaxed">{record.soap_objective}</p>
                          </div>
                          <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Assessment (Diagnosis)</p>
                            <p className="text-sm text-slate-700 leading-relaxed">{record.soap_assessment}</p>
                          </div>
                          <div className="bg-purple-50/50 p-3 rounded-xl border border-purple-100">
                            <p className="text-[10px] font-black uppercase tracking-widest text-purple-600 mb-1">Plan (Treatment/Action)</p>
                            <p className="text-sm text-slate-700 leading-relaxed">{record.soap_plan}</p>
                          </div>
                        </div>

                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 3. Strict SOAP Form Modal */}
      {isModalOpen && selectedAnimal && (
        <SOAPFormModal 
          animalId={selectedAnimal.id} 
          animalName={selectedAnimal.name!}
          onClose={() => setIsModalOpen(false)} 
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// STRICT S.O.A.P. DATA ENTRY MODAL (Upgraded with Dual-Insertion)
// ------------------------------------------------------------------
function SOAPFormModal({ animalId, animalName, onClose }: { animalId: string, animalName: string, onClose: () => void }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Field State
  const [encounterType, setEncounterType] = useState('Routine Exam');
  const [weight, setWeight] = useState('');
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');

  // Conductor State
  const [conductorType, setConductorType] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const [conductedBy, setConductedBy] = useState(profile?.id || '');
  const [externalVetName, setExternalVetName] = useState('');
  const [externalClinic, setExternalClinic] = useState('');

  // Query Active Staff for the Dropdown
  const { data: staffMembers = [] } = useQuery({
    queryKey: ['active_staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Unauthorized");
      if (!subjective || !objective || !assessment || !plan || !weight) {
        throw new Error("All SOAP fields and weight are mandatory for ZLA compliance.");
      }
      if (conductorType === 'EXTERNAL' && (!externalVetName || !externalClinic)) {
        throw new Error("External Vet Name and Clinic are required.");
      }

      // Determine correct UUID and Role based on toggle
      // If external, the person logging it (profile.id) takes accountability for data entry
      const finalConductedBy = conductorType === 'INTERNAL' ? conductedBy : profile.id;
      const finalConductorRole = conductorType === 'INTERNAL' 
        ? (staffMembers.find(s => s.id === conductedBy)?.role || 'UNKNOWN') 
        : 'EXTERNAL_VET';

      // 1. Insert into Clinical Records
      const { error: clinicalError } = await supabase.from('clinical_records').insert({
        animal_id: animalId,
        encounter_type: encounterType,
        weight_grams: Number(weight),
        soap_subjective: subjective,
        soap_objective: objective,
        soap_assessment: assessment,
        soap_plan: plan,
        conducted_by: finalConductedBy,
        conductor_role: finalConductorRole,
        external_vet_name: conductorType === 'EXTERNAL' ? externalVetName : null,
        external_vet_clinic: conductorType === 'EXTERNAL' ? externalClinic : null,
        created_by: profile.id,
        modified_by: profile.id,
      });

      if (clinicalError) throw clinicalError;

      // 2. Dual-Insert into Weight Logs table to keep graphs synced
      const { error: weightError } = await supabase.from('weight_logs').insert({
        animal_id: animalId,
        weight_grams: Number(weight),
        recorded_by: finalConductedBy, // Credits the person who actually conducted the exam
      });

      if (weightError) {
        console.error("Weight Dual-Insert Failed:", weightError);
        // We throw a specific error so the user knows the clinical note saved, but weight graph didn't update
        throw new Error("Clinical record saved, but failed to sync weight to husbandry logs.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical_records', animalId] });
      queryClient.invalidateQueries({ queryKey: ['weight_logs', animalId] }); // Triggers graph update
      toast.success('Clinical Record & Weight successfully sealed.');
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    }
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Stethoscope className="text-emerald-500" size={20} />
              New Clinical Entry
            </h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Patient: {animalName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Encounter Type</label>
              <select 
                value={encounterType} onChange={(e) => setEncounterType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              >
                <option value="Routine Exam">Routine Exam</option>
                <option value="Emergency Triage">Emergency Triage</option>
                <option value="Recheck / Follow-up">Recheck / Follow-up</option>
                <option value="Surgery / Procedure">Surgery / Procedure</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Current Weight (g) *</label>
              <input 
                type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 1250"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* DYNAMIC CONDUCTOR BLOCK */}
          <div className="bg-slate-100 rounded-xl p-4 border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <UserRound size={16} className="text-slate-500" />
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">Conductor Details</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Conducted By</label>
                <select 
                  value={conductorType} 
                  onChange={(e) => setConductorType(e.target.value as 'INTERNAL' | 'EXTERNAL')}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-500"
                >
                  <option value="INTERNAL">Internal Staff / Vet</option>
                  <option value="EXTERNAL">External Vet</option>
                </select>
              </div>

              {conductorType === 'INTERNAL' ? (
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Select Staff Member</label>
                  <select 
                    value={conductedBy} 
                    onChange={(e) => setConductedBy(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-500"
                  >
                    {staffMembers.map(user => (
                      <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-rose-500 mb-2">Vet Name *</label>
                    <input 
                      type="text" value={externalVetName} onChange={(e) => setExternalVetName(e.target.value)} placeholder="e.g. Sarah Jenkins"
                      className="w-full bg-white border border-rose-300 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-rose-500 mb-2">Clinic Name *</label>
                    <input 
                      type="text" value={externalClinic} onChange={(e) => setExternalClinic(e.target.value)} placeholder="e.g. City Wildlife Vets"
                      className="w-full bg-white border border-rose-300 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </>
              )}
            </div>
            
            {conductorType === 'EXTERNAL' && (
              <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mt-2">
                <ShieldAlert size={12} className="text-rose-500" />
                Note: You ({profile?.name}) will be recorded as the authorizing internal sponsor for this external exam.
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600 mb-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div> S - Subjective (History / Observations) *
              </label>
              <textarea 
                value={subjective} onChange={(e) => setSubjective(e.target.value)} rows={3} placeholder="Keeper reports bird is reluctant to bear weight..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
            
            <div>
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div> O - Objective (Exam Findings / Vitals) *
              </label>
              <textarea 
                value={objective} onChange={(e) => setObjective(e.target.value)} rows={3} placeholder="Grade III Bumblefoot lesion present on left plantar metatarsal pad..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div> A - Assessment (Diagnosis) *
              </label>
              <textarea 
                value={assessment} onChange={(e) => setAssessment(e.target.value)} rows={2} placeholder="Pododermatitis (Bumblefoot) - Left Foot."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-purple-600 mb-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div> P - Plan (Treatment / Actions) *
              </label>
              <textarea 
                value={plan} onChange={(e) => setPlan(e.target.value)} rows={3} placeholder="Apply hydrogel dressing. Start Meloxicam 0.5mg/kg PO SID..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors">
            Cancel
          </button>
          <button 
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2 shadow-sm"
          >
            {submitMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldAlert size={16} />}
            Seal Record
          </button>
        </div>
        
      </div>
    </div>
  );
}