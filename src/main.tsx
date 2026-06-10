import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';
import { routeTree } from './routeTree.gen';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 14, // 14 Days
      staleTime: 1000 * 60 * 5,
      retry: 2,
      refetchOnWindowFocus: true,
      networkMode: 'offlineFirst',
    },
  },
});

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
  buster: 'v1.0.1',
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultNotFoundComponent: () => (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900">
      <h1 className="text-4xl font-black mb-4">404</h1>
      <p className="font-bold uppercase tracking-widest text-sm mb-8">System Route Not Found</p>
      <a href="/" className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-xs hover:bg-emerald-500">
        Return to Dashboard
      </a>
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