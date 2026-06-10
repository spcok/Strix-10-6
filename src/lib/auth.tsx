import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback, useMemo } from 'react';
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

  // Architectural Fix: Safely reference timeouts and states without triggering re-renders
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLockedRef = useRef(isLocked);

  // Keep the ref strictly synced with state so our stable callbacks can read it
  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

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
        
        if (activeSession) setIsLocked(true); 
      } catch (error) {
        console.error('[Auth Engine] Initialization failed:', error);
      } finally {
        setIsSessionLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      
      if (newSession) {
        set('strix-auth-session', newSession);
        if (event === 'SIGNED_IN') setIsLocked(false);
      } else {
        del('strix-auth-session');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
    // Note: Persister is now handled globally in main.tsx, but leaving this is safe.
    meta: { persist: true }, 
  });

  // Architectural Fix: This callback now has NO dependencies. It will never force a re-render.
  const resetIdleTimer = useCallback(() => {
    if (isLockedRef.current) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setIsLocked(true), IDLE_TIMEOUT_MS);
  }, []);

  // Architectural Fix: Event listeners mount EXACTLY ONCE. No more DOM thrashing.
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, resetIdleTimer, { passive: true }));
    
    resetIdleTimer();
    
    return () => {
      events.forEach(event => document.removeEventListener(event, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  const unlock = useCallback((enteredPin: string): boolean => {
    if (!profile?.pin) return false;
    if (enteredPin === String(profile.pin)) {
      setIsLocked(false);
      resetIdleTimer();
      return true;
    }
    return false;
  }, [profile?.pin, resetIdleTimer]);

  const lock = useCallback(() => setIsLocked(true), []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    await del('strix-auth-session');
    setSession(null);
    setUser(null);
    setIsLocked(false); 
  }, []);

  const isFullyLoading = isSessionLoading || (!!user && profileStatus === 'pending');

  // Architectural Fix: Memoize the context value so the app only re-renders when data actually changes
  const contextValue = useMemo(() => ({
    session,
    user,
    profile: profile || null,
    isLocked,
    unlock,
    lock,
    logout,
    isLoading: isFullyLoading
  }), [session, user, profile, isLocked, unlock, lock, logout, isFullyLoading]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};