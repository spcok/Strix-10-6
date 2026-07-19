import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback, useMemo } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, set, del } from 'idb-keyval';
import { supabase } from './supabase';
import { toast } from 'sonner';

// --- Configuration & Constants ---
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SECURITY_HEARTBEAT_TTL_MS = 72 * 60 * 60 * 1000;
const HEARTBEAT_STORAGE_KEY = 'strixos_last_auth_heartbeat';
const HEARTBEAT_CHECK_INTERVAL_MS = 5 * 60 * 1000;

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
  isLocked: boolean;
  hasPermission: (permission: string, showToastOnDenied?: boolean) => boolean;
  checkAccess: (allowedRoles: string[]) => boolean;
  lockSession: () => void;
  unlockSession: (pinCode: string) => boolean;
  logout: (isExpired?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const getPermissionsQueryOptions = (role?: string | null) => {
  const normalizedRole = role ? role.toUpperCase() : 'ANONYMOUS';
  return {
    queryKey: ['rbac_permissions', normalizedRole],
    queryFn: async () => {
      console.log(`[Auth Diagnostic] Querying matrix for role: ${normalizedRole}`);
      if (!role) return [];
      const { data, error } = await supabase
        .from('rbac_matrix')
        .select('permissions')
        .ilike('role', normalizedRole)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[Auth Diagnostic] Matrix fetch error:', error);
      }
      
      console.log(`[Auth Diagnostic] Permissions returned from DB:`, data?.permissions);
      return (data?.permissions || []) as string[];
    },
    networkMode: 'offlineFirst' as const,
    staleTime: 1000 * 60 * 60 * 24,
    meta: { persist: true },
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const throttleRef = useRef<number>(0);

  useEffect(() => {
    if (localStorage.getItem('strix-is-locked') === 'true') {
      setIsLocked(true);
    }
  }, []);

  const lockSession = useCallback(() => {
    setIsLocked(true);
    localStorage.setItem('strix-is-locked', 'true');
  }, []);

  // RESTORED: The missing logout function that caused the crash
  const logout = useCallback(async (isExpired = false) => {
    await supabase.auth.signOut();
    await del('strix-auth-session');
    localStorage.removeItem(HEARTBEAT_STORAGE_KEY);
    localStorage.removeItem('strix-is-locked');
    
    queryClient.clear();
    setSession(null);
    setUser(null);
    setIsLocked(false);

    if (isExpired) {
      toast.error('Security session expired (72h offline limit reached). Logged out for data protection.');
    }
  }, [queryClient]);

  // RESTORED: The missing heartbeat function
  const evaluateSecurityHeartbeat = useCallback(() => {
    if (!user) return;
    if (navigator.onLine) {
      localStorage.setItem(HEARTBEAT_STORAGE_KEY, Date.now().toString());
    } else {
      const lastHeartbeatStr = localStorage.getItem(HEARTBEAT_STORAGE_KEY);
      const lastHeartbeat = lastHeartbeatStr ? parseInt(lastHeartbeatStr, 10) : 0;
      if (Date.now() - lastHeartbeat > SECURITY_HEARTBEAT_TTL_MS) {
        logout(true);
      }
    }
  }, [user, logout]);

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
        console.log('[Auth Diagnostic] Session initialized. User ID:', activeSession?.user?.id);
      } catch (error) {
        console.error('[Auth Engine] Initialization failed:', error);
      } finally {
        setIsSessionLoading(false);
      }
    };
    initializeAuth();
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
      if (data) console.log(`[Auth Diagnostic] Profile loaded successfully. Role: ${data.role}`);
      return data as UserProfile;
    },
    enabled: !!user?.id,
    meta: { persist: true },
  });

  const { data: rawPermissions = [] } = useQuery(getPermissionsQueryOptions(profile?.role));
  const activePermissionsSet = useMemo(() => new Set<string>(rawPermissions), [rawPermissions]);

  const hasPermission = useCallback((permission: string, showToastOnDenied = false): boolean => {
    if (profileStatus === 'pending') return false; 
    
    if (!profile) {
      console.warn('[Auth Diagnostic] Denied permission: No profile exists yet.');
      return false;
    }
    
    if (isLocked) return false;

    const normalizedRole = profile.role?.toUpperCase() || '';
    const isRootRole = normalizedRole === 'ADMIN' || normalizedRole === 'DIRECTOR';
    
    const allowed = isRootRole || activePermissionsSet.has(permission) || activePermissionsSet.has('*');

    console.log(`[Auth Diagnostic] Perm Check -> User Role: '${normalizedRole}' | Requested Perm: '${permission}' | Is Root Role? ${isRootRole} | Access Allowed? ${allowed}`);

    if (!allowed && showToastOnDenied) {
      toast.error('Unauthorized Access');
    }

    return allowed;
  }, [profile, profileStatus, isLocked, activePermissionsSet]);

  const checkAccess = useCallback((allowedRoles: string[]): boolean => {
    if (!profile || isLocked) return false;
    const normalizedRole = profile.role?.toUpperCase() || '';
    if (normalizedRole === 'ADMIN' || normalizedRole === 'DIRECTOR') return true;
    return allowedRoles.map(r => r.toUpperCase()).includes(normalizedRole);
  }, [profile, isLocked]);

  const unlockSession = useCallback((pinCode: string) => {
    if (!profile?.pin || profile.pin === pinCode) {
      setIsLocked(false);
      localStorage.removeItem('strix-is-locked');
      return true;
    }
    return false;
  }, [profile]);

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