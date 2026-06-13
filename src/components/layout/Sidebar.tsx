import React, { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useAuth } from '../../lib/auth';
import { 
  LayoutDashboard, PawPrint, Stethoscope, ClipboardList, ShieldAlert,
  CalendarDays, Apple, Syringe, Activity, BriefcaseMedical, AlertTriangle, 
  Wrench, Users, Clock, CalendarHeart, FileBadge, FileWarning, 
  BarChart3, Settings, HelpCircle, ChevronDown, ChevronRight, HeartPulse,
  Utensils, LogOut, MapPin, ArrowRightLeft
} from 'lucide-react';

const navGroups = [
  {
    title: 'Husbandry',
    icon: PawPrint,
    items: [
      { name: 'Daily Logs', to: '/husbandry/daily-logs', icon: ClipboardList },
      { name: 'Daily Rounds', to: '/husbandry/rounds', icon: CalendarDays },
      { name: 'Feeding Schedule', to: '/husbandry/feeding', icon: Utensils },
    ]
  },
  {
    title: 'Logistics',
    icon: MapPin,
    items: [
      { name: 'Internal Moves', to: '/logistics/internal-movements', icon: ArrowRightLeft },
      { name: 'Ext. Transfers', to: '/logistics/external-transfers', icon: ArrowRightLeft },
    ]
  },
  {
    title: 'Clinical and Medical',
    icon: Stethoscope,
    items: [
      { name: 'Clinical Records', to: '/clinical/records', icon: HeartPulse },
      { name: 'Medication', to: '/clinical/medication', icon: Syringe },
      { name: 'Quarantine and Isolation', to: '/clinical/isolation', icon: ShieldAlert },
    ]
  },
  {
    title: 'Safety and Compliance',
    icon: AlertTriangle,
    items: [
      { name: 'First Aid', to: '/safety/first-aid', icon: BriefcaseMedical },
      { name: 'Incidents', to: '/safety/incidents', icon: AlertTriangle },
      { name: 'Safety Drills', to: '/safety/drills', icon: Activity },
      { name: 'Maintenance', to: '/safety/maintenance', icon: Wrench },
    ]
  },
  {
    title: 'Staff',
    icon: Users,
    items: [
      { name: 'Timesheets', to: '/staff/timesheets', icon: Clock },
      { name: 'Rota', to: '/staff/rota', icon: CalendarDays },
      { name: 'Holidays & Absence', to: '/staff/leave', icon: CalendarHeart },
      { name: 'ZLA Compliance', to: '/staff/zla', icon: FileBadge },
      { name: 'Missing Records', to: '/staff/missing-records', icon: FileWarning },
      { name: 'Staff Shifts', to: '/staff/shifts', icon: Wrench },
    ]
  },
  {
    title: 'Admin',
    icon: Settings,
    items: [
      { name: 'Reports', to: '/staff/reports', icon: BarChart3 },
      { name: 'Settings', to: '/admin/settings', icon: Settings },
      { name: 'Help', to: '/admin/help', icon: HelpCircle },
    ]
  }
];

interface NavGroupProps {
  key?: string;
  group: typeof navGroups[0];
  isOpen: boolean;
  showDivider: boolean;
}

function NavGroup({ group, isOpen, showDivider }: NavGroupProps) {
  const [isGroupOpen, setIsGroupOpen] = useState(true);

  return (
    <div className="mb-2">
      {isOpen ? (
        <button 
          onClick={() => setIsGroupOpen(!isGroupOpen)} 
          className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-colors"
        >
          <div className="flex items-center gap-2">
            <group.icon size={14} />
            {group.title}
          </div>
          {isGroupOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ) : (
        showDivider && <div className="h-px bg-slate-800/80 mx-4 my-3" />
      )}
      
      {(isGroupOpen || !isOpen) && (
        <div className="mt-1 space-y-1">
          {group.items.map((item) => (
            <Link
              key={item.name}
              to={item.to as any}
              title={!isOpen ? item.name : undefined}
              className={`flex items-center ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'} py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors group [&.active]:bg-emerald-500/10 [&.active]:text-emerald-400`}
            >
              <item.icon size={18} className="shrink-0 transition-colors group-[&.active]:text-emerald-400" />
              {isOpen && <span className="truncate">{item.name}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ isOpen }: { isOpen: boolean }) {
  const { session, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
  };

  return (
    <div className={`transition-all duration-300 shrink-0 ${isOpen ? 'w-64' : 'w-20'} bg-[#0F1117] border-r border-slate-800/80 flex flex-col h-full overflow-hidden`}>
      <div className={`h-16 flex items-center ${isOpen ? 'px-6' : 'justify-center'} border-b border-slate-800/80 shrink-0 transition-all`}>
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-[#0A0B0E] border border-slate-800/80 flex items-center justify-center shadow-inner shrink-0">
            <PawPrint size={16} className="text-emerald-500" />
          </div>
          {isOpen && (
            <span className="font-black text-white tracking-tight uppercase whitespace-nowrap">
              Strix<span className="text-emerald-500">OS</span>
            </span>
          )}
        </div>
      </div>
      
      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
        <Link
          to="/"
          title={!isOpen ? "Dashboard" : undefined}
          className={`flex items-center ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'} py-2.5 mb-4 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors group [&.active]:bg-emerald-500/10 [&.active]:text-emerald-400`}
          activeOptions={{ exact: true }}
        >
          <LayoutDashboard size={18} className="shrink-0 transition-colors group-[&.active]:text-emerald-400" />
          {isOpen && <span>Dashboard</span>}
        </Link>
        
        {navGroups.map((group, index) => (
          <NavGroup key={group.title} group={group} isOpen={isOpen} showDivider={index !== 0} />
        ))}
      </nav>

      {session && (
        <div className="p-4 border-t border-slate-800/80 shrink-0">
          <button 
            onClick={handleSignOut}
            title={!isOpen ? "Sign Out" : undefined}
            className={`w-full flex items-center ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'} py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-rose-400 hover:bg-rose-50 border border-transparent hover:border-rose-500/10 transition-all`}
          >
            <LogOut size={16} className="shrink-0" />
            {isOpen && <span>Sign Out</span>}
          </button>
        </div>
      )}
    </div>
  );
}