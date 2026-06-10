import { supabase } from '../lib/supabase';
import { DailyRound } from '../types';

// Helper to extract custom local-storage auth UUID (StrixOS custom Auth Engine)
const getCustomUserId = async (): Promise<string | null> => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user?.id) return sessionData.session.user.id;
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const val = localStorage.getItem(key);
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

export const dailyRoundsService = {
  // Fetch all rounds for a specific date and shift
  async getRoundsByDateAndShift(date: string, shift: string): Promise<DailyRound[]> {
    const { data, error } = await supabase
      .from('daily_rounds')
      .select('*')
      .eq('date', date)
      .eq('shift', shift)
      .eq('is_deleted', false);

    if (error) throw error;
    return data as DailyRound[];
  },

  // Auto-upsert a round interaction. If it exists, update it. If not, insert it.
  async upsertRoundToggle(payload: {
    animal_id: string;
    date: string;
    shift: string;
    section?: string | null;
    is_alive: boolean;
    water_checked: boolean;
    locks_secured: boolean;
    animal_issue_note?: string | null;
  }) {
    const activeUserId = await getCustomUserId();

    // Look for an existing record for this precise matrix intersection
    const { data: existingRound, error: searchError } = await supabase
      .from('daily_rounds')
      .select('*')
      .eq('animal_id', payload.animal_id)
      .eq('date', payload.date)
      .eq('shift', payload.shift)
      .eq('is_deleted', false)
      .maybeSingle();

    if (searchError) throw searchError;

    if (existingRound) {
      // UPDATE
      const { data, error } = await supabase
        .from('daily_rounds')
        .update({
          is_alive: payload.is_alive,
          water_checked: payload.water_checked,
          locks_secured: payload.locks_secured,
          animal_issue_note: payload.animal_issue_note !== undefined ? payload.animal_issue_note : existingRound.animal_issue_note,
          completed_at: new Date().toISOString(),
          completed_by: activeUserId,
          modified_by: activeUserId,
          updated_at: new Date().toISOString(),
          status: 'COMPLETED'
        })
        .eq('id', existingRound.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // INSERT
      const { data, error } = await supabase
        .from('daily_rounds')
        .insert([{
          animal_id: payload.animal_id,
          date: payload.date,
          shift: payload.shift,
          section: payload.section || null,
          is_alive: payload.is_alive,
          water_checked: payload.water_checked,
          locks_secured: payload.locks_secured,
          animal_issue_note: payload.animal_issue_note || null,
          completed_at: new Date().toISOString(),
          completed_by: activeUserId,
          created_by: activeUserId,
          modified_by: activeUserId,
          is_deleted: false,
          status: 'COMPLETED'
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  // Bulk-upsert multiple rounds in a batch
  async bulkUpsertRounds(payloads: Array<{
    animal_id: string;
    date: string;
    shift: string;
    section?: string | null;
    is_alive: boolean;
    water_checked: boolean;
    locks_secured: boolean;
    animal_issue_note?: string | null;
  }>) {
    const results = [];
    for (const payload of payloads) {
      const res = await this.upsertRoundToggle(payload);
      results.push(res);
    }
    return results;
  },

  // Save textual notes directly to a round record
  async updateRoundNotes(roundId: string, notes: string | null) {
    const activeUserId = await getCustomUserId();
    const { data, error } = await supabase
      .from('daily_rounds')
      .update({
        animal_issue_note: notes,
        modified_by: activeUserId,
        updated_at: new Date().toISOString()
      })
      .eq('id', roundId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};