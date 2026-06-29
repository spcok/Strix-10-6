import { supabase } from '../lib/supabase';

export interface StaffMember {
  id: string;
  name: string | null;
  initials: string | null;
  email: string | null;
}

export const firstAidService = {
  async getFirstAidLogs() {
    const { data, error } = await supabase
      .from('first_aid_logs')
      .select('*')
      .eq('is_deleted', false)
      .order('incident_date', { ascending: false });

    if (error) throw error;
    return data;
  },

  async getStaffMembers(): Promise<StaffMember[]> {
    // AUDIT FIX 12: Removed .eq('is_deleted', false) to prevent orphaned records in history
    const { data, error } = await supabase
      .from('users')
      .select('id, name, initials, email')
      .order('name');

    if (error) throw error;
    return data;
  },

  async commitFirstAidLog(firstAidPayload: any, incidentPayload?: any) {
    let incidentId = null;

    // AUDIT FIX 1, 2, 4: Execute sequentially. Let Postgres generate the UUID to avoid client-side crypto crashes.
    if (incidentPayload) {
      const { data: incident, error: incidentErr } = await supabase
        .from('incidents')
        .insert([{
          ...incidentPayload,
          is_deleted: false,
          status: 'OPEN'
        }])
        .select('id')
        .single();

      if (incidentErr) throw incidentErr;
      incidentId = incident.id;
    }

    const { error: faError } = await supabase
      .from('first_aid_logs')
      .insert([{
        ...firstAidPayload,
        incident_id: incidentId, 
        is_deleted: false
      }]);

    if (faError) {
      // AUDIT FIX 2: Soft fallback to rollback the incident if the first aid log constraint fails
      if (incidentId) {
        await supabase.from('incidents').delete().eq('id', incidentId);
      }
      throw faError;
    }

    return true;
  }
};