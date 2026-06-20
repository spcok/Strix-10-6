import React, { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { reportExportService } from '../../services/reportExportService';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { format, subDays, parseISO } from 'date-fns';
import { Loader2, Download, Activity, Scale, Utensils, AlertTriangle } from 'lucide-react';
import html2canvas from 'html2canvas';

interface TelemetryDashboardProps {
  animalId: string;
}

export default function TelemetryDashboard({ animalId }: TelemetryDashboardProps) {
  const { user, profile } = useAuth();
  const [timeframe, setTimeframe] = useState<30 | 90 | 365>(30);
  const [isExporting, setIsExporting] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  // Fetch logs specifically for this animal
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['animal_logs', animalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('animal_id', animalId)
        .eq('is_deleted', false)
        .order('log_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
    networkMode: 'offlineFirst',
  });

  const { data: animal } = useQuery({
    queryKey: ['animal', animalId],
    queryFn: async () => {
      const { data } = await supabase.from('animals').select('name, species').eq('id', animalId).single();
      return data;
    }
  });

  // Data Aggregation Engine
  const chartData = useMemo(() => {
    if (!logs.length) return [];
    
    const cutoffDate = subDays(new Date(), timeframe).getTime();
    const dataMap = new Map<string, any>();

    logs.forEach(log => {
      const logTime = new Date(log.log_date).getTime();
      if (logTime < cutoffDate) return;

      const dateKey = format(parseISO(log.log_date), 'dd MMM');
      
      if (!dataMap.has(dateKey)) {
        dataMap.set(dateKey, { date: dateKey, weight: null, feedQty: 0 });
      }

      const existing = dataMap.get(dateKey);

      if (log.log_type === 'WEIGHT' && log.weight_grams) {
        existing.weight = log.weight_grams;
      }
      
      if (log.log_type === 'FEEDING' && log.feed_details?.meals) {
        const dailyTotal = log.feed_details.meals.reduce((sum: number, meal: any) => sum + (Number(meal.quantity) || 0), 0);
        existing.feedQty += dailyTotal;
      }
    });

    return Array.from(dataMap.values());
  }, [logs, timeframe]);

  // DOCX Export with Canvas Snapshot
  const handleExport = async () => {
    if (!chartRef.current) return;
    setIsExporting(true);

    try {
      // 1. Snapshot the DOM element
      const canvas = await html2canvas(chartRef.current, { scale: 2, backgroundColor: '#ffffff' });
      
      // 2. Convert canvas to ArrayBuffer
      const base64Data = canvas.toDataURL('image/png');
      const res = await fetch(base64Data);
      const chartBuffer = await res.arrayBuffer();

      // 3. Format Data Table for DOCX
      const tableData = chartData.map(d => [d.date, d.weight ? `${d.weight}g` : '-', d.feedQty > 0 ? d.feedQty : '-']);

      // 4. Fire Export Service
      await reportExportService.exportSingleReport({
        title: `Telemetry & Metrics: ${animal?.name || 'Patient'}`,
        generatorName: profile?.name || user?.email || 'System Administrator',
        dateRange: `Last ${timeframe} Days`,
        columns: ['Date', 'Recorded Weight', 'Total Feed Quantity'],
        data: tableData,
        chartImage: chartBuffer
      }, `Telemetry_${animalId.substring(0,6)}`);

    } catch (error) {
      console.error("Export Failed", error);
      alert("Failed to generate Telemetry Report.");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-xl">
            <Activity className="text-blue-600" size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Biometric Telemetry</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Historical Weight & Feed Analysis</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select 
            value={timeframe} 
            onChange={(e) => setTimeframe(Number(e.target.value) as any)}
            className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-4 py-2 focus:outline-none focus:border-blue-500 shadow-sm"
          >
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
            <option value={365}>Last 1 Year</option>
          </select>

          <button 
            onClick={handleExport}
            disabled={isExporting || chartData.length === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors shadow-sm disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export DOCX
          </button>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center text-center shadow-sm">
          <AlertTriangle className="text-slate-300 mb-3" size={32} />
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">No telemetry data available for this period.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" ref={chartRef}>
          
          {/* Weight Line Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Scale size={14} className="text-emerald-500" /> Mass Trending (Grams)
            </h4>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} minTickGap={30} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                    labelStyle={{ fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}
                  />
                  <Line type="monotone" dataKey="weight" name="Weight (g)" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Feed Volume Bar Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Utensils size={14} className="text-amber-500" /> Nutritional Volume (Items/Qty)
            </h4>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} minTickGap={30} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                    labelStyle={{ fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar dataKey="feedQty" name="Qty Consumed" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}