import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';
import { AlertTriangle, WifiOff } from 'lucide-react';
import { routeTree } from './routeTree.gen';
import './index.css';

// 1. Core Engine Upgrade: Queries AND Mutations set to offline-first
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 14, // 14 Days offline cache
      staleTime: 1000 * 60 * 5, // 5 minutes before background refetch
      retry: 3,
      refetchOnWindowFocus: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst', // CRITICAL: Queues writes when offline
      retry: 3, // Automatically retry failed writes
    }
  },
});

// 2. Storage Persister (Unchanged, already optimal)
const idbStorage = {
  getItem: async (key: string) => {
    const val = await get(key);
    return val === undefined ? null : val;
  },
  setItem: async (key: string, value: any) => await set(key, value),
  removeItem: async (key: string) => await del(key),
};

const persister = createAsyncStoragePersister({
  storage: idbStorage as any,
});

persistQueryClient({
  queryClient,
  persister,
  maxAge: 1000 * 60 * 60 * 24 * 14,
  buster: 'v1.0.2', // Bumped buster to clear old bad cache structures
});

// 3. Router Upgrade: Global Error Boundary & 404 Handlers
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  
  // Catches missing routes
  defaultNotFoundComponent: () => (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900">
      <h1 className="text-4xl font-black mb-4">404</h1>
      <p className="font-bold uppercase tracking-widest text-sm mb-8 text-slate-500">System Route Not Found</p>
      <a href="/" className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-xs hover:bg-emerald-500 transition-colors shadow-sm">
        Return to Dashboard
      </a>
    </div>
  ),

  // CRITICAL: Catches API crashes so the app doesn't white-screen
  defaultErrorComponent: ({ error, reset }) => (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full border border-rose-200 flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="text-rose-600" size={32} />
        </div>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">System Exception</h2>
        <p className="text-sm font-medium text-slate-500 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100 w-full overflow-x-auto text-left">
          {error.message || 'An unknown architectural error occurred.'}
        </p>
        <button 
          onClick={() => {
            queryClient.clear(); // Nuke the bad cache
            reset(); // Reset the router
          }}
          className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-800 transition-all shadow-md"
        >
          Flush Cache & Recover
        </button>
      </div>
    </div>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);