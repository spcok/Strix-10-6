import { supabase } from '../lib/supabase';

export const auditService = {
  /**
   * Hardcoded strictly to your exact database values.
   * Matches the singular lowercase format stored in your 'animals' table.
   */
  getValidSections() {
    return ['owl', 'raptor', 'mammal'];
  },

  /**
   * Fetches the animals and their daily logs for a specific date range and section.
   */
  async getAuditData(startStr: string, endStr: string, section: string) {
    if (!section) return { animals: [], logs: [] };

    // 1. Fetch target animals for the specific section (Exact Match)
    const animalsQuery = await supabase
      .from('animals')
      .select('id, name, species, section')
      .eq('section', section)
      .eq('is_deleted', false)
      .order('name');

    if (animalsQuery.error) throw animalsQuery.error;
    const animals = animalsQuery.data || [];

    if (animals.length === 0) return { animals: [], logs: [] };

    const animalIds = animals.map(a => a.id);

    // 2. Fetch logs within the 7-day window for these specific animals
    const logsQuery = await supabase
      .from('daily_logs')
      .select('animal_id, log_date, weight, weight_not_required, fed')
      .in('animal_id', animalIds)
      .gte('log_date', startStr)
      .lte('log_date', endStr)
      .eq('is_deleted', false);

    if (logsQuery.error) throw logsQuery.error;

    return { 
      animals, 
      logs: logsQuery.data || [] 
    };
  }
};