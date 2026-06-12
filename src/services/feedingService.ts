import { supabase } from '../lib/supabase';
import { FeedingSchedule } from '../types';

export const feedingService = {
  // legacyUserId is kept in the signature to prevent React components from throwing type errors,
  // but it is actively ignored by the payload. Identity is handled by Supabase JWTs.
  async bulkCreateSchedules(schedules: Partial<FeedingSchedule>[], legacyUserId?: string) {
    const { data, error } = await supabase
      .from('feeding_schedules')
      .insert(schedules)
      .select();
      
    if (error) throw error;
    return data;
  },

  async deleteSchedule(id: string, legacyUserId?: string) {
    const { error } = await supabase
      .from('feeding_schedules')
      .update({ is_deleted: true, status: 'CANCELLED' })
      .eq('id', id);
      
    if (error) throw error;
  },
};