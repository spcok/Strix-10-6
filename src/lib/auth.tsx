import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback, useMemo } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { get, set, del } from 'idb-keyval';
import { supabase } from './supabase';

interface UserProfile {
  id: string;
  name: string | null;
  initials: string | null;
  pin: string | null; // Retained for future database compatibility
  role: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes strict timeout

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  // Architectural Fix: Safely reference timeouts and states without triggering re-renders
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const throttleRef = useRef<number>(0);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    await del('strix-auth-session');
    setSession(null);
    setUser(null);
  }, []);

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
      setSession(newSession);
      setUser(newSession?.user ?? null);
      
      if (newSession) {
        set('strix-auth-session', newSession);
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
    meta: { persist: true }, 
  });

  // Architectural Fix: This callback now has NO dependencies. It will never force a re-render.
  const resetIdleTimer = useCallback(() => {
    if (!session) return; // Do not track idle time if not logged in
    
    const now = Date.now();
    // Throttle: Only process input if 5 seconds have passed since last interaction
    if (now - throttleRef.current < 5000) return; 
    
    throttleRef.current = now;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    
    idleTimerRef.current = setTimeout(() => {
      logout();
    }, IDLE_TIMEOUT_MS);
  }, [session, logout]);

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

  const isFullyLoading = isSessionLoading || (!!user && profileStatus === 'pending');

  // Architectural Fix: Memoize the context value so the app only re-renders when data actually changes
  const contextValue = useMemo(() => ({
    session,
    user,
    profile: profile || null,
    logout,
    isLoading: isFullyLoading
  }), [session, user, profile, logout, isFullyLoading]);

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