import { supabase } from '../lib/supabase';

export const auditService = {
  // Hardcoded to match your exact database casing
  getValidSections() {
    return ['OWL', 'RAPTOR', 'MAMMAL'];
  },

  async getAuditData(startStr: string, endStr: string) {
    // 1. Fetch exactly what we need. Blazing fast, indexed query.
    const { data: targetAnimals, error: animalErr } = await supabase
      .from('animals')
      .select('id, name, species, section')
      .eq('is_deleted', false)
      .in('section', ['OWL', 'RAPTOR', 'MAMMAL'])
      .order('name');

    if (animalErr) throw animalErr;
    if (!targetAnimals || targetAnimals.length === 0) return { animals: [], logs: [] };

    const animalIds = targetAnimals.map(a => a.id);

    // 2. Fetch logs within strict timezone boundaries
    const { data: logs, error: logErr } = await supabase
      .from('daily_logs')
      .select('animal_id, log_date, weight, weight_not_required, fed')
      .in('animal_id', animalIds)
      .gte('log_date', `${startStr}T00:00:00Z`)
      .lte('log_date', `${endStr}T23:59:59Z`)
      .eq('is_deleted', false);

    if (logErr) throw logErr;

    return { 
      animals: targetAnimals, 
      logs: logs || [] 
    };
  }
};