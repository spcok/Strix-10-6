import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Animal } from '../../types';
import { Users, Scale, X, MapPin, Activity, ListOrdered, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface MobProfileProps {
  mob: Animal;
  onClose: () => void;
}

export function MobProfile({ mob, onClose }: MobProfileProps) {
  
  // Fetch all individuals belonging to this mob
  const { data: members = [], isLoading: isMembersLoading } = useQuery({
    queryKey: ['mob_members', mob.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('*')
        .eq('parent_group_id', mob.id)
        .eq('is_deleted', false)
        .eq('status', 'ACTIVE');
      
      if (error) throw error;
      return data as Animal[];
    }
  });

  // Fetch logs applied directly to the mob UUID
  const { data: mobLogs = [], isLoading: isLogsLoading } = useQuery({
    queryKey: ['strict_logs', mob.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('animal_id', mob.id)
        .eq('is_deleted', false)
        .order('log_date', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data;
    }
  });

  // ------------------------------------------------------------------
  // ROLL-UP AGGREGATION ENGINE
  // ------------------------------------------------------------------
  const metrics = useMemo(() => {
    let males = 0;
    let females = 0;
    let unknowns = 0;
    let totalWeight = 0;
    let weighCount = 0;

    members.forEach(m => {
      if (m.gender === 'M') males++;
      else if (m.gender === 'F') females++;
      else unknowns++;

      if (m.flying_weight) {
        totalWeight += m.flying_weight;
        weighCount++;
      }
    });

    const avgWeight = weighCount > 0 ? Math.round(totalWeight / weighCount) : 0;
    const mfu = `${males}.${females}.${unknowns}`;

    return { headcount: members.length, mfu, avgWeight, unit: members[0]?.weight_unit || 'g' };
  }, [members]);

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-50 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center border border-blue-200 shadow-sm">
              <Users size={24} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">{mob.name}</h2>
                <span className="bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-blue-200">Colony / Mob</span>
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">{mob.species || 'Unknown Species'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* Biometric Roll-Ups */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><ListOrdered size={20} /></div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Demographic (M.F.U)</p>
                <p className="text-xl font-black text-slate-900 mt-1">{metrics.mfu}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Scale size={20} /></div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Avg Individual Weight</p>
                <p className="text-xl font-black text-slate-900 mt-1">
                  {metrics.avgWeight > 0 ? `${metrics.avgWeight}${metrics.unit}` : '--'}
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-100 text-slate-600 rounded-xl"><MapPin size={20} /></div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Enclosure Base</p>
                <p className="text-sm font-bold text-slate-900 mt-1 truncate">{mob.location || 'Unassigned'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Members List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-96">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Activity size={14} className="text-blue-500" /> Active Members ({metrics.headcount})
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {isMembersLoading ? (
                  <div className="p-4 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">Loading members...</div>
                ) : members.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No active individuals assigned.</div>
                ) : (
                  <div className="space-y-1">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl border border-transparent hover:border-slate-100 transition-colors">
                        <span className="text-sm font-bold text-slate-900">{m.name}</span>
                        <div className="flex gap-3 text-xs font-bold text-slate-500">
                          <span>{m.gender || 'U'}</span>
                          <span className="w-16 text-right">{m.flying_weight ? `${m.flying_weight}${m.weight_unit || 'g'}` : '--'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Mob-Level Logs */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-96">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <FileText size={14} className="text-emerald-500" /> Group Husbandry Logs
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {isLogsLoading ? (
                  <div className="p-4 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">Loading logs...</div>
                ) : mobLogs.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No group-level logs found.</div>
                ) : (
                  <div className="space-y-2">
                    {mobLogs.map((log: any) => (
                      <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{log.log_type}</span>
                          <span className="text-[10px] font-bold text-slate-400">{format(parseISO(log.log_date), 'dd MMM yyyy HH:mm')}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-700">{log.notes || 'No notes provided.'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}