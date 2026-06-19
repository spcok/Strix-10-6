import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Shield, Plus, X, Search, Save, Loader2, UserCircle, Key, Calendar, Mail, Phone, MapPin, HeartPulse, AlertCircle, FileText } from 'lucide-react';
import { format, parseISO, formatISO } from 'date-fns';
import { supabase } from '../lib/supabase';

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const internalUsersOptions = queryOptions({
  queryKey: ['internal_users'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('name');
    if (error) throw error;
    return data || [];
  },
  staleTime: 1000 * 60 * 15,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/settings/access')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) await queryClient.ensureQueryData(internalUsersOptions);
  },
  component: AccessControlPage,
});

// ------------------------------------------------------------------
// MAIN COMPONENT
// ------------------------------------------------------------------
export function AccessControlPage() {
  const queryClient = useQueryClient();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');

  useEffect(() => {
    const channel = supabase.channel('users-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        queryClient.invalidateQueries({ queryKey: ['internal_users'] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: users = [], isLoading } = useQuery(internalUsersOptions);

  const filteredUsers = useMemo(() => {
    let filtered = users;
    
    if (statusFilter === 'ACTIVE') filtered = filtered.filter((u: any) => u.is_active !== false && !u.is_deleted);
    if (statusFilter === 'INACTIVE') filtered = filtered.filter((u: any) => u.is_active === false || u.is_deleted);

    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter((u: any) => 
        (u.name || '').toLowerCase().includes(lower) ||
        (u.email || '').toLowerCase().includes(lower) ||
        (u.role || '').toLowerCase().includes(lower)
      );
    }
    return filtered;
  }, [users, searchQuery, statusFilter]);

  const rowVirtualizer = useWindowVirtualizer({
    count: filteredUsers.length,
    estimateSize: () => 80, 
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Shield className="text-indigo-600" size={24} /> Access Control
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">HR Provisioning & Staff Permissions</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value as any)} 
            className="bg-slate-50 border border-slate-200 text-[10px] font-black text-slate-700 uppercase tracking-widest rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 shadow-sm w-full sm:w-auto"
          >
            <option value="ACTIVE">Active Staff</option>
            <option value="INACTIVE">Inactive / Former</option>
            <option value="ALL">All Records</option>
          </select>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search personnel..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm" 
            />
          </div>
          
          <button 
            onClick={handleCreate}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(79,70,229,0.15)]"
          >
            <Plus size={16} /> Provision User
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
        {isLoading && <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600 w-8 h-8" /></div>}
        
        <div className="w-full overflow-x-auto relative flex-1 custom-scrollbar">
          <table className="w-full text-left min-w-[900px]">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/4">Staff Member</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/6">Role & Access</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/6">Contact & PIN</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/6">Contract Dates</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 && !isLoading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No personnel records found.</td></tr>
              ) : (
                <>
                  {paddingTop > 0 && <tr><td colSpan={5} style={{ height: `${paddingTop}px` }} /></tr>}
                  {virtualItems.map((virtualRow) => {
                    const user = filteredUsers[virtualRow.index];
                    const isActive = user.is_active !== false && !user.is_deleted;
                    const startDate = user.start_date ? new Date(user.start_date) : null;
                    const endDate = user.end_date ? new Date(user.end_date) : null;

                    return (
                      <tr key={user.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className={`transition-colors cursor-pointer ${isActive ? 'hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100/50 opacity-75'}`} onClick={() => handleEdit(user)}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${isActive ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-200 border-slate-300 text-slate-500'}`}>
                               <UserCircle size={18} />
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{user.name}</p>
                              <p className="text-[10px] font-bold text-slate-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest shadow-sm ${
                            user.role === 'ADMIN' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                            user.role === 'MANAGER' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                            user.role === 'VET' ? 'bg-teal-50 border-teal-200 text-teal-700' :
                            'bg-slate-100 border-slate-200 text-slate-700'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-[10px] font-bold text-slate-600 flex items-center gap-1.5"><Phone size={10} className="text-slate-400"/> {user.phone || '--'}</p>
                          <p className="text-[10px] font-black text-slate-900 tracking-widest mt-1 flex items-center gap-1.5">
                            <Key size={10} className="text-indigo-400" /> {user.pin ? '••••' : 'NO PIN'}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-[10px] font-bold text-slate-600 space-y-1">
                          {startDate && <p>Start: {format(startDate, 'dd MMM yyyy')}</p>}
                          {endDate && <p className="text-rose-600">End: {format(endDate, 'dd MMM yyyy')}</p>}
                          {!startDate && !endDate && <p className="text-slate-400">No dates recorded</p>}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`inline-flex px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border shadow-sm ${isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-300'}`}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && <tr><td colSpan={5} style={{ height: `${paddingBottom}px` }} /></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && <StaffModal onClose={() => setIsModalOpen(false)} user={editingUser} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HR / STAFF MODAL (Temporal Fix & Modal Hang Prevented)
// ---------------------------------------------------------------------------
function StaffModal({ onClose, user }: { onClose: () => void, user: any | null }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (user?.id) {
        // Updating an existing user: Upsert securely, allowing offline queueing
        const upsertPayload = { 
          ...payload, 
          id: user.id, 
          is_active: payload.is_active ?? true, 
          is_deleted: !(payload.is_active ?? true) 
        };
        const { error } = await supabase.from('users').upsert(upsertPayload);
        if (error) throw error;
      } else {
        // Creating a new user: Requires Edge Function to create GoTrue Identity
        const { data, error } = await supabase.functions.invoke('provision-staff', { body: { payload } });
        if (error) throw new Error('Network failure connecting to Auth Server. You must be online to provision new users.');
        if (data?.error) throw new Error(data.error); 
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internal_users'] });
      // Also invalidate rota to ensure name changes propogate
      queryClient.invalidateQueries({ queryKey: ['rota_matrix'] });
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to save staff record.')
  });

  const form = useForm({
    defaultValues: {
      name: user?.name || '', 
      email: user?.email || '', 
      initials: user?.initials || '', 
      role: user?.role || 'KEEPER',
      phone: user?.phone || '', 
      address: user?.address || '', 
      pin: user?.pin || '',
      dob: user?.dob ? format(parseISO(user.dob), 'yyyy-MM-dd') : '',
      start_date: user?.start_date ? format(parseISO(user.start_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      end_date: user?.end_date ? format(parseISO(user.end_date), 'yyyy-MM-dd') : '',
      emergency_contact_name: user?.emergency_contact_name || '', 
      emergency_contact_phone: user?.emergency_contact_phone || '',
      hr_notes: user?.hr_notes || '', 
      is_active: user?.is_active !== false,
    },
    onSubmit: ({ value }) => { 
      setErrorMsg(null);
      
      // ENTERPRISE FIX: Strict Temporal Formatting to prevent Date-of-Birth / Contract Date shifting
      const payload = {
        ...value,
        dob: value.dob ? formatISO(parseISO(value.dob), { representation: 'date' }) : null,
        start_date: value.start_date ? formatISO(parseISO(value.start_date), { representation: 'date' }) : null,
        end_date: value.end_date ? formatISO(parseISO(value.end_date), { representation: 'date' }) : null,
      };

      // MODAL HANG FIX: Fire and forget
      saveMutation.mutate(payload); 
      onClose();
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto custom-scrollbar">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl flex flex-col shadow-2xl relative my-auto">
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Shield size={20} className="text-indigo-600" /> {user ? 'Edit Personnel Record' : 'Provision New Staff'}
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"><X size={20} /></button>
        </div>

        <form id="staff-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-8">
          {errorMsg && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold shadow-sm flex items-center gap-2"><AlertCircle size={16} /> {errorMsg}</div>}

          {/* Section 1: Core Identity */}
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
               <UserCircle size={16} className="text-slate-400" /> Identity & Access
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <form.Field name="name" children={(field) => (
                <div className="md:col-span-2">
                  <label className={labelClass}>Full Legal Name</label>
                  <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. Jane Doe" className={inputClass} />
                </div>
              )} />
              <form.Field name="initials" children={(field) => (
                <div>
                  <label className={labelClass}>Initials</label>
                  <input type="text" required maxLength={3} value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value.toUpperCase())} placeholder="e.g. JD" className={inputClass} />
                </div>
              )} />
              <form.Field name="email" children={(field) => (
                <div className="md:col-span-2">
                  <label className={labelClass}>Corporate Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input type="email" required disabled={!!user} value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="name@zoo.com" className={`${inputClass} pl-9 ${user ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} />
                  </div>
                </div>
              )} />
              <form.Field name="pin" children={(field) => (
                <div>
                  <label className={labelClass}>4-Digit Security PIN</label>
                  <div className="relative">
                     <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                     <input type="text" maxLength={4} pattern="\d{4}" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value.replace(/\D/g, ''))} placeholder="••••" className={`${inputClass} pl-9 font-mono tracking-widest`} />
                  </div>
                </div>
              )} />
              <form.Field name="role" children={(field) => (
                <div className="md:col-span-3">
                  <label className={labelClass}>System Authorization Role</label>
                  <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                    <option value="KEEPER">KEEPER - Standard animal care access</option>
                    <option value="VET">VETERINARIAN - Full clinical access</option>
                    <option value="HR">HR - Staff management and rotas</option>
                    <option value="MANAGER">MANAGER - Operational oversight</option>
                    <option value="ADMIN">SYSTEM ADMIN - Unrestricted access</option>
                  </select>
                </div>
              )} />
            </div>
          </div>

          {/* Section 2: Personal & Contract Details */}
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
               <Calendar size={16} className="text-slate-400" /> HR & Contract
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <form.Field name="dob" children={(field) => (
                <div>
                  <label className={labelClass}>Date of Birth</label>
                  <input type="date" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )} />
              <form.Field name="start_date" children={(field) => (
                <div>
                  <label className={labelClass}>Contract Start Date</label>
                  <input type="date" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )} />
              <form.Field name="end_date" children={(field) => (
                <div>
                  <label className={labelClass}>Contract End Date (Optional)</label>
                  <input type="date" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )} />
              <form.Field name="phone" children={(field) => (
                <div>
                  <label className={labelClass}>Personal Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input type="tel" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="07000 000000" className={`${inputClass} pl-9`} />
                  </div>
                </div>
              )} />
              <form.Field name="address" children={(field) => (
                <div className="md:col-span-2">
                  <label className={labelClass}>Home Address</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-4 text-slate-400" size={14} />
                    <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} placeholder="Full postal address..." className={`${inputClass} pl-9 resize-none`} />
                  </div>
                </div>
              )} />
            </div>
          </div>

          {/* Section 3: Emergency & Medical */}
          <div className="bg-rose-50 p-5 rounded-2xl border border-rose-100">
            <h3 className="text-xs font-black text-rose-900 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-rose-200/50 pb-2">
               <HeartPulse size={16} className="text-rose-500" /> Emergency Contact
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <form.Field name="emergency_contact_name" children={(field) => (
                <div>
                  <label className={`${labelClass} text-rose-700`}>Contact Name</label>
                  <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="Name & Relationship" className={`${inputClass} border-rose-200 focus:border-rose-500`} />
                </div>
              )} />
              <form.Field name="emergency_contact_phone" children={(field) => (
                <div>
                  <label className={`${labelClass} text-rose-700`}>Emergency Phone</label>
                  <input type="tel" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="Emergency Number" className={`${inputClass} border-rose-200 focus:border-rose-500`} />
                </div>
              )} />
            </div>
          </div>

          {/* Section 4: Administration */}
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
               <FileText size={16} className="text-slate-400" /> Internal HR Notes
            </h3>
            <div className="space-y-4">
              <form.Field name="hr_notes" children={(field) => (
                <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} placeholder="Confidential notes, training requirements, or medical disclosures..." className={`${inputClass} resize-none`} />
              )} />
              
              <form.Field name="is_active" children={(field) => (
                <label className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors shadow-sm w-fit">
                  <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 bg-white" />
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Active Staff Member</span>
                    <span className="text-[10px] font-bold text-slate-500 mt-0.5">Uncheck to revoke login access and remove from active rosters.</span>
                  </div>
                </label>
              )} />
            </div>
          </div>

        </form>
        
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button type="submit" form="staff-form" disabled={!canSubmit || isSubmitting as boolean || saveMutation.isPending} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md">
                {isSubmitting || saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                {user ? 'Update Record' : 'Provision Secure ID'}
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}