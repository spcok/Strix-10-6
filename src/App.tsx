import React from 'react';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';
import { routeTree } from './routeTree.gen';
import { AuthProvider } from './lib/auth';

// ------------------------------------------------------------------
// 1. ROOT CACHE CONFIGURATION
// ------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 14, // 14-Day Global Garbage Collection
      networkMode: 'offlineFirst',      // Global offline routing
      refetchOnWindowFocus: true,       // Force sync when app is re-opened
    },
  },
});

// ------------------------------------------------------------------
// 2. INDEXED-DB ASYNC PERSISTER
// ------------------------------------------------------------------
const idbPersister = {
  persistClient: async (client: any) => {
    await set('strix-offline-cache', client);
  },
  restoreClient: async () => {
    return await get('strix-offline-cache');
  },
  removeClient: async () => {
    await del('strix-offline-cache');
  },
};

// ------------------------------------------------------------------
// 3. ROUTER INJECTION
// ------------------------------------------------------------------
const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
});

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ 
        persister: idbPersister, 
        maxAge: 1000 * 60 * 60 * 24 * 14 // Enforce 14-day physical storage limit
      }}
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}

export default App;