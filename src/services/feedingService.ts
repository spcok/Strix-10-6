import { supabase } from '../lib/supabase';
import { FeedingSchedule } from '../types';

export const feedingService = {
  async bulkCreateSchedules(schedules: Omit<FeedingSchedule, 'id'>[], userId: string) {
    const recordsToInsert = schedules.map(s => ({
      ...s,
      created_by: userId,
      modified_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('feeding_schedules')
      .insert(recordsToInsert)
      .select();

    if (error) throw error;
    return data;
  },

  async deleteSchedule(id: string, userId: string) {
    const { data, error } = await supabase
      .from('feeding_schedules')
      .update({
        is_deleted: true,
        modified_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
