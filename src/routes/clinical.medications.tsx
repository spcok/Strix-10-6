import React, { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Pill, Activity, WifiOff, FileText, AlertCircle, Loader2 } from 'lucide-react';

import DigitalMAR from '../components/medical/DigitalMAR';
import PrescriptionList from '../components/medical/PrescriptionList';
import PrescriptionFormModal from '../components/medical/PrescriptionFormModal';
import MedicationHistory from '../components/medical/MedicationHistory';
import { marExportService } from '../services/marExportService';
import { Prescription } from '../types';

export const Route = createFileRoute('/clinical/medications')({
  component: MedicationsModule,
});

function MedicationsModule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'DIGITAL_MAR' | 'PRESCRIPTIONS' | 'HISTORY'>('DIGITAL_MAR');
  const [exportError, setExportError] = useState<string | null>(null);
  
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState<Prescription | null>(null);

  // --- STRICT NETWORK HEARTBEAT ---
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
    const interval = setInterval(checkConnection, 15000); 

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

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);

  useEffect(() => {
    // Only execute data fetch if we are online
    if (isOnline) {
      const fetchRx = async () => {
        const { data, error } = await supabase
          .from('prescriptions')
          .select('*, animals(id, name, species, location, gender, flying_weight, weight_unit, special_requirements, date_of_birth, status)')
          .eq('status', 'ACTIVE')
          .order('start_date', { ascending: false });
        if (!error && data) setPrescriptions(data as Prescription[]);
      };
      fetchRx();
    }
  }, [isOnline]);

  useEffect(() => {
    const adminChannel = supabase
      .channel('medication_administrations_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medication_administrations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['medication_administrations'], refetchType: 'active' });
      })
      .subscribe();

    const rxChannel = supabase
      .channel('prescriptions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prescriptions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['prescriptions'], refetchType: 'active' });
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(adminChannel); 
      supabase.removeChannel(rxChannel); 
    };
  }, [queryClient]);

  const handleOpenNewOrder = () => {
    setEditingPrescription(null);
    setIsPrescriptionModalOpen(true);
  };

  const handleEditOrder = (rx: Prescription) => {
    setEditingPrescription(rx);
    setIsPrescriptionModalOpen(true);
  };

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

  // --- STRICT LOCKOUT RENDER ---
  if (!isOnline) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-32">
        <div className="bg-slate-900 text-white p-12 rounded-2xl shadow-2xl flex flex-col items-center justify-center text-center min-h-[60vh] border border-slate-800">
          <WifiOff size={64} className="mb-6 text-blue-500" />
          <h2 className="text-3xl font-black uppercase tracking-widest mb-3">Clinical Dispensary Locked</h2>
          <p className="font-bold text-slate-400 max-w-lg text-sm leading-relaxed">
            To enforce veterinary data integrity and prevent split-brain double dosing, this module requires an active database connection. All caches are suspended.
          </p>
          <div className="mt-8 px-6 py-3 bg-slate-800 rounded-xl text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-3 border border-slate-700">
            <Loader2 size={16} className="animate-spin text-blue-500" /> Securing connection...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">

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
          <button onClick={handleOpenNewOrder} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-700 shadow-[0_0_15px_rgba(37,99,235,0.2)] transition-all">
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
        {activeTab === 'PRESCRIPTIONS' && <PrescriptionList prescriptions={prescriptions} onEditOrder={handleEditOrder} onPrintMar={handlePrintUnifiedMar} />}
        {activeTab === 'HISTORY' && <MedicationHistory />}
      </div>

      {isPrescriptionModalOpen && (
        <PrescriptionFormModal isOpen={isPrescriptionModalOpen} onClose={() => setIsPrescriptionModalOpen(false)} initialData={editingPrescription} />
      )}
    </div>
  );
}