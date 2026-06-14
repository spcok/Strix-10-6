import React, { useState } from 'react';
import { LogIn } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0B0E] p-4 font-sans selection:bg-emerald-500 selection:text-white">
      <div className="bg-[#0F1117] p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-800/80">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center mb-4 shadow-lg border border-emerald-500/20">
            <LogIn size={32} />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight uppercase">Strix<span className="text-emerald-500">OS</span></h1>
          <p className="text-xs font-bold tracking-widest text-slate-500 uppercase mt-2">Authenticate to begin</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-5">
          {error && <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 text-xs font-bold tracking-wide border border-rose-500/20">{error}</div>}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Email Address</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 bg-[#0A0B0E] border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500/20 text-slate-300 outline-none text-sm shadow-inner" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 bg-[#0A0B0E] border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500/20 text-slate-300 outline-none text-sm shadow-inner" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-black text-xs uppercase tracking-widest py-3 rounded-xl mt-4 shadow-[0_0_15px_rgba(16,185,129,0.15)] transition-colors">
            {loading ? 'Authenticating...' : 'Establish Session'}
          </button>
        </form>
      </div>
    </div>
  );
}