import React, { useState, useMemo, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { reportExportService } from '../services/reportExportService';
import { 
  CalendarDays, ListOrdered, AlertTriangle, ArrowRightLeft, 
  Download, Loader2, FileText, ChevronRight, Eye, Filter, WifiOff,
  Scale, Utensils, Wrench, HeartPulse, Archive
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS - FULL COMPLIANCE POOL
// ------------------------------------------------------------------
const reportDataOptions = queryOptions({
  queryKey: ['report_data_pool'],
  queryFn: async () => {
    const [animals, logs, internal, external, incidents, maintenance, firstAid] = await Promise.all([
      supabase.from('animals').select('*').eq('is_deleted', false).order('name'),
      supabase.from('daily_logs').select('*, animals(name, species)').eq('is_deleted', false).order('log_date', { ascending: false }),
      supabase.from('internal_movements').select('*, animals(name, species)').order('movement_date', { ascending: false }),
      supabase.from('external_transfers').select('*, animals(name, species)').order('transfer_date', { ascending: false }),
      supabase.from('incidents').select('*').eq('is_deleted', false).order('incident_date', { ascending: false }),
      supabase.from('maintenance_logs').select('*').eq('is_deleted', false).order('reported_date', { ascending: false }),
      supabase.from('first_aid_logs').select('*').eq('is_deleted', false).order('incident_date', { ascending: false })
    ]);

    return {
      animals: animals.data || [],
      logs: logs.data || [],
      internal: internal.data || [],
      external: external.data || [],
      incidents: incidents.data || [],
      maintenance: maintenance.data || [],
      firstAid: firstAid.data || []
    };
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/reports')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) await queryClient.ensureQueryData(reportDataOptions);
  },
  component: ReportsDashboard,
});

const REPORTS = [
  { id: 'husbandry', title: 'Daily Husbandry Logs', description: 'Export daily observation records.', icon: CalendarDays, columns: ['Date', 'Animal', 'Log Type', 'Notes', 'Staff'] },
  { id: 'weekly_feed', title: 'Weekly Feed Chart', description: 'Log of nutritional intake & feed methods.', icon: Utensils, columns: ['Date', 'Animal', 'Feed Details', 'Quantity', 'Notes'] },
  { id: 'weekly_weight', title: 'Weekly Weight Chart', description: 'Tracking of animal masses and anomalies.', icon: Scale, columns: ['Date', 'Animal', 'Weight', 'Unit', 'Notes'] },
  { id: 'internal_movements', title: 'Internal Movements', description: 'Log of enclosure changes.', icon: ArrowRightLeft, columns: ['Date', 'Animal', 'Species', 'From', 'To', 'Reason'] },
  { id: 'external_movements', title: 'External Transfers', description: 'Acquisitions, loans, and dispositions.', icon: ArrowRightLeft, columns: ['Date', 'Animal', 'Transfer Type', 'Origin/Destination', 'Auth By'] },
  { id: 'census', title: 'Annual Census (Section 9)', description: 'Complete site inventory.', icon: ListOrdered, columns: ['Name', 'Species', 'Category', 'Sex', 'Status'] },
  { id: 'incidents', title: 'Safety Incidents', description: 'Operational and safety incident log.', icon: AlertTriangle, columns: ['Date', 'Category', 'Severity', 'Description', 'Reported By'] },
  { id: 'first_aid', title: 'First Aid Report', description: 'Medical interventions for staff/public.', icon: HeartPulse, columns: ['Date', 'Person Type', 'Injury', 'Treatment', 'Administered By'] },
  { id: 'maintenance', title: 'Site Maintenance', description: 'Facility repair and upkeep log.', icon: Wrench, columns: ['Date', 'Location', 'Issue', 'Priority', 'Status'] },
  { id: 'inspection_pack', title: 'ZLA Inspection Pack', description: 'Auto-generates a .zip containing all statutory requirements.', icon: Archive, columns: ['Included Document', 'Description'] }
];

export function ReportsDashboard() {
  const { user, profile } = useAuth();
  const [activeReportId, setActiveReportId] = useState('husbandry');
  const [startDate, setStartDate] = useState(format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const { data: db, isLoading } = useQuery(reportDataOptions);
  const activeReport = REPORTS.find(r => r.id === activeReportId) || REPORTS[0];

  // ------------------------------------------------------------------
  // DATA TRANSFORMATION ENGINE
  // ------------------------------------------------------------------
  const getTransformedData = (reportId: string) => {
    if (!db) return [];
    
    const sDate = new Date(startDate).getTime();
    const eDate = new Date(endDate).setHours(23, 59, 59, 999);
    
    const filterByDateAndCategory = (items: any[], dateField: string) => {
      return items.filter(item => {
        const t = new Date(item[dateField]).getTime();
        const categoryMatch = selectedCategory === 'ALL' || item.animals?.category === selectedCategory;
        return t >= sDate && t <= eDate && categoryMatch;
      });
    };

    switch (reportId) {
      case 'husbandry':
        return filterByDateAndCategory(db.logs.filter((l: any) => l.log_type === 'OBSERVATION'), 'log_date')
          .map((l: any) => [format(parseISO(l.log_date), 'dd MMM yyyy HH:mm'), `${l.animals?.name}`, l.log_type, l.notes || '-', l.created_by?.substring(0, 8) || 'Unknown']);
      
      case 'weekly_feed':
        return filterByDateAndCategory(db.logs.filter((l: any) => l.log_type === 'FEEDING'), 'log_date')
          .map((l: any) => {
            const meals = l.feed_details?.meals?.map((m: any) => m.food_item).join(', ') || 'Standard Diet';
            const qty = l.feed_details?.meals?.map((m: any) => m.quantity).join(', ') || '-';
            return [format(parseISO(l.log_date), 'dd MMM yyyy'), l.animals?.name, meals, qty, l.notes || '-'];
          });

      case 'weekly_weight':
        return filterByDateAndCategory(db.logs.filter((l: any) => l.log_type === 'WEIGHT'), 'log_date')
          .map((l: any) => [format(parseISO(l.log_date), 'dd MMM yyyy'), l.animals?.name, l.weight_grams, l.weight_unit || 'g', l.notes || '-']);

      case 'internal_movements':
        return db.internal.filter((m: any) => new Date(m.movement_date).getTime() >= sDate && new Date(m.movement_date).getTime() <= eDate)
          .map((m: any) => [format(parseISO(m.movement_date), 'dd MMM yyyy'), m.animals?.name, m.animals?.species, m.from_location || 'External', m.to_location || 'Unknown', m.reason || '-']);

      case 'external_movements':
        return db.external.filter((m: any) => new Date(m.transfer_date).getTime() >= sDate && new Date(m.transfer_date).getTime() <= eDate)
          .map((m: any) => [format(parseISO(m.transfer_date), 'dd MMM yyyy'), m.animals?.name, m.transfer_type, m.transfer_type === 'OUT' ? m.destination : m.origin, m.authorized_by?.substring(0, 8) || '-']);

      case 'census':
        return db.animals.filter((a: any) => selectedCategory === 'ALL' || a.category === selectedCategory)
          .map((a: any) => [a.name, a.species, a.category || '-', a.gender || 'U', a.status || 'ACTIVE']);

      case 'incidents':
        return db.incidents.filter((i: any) => new Date(i.incident_date).getTime() >= sDate && new Date(i.incident_date).getTime() <= eDate)
          .map((i: any) => [format(parseISO(i.incident_date), 'dd MMM yyyy HH:mm'), i.category, i.severity, i.description, i.reported_by?.substring(0, 8)]);

      case 'first_aid':
        return db.firstAid.filter((f: any) => new Date(f.incident_date).getTime() >= sDate && new Date(f.incident_date).getTime() <= eDate)
          .map((f: any) => [format(parseISO(f.incident_date), 'dd MMM yyyy HH:mm'), f.person_type, f.injury_type, f.treatment_provided, f.administered_by?.substring(0, 8)]);

      case 'maintenance':
        return db.maintenance.filter((m: any) => new Date(m.reported_date).getTime() >= sDate && new Date(m.reported_date).getTime() <= eDate)
          .map((m: any) => [format(parseISO(m.reported_date), 'dd MMM yyyy'), m.location, m.issue_description, m.priority, m.status]);

      case 'inspection_pack':
        return [
          ['1_Husbandry_Logs.docx', 'Daily observations for the reporting period.'],
          ['2_Internal_Movements.docx', 'Audit of enclosure biosecurity changes.'],
          ['3_External_Transfers.docx', 'Audit of acquisitions and dispositions.'],
          ['4_Site_Census.docx', 'Current active population list.']
        ];

      default:
        return [];
    }
  };

  const reportData = useMemo(() => getTransformedData(activeReportId), [db, activeReportId, startDate, endDate, selectedCategory]);

  // ------------------------------------------------------------------
  // EXPORT HANDLER
  // ------------------------------------------------------------------
  const handleExport = async () => {
    if (!isOnline) {
      alert("Compliance exports require an active internet connection to securely fetch the latest data and letterheads.");
      return;
    }

    setIsGenerating(true);
    try {
      const basePayload = {
        generatorName: profile?.name || user?.email || "System Administrator",
        dateRange: `${format(new Date(startDate), 'dd MMM yyyy')} to ${format(new Date(endDate), 'dd MMM yyyy')}`
      };

      if (activeReportId === 'inspection_pack') {
        // Build the ZLA ZIP Pack
        const packReports = [
          { filenameId: 'Husbandry', payload: { ...basePayload, title: 'Husbandry Logs', columns: REPORTS.find(r => r.id === 'husbandry')!.columns, data: getTransformedData('husbandry') } },
          { filenameId: 'Internal_Movements', payload: { ...basePayload, title: 'Internal Movements', columns: REPORTS.find(r => r.id === 'internal_movements')!.columns, data: getTransformedData('internal_movements') } },
          { filenameId: 'External_Transfers', payload: { ...basePayload, title: 'External Transfers', columns: REPORTS.find(r => r.id === 'external_movements')!.columns, data: getTransformedData('external_movements') } },
          { filenameId: 'Census', payload: { ...basePayload, title: 'Site Census', columns: REPORTS.find(r => r.id === 'census')!.columns, data: getTransformedData('census') } },
        ];
        await reportExportService.generateInspectionPackZip(packReports);
      } else {
        // Export Single Document
        await reportExportService.exportSingleReport({
          ...basePayload,
          title: activeReport.title,
          columns: activeReport.columns,
          data: reportData
        }, activeReportId);
      }
    } catch (error) {
      console.error("Export Failed:", error);
      alert("Failed to generate report export.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50 font-sans">
      
      {/* Sidebar Navigation */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 relative">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-1">
            <div className="bg-blue-100 p-2 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Compliance</h2>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Statutory Reporting</p>
        </div>

        <nav className="flex-grow p-4 space-y-2 overflow-y-auto custom-scrollbar pb-24">
          {REPORTS.map((report) => (
            <button
              key={report.id}
              onClick={() => setActiveReportId(report.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group border ${
                activeReportId === report.id 
                  ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3">
                <report.icon size={16} className={activeReportId === report.id ? 'text-white' : 'text-slate-400 group-hover:text-blue-500'} />
                <span className="text-xs font-bold uppercase tracking-wide text-left line-clamp-1">
                  {report.title}
                </span>
              </div>
              {activeReportId === report.id && <ChevronRight className="w-4 h-4 text-blue-200 shrink-0" />}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content Pane */}
      <div className="flex-grow flex flex-col overflow-hidden w-full p-6 space-y-6 relative">
        
        {/* OFFLINE OVERLAY LOCK */}
        {!isOnline && (
          <div className="absolute inset-0 z-50 bg-slate-100/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 flex flex-col items-center text-center max-w-md">
              <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-4">
                <WifiOff className="text-rose-600" size={32} />
              </div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Network Disconnected</h2>
              <p className="text-sm font-medium text-slate-500 mb-6">
                Statutory compliance reports must be generated using globally synchronized data. 
                Please reconnect to Wi-Fi to export ZLA documents.
              </p>
            </div>
          </div>
        )}

        {/* Header & Controls */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
              <activeReport.icon className="text-blue-600" size={24} /> {activeReport.title}
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-2">{activeReport.description}</p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            {activeReportId !== 'census' && activeReportId !== 'inspection_pack' && (
              <>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Start Date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">End Date</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm" />
                </div>
              </>
            )}

            {(activeReportId === 'husbandry' || activeReportId === 'census' || activeReportId === 'weekly_feed' || activeReportId === 'weekly_weight') && (
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Taxonomic Filter</label>
                <div className="relative">
                  <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm appearance-none">
                    <option value="ALL">All Categories</option>
                    <option value="OWL">Owls</option>
                    <option value="RAPTOR">Raptors</option>
                    <option value="MAMMAL">Mammals</option>
                    <option value="EXOTIC">Exotics</option>
                  </select>
                </div>
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={isGenerating || isLoading || reportData.length === 0 || !isOnline}
              className={`text-white px-6 py-2.5 rounded-xl transition-colors text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-sm disabled:opacity-50 h-[42px] ${activeReportId === 'inspection_pack' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : activeReportId === 'inspection_pack' ? <Archive size={16} /> : <Download size={16} />}
              {activeReportId === 'inspection_pack' ? 'Compile .ZIP' : 'Export .DOCX'}
            </button>
          </div>
        </div>

        {/* Data Preview Table */}
        <div className="flex-grow bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <Eye size={14} className="text-blue-500" /> {activeReportId === 'inspection_pack' ? 'Zip Contents Preview' : 'Data Preview'}
            </h3>
            <span className="text-[10px] font-bold text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-sm">
              {isLoading ? 'Querying...' : `${reportData.length} Records Found`}
            </span>
          </div>
          
          <div className="flex-grow overflow-auto custom-scrollbar">
            {isLoading ? (
               <div className="h-full flex items-center justify-center">
                  <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
               </div>
            ) : reportData.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                  <FileText size={32} className="opacity-50" />
                  <p className="text-xs font-bold uppercase tracking-widest">No data matches the current filters.</p>
               </div>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
                <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                  <tr>
                    {activeReport.columns.map((col, i) => (
                      <th key={i} className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                      {row.map((cell: any, j: number) => (
                        <td key={j} className="px-6 py-4 font-medium text-slate-700 truncate max-w-[250px]">
                           {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}