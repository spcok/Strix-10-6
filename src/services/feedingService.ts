import { supabase } from '../lib/supabase';

export const feedingService = {
  // We keep the name insertFeedLog to prevent breaking UI imports, but it now Upserts
  insertFeedLog: async (payload: any | any[]) => {
    try {
      // FIX: Changed .insert() to .upsert() so edits safely overwrite instead of crashing
      const { data, error } = await supabase
        .from('feed_logs')
        .upsert(payload) 
        .select();
        
      if (error) throw error;
      return data;
      
    } catch (error: any) {
      console.warn("Network unreachable or upsert failed. Queueing offline...", error);
      throw error; 
    }
  }
};