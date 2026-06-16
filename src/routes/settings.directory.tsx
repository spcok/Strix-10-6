import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Phone, Plus, Trash2, Mail, MapPin, X, Loader2, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const directoryOptions = queryOptions({
  queryKey: ['external_directory'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('external_directory')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  },
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/settings/directory')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) await queryClient.ensureQueryData(directoryOptions);
  },
  component: DirectoryPage,
});

// ------------------------------------------------------------------
// MAIN COMPONENT
// ------------------------------------------------------------------
export function DirectoryPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const scrollParentRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------------
  // SUPABASE REALTIME CACHE INVALIDATION
  // ------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('directory-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'external_directory' }, () => {
        queryClient.invalidateQueries({ queryKey: ['external_directory'] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: contacts = [], isLoading } = useQuery(directoryOptions);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('external_directory').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['external_directory'] })
  });

  const filteredContacts = useMemo(() => {
    if (!searchQuery) return contacts;
    const lower = searchQuery.toLowerCase();
    return contacts.filter((c: any) => 
      (c.name || '').toLowerCase().includes(lower) ||
      (c.role || '').toLowerCase().includes(lower) ||
      (c.address || '').toLowerCase().includes(lower)
    );
  }, [contacts, searchQuery]);

  // ------------------------------------------------------------------
  // WINDOW VIRTUALIZER (DOM PROTECTION)
  // ------------------------------------------------------------------
  const rowVirtualizer = useWindowVirtualizer({
    count: filteredContacts.length,
    estimateSize: () => 140, // Estimated pixel height of a contact card
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-slate-200 pb-6">
        <div>
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">External Directory</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Veterinarians, Contractors & Suppliers</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search contacts..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all" 
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)} 
            className="w-full sm:w-auto bg-slate-900 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-black transition-all shadow-md shrink-0"
          >
            <Plus size={14} /> Add Contact
          </button>
        </div>
      </div>

      <div className="min-h-[500px] relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-emerald-600" size={32} /></div>
        ) : filteredContacts.length === 0 ? (
          <div className="py-12 text-center text-slate-400 bg-white border-2 border-dashed border-slate-200 rounded-2xl">
            <Phone size={32} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs font-black uppercase tracking-widest">Directory Empty</p>
          </div>
        ) : (
          <div className="w-full relative">
            {paddingTop > 0 && <div style={{ height: paddingTop }} />}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {virtualItems.map((virtualRow) => {
                const contact = filteredContacts[virtualRow.index];
                return (
                  <div key={contact.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="bg-white p-5 rounded-2xl border-2 border-slate-200 hover:border-emerald-500 transition-all shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-black text-slate-900 uppercase tracking-tight text-sm">{contact.name}</h4>
                        <span className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-500 uppercase tracking-widest">{contact.role}</span>
                      </div>
                      <button 
                        onClick={() => { if(window.confirm('Delete contact?')) deleteMutation.mutate(contact.id); }} 
                        disabled={deleteMutation.isPending}
                        className="text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="space-y-2 mt-auto">
                      {contact.phone && (
                        <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
                          <Phone size={14} className="text-emerald-500 shrink-0" /> {contact.phone}
                        </div>
                      )}
                      {contact.email && (
                        <div className="flex items-center gap-3 text-xs font-medium text-slate-600 truncate">
                          <Mail size={14} className="text-emerald-500 shrink-0" /> {contact.email}
                        </div>
                      )}
                      {contact.address && (
                        <div className="flex items-start gap-3 text-xs font-medium text-slate-600 mt-2 pt-2 border-t border-slate-100">
                          <MapPin size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                          <span className="leading-snug">{contact.address}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
          </div>
        )}
      </div>

      {isModalOpen && <ContactModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------
// TANSTACK FORM MODAL
// ------------------------------------------------------------------
function ContactModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('external_directory').insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external_directory'] });
      onClose();
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to save contact.')
  });

  const form = useForm({
    defaultValues: { name: '', role: '', phone: '', email: '', address: '' },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      await saveMutation.mutateAsync(value);
    }
  });

  const inputClass = "w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:border-emerald-500 transition-all placeholder-slate-400 uppercase tracking-widest";

  return (
    <div className="fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Phone size={16} className="text-emerald-600" /> New Contact
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-4">
          {errorMsg && <div className="p-3 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl border border-rose-200">{errorMsg}</div>}
          
          <form.Field name="name" children={(field) => (
            <input required placeholder="Name *" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
          )} />
          <form.Field name="role" children={(field) => (
            <input required placeholder="Role / Company *" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
          )} />
          <form.Field name="phone" children={(field) => (
            <input placeholder="Phone" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
          )} />
          <form.Field name="email" children={(field) => (
            <input type="email" placeholder="Email" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
          )} />
          <form.Field name="address" children={(field) => (
            <textarea placeholder="Address" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} h-24 resize-none`} />
          )} />
          
          <div className="pt-2">
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <button type="submit" disabled={!canSubmit || isSubmitting as boolean || saveMutation.isPending} className="w-full flex justify-center items-center gap-2 bg-slate-900 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-black transition-all shadow-lg disabled:opacity-50">
                  {(isSubmitting || saveMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : 'Save Contact'}
                </button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </div>
    </div>
  );
}