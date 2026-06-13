import { supabase } from '../lib/supabase';

export const auditService = {
  /**
   * Fetches the animals and their daily logs for a specific date range and section.
   * Utilizes an "ilike" OR query to completely bypass database casing/pluralization errors.
   */
  async getAuditData(startStr: string, endStr: string, section: string) {
    if (!section) return { animals: [], logs: [] };

    // 1. Fetch target animals using case-insensitive & plural-forgiving matching
    const animalsQuery = await supabase
      .from('animals')
      .select('id, name, species, section')
      .or(`section.ilike.${section},section.ilike.${section}s`)
      .eq('is_deleted', false)
      .order('name');

    if (animalsQuery.error) throw animalsQuery.error;
    const animals = animalsQuery.data || [];

    if (animals.length === 0) return { animals: [], logs: [] };

    const animalIds = animals.map(a => a.id);

    // 2. Fetch logs within the 7-day window. Appended timezones ensure we capture the full final day.
    const logsQuery = await supabase
      .from('daily_logs')
      .select('animal_id, log_date, weight, weight_not_required, fed')
      .in('animal_id', animalIds)
      .gte('log_date', `${startStr}T00:00:00Z`)
      .lte('log_date', `${endStr}T23:59:59Z`)
      .eq('is_deleted', false);

    if (logsQuery.error) throw logsQuery.error;

    return { 
      animals, 
      logs: logsQuery.data || [] 
    };
  }
};