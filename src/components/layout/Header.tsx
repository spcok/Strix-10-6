import React, { useState } from 'react';
import { Menu, Play, Square, Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';

interface HeaderProps {
  toggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export function Header({ toggleSidebar, isSidebarOpen }: HeaderProps) {
  const { user } = useAuth(); 
  const [isProcessing, setIsProcessing] = useState(false);

  // TEMPORARY STUBS: These will be wired up in Phase 4 when we build the Mutation Queue
  const pendingMutations = 0;
  const activeShift = null;
  const checkingShift = false;

  const handleClockAction = async () => {
    if (!user?.id) return;
    setIsProcessing(true);
    
    // Stub timeout to simulate visual interaction without actual API calls yet
    setTimeout(() => {
      setIsProcessing(false);
    }, 500);
  };

  return (
    <header className="h-16 bg-slate-100 border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 sticky top-0 transition-all duration-300">
      
      {/* LEFT SIDE: Toggle, Shift Controls & Sync Status */}
      <div className="flex items-center gap-4">
        
        {/* SIDEBAR TOGGLE BUTTON */}
        <button 
          onClick={toggleSidebar}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors"
          aria-label="Toggle Sidebar"
        >
          <Menu size={20} />
        </button>

        {user?.id && (
          <button 
            onClick={handleClockAction}
            disabled={isProcessing || checkingShift}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 ${
              activeShift 
                ? 'bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-200' 
                : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border border-emerald-200'
            }`}
          >
            {isProcessing || checkingShift ? <Loader2 size={14} className="animate-spin" /> : activeShift ? <Square size={14} /> : <Play size={14} />}
            {activeShift ? 'Clock Out' : 'Clock In'}
          </button>
        )}

        {/* OFFLINE SYNC BADGE */}
        {pendingMutations > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 border border-amber-200 rounded-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
              Sync Pending ({pendingMutations})
            </span>
          </div>
        )}
      </div>

      {/* RIGHT SIDE: User Info ONLY */}
      <div className="flex items-center gap-4">
        <span className="text-slate-500 font-bold text-xs uppercase tracking-widest hidden sm:block">
          {user?.email || 'Academy Staff'}
        </span>
      </div>
      
    </header>
  );
}