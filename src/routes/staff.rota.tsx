import React, { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Calendar as CalendarIcon, Loader2, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { format, addDays, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { rotaService } from '../services/rotaService';
import { useAuth } from '../lib/auth';

export const Route = createFileRoute('/staff/rota')({
  component: RotaPage,
});

function RotaPage() {
  const { profile } = useAuth();
  const isManager = profile?.role === 'ADMIN' || profile?.role === 'MANAGER';
  const [view, setView] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [baseDate, setBaseDate] = useState(new Date());

  const startStr = format(addDays(baseDate, -7), 'yyyy-MM-dd');
  const endStr = format(addDays(baseDate, 21), 'yyyy-MM-dd');
  const daysInView = eachDayOfInterval({ start: addDays(baseDate, -7), end: addDays(baseDate, 21) });

  const { data, isLoading } = useQuery({
    queryKey: ['rota', startStr, endStr],
    queryFn: () => rotaService.getRotaData(startStr, endStr)
  });

  const { shiftMap, leaveMap } = useMemo(() => {
    if (!data) return { shiftMap: {}, leaveMap: {} };
    const sMap: Record<string, any> = {};
    const lMap: Record<string, any> = {};

    data.shifts.forEach((s: any) => {
      const d = format(parseISO(s.start_time), 'yyyy-MM-dd');
      sMap[`${s.user_id}_${d}`] = s;
    });

    data.leave.forEach((l: any) => {
      const days = eachDayOfInterval({ start: parseISO(l.start_date), end: parseISO(l.end_date) });
      days.forEach(d => lMap[`${l.user_id}_${format(d, 'yyyy-MM-dd')}`] = l);
    });

    return { shiftMap: sMap, leaveMap: lMap };
  }, [data]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
          <CalendarIcon className="text-indigo-600" /> Shift Rota
        </h1>
        <div className="flex items-center gap-4">
           <div className="bg-slate-100 p-1 rounded-xl">
            {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg ${view === v ? 'bg-white shadow-sm' : ''}`}>{v}</button>
            ))}
          </div>
          <div className="flex border rounded-xl overflow-hidden">
             <button onClick={() => setBaseDate(addDays(baseDate, -7))} className="p-2 hover:bg-slate-50 border-r"><ChevronLeft size={16}/></button>
             <button onClick={() => setBaseDate(addDays(baseDate, 7))} className="p-2 hover:bg-slate-50"><ChevronRight size={16}/></button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-[600px] flex flex-col relative">
        {isLoading && <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/80"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>}
        
        <div className="overflow-auto custom-scrollbar">
          <div className="min-w-max">
            <div className="flex sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <div className="w-48 shrink-0 p-4 border-r font-black text-[10px] uppercase">Staff</div>
              {daysInView.map((d, i) => (
                <div key={i} className="w-32 shrink-0 p-3 text-center text-[10px] font-black uppercase border-r">{format(d, 'dd MMM')}</div>
              ))}
            </div>

            <div className="divide-y divide-slate-100">
              {data?.staff.map((staff: any) => (
                <div key={staff.id} className="flex hover:bg-slate-50/50" style={{ contentVisibility: 'auto' }}>
                  <div className="w-48 shrink-0 p-3 border-r font-bold text-xs sticky left-0 bg-white z-10">{staff.name}</div>
                  {daysInView.map((date, i) => {
                    const k = `${staff.id}_${format(date, 'yyyy-MM-dd')}`;
                    const leave = leaveMap[k];
                    const shift = shiftMap[k];
                    return (
                      <div key={i} className="w-32 shrink-0 p-2 border-r min-h-[60px]">
                        {leave ? (
                          <div className={`p-2 rounded text-center text-[9px] font-black uppercase ${leave.leave_type === 'SICK' ? 'bg-rose-100' : 'bg-amber-100'}`}>
                            {leave.leave_type}
                          </div>
                        ) : shift ? (
                          <div className="p-2 rounded bg-white border text-center relative group">
                            <p className="text-[10px] font-black">{format(parseISO(shift.start_time), 'HH:mm')}-{format(parseISO(shift.end_time), 'HH:mm')}</p>
                            {isManager && (
                                <button onClick={() => rotaService.deleteShift(shift.id)} className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 bg-rose-100 text-rose-600 rounded-full p-0.5"><Trash2 size={10}/></button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}