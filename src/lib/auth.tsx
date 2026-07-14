import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback, useMemo } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, set, del } from 'idb-keyval'; // PRESERVED: Vital for offline session hydration
import { supabase } from './supabase';
import { toast } from 'sonner';

// --- Configuration & Constants ---
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes strict soft-lock timeout (PRESERVED)
const SECURITY_HEARTBEAT_TTL_MS = 72 * 60 * 60 * 1000; // 72 Hours hard GDPR offline limit
const HEARTBEAT_STORAGE_KEY = 'strixos_last_auth_heartbeat';
const HEARTBEAT_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check 72h offline limit every 5 mins

// --- Types & Schema Alignment ---
export interface UserProfile {
  id: string;
  name: string | null;
  initials: string | null;
  pin: string | null; 
  role: string | null;
  avatar_url?: string;
  phone?: string;
  is_active?: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isLocked: boolean; // PRESERVED: 5-minute idle soft-lock state
  hasPermission: (permission: string, showToastOnDenied?: boolean) => boolean;
  checkAccess: (allowedRoles: string[]) => boolean;
  lockSession: () => void;
  unlockSession: (pinCode: string) => boolean;
  logout: (isExpired?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- Standalone Query Helper for Router Guards ---
// ALIGNED: Reads the 'permissions' array column directly from your rbac_matrix table
export const getPermissionsQueryOptions = (role?: string | null) => ({
  queryKey: ['rbac_permissions', role || 'ANONYMOUS'],
  queryFn: async () => {
    if (!role) return [];

    const { data, error } = await supabase
      .from('rbac_matrix')
      .select('permissions')
      .eq('role', role)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[Auth Engine] Failed to fetch RBAC matrix:', error);
      throw error;
    }

    return (data?.permissions || []) as string[];
  },
  networkMode: 'offlineFirst' as const,
  staleTime: 1000 * 60 * 60 * 24, // 24 hours stale time
  meta: { persist: true }, // Enforces local IndexedDB caching via TanStack Query
});

// --- Auth Provider Component ---
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  
  // Soft-Lock State (PRESERVED)
  const [isLocked, setIsLocked] = useState(false);

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const throttleRef = useRef<number>(0);

  // Persist lock state across browser refresh (PRESERVED)
  useEffect(() => {
    if (localStorage.getItem('strix-is-locked') === 'true') {
      setIsLocked(true);
    }
  }, []);

  const lockSession = useCallback(() => {
    setIsLocked(true);
    localStorage.setItem('strix-is-locked', 'true');
  }, []);

  // 1. Hard Logout / GDPR Sanitization Engine (MERGED with idb-keyval del)
  const logout = useCallback(async (isExpired = false) => {
    await supabase.auth.signOut();
    await del('strix-auth-session'); // PRESERVED: Wipe IndexedDB session backup
    localStorage.removeItem(HEARTBEAT_STORAGE_KEY);
    localStorage.removeItem('strix-is-locked');
    
    // Instantly purge all cached arrays from RAM to prevent RLS ghost states & satisfy GDPR
    queryClient.clear(); 
    
    setSession(null);
    setUser(null);
    setIsLocked(false);

    if (isExpired) {
      toast.error(
        'Security session expired (72h offline limit reached). Logged out for data protection and GDPR compliance.'
      );
    }
  }, [queryClient]);

  // 2. The 72-Hour GDPR & Security Heartbeat Evaluator
  const evaluateSecurityHeartbeat = useCallback(() => {
    if (!user) return;

    if (navigator.onLine) {
      localStorage.setItem(HEARTBEAT_STORAGE_KEY, Date.now().toString());
    } else {
      const lastHeartbeatStr = localStorage.getItem(HEARTBEAT_STORAGE_KEY);
      const lastHeartbeat = lastHeartbeatStr ? parseInt(lastHeartbeatStr, 10) : 0;
      const elapsed = Date.now() - lastHeartbeat;

      if (elapsed > SECURITY_HEARTBEAT_TTL_MS) {
        console.warn('[Auth Engine] Offline security TTL breached. Executing hard GDPR sign-out.');
        logout(true);
      }
    }
  }, [user, logout]);

  // 3. Initialize Auth with IndexedDB (idb-keyval) Fallback (PRESERVED)
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
        
        if (activeSession && navigator.onLine) {
          localStorage.setItem(HEARTBEAT_STORAGE_KEY, Date.now().toString());
        }
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
        if (navigator.onLine) {
          localStorage.setItem(HEARTBEAT_STORAGE_KEY, Date.now().toString());
        }
      } else {
        del('strix-auth-session');
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  // 4. Attach 72h Heartbeat Listeners & Periodic Checks
  useEffect(() => {
    if (!user) return;

    evaluateSecurityHeartbeat();
    window.addEventListener('online', evaluateSecurityHeartbeat);
    window.addEventListener('offline', evaluateSecurityHeartbeat);
    const intervalId = setInterval(evaluateSecurityHeartbeat, HEARTBEAT_CHECK_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', evaluateSecurityHeartbeat);
      window.removeEventListener('offline', evaluateSecurityHeartbeat);
      clearInterval(intervalId);
    };
  }, [user, evaluateSecurityHeartbeat]);

  // 5. User Profile Fetch (PRESERVED)
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

  // 6. Fetch Capabilities via TanStack Query ($O(1)$ RBAC Cache)
  const { data: rawPermissions = [] } = useQuery(
    getPermissionsQueryOptions(profile?.role)
  );

  // 7. Realtime "Side-Door" Revocation Listener
  useEffect(() => {
    if (!profile?.role || !user?.id) return;

    const channel = supabase
      .channel('rbac_revocation_listener')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rbac_matrix', filter: `role=eq.${profile.role}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['rbac_permissions', profile.role] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['userProfile', user.id] });
          queryClient.invalidateQueries({ queryKey: ['rbac_permissions'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.role, user?.id, queryClient]);

  // 8. Synchronous O(1) Permission Evaluation Hook
  const activePermissionsSet = useMemo(() => new Set<string>(rawPermissions), [rawPermissions]);

  const hasPermission = useCallback((permission: string, showToastOnDenied = false): boolean => {
    if (!profile) return false;
    if (isLocked) return false; // Block action if screen is soft-locked
    
    // Root bypass: Director and Admin retain full access while actively authenticated
    const isRootRole = profile.role === 'ADMIN' || profile.role === 'DIRECTOR';
    const allowed = isRootRole || activePermissionsSet.has(permission) || activePermissionsSet.has('*');

    if (!allowed && showToastOnDenied) {
      toast.error('Unauthorized: You do not have permission to perform this action.');
    }

    return allowed;
  }, [profile, isLocked, activePermissionsSet]);

  const checkAccess = useCallback((allowedRoles: string[]): boolean => {
    if (!profile) return false;
    if (isLocked) return false;
    if (profile.role === 'ADMIN' || profile.role === 'DIRECTOR') return true;
    return allowedRoles.includes(profile.role || '');
  }, [profile, isLocked]);

  // 9. PIN Unlock Execution (PRESERVED)
  const unlockSession = useCallback((pinCode: string) => {
    if (!profile?.pin || profile.pin === pinCode) {
      setIsLocked(false);
      localStorage.removeItem('strix-is-locked');
      resetIdleTimer();
      return true;
    }
    return false;
  }, [profile]);

  // 10. 5-Minute Idle Timer Soft-Lock Engine (PRESERVED)
  const resetIdleTimer = useCallback(() => {
    if (!session || isLocked) return; 
    
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
    isLoading: isFullyLoading,
    isLocked,
    hasPermission,
    checkAccess,
    lockSession,
    unlockSession,
    logout: () => logout(false),
  }), [session, user, profile, isFullyLoading, isLocked, hasPermission, checkAccess, lockSession, unlockSession, logout]);

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