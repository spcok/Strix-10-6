import React, { useState, useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Pill, Activity, WifiOff, FileText, AlertCircle, Loader2 } from 'lucide-react';

import DigitalMAR from '../components/medical/DigitalMAR';
import PrescriptionList from '../components/medical/PrescriptionList';
import PrescriptionFormModal from '../components/medical/PrescriptionFormModal';
import MedicationHistory from '../components/medical/MedicationHistory';
import { marExportService } from '../services/marExportService';
import { Prescription } from '../types';

// ISSUE 19: Lift navigation context to TanStack Router to preserve state on tab switch
type MedicationsSearch = { tab?: 'DIGITAL_MAR' | 'PRESCRIPTIONS' | 'HISTORY'; };

export const Route = createFileRoute('/clinical/medications')({
  validateSearch: (search: Record<string, unknown>): MedicationsSearch => ({
    tab: (search.tab as 'DIGITAL_MAR' | 'PRESCRIPTIONS' | 'HISTORY') || 'DIGITAL_MAR',
  }),
  component: MedicationsModule,
});

function MedicationsModule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  
  const activeTab = tab || 'DIGITAL_MAR';
  const setActiveTab = (newTab: 'DIGITAL_MAR' | 'PRESCRIPTIONS' | 'HISTORY') => {
    navigate({ search: { tab: newTab } });
  };

  const [exportError, setExportError] = useState<string | null>(null);
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState<Prescription | null>(null);

  // ISSUE 13: Lightweight 60-second heartbeat to reduce database noise
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    let isMounted = true;
    const checkConnection = async () => {
      try {
        const { error } = await supabase.from('animals').select('id').limit(1);
        if (isMounted) setIsOnline(!error);
      } catch {
        if (isMounted) setIsOnline(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 60000); 

    const handleOnline = () => checkConnection();
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ISSUE 1: Replaced local useState array with direct useQuery synchronization
  const { data: prescriptions = [], isLoading: loadingRx } = useQuery({
    queryKey: ['prescriptions', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prescriptions')
        .select('*, animals(id, name, species, location, gender, flying_weight, weight_unit, special_requirements, date_of_birth, status)')
        .eq('status', 'ACTIVE')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data as Prescription[];
    },
    enabled: isOnline,
  });

  useEffect(() => {
    if (!user?.id) return;
    // ISSUE 2: Dynamic channel names prevent stale registrations across tenants
    const adminChannel = supabase
      .channel(`medication_administrations_changes_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medication_administrations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['medication_administrations'], refetchType: 'active' });
      }).subscribe();

    const rxChannel = supabase
      .channel(`prescriptions_changes_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prescriptions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['prescriptions'], refetchType: 'active' });
      }).subscribe();

    return () => { 
      supabase.removeChannel(adminChannel); 
      supabase.removeChannel(rxChannel); 
    };
  }, [queryClient, user?.id]);

  const handlePrintUnifiedMar = async (rx: Prescription, setLoading: (b: boolean) => void) => {
    setLoading(true);
    setExportError(null);
    try {
      const patientPrescriptions = prescriptions.filter(p => p.animal_id === rx.animal_id);
      await marExportService.exportUnifiedMAR(
        rx.animals, 
        patientPrescriptions, 
        user?.name || 'Staff', 
        user?.id || 'Unknown-ID'
      );
    } catch (error: any) {
      console.error(error);
      setExportError(error.message || "Failed to generate DOCX MAR chart. Please ensure network is stable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      {/* ISSUE 14: Non-blocking sticky banner preserves user form inputs while offline */}
      {!isOnline && (
        <div className="sticky top-4 z-40 bg-rose-600 text-white p-4 rounded-xl shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3">
            <WifiOff size={20} />
            <div>
              <p className="font-black uppercase tracking-widest text-xs">Database Disconnected</p>
              <p className="text-sm font-medium text-rose-100">Writes are temporarily locked to prevent split-brain double-dosing.</p>
            </div>
          </div>
        </div>
      )}

      {exportError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl shadow-sm flex items-center gap-3 animate-in fade-in">
          <AlertCircle size={20} className="shrink-0 text-rose-600" />
          <p className="text-sm font-bold">{exportError}</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Clinical Dispensary</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">Prescription Management & Digital MAR</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditingPrescription(null); setIsPrescriptionModalOpen(true); }} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-700 shadow-[0_0_15px_rgba(37,99,235,0.2)] transition-all">
            <Pill size={14} /> Provision Order
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 pb-px overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('DIGITAL_MAR')} className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'DIGITAL_MAR' ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg' : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-t-lg'}`}>
          <Activity size={16} /> Today's MAR
        </button>
        <button onClick={() => setActiveTab('PRESCRIPTIONS')} className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'PRESCRIPTIONS' ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg' : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-t-lg'}`}>
          <Pill size={16} /> Active Orders
        </button>
        <button onClick={() => setActiveTab('HISTORY')} className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'HISTORY' ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg' : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-t-lg'}`}>
          <FileText size={16} /> Medication History
        </button>
      </div>

      <div className="animate-in fade-in duration-300">
        {activeTab === 'DIGITAL_MAR' && <DigitalMAR prescriptions={prescriptions} isOnline={isOnline} />}
        {activeTab === 'PRESCRIPTIONS' && <PrescriptionList prescriptions={prescriptions} onEditOrder={(rx) => { setEditingPrescription(rx); setIsPrescriptionModalOpen(true); }} onPrintMar={handlePrintUnifiedMar} />}
        {activeTab === 'HISTORY' && <MedicationHistory />}
      </div>

      {isPrescriptionModalOpen && (
        <PrescriptionFormModal isOpen={isPrescriptionModalOpen} onClose={() => setIsPrescriptionModalOpen(false)} initialData={editingPrescription} />
      )}
    </div>
  );
}