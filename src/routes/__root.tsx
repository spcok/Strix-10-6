import React, { useState, useEffect } from 'react';
import { createRootRouteWithContext, Outlet, useLocation, Navigate } from '@tanstack/react-router';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../lib/auth';
import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { LoginScreen } from '../components/auth/LoginScreen';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: () => (
    <AuthProvider>
      <AuthGuard />
    </AuthProvider>
  ),
});

// ------------------------------------------------------------------
// GLOBAL REALTIME MULTIPLEXER (ENTERPRISE STANDARD)
// ------------------------------------------------------------------
function GlobalSyncEngine() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return; 

    console.log('[Sync Engine] Initializing Global Realtime Multiplexer...');

    const channel = supabase.channel('strix-global-multiplexer')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        const table = payload.table;
        
        // Strict routing of database mutations to local cache invalidations
        const tableToKeyMap: Record<string, string[]> = {
          'daily_logs': ['daily_logs'],
          'animals': ['animals'],
          'users': ['internal_users', 'userProfile'],
          'rbac_matrix': ['rbac_matrix', 'rbac_permissions'],
          'role_permissions': ['role_permissions'],
          'external_directory': ['external_directory'],
          'safety_drills': ['safety_drills'],
          'timesheets': ['timesheets', 'my_active_shift', 'active_timesheets_rollcall'],
          'isolation_logs': ['isolation_logs_complete']
        };

        const keysToInvalidate = tableToKeyMap[table];
        if (keysToInvalidate) {
          keysToInvalidate.forEach(key => {
            queryClient.invalidateQueries({ queryKey: [key] });
          });
        }
      })
      .subscribe();

    return () => {
      console.log('[Sync Engine] Terminating Global Multiplexer...');
      supabase.removeChannel(channel);
    };
  }, [queryClient, session]);

  return null;
}

// ------------------------------------------------------------------
// ROUTE GATEKEEPER & ACCESS DEFLECTOR (REACT 19 OPTIMIZED)
// ------------------------------------------------------------------
function RouteGatekeeper({ children }: { children: React.ReactNode }) {
  const { hasPermission, profile, isLocked, isLoading } = useAuth();
  const location = useLocation();

  // 1. Synchronous derivation of required permissions (Pure Render Phase)
  const path = location.pathname;
  const routePermissions: Record<string, string> = {
    '/clinical': 'clinical:read',
    '/logistics': 'logistics:read',
    '/staff/rota': 'hr:read',
    '/staff/timesheets': 'hr:read',
    '/settings/rbac': 'admin:settings',
    '/settings/directory': 'admin:users',
    '/safety': 'safety:read', // Absolute route protection for Safety Module
  };

  const requiredPerm = Object.entries(routePermissions).find(([routePrefix]) =>
    path.startsWith(routePrefix)
  )?.[1];

  // 2. Calculate denial BEFORE rendering
  // We wait for isLoading to be false so we don't accidentally redirect during initialization
  const isDenied = !isLoading && profile && !isLocked && requiredPerm && !hasPermission(requiredPerm);

  // 3. React 19 Strict Side-Effect Isolation
  // Toasts are imperative DOM actions and MUST live in a useEffect to prevent frame tearing
  useEffect(() => {
    if (isDenied) {
      console.warn(`[Route Gatekeeper] Access denied for path: ${path}. Missing perm: ${requiredPerm}`);
      toast.error('Unauthorized Access: You do not have permission to view this module.');
    }
  }, [isDenied, path, requiredPerm]);

  // 4. Declarative TanStack Redirect (React 19 Safe)
  // Instead of a fallback div + imperative navigate, we return the routing instruction directly.
  if (isDenied) {
    return <Navigate to="/" replace={true} />;
  }

  // 5. If safe, render the page components natively
  return <>{children}</>;
}

// ------------------------------------------------------------------
// LAYOUT GATEKEEPER WITH UI SHELL
// ------------------------------------------------------------------
function AuthGuard() {
  const { session, isLoading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0B0E] flex items-center justify-center">
        <div className="animate-pulse text-emerald-500 font-black tracking-widest uppercase">
          Initializing Engine...
        </div>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans antialiased relative overflow-hidden">
      <GlobalSyncEngine />
      <Sidebar isOpen={isSidebarOpen} />
      
      <div className="flex flex-col flex-1 overflow-hidden transition-all duration-300">
        <Header onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 overflow-auto p-6 relative">
          <RouteGatekeeper>
            <Outlet />
          </RouteGatekeeper>
        </main>
      </div>
    </div>
  );
}