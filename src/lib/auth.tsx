import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback, useMemo } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  logout: () => Promise<void>;
  isLoading: boolean;
  isLocked: boolean;
  lockSession: () => void;
  unlockSession: (pinCode: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes strict timeout

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  
  // New Soft-Lock State
  const [isLocked, setIsLocked] = useState(false);

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const throttleRef = useRef<number>(0);

  // Persist lock state across browser refresh
  useEffect(() => {
    if (localStorage.getItem('strix-is-locked') === 'true') {
      setIsLocked(true);
    }
  }, []);

  const lockSession = useCallback(() => {
    setIsLocked(true);
    localStorage.setItem('strix-is-locked', 'true');
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    await del('strix-auth-session');
    
    // Instantly purge all cached arrays from RAM to prevent RLS ghost states
    queryClient.clear(); 
    
    setSession(null);
    setUser(null);
    setIsLocked(false);
    localStorage.removeItem('strix-is-locked');
  }, [queryClient]);

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
      } catch (error) {
        console.error('[Auth Engine] Initialization failed:', error);
      } finally {
        setIsSessionLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_IN') {
        queryClient.invalidateQueries();
      }
      
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
      }

      setSession(newSession);
      setUser(newSession?.user ?? null);
      
      if (newSession) {
        set('strix-auth-session', newSession);
      } else {
        del('strix-auth-session');
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

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

  const unlockSession = useCallback((pinCode: string) => {
    // Failsafe: If no PIN is set up in the database, allow bypass for now.
    // Otherwise, rigorously verify against local offline cache.
    if (!profile?.pin || profile.pin === pinCode) {
      setIsLocked(false);
      localStorage.removeItem('strix-is-locked');
      return true;
    }
    return false;
  }, [profile]);

  const resetIdleTimer = useCallback(() => {
    if (!session || isLocked) return; // Do not trigger timers if already locked
    
    const now = Date.now();
    if (now - throttleRef.current < 5000) return; 
    
    throttleRef.current = now;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    
    idleTimerRef.current = setTimeout(() => {
      console.log('[Auth Engine] Idle timeout reached. Locking screen.');
      lockSession();
    }, IDLE_TIMEOUT_MS);
  }, [session, isLocked, lockSession]);

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, resetIdleTimer, { passive: true }));
    
    resetIdleTimer();
    
    return () => {
      events.forEach(event => document.removeEventListener(event, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  const isFullyLoading = isSessionLoading || (!!user && profileStatus === 'pending');

  const contextValue = useMemo(() => ({
    session,
    user,
    profile: profile || null,
    logout,
    isLoading: isFullyLoading,
    isLocked,
    lockSession,
    unlockSession
  }), [session, user, profile, logout, isFullyLoading, isLocked, lockSession, unlockSession]);

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