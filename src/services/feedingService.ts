import { supabase } from '../lib/supabase';

export const feedingService = {
  insertFeedLog: async (payload: any) => {
    try {
      // 1. Attempt the standard online insertion
      const { data, error } = await supabase
        .from('feed_logs')
        .insert(payload)
        .select()
        .single();
        
      if (error) throw error;
      return data;
      
    } catch (error: any) {
      console.warn("Network unreachable or insert failed. Queueing offline...", error);
      
      // 2. Offline Fallback: Insert into your local PGlite/IndexedDB queue here.
      // e.g., await db.query('INSERT INTO local_sync_queue ...', payload);
      
      // We throw the error upward so TanStack Query knows it failed the primary network request, 
      // allowing your global toast system to notify the user they are operating offline.
      throw error; 
    }
  }
};