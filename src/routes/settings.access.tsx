import React, { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { ShieldCheck, UserPlus, Key, Mail, Shield, Loader2, X, AlertTriangle, WifiOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { createClient } from '@supabase/supabase-js'; 

export const Route = createFileRoute('/settings/access')({
  component: AccessControlPage,
});

export function AccessControlPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch the public profiles
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['system_users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    meta: { persist: true }
  });

  // Role Badge Styling
  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'MANAGER': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'HR': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200'; // KEEPER
    }
  };

  if (profile?.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <ShieldCheck size={48} className="mb-4 opacity-20" />
        <h2 className="text-lg font-black uppercase tracking-widest">Unauthorized Area</h2>
        <p className="text-sm font-bold mt-2">Only System Administrators can access account provisioning.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative animate-in fade-in duration-300">
      
      {!isOnline && (
        <div className="absolute inset-0 z-50 bg-slate-100/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 flex flex-col items-center text-center max-w-sm">
            <WifiOff className="text-rose-600 mb-4" size={32} />
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">Network Required</h2>
            <p className="text-xs font-bold text-slate-500">Creating secure user accounts requires a direct connection to the Auth servers. Please reconnect.</p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-slate-200 pb-6">
        <div>
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <ShieldCheck className="text-blue-600" size={24} /> Access & Provisioning
          </h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Manage StrixOS Staff Accounts</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          disabled={!isOnline}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm shrink-0"
        >
          <UserPlus size={16} /> Provision Account
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Staff Member</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">System Role</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Offline PIN</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u: any) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-black text-slate-600 uppercase">
                          {u.initials || 'U'}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{u.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 font-mono">{u.id.split('-')[0]}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${getRoleBadge(u.role)}`}>
                        {u.role || 'KEEPER'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Key size={14} className={u.pin ? "text-emerald-500" : "text-slate-300"} />
                        <span className="font-mono text-xs font-bold text-slate-600 tracking-widest">
                          {u.pin ? '****' : 'UNSET'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Managed via DB</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && <ProvisioningModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------
// SECURE IN-APP PROVISIONING MODAL
// ------------------------------------------------------------------
function ProvisioningModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const provisionMutation = useMutation({
    mutationFn: async (payload: any) => {
      // 1. ISOLATE THE AUTH CLIENT: We MUST use a secondary client with persistSession: false
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      // 2. CREATE SECURE AUTHENTICATION IDENTITY
      const { data: authData, error: authError } = await authClient.auth.signUp({
        email: payload.email,
        password: payload.password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Authentication identity creation failed.");

      // 3. GENERATE INITIALS
      const initials = payload.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();

      // 4. LINK PUBLIC DATABASE PROFILE
      const { error: dbError } = await supabase.from('users').insert([{
        id: authData.user.id,
        name: payload.name,
        initials: initials,
        role: payload.role,
        pin: payload.pin,
      }]);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system_users'] });
      onClose();
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to provision account.')
  });

  const form = useForm({
    defaultValues: { name: '', email: '', password: '', role: 'KEEPER', pin: '' },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      
      if (value.pin && value.pin.length !== 4) {
        setErrorMsg("Offline PIN must be exactly 4 digits.");
        return;
      }

      await provisionMutation.mutateAsync(value);
    }
  });

  const inputClass = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all";
  const labelClass = "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-600 text-white">
          <h3 className="font-black uppercase tracking-tight flex items-center gap-2">
            <UserPlus size={18} /> Provision New Account
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-blue-500 rounded-lg transition-colors"><X size={18} /></button>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-5">
          
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex gap-3 text-blue-800">
            <Shield size={18} className="shrink-0 mt-0.5" />
            <p className="text-xs font-bold leading-tight">This will create a secure Auth Identity and link it to a public StrixOS profile.</p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" /> {errorMsg}
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <form.Field name="name" children={(field) => (
              <div className="md:col-span-2">
                <label className={labelClass}>Full Legal Name *</label>
                <input required placeholder="e.g. John Doe" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
              </div>
            )} />
            
            <form.Field name="email" children={(field) => (
              <div>
                <label className={labelClass}>Login Email *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input type="email" required placeholder="name@kentowlacademy.com" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} pl-9`} />
                </div>
              </div>
            )} />

            <form.Field name="password" children={(field) => (
              <div>
                <label className={labelClass}>Temporary Password *</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input type="text" required placeholder="Min. 6 characters" minLength={6} value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} pl-9 font-mono text-sm`} />
                </div>
              </div>
            )} />

            <form.Field name="role" children={(field) => (
              <div>
                <label className={labelClass}>System Permissions *</label>
                <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                  <option value="KEEPER">KEEPER (Standard)</option>
                  <option value="MANAGER">MANAGER (Elevated)</option>
                  <option value="HR">HR (Restricted)</option>
                  <option value="ADMIN">ADMIN (Full Control)</option>
                </select>
              </div>
            )} />

            <form.Field name="pin" children={(field) => (
              <div>
                <label className={labelClass}>Offline Lock PIN (Optional)</label>
                <input type="text" maxLength={4} placeholder="e.g. 1234" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value.replace(/\D/g, ''))} className={`${inputClass} font-mono tracking-widest`} />
              </div>
            )} />
          </div>
          
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
             <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-100 rounded-xl">Cancel</button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <button type="submit" disabled={!canSubmit || isSubmitting as boolean || provisionMutation.isPending} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50">
                  {(isSubmitting || provisionMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : 'Create Account'}
                </button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </div>
    </div>
  );
}