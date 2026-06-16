import React from 'react';
import { useNavigate, Outlet, useLocation, createFileRoute } from '@tanstack/react-router';
import { 
  ShieldCheck, Users, FileText, 
  List, Building, History, Activity
} from 'lucide-react';
import { useAuth } from '../lib/auth';

export const Route = createFileRoute('/settings')({
  component: SettingsLayout,
});

function SettingsLayout() {
  const navigate = useNavigate({ from: Route.fullPath });
  const location = useLocation();
  const { profile } = useAuth();
  
  // Role-based access control for tabs
  const isManager = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.role === 'HR';
  const isAdmin = profile?.role === 'ADMIN';

  const tabs = [
    { id: 'organization', label: 'Organisation Profile', icon: Building, show: true },
    { id: 'directory', label: 'Directory', icon: Users, show: isManager },
    { id: 'lists', label: 'Operational Lists', icon: List, show: true },
    { id: 'health', label: 'System Health', icon: Activity, show: true },
    { id: 'access', label: 'Access Control', icon: ShieldCheck, show: isAdmin },
    { id: 'zla', label: 'ZLA Documents', icon: FileText, show: isManager },
    { id: 'changelog', label: 'Changelog', icon: History, show: true },
  ];

  const visibleTabs = tabs.filter(t => t.show);
  const currentTab = location.pathname.split('/').pop() || 'organization';

  return (
    <div className="p-2 md:p-4 max-w-[1920px] mx-auto space-y-6 pb-24">
      <h1 className="text-3xl font-bold text-slate-900">System Settings</h1>
      
      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Navigation (Identical RC6 UI) */}
        <nav className="w-full md:w-64 space-y-1 shrink-0">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate({ to: `/settings/${t.id}` })}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                currentTab === t.id 
                  ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50' 
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <t.icon size={18} className={currentTab === t.id ? 'text-blue-600' : 'text-slate-400'} />
              {t.label}
            </button>
          ))}
        </nav>

        {/* Main Content Area */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}