import React, { useState, useMemo, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ClipboardList, Loader2, ChevronLeft, ChevronRight, AlertTriangle, Layers } from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { auditService } from '../services/auditService';

export const Route = createFileRoute('/staff/missing-records')({
  component: MissingRecordsPage,
});

export function MissingRecordsPage() {
  const SECTIONS = useMemo(() => auditService.getValidSections(), []);
  
  const [baseDate, setBaseDate] = useState(new Date());
  const [selectedSection, setSelectedSection] = useState<string>(SECTIONS[0]);

  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
  const daysInView = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);
  
  const startStr = format(weekStart, 'yyyy-MM-dd');
  const endStr = format(weekEnd, 'yyyy-MM-dd');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit_records', startStr, endStr],
    queryFn: () => auditService.getAuditData(startStr, endStr),
    staleTime: 1000 * 60 * 5, 
  });

  const logMap = useMemo(() => {
    if (!data?.logs) return {};
    const map: Record<string, any> = {};
    data.logs.forEach((log: any) => {
      if (!log.log_date) return;
      const dateKey = String(log.log_date).substring(0, 10); 
      map[`${log.animal_id}_${dateKey}`] = log;
    });
    return map;
  }, [data]);

  // Instant memory filter using exact database fields
  const filteredAnimals = useMemo(() => {
    if (!data?.animals) return [];
    return data.animals.filter((a: any) => a.section === selectedSection);
  }, [data?.animals, selectedSection]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredAnimals.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  const handlePrev = () => setBaseDate(addDays(baseDate, -7));
  const handleNext = () => setBaseDate(addDays(baseDate, 7));

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20 font-sans">
      
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
            <ClipboardList className="text-indigo-600" /> Missing Records
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Compliance Audit Matrix</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
             <button onClick={handlePrev} className="p-2.5 hover:bg-slate-50 border-r border-slate-200 text-slate-600 transition-colors"><ChevronLeft size={16}/></button>
             <span className="px-4 text-[11px] font-black uppercase tracking-widest text-slate-700 w-44 text-center">
                W/C {format(weekStart, 'dd MMM yyyy')}
             </span>
             <button onClick={handleNext} className="p-2.5 hover:bg-slate-50 border-l border-slate-200 text-slate-600 transition-colors"><ChevronRight size={16}/></button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-500 border border-slate-200">
          <Layers size={14} /> Filter Section:
        </div>
        {SECTIONS.map(section => (
          <button
            key={section}
            onClick={() => setSelectedSection(section)}
            className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border ${
              selectedSection === section 
                ? 'bg-indigo-600 border-indigo-600 text-white' 
                : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {section}
          </button>
        ))}
      </div>

      <div className="flex justify-end gap-6 px-2">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
           <div className="w-3 h-3 rounded bg-emerald-500"></div> Logged / N/A
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
           <div className="w-3 h-3 rounded bg-rose-500"></div> Missing
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-16rem)] min-h-[500px] relative">
        
        {isLoading && !isError && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm">
            <Loader2 className="animate-spin text-indigo-600 mb-3" size={32} />
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm p-6 text-center">
             <AlertTriangle size={32} className="text-rose-500 mb-2" />
             <p className="text-xs font-bold text-slate-500">Database fetch failed. Verify network connection.</p>
          </div>
        )}

        <div className="flex sticky top-0 z-30 bg-slate-50 border-b border-slate-200 shadow-sm shrink-0">
          <div className="w-64 shrink-0 p-4 border-r border-slate-200 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] flex items-center">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Animal</span>
          </div>
          {daysInView.map((d, i) => {
            const isToday = isSameDay(d, new Date());
            return (
              <div key={i} className={`flex-1 p-3 flex flex-col items-center justify-center border-r border-slate-200 ${isToday ? 'bg-indigo-50/50' : ''}`}>
                <span className={`text-[9px] font-black uppercase tracking-widest ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>{format(d, 'EEE')}</span>
                <span className={`text-sm font-black tracking-tight ${isToday ? 'text-indigo-700' : 'text-slate-900'}`}>{format(d, 'dd MMM')}</span>
              </div>
            );
          })}
        </div>

        <div ref={parentRef} className="flex-1 overflow-auto custom-scrollbar">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {filteredAnimals.length === 0 && !isLoading && !isError ? (
               <div className="p-10 text-center text-xs font-bold uppercase tracking-widest text-slate-400 flex flex-col items-center justify-center gap-3 mt-10">
                 No animals located for section: {selectedSection}.
               </div>
            ) : (
              rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const animal = filteredAnimals[virtualRow.index];
                
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-64 shrink-0 p-3 border-r border-slate-200 bg-white sticky left-0 z-20 flex flex-col justify-center shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)]">
                      <span className="text-xs font-black text-slate-900 truncate">{animal.name}</span>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest truncate">{animal.species}</span>
                    </div>

                    {daysInView.map((date, i) => {
                      const dateKey = format(date, 'yyyy-MM-dd');
                      const log = logMap[`${animal.id}_${dateKey}`];
                      
                      const hasLog = !!log;
                      const weightValid = hasLog && (Number(log.weight) > 0 || log.weight_not_required === true);
                      const feedValid = hasLog && log.fed === true;

                      return (
                        <div key={i} className="flex-1 p-2 border-r border-slate-100 flex items-center justify-center">
                          <div className="w-full max-w-[80px] h-8 flex rounded-lg overflow-hidden shadow-sm border border-slate-200 bg-slate-100" title={`W: Weight | F: Feed\nDate: ${dateKey}`}>
                            <div className={`w-1/2 flex items-center justify-center border-r border-white/20 transition-colors ${weightValid ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                              <span className="text-[10px] font-black text-white/90">W</span>
                            </div>
                            <div className={`w-1/2 flex items-center justify-center transition-colors ${feedValid ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                              <span className="text-[10px] font-black text-white/90">F</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}