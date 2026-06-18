import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Shield, Users, Key, Plus, Search, Loader2, Edit, UserX, UserCheck, Phone, AlertCircle, X, CheckSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { User } from '../types';
import { format } from 'date-fns';

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const usersOptions = queryOptions({
  queryKey: ['internal_users'],
  queryFn: async () => {
    const { data, error } = await supabase.from('users').select('*').order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as User[];
  },
  staleTime: 1000 * 60 * 60, gcTime: 1000 * 60 * 60 * 24 * 15, networkMode: 'offlineFirst', meta: { persist: true }
});

const permissionsOptions = queryOptions({
  queryKey: ['role_permissions'],
  queryFn: async () => {
    const { data, error } = await supabase.from('role_permissions').select('*');
    if (error) throw error;
    return data || [];
  },
  staleTime: 1000 * 60 * 60, gcTime: 1000 * 60 * 60 * 24 * 15, networkMode: 'offlineFirst', meta: { persist: true }
});

export const Route = createFileRoute('/settings/access')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    await Promise.all([
      queryClient.ensureQueryData(usersOptions),
      queryClient.ensureQueryData(permissionsOptions)
    ]);
  },
  component: AccessControlPage,
});

// ------------------------------------------------------------------
// 2. MAIN COMPONENT
// ------------------------------------------------------------------
export function AccessControlPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalState, setModalState] = useState<{ isOpen: boolean; user: Partial<User> | null }>({ isOpen: false, user: null });

  // Sync Engine
  useEffect(() => {
    const channel1 = supabase.channel('users-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => queryClient.invalidateQueries({ queryKey: ['internal_users'] })).subscribe();
    const channel2 = supabase.channel('perms-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'role_permissions' }, () => queryClient.invalidateQueries({ queryKey: ['role_permissions'] })).subscribe();
    return () => { supabase.removeChannel(channel1); supabase.removeChannel(channel2); };
  }, [queryClient]);

  const { data: users = [], isLoading: usersLoading } = useQuery(usersOptions);

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string, is_active: boolean }) => {
      const { error } = await supabase.from('users').update({ is_active, is_deleted: !is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['internal_users'] })
  });

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const lower = searchQuery.toLowerCase();
    return users.filter(u => (u.name || '').toLowerCase().includes(lower) || (u.email || '').toLowerCase().includes(lower) || (u.role || '').toLowerCase().includes(lower));
  }, [users, searchQuery]);

  const rowVirtualizer = useWindowVirtualizer({ count: filteredUsers.length, estimateSize: () => 100, overscan: 5 });

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      
      <div className="border-b-2 border-slate-200 pb-6">
        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
          <Shield size={28} className="text-indigo-600" /> Access & Security
        </h3>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Manage staff accounts and dynamic RBAC permissions</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200 pb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'users' ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' : 'text-slate-600 hover:bg-slate-50 border border-transparent'
          }`}
        >
          <Users size={16} /> Staff Directory
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'roles' ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' : 'text-slate-600 hover:bg-slate-50 border border-transparent'
          }`}
        >
          <Key size={16} /> Role Matrix
        </button>
      </div>

      {/* -----------------------------------------------------------
          TAB 1: USERS DIRECTORY
      ----------------------------------------------------------- */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Search staff..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm" 
              />
            </div>
            <button 
              onClick={() => setModalState({ isOpen: true, user: null })}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-sm shrink-0"
            >
              <Plus size={14} /> Provision Account
            </button>
          </div>

          <div className="min-h-[500px] relative">
            {usersLoading ? (
              <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-12 text-center text-slate-400 bg-white border-2 border-dashed border-slate-200 rounded-2xl">
                <Users size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-xs font-black uppercase tracking-widest">No Staff Found</p>
              </div>
            ) : (
              <div className="w-full relative" style={{ height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const u = filteredUsers[virtualRow.index];
                  const isActive = u.is_active !== false && u.is_deleted !== true;
                  return (
                    <div 
                      key={u.id} 
                      ref={rowVirtualizer.measureElement} 
                      data-index={virtualRow.index} 
                      className="absolute top-0 left-0 w-full py-2"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <div className={`bg-white p-5 rounded-2xl border ${isActive ? 'border-slate-200' : 'border-rose-200 bg-rose-50/30'} hover:border-indigo-300 transition-all shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${isActive ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-slate-200 text-slate-500'}`}>
                            {u.initials || u.name?.substring(0,2).toUpperCase() || '??'}
                          </div>
                          <div>
                            <h4 className="font-black text-slate-900 uppercase tracking-tight text-sm flex items-center gap-2">
                              {u.name} {!isActive && <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">Suspended</span>}
                            </h4>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mt-0.5">{u.role?.replace('_', ' ')}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                          {u.email && <div>{u.email}</div>}
                          {u.phone && <div>{u.phone}</div>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => setModalState({ isOpen: true, user: u })} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit size={16} /></button>
                          <button onClick={() => { if(window.confirm(`Toggle access for ${u.name}?`)) toggleStatusMutation.mutate({ id: u.id, is_active: !isActive }); }} disabled={toggleStatusMutation.isPending} className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${isActive ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                            {isActive ? <UserX size={16} /> : <UserCheck size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* -----------------------------------------------------------
          TAB 2: DYNAMIC ROLE MATRIX
      ----------------------------------------------------------- */}
      {activeTab === 'roles' && <RoleMatrixView />}

      {modalState.isOpen && <StaffModal onClose={() => setModalState({ isOpen: false, user: null })} user={modalState.user} />}
    </div>
  );
}

// ------------------------------------------------------------------
// ROLE MATRIX COMPONENT
// ------------------------------------------------------------------
function RoleMatrixView() {
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState('KEEPER');
  
  const { data: allPermissions = [], isLoading } = useQuery(permissionsOptions);

  const roles = ['DIRECTOR', 'ADMIN', 'SENIOR_KEEPER', 'KEEPER', 'VOLUNTEER'];
  const coreResources = [
    'animals', 'daily_logs', 'clinical_records', 'isolation_logs', 
    'timesheets', 'safety_drills', 'maintenance_tickets', 'users', 
    'organization_profile', 'external_directory', 'operational_lists'
  ];

  const upsertPermissionMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('role_permissions').upsert(payload, { onConflict: 'role, resource' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['role_permissions'] })
  });

  const handleToggle = (resource: string, field: string, currentValue: boolean) => {
    const existing = allPermissions.find((p: any) => p.role === selectedRole && p.resource === resource) || {
      role: selectedRole, resource, can_select: false, can_insert: false, can_update: false, can_delete: false
    };
    
    upsertPermissionMutation.mutate({
      ...existing,
      [field]: !currentValue
    });
  };

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>;

  const isLocked = selectedRole === 'ADMIN' || selectedRole === 'DIRECTOR';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      <div className="p-6 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h4 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2"><CheckSquare size={16} className="text-indigo-600"/> Granular Access Control</h4>
           <p className="text-xs font-medium text-slate-500 mt-1 max-w-lg">Modify these toggles to instantly update backend Supabase RLS policies for the selected role group.</p>
        </div>
        <select 
          value={selectedRole} 
          onChange={(e) => setSelectedRole(e.target.value)}
          className="bg-white border-2 border-indigo-200 rounded-xl px-4 py-2.5 text-xs font-black text-indigo-900 focus:outline-none focus:border-indigo-500 shadow-sm cursor-pointer"
        >
          {roles.map(r => <option key={r} value={r}>{r.replace('_', ' ')} CLEARANCE</option>)}
        </select>
      </div>

      <div className="overflow-x-auto w-full">
        <table className="w-full text-left min-w-[700px]">
          <thead className="bg-slate-100 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-6 py-4 w-1/3">Data Module (Resource)</th>
              <th className="px-6 py-4 text-center">Read (Select)</th>
              <th className="px-6 py-4 text-center">Create (Insert)</th>
              <th className="px-6 py-4 text-center">Edit (Update)</th>
              <th className="px-6 py-4 text-center text-rose-600">Delete</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {coreResources.map(resource => {
              const perm = allPermissions.find((p: any) => p.role === selectedRole && p.resource === resource) || {
                can_select: false, can_insert: false, can_update: false, can_delete: false
              };

              return (
                <tr key={resource} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-bold text-slate-900 font-mono">{resource}</td>
                  
                  {['can_select', 'can_insert', 'can_update', 'can_delete'].map((field) => (
                    <td key={field} className="px-6 py-4 text-center">
                      <input 
                        type="checkbox" 
                        disabled={isLocked || upsertPermissionMutation.isPending}
                        checked={isLocked ? true : perm[field]}
                        onChange={() => handleToggle(resource, field, perm[field])}
                        className={`w-5 h-5 rounded cursor-pointer transition-all ${isLocked ? 'opacity-30' : ''} ${field === 'can_delete' ? 'text-rose-500 focus:ring-rose-500' : 'text-indigo-500 focus:ring-indigo-500'}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isLocked && (
        <div className="p-3 bg-amber-50 text-amber-700 text-xs font-bold text-center border-t border-amber-200 uppercase tracking-widest">
          Director and Admin clearance cannot be modified. They possess absolute system authority.
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// HR / STAFF MODAL (TANSTACK FORM)
// ------------------------------------------------------------------
function StaffModal({ onClose, user }: { onClose: () => void, user: Partial<User> | null }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (user?.id) {
        // UPDATE EXISTING USER
        const upsertPayload = { 
          ...payload, 
          id: user.id, 
          is_active: payload.is_active ?? true, 
          is_deleted: !(payload.is_active ?? true) 
        };
        const { error } = await supabase.from('users').upsert(upsertPayload);
        if (error) throw error;
      } else {
        // PROVISION NEW USER VIA EDGE FUNCTION
        const { data, error } = await supabase.functions.invoke('provision-staff', {
          body: { payload }
        });
        
        if (error) throw new Error('Network failure connecting to Auth Server.');
        if (data?.error) throw new Error(data.error); 
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internal_users'] });
      onClose();
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to save staff record.')
  });

  const form = useForm({
    defaultValues: {
      name: user?.name || '', email: user?.email || '', initials: user?.initials || '', role: user?.role || 'KEEPER',
      phone: user?.phone || '', address: user?.address || '', pin: user?.pin || '',
      dob: user?.dob ? format(new Date(user.dob), 'yyyy-MM-dd') : '',
      start_date: user?.start_date ? format(new Date(user.start_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      end_date: user?.end_date ? format(new Date(user.end_date), 'yyyy-MM-dd') : '',
      emergency_contact_name: user?.emergency_contact_name || '', emergency_contact_phone: user?.emergency_contact_phone || '',
      hr_notes: user?.hr_notes || '', is_active: user?.is_active !== false,
    },
    onSubmit: async ({ value }) => { setErrorMsg(null); await saveMutation.mutateAsync(value); }
  });

  const inputClass = "w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all";
  const labelClass = "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5";
  const sectionTitle = "text-xs font-black uppercase tracking-widest text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2";

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
          <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2 text-lg">
            <Users size={20} className="text-indigo-600" /> {user ? 'Edit Staff Profile' : 'Provision Staff Account'}
          </h3>
          <button onClick={onClose} className="p-2 bg-white text-slate-400 hover:text-slate-700 rounded-full shadow-sm"><X size={16} /></button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">
          <form id="staff-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="space-y-8">
            {errorMsg && <div className="p-3 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 flex gap-2"><AlertCircle size={16}/> {errorMsg}</div>}
            <div>
              <h4 className={sectionTitle}><Shield size={16} className="text-indigo-500" /> Identity & Access</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <form.Field name="name" children={(field) => (<div className="md:col-span-2"><label className={labelClass}>Full Legal Name *</label><input required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} /></div>)} />
                <form.Field name="initials" children={(field) => (<div><label className={labelClass}>Initials *</label><input required maxLength={3} value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value.toUpperCase())} className={inputClass} /></div>)} />
                <form.Field name="role" children={(field) => (
                  <div>
                    <label className={labelClass}>System Role *</label>
                    <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                      <option value="DIRECTOR">Director</option>
                      <option value="ADMIN">Administrator</option>
                      <option value="SENIOR_KEEPER">Senior Keeper</option>
                      <option value="KEEPER">Keeper</option>
                      <option value="VOLUNTEER">Volunteer</option>
                    </select>
                  </div>
                )} />
                <form.Field name="email" children={(field) => (<div className="md:col-span-2"><label className={labelClass}>Professional Email *</label><input type="email" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} disabled={!!user?.id} className={`${inputClass} ${user?.id ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>)} />
                <form.Field name="pin" children={(field) => (<div className="md:col-span-2"><label className={labelClass}>4-Digit UI Soft-Lock PIN</label><input type="password" maxLength={4} placeholder="e.g. 1234" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} /></div>)} />
              </div>
            </div>
            <div>
              <h4 className={sectionTitle}><Phone size={16} className="text-emerald-500" /> Contact & Demographics</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <form.Field name="phone" children={(field) => (<div><label className={labelClass}>Mobile Phone</label><input value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} /></div>)} />
                <form.Field name="dob" children={(field) => (<div><label className={labelClass}>Date of Birth</label><input type="date" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} /></div>)} />
                <form.Field name="address" children={(field) => (<div className="md:col-span-2"><label className={labelClass}>Residential Address</label><textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none`} /></div>)} />
              </div>
            </div>
            <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
              <h4 className="text-xs font-black uppercase tracking-widest text-rose-900 mb-4 pb-2 border-b border-rose-200/50 flex items-center gap-2"><AlertCircle size={16} className="text-rose-600" /> Emergency Contact</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <form.Field name="emergency_contact_name" children={(field) => (<div><label className={`${labelClass} !text-rose-700`}>Contact Name</label><input value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} !bg-white !border-rose-200`} /></div>)} />
                <form.Field name="emergency_contact_phone" children={(field) => (<div><label className={`${labelClass} !text-rose-700`}>Contact Phone</label><input value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} !bg-white !border-rose-200`} /></div>)} />
              </div>
            </div>
            <div>
              <h4 className={sectionTitle}>Human Resources</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <form.Field name="start_date" children={(field) => (<div><label className={labelClass}>Employment Start Date</label><input type="date" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} /></div>)} />
                <form.Field name="end_date" children={(field) => (<div><label className={labelClass}>Termination Date</label><input type="date" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} /></div>)} />
                <form.Field name="hr_notes" children={(field) => (<div className="md:col-span-2"><label className={labelClass}>Confidential HR Notes</label><textarea placeholder="Medical conditions, disciplinary notes, etc..." value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} className={`${inputClass} resize-none`} /></div>)} />
              </div>
            </div>
          </form>
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-6 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button form="staff-form" type="submit" disabled={!canSubmit || isSubmitting as boolean || saveMutation.isPending} className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50">
                {(isSubmitting || saveMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : 'Save Profile'}
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}