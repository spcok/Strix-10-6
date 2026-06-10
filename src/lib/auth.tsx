import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { get, set, del } from 'idb-keyval';
import { supabase } from './supabase';

interface UserProfile {
  id: string;
  name: string | null;
  initials: string | null;
  pin: string | null;
  role: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLocked: boolean;
  unlock: (pin: string) => boolean;
  lock: () => void;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  // 1. Session Management (Online-First with IDB Failover)
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session: nativeSession } } = await supabase.auth.getSession();
        let activeSession = nativeSession;
        
        if (!activeSession) {
          const cachedSession = await get('strix-auth-session');
          if (cachedSession) {
            await supabase.auth.setSession(cachedSession);
            activeSession = cachedSession;
          }
        }

        setSession(activeSession);
        setUser(activeSession?.user ?? null);
        
        // Lock ONLY if we are rehydrating an existing session on app boot
        if (activeSession) setIsLocked(true); 
      } catch (error) {
        console.error('[Auth Engine] Initialization failed:', error);
      } finally {
        setIsSessionLoading(false);
      }
    };

    initializeAuth();

    // Listen for login/logout events and sync to IndexedDB
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      
      if (newSession) {
        set('strix-auth-session', newSession);
        
        // CRITICAL FIX: Only let them straight in if they just actively logged in.
        // Token refreshes or other background events will not trigger the lock screen.
        if (event === 'SIGNED_IN') {
          setIsLocked(false);
        }
      } else {
        del('strix-auth-session');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Profile Management (Cached via TanStack for Offline Unlock)
  const { data: profile, status: profileStatus } = useQuery({
    queryKey: ['userProfile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('users')
        .select('id, name, initials, pin, role')
        .eq('id', user.id)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('[Auth Engine] Profile fetch failed:', error.message);
      }
      return data as UserProfile;
    },
    enabled: !!user?.id,
    meta: { persist: true }, 
  });

  // 3. Idle Timer Logic
  const resetIdleTimer = useCallback(() => {
    if (isLocked) return;
    if ((window as any).idleTimer) clearTimeout((window as any).idleTimer);
    (window as any).idleTimer = setTimeout(() => setIsLocked(true), IDLE_TIMEOUT_MS);
  }, [isLocked]);

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, resetIdleTimer));
    resetIdleTimer();
    return () => {
      events.forEach(event => document.removeEventListener(event, resetIdleTimer));
      if ((window as any).idleTimer) clearTimeout((window as any).idleTimer);
    };
  }, [resetIdleTimer]);

  // 4. Local PIN Verification
  const unlock = (enteredPin: string): boolean => {
    if (!profile?.pin) {
      console.warn('[Auth Engine] No PIN in cache. Waiting for sync...');
      return false;
    }
    
    if (enteredPin === String(profile.pin)) {
      setIsLocked(false);
      resetIdleTimer();
      return true;
    }
    
    return false;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    await del('strix-auth-session');
    setSession(null);
    setUser(null);
    setIsLocked(false); 
  };

  const isFullyLoading = isSessionLoading || (!!user && profileStatus === 'pending');

  return (
    <AuthContext.Provider value={{ 
      session, 
      user, 
      profile: profile || null, 
      isLocked, 
      unlock, 
      lock: () => setIsLocked(true), 
      logout, 
      isLoading: isFullyLoading 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};