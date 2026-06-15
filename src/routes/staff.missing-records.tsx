import React, { useState, useMemo, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ClipboardList, Loader2, ChevronLeft, ChevronRight, AlertTriangle, Layers, RefreshCw, WifiOff, Stethoscope, Biohazard } from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { auditService } from '../services/auditService';

export const Route = createFileRoute('/staff/missing-records')({
  component: MissingRecordsPage,
});

export function MissingRecordsPage() {
  const CATEGORIES = useMemo(() => auditService.getValidSections(), []);
  
  const [baseDate, setBaseDate] = useState(new Date());
  const [selectedCategory, setSelectedCategory] = useState<string>(CATEGORIES[0]);

  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
  const daysInView = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);
  
  const startStr = format(weekStart, 'yyyy-MM-dd');
  const endStr = format(weekEnd, 'yyyy-MM-dd');

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['audit_records', startStr, endStr],
    queryFn: () => auditService.getAuditData(startStr, endStr),
    staleTime: 1000 * 60 * 5, 
    gcTime: 1000 * 60 * 60 * 24 * 14, 
    networkMode: 'offlineFirst', 
    meta: { persist: true } 
  });

  const logMap = useMemo(() => {
    if (!data?.logs) return {};
    const map: Record<string, any> = {};
    data.logs.forEach((log: any) => {
      if (!log.log_date) return;
      const localDate = new Date(log.log_date);
      const dateKey = format(localDate, 'yyyy-MM-dd'); 
      map[`${log.animal_id}_${dateKey}`] = log;
    });
    return map;
  }, [data]);

  const filteredAnimals = useMemo(() => {
    if (!data?.animals) return [];
    return data.animals.filter((a: any) => a.category === selectedCategory);
  }, [data?.animals, selectedCategory]);

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
          <button 
            onClick={() => refetch()} 
            disabled={isLoading || isRefetching}
            className="p-2.5 text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded-xl transition-colors border border-slate-200 disabled:opacity-50"
            title="Force Sync"
          >
            {isRefetching ? <Loader2 size={16} className="animate-spin text-indigo-600" /> : <RefreshCw size={16} />}
          </button>
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
          <Layers size={14} /> Filter Category:
        </div>
        {CATEGORIES.map(category => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border ${
              selectedCategory === category 
                ? 'bg-indigo-600 border-indigo-600 text-white' 
                : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {category}
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
        
        {isLoading && !data && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm">
            <Loader2 className="animate-spin text-indigo-600 mb-3" size={32} />
          </div>
        )}

        {isError && !data && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm p-6 text-center">
             <WifiOff size={32} className="text-rose-500 mb-2" />
             <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-1">Offline & No Cache</h3>
             <p className="text-xs font-bold text-slate-500 max-w-lg mb-4">
               {error instanceof Error ? error.message : JSON.stringify(error)}
             </p>
             <button onClick={() => refetch()} className="px-5 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2">
               <RefreshCw size={14} /> Retry Sync
             </button>
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
            {filteredAnimals.length === 0 && !isLoading ? (
               <div className="p-10 text-center text-xs font-bold uppercase tracking-widest text-slate-400 flex flex-col items-center justify-center gap-3 mt-10">
                 No active animals mapped to category: {selectedCategory}.
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
                      {/* Biosecurity Flags Injected Here */}
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-xs font-black text-slate-900 truncate">{animal.name}</span>
                        {animal.biosecurityStatus === 'quarantine' && (
                          <Biohazard size={14} className="text-rose-600 drop-shadow-sm shrink-0" title="Quarantine (Infectious)" />
                        )}
                        {animal.biosecurityStatus === 'isolation' && (
                          <Stethoscope size={14} className="text-amber-500 drop-shadow-sm shrink-0" title="Medical Isolation" />
                        )}
                      </div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest truncate mt-0.5">{animal.species}</span>
                    </div>

                    {daysInView.map((date, i) => {
                      const dateKey = format(date, 'yyyy-MM-dd');
                      const log = logMap[`${animal.id}_${dateKey}`];
                      
                      const hasLog = !!log;
                      const weightValid = hasLog && (Number(log.weight_grams) > 0 || log.weight_not_required === true);
                      const feedValid = hasLog && (!!log.feed_details && String(log.feed_details).trim() !== '');

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