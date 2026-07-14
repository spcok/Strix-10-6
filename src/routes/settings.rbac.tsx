import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, CheckSquare, Square, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const Route = createFileRoute('/settings/rbac')({
  component: RBACMatrixPage,
});

// ------------------------------------------------------------------
// EXHAUSTIVE SYSTEM PERMISSION REGISTRY
// ------------------------------------------------------------------
const PERMISSION_REGISTRY = [
  {
    module: 'Husbandry & Care',
    actions: [
      { key: 'husbandry:read', label: 'View Daily Logs, Rounds & Feeding' },
      { key: 'husbandry:write', label: 'Submit Daily Logs, Weights & Feeding' },
      { key: 'animals:write', label: 'Add/Edit Animal Profiles & Census' },
      { key: 'husbandry:delete', label: 'Purge Erroneous Logs & Archive Animals' },
    ]
  },
  {
    module: 'Clinical & Medical',
    actions: [
      { key: 'clinical:read', label: 'View Medical History & Active MARs' },
      { key: 'clinical:write', label: 'Log Medical Administrations & Treatments' },
      { key: 'clinical:prescribe', label: 'Issue Prescriptions / ZLA Vet Sign-Off' },
    ]
  },
  {
    module: 'Logistics & Movements',
    actions: [
      { key: 'logistics:read', label: 'View Internal Moves & Transfer Audits' },
      { key: 'logistics:write', label: 'Request Internal Animal Movements' },
      { key: 'logistics:approve', label: 'Approve Internal & External Transfers' },
    ]
  },
  {
    module: 'Safety & Compliance',
    actions: [
      { key: 'safety:read', label: 'View Incident Logs, Drills & Maintenance' },
      { key: 'safety:write', label: 'Submit Incident Reports & Record Drills' },
      { key: 'safety:manage', label: 'Investigate Incidents & Schedule Drills' },
      { key: 'maintenance:write', label: 'Create, Assign & Close Maintenance Tickets' },
    ]
  },
  {
    module: 'HR & Staffing',
    actions: [
      { key: 'hr:read', label: 'View Rotas, Shifts & Staff Directory' },
      { key: 'hr:write', label: 'Publish Rotas & Draft Staff Schedules' },
      { key: 'hr:approve', label: 'Approve Leave Requests & Finalize Timesheets' },
      { key: 'hr:sensitive', label: 'View Medical Disclosures & HR Notes' },
    ]
  },
  {
    module: 'System Administration',
    actions: [
      { key: 'admin:users', label: 'Provision & Deactivate User Accounts' },
      { key: 'admin:settings', label: 'Edit ZLA Config, Lists & DB Schema' },
    ]
  }
];

export function RBACMatrixPage() {
  const queryClient = useQueryClient();

  const { data: matrix = [], isLoading } = useQuery({
    queryKey: ['rbac_matrix'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rbac_matrix').select('*');
      if (error) throw error;
      return data;
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ role, permissions }: { role: string, permissions: string[] }) => {
      const { error } = await supabase
        .from('rbac_matrix')
        .update({ permissions })
        .eq('role', role);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rbac_matrix'] });
      queryClient.invalidateQueries({ queryKey: ['rbac_permissions'] }); // Hot-swaps active sessions instantly
    },
  });

  const togglePermission = (role: string, currentPerms: string[], permKey: string) => {
    const updated = currentPerms.includes(permKey)
      ? currentPerms.filter(p => p !== permKey)
      : [...currentPerms, permKey];
      
    updateMutation.mutate({ role, permissions: updated });
  };

  // Sort roles alphabetically to ensure consistent column ordering
  const displayRoles = [...matrix].sort((a, b) => a.role.localeCompare(b.role));

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      
      <div className="border-b-2 border-slate-200 pb-6">
        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
          <ShieldCheck className="text-emerald-600" size={24} /> Role-Based Access Matrix
        </h3>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Configure Granular System Permissions</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
           <div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-full">
              
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 w-[400px] text-xs font-black text-slate-900 uppercase tracking-widest border-r border-slate-200">Module Capabilities</th>
                  {displayRoles.map(r => (
                    <th key={r.role} className="px-6 py-4 text-center min-w-[150px]">
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm inline-block">
                        {r.role.replace('_', ' ')}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {PERMISSION_REGISTRY.map((moduleGroup, gIdx) => (
                  <React.Fragment key={gIdx}>
                    {/* Category Header Row */}
                    <tr className="bg-slate-50">
                      <td colSpan={displayRoles.length + 1} className="px-6 py-3 text-[10px] font-black text-emerald-700 uppercase tracking-widest border-y border-slate-200">
                        {moduleGroup.module}
                      </td>
                    </tr>
                    
                    {/* Specific Permission Rows */}
                    {moduleGroup.actions.map((action, aIdx) => (
                      <tr key={aIdx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 border-r border-slate-100">
                          <p className="font-bold text-slate-700">{action.label}</p>
                          <p className="text-[9px] font-black text-slate-400 font-mono tracking-widest mt-0.5">{action.key}</p>
                        </td>
                        
                        {displayRoles.map(roleData => {
                          const hasPerm = roleData.permissions.includes(action.key) || roleData.permissions.includes('*');
                          
                          return (
                            <td key={roleData.role} className="px-6 py-4 text-center">
                              <button
                                onClick={() => togglePermission(roleData.role, roleData.permissions, action.key)}
                                disabled={updateMutation.isPending}
                                className="inline-flex p-1.5 rounded-lg transition-all hover:bg-slate-100 cursor-pointer"
                                title={`Toggle ${action.key} for ${roleData.role}`}
                              >
                                {hasPerm ? (
                                  <CheckSquare size={24} className="text-emerald-500" />
                                ) : (
                                  <Square size={24} className="text-slate-300" />
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
    </div>
  );
}