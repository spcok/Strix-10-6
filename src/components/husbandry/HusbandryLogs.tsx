import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  ClipboardList, Scale, Utensils, Thermometer, Eye, 
  Loader2, Calendar, User 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// THE FIX: Pointing directly to your existing service file
import { formatWeightDisplay } from '../../services/dailyLogService';

interface HusbandryLogsProps {
  animalId: string;
  weightUnit?: string;
  animal?: any;
}

export default function HusbandryLogs({ animalId, weightUnit = 'g' }: HusbandryLogsProps) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['daily_logs', animalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('animal_id', animalId)
        .eq('is_deleted', false)
        .order('log_date', { ascending: false })
        .limit(50);
        
      if (error) throw error;
      return data;
    },
    enabled: !!animalId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-emerald-600 w-8 h-8" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <ClipboardList size={32} className="mb-3 opacity-50" />
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">No Husbandry Data</h3>
        <p className="text-[10px] font-bold mt-1">No daily logs, weights, or feeds have been recorded for this animal yet.</p>
      </div>
    );
  }

  const getLogConfig = (type: string) => {
    switch (type) {
      case 'WEIGHT': return { icon: Scale, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
      case 'FEEDING': return { icon: Utensils, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
      case 'ENVIRONMENTAL': return { icon: Thermometer, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' };
      default: return { icon: Eye, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
          <ClipboardList className="text-emerald-600" size={18} /> Husbandry & Care Timeline
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200">
          Showing Last {logs.length} Entries
        </span>
      </div>

      <div className="space-y-4 pt-2">
        {logs.map((log: any) => {
          const config = getLogConfig(log.log_type);
          const Icon = config.icon;
          
          return (
            <div key={log.id} className="flex gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${config.bg} ${config.color} ${config.border}`}>
                <Icon size={18} />
              </div>

              <div className="flex-grow min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                  <div>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${config.bg} ${config.color} ${config.border}`}>
                      {log.log_type}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 mt-1.5 flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      {new Date(log.log_date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </h4>
                  </div>
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-100 h-max">
                    <User size={12} className="text-slate-400" /> {log.created_by?.substring(0, 8) || 'STAFF'}
                  </div>
                </div>

                {log.log_type === 'WEIGHT' && log.weight_grams !== null && (
                  <p className="text-lg font-black text-slate-900 mt-2">
                    {formatWeightDisplay(log.weight_grams, log.weight_unit || weightUnit)}
                  </p>
                )}
                
                {log.log_type === 'FEEDING' && log.feed_details && (
                  <div className="text-xs font-bold text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 mt-2">
                    Feed Administered: {log.feed_details.meals?.map((m: any) => `${m.quantity}x ${m.food_item}`).join(', ') || 'Standard Diet'}
                  </div>
                )}

                {log.notes && (
                  <p className="text-xs font-medium text-slate-600 mt-2 leading-relaxed">
                    {log.notes}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}