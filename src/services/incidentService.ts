import { supabase } from '../lib/supabase';

export interface IncidentSummary {
  id: string;
  title: string;
  incident_date: string;
  incident_type: string;
  severity: string;
  status: string;
  description: string;
  immediate_action_taken?: string | null;
  resolution_notes?: string | null;
  created_at: string;
}

export const incidentService = {
  async getIncidents() {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('is_deleted', false)
      .order('incident_date', { ascending: false });

    if (error) throw error;
    return data;
  },

  async commitIncident(incidentPayload: any, firstAidPayload?: any) {
    // AUDIT FIX 4 & 6: Sequential insert avoiding parallel race conditions and bypassing client-side crypto
    const { data: incidentData, error: incidentErr } = await supabase
      .from('incidents')
      .insert([{
        ...incidentPayload,
        is_deleted: false,
        status: 'OPEN'
      }])
      .select('id')
      .single();

    if (incidentErr) throw incidentErr;

    // If there is linked medical data, process it synchronously afterwards
    if (firstAidPayload) {
      const { error: faError } = await supabase
        .from('first_aid_logs')
        .insert([{
          ...firstAidPayload,
          incident_id: incidentData.id, 
          is_deleted: false
        }]);

      // AUDIT FIX 5: Orphan Hazard Rollback. 
      // If the linked medical log fails, tear down the incident so we don't have dangling operations.
      if (faError) {
        await supabase.from('incidents').delete().eq('id', incidentData.id);
        throw faError;
      }
    }

    return true;
  },

  async resolveIncident(id: string, notes: string) {
    const { error } = await supabase
      .from('incidents')
      .update({
        status: 'CLOSED',
        resolution_notes: notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
    return true;
  }
};