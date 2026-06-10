import { supabase } from '../lib/supabase';
import { DailyLog } from '../types';

// Helper to extract custom local-storage auth UUID (StrixOS custom Auth Engine)
const getCustomUserId = async (): Promise<string | null> => {
  // 1. Try Native Supabase session first
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user?.id) return sessionData.session.user.id;
  
  // 2. Fallback: Search localStorage for the custom Auth Engine profile
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const val = localStorage.getItem(key);
        // Look for the specific JSON signature of your Auth Engine
        if (val && val.includes('role') && val.includes('id')) {
          const parsed = JSON.parse(val);
          if (parsed.id) return parsed.id;
          if (parsed.user?.id) return parsed.user.id;
          if (parsed.state?.user?.id) return parsed.state.user.id;
        }
      }
    }
  } catch (e) {
    console.warn('StrixOS Auth extraction failed', e);
  }
  return null;
};

export const dailyLogService = {
  // Fetch active logs for an individual animal
  async getLogsByAnimal(animalId: string): Promise<DailyLog[]> {
    const { data, error } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('animal_id', animalId)
      .eq('is_deleted', false)
      .order('log_date', { ascending: false });

    if (error) throw error;
    return data as DailyLog[];
  },

  // Commits daily logs with automated user authorization tracking to satisfy RLS constraints
  async commitLog(payload: {
    animal_id: string;
    log_type: string;
    log_date: string;
    notes?: string | null;
    weight_grams?: number | null;
    weight_unit?: string | null;
    weight_not_required?: boolean;
    temperature_c?: number | null;
    basking_temp_c?: number | null;
    cool_temp_c?: number | null;
    feed_details?: any;
  }) {
    
    // Extract current session details to satisfy required audit trail fields
    const activeUserId = await getCustomUserId();

    const targetDate = new Date(payload.log_date).toISOString().split('T')[0];
    
    const { data: existingLog, error: searchError } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('animal_id', payload.animal_id)
      .eq('is_deleted', false)
      .gte('log_date', `${targetDate}T00:00:00.000Z`)
      .lte('log_date', `${targetDate}T23:59:59.999Z`)
      .maybeSingle();

    if (searchError) throw searchError;

    if (existingLog) {
      // UPDATE existing row: Merge metrics and populate audit signature columns
      const { data, error } = await supabase
        .from('daily_logs')
        .update({
          notes: payload.notes !== undefined ? payload.notes : existingLog.notes,
          weight_grams: payload.weight_grams !== undefined ? payload.weight_grams : existingLog.weight_grams,
          weight_unit: payload.weight_unit !== undefined ? payload.weight_unit : existingLog.weight_unit,
          weight_not_required: payload.weight_not_required !== undefined ? payload.weight_not_required : existingLog.weight_not_required,
          temperature_c: payload.temperature_c !== undefined ? payload.temperature_c : existingLog.temperature_c,
          basking_temp_c: payload.basking_temp_c !== undefined ? payload.basking_temp_c : existingLog.basking_temp_c,
          cool_temp_c: payload.cool_temp_c !== undefined ? payload.cool_temp_c : existingLog.cool_temp_c,
          feed_details: payload.feed_details !== undefined ? payload.feed_details : existingLog.feed_details,
          log_date: payload.log_date, // update timestamp to track precise execution hour
          modified_by: activeUserId,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingLog.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // INSERT completely new log row with explicit is_deleted flag for RLS checks
      const { data, error } = await supabase
        .from('daily_logs')
        .insert([{
          animal_id: payload.animal_id,
          log_type: payload.log_type,
          log_date: payload.log_date,
          notes: payload.notes || null,
          weight_grams: payload.weight_grams || null,
          weight_unit: payload.weight_unit || 'g',
          weight_not_required: payload.weight_not_required || false,
          temperature_c: payload.temperature_c || null,
          basking_temp_c: payload.basking_temp_c || null,
          cool_temp_c: payload.cool_temp_c || null,
          feed_details: payload.feed_details || null,
          is_deleted: false, // CRITICAL FIX: Satisfies RLS WITH CHECK policy
          created_by: activeUserId,
          modified_by: activeUserId
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  // Edit a specific historical log directly via its primary UUID
  async updateLogDirect(logId: string, updates: Partial<DailyLog>) {
    const activeUserId = await getCustomUserId();

    const { data, error } = await supabase
      .from('daily_logs')
      .update({
        ...updates,
        modified_by: activeUserId,
        updated_at: new Date().toISOString()
      })
      .eq('id', logId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};