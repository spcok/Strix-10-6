import { supabase } from '../lib/supabase';

export const weightService = {
  insertWeightLog: async (payload: any) => {
    try {
      const { data, error } = await supabase
        .from('weight_logs')
        .insert(payload)
        .select()
        .single();
        
      if (error) throw error;
      return data;
      
    } catch (error: any) {
      console.warn("Network unreachable or insert failed. Queueing offline...", error);
      
      // Fallback to local queue
      // await db.query('INSERT INTO local_sync_queue ...', payload);
      
      throw error; 
    }
  }
};