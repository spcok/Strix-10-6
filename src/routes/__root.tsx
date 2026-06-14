import { useState } from 'react';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../lib/auth';
import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { LoginScreen } from '../components/auth/LoginScreen';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: () => (
    <AuthProvider>
      <AuthGuard />
    </AuthProvider>
  ),
});

// Layout Gatekeeper with UI Shell
function AuthGuard() {
  const { session, isLoading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  if (isLoading) {
    return <div className="min-h-screen bg-[#0A0B0E] flex items-center justify-center"><div className="animate-pulse text-emerald-500 font-black tracking-widest uppercase">Initializing Engine...</div></div>;
  }

  if (!session) return <LoginScreen />;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans antialiased relative overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} />
      
      <div className="flex flex-col flex-1 overflow-hidden transition-all duration-300">
        <Header onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}