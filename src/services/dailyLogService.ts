import { supabase } from '../lib/supabase';
import { DailyLog } from '../types';

export const dailyLogService = {
  async getLogsByAnimal(animalId: string): Promise<DailyLog[]> {
    // ENTERPRISE FIX: 14-Day Rolling Window to prevent Offline RAM Exhaustion
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('animal_id', animalId)
      .eq('is_deleted', false)
      .gte('log_date', fourteenDaysAgo) // Strict cutoff
      .order('log_date', { ascending: false });

    if (error) throw error;
    return data as DailyLog[];
  },

  async commitLog(payload: Partial<DailyLog>) {
    if (!payload.id) {
      payload.id = crypto.randomUUID();
    }

    const { data, error } = await supabase
      .from('daily_logs')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateLogDirect(id: string, updates: Partial<DailyLog>) {
    const { data, error } = await supabase
      .from('daily_logs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};