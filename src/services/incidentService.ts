import { supabase } from '../lib/supabase';

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

  // Upgraded to handle offline-safe compound inserts
  async commitIncident(incidentPayload: any, firstAidPayload?: any) {
    const promises = [];
    
    // Generate the primary incident UUID locally
    const incidentId = crypto.randomUUID();

    promises.push(
      supabase.from('incidents').insert([{
        ...incidentPayload,
        id: incidentId,
        is_deleted: false,
        status: incidentPayload.status || 'OPEN'
      }])
    );

    // If the incident included a medical event, link it and fire concurrently
    if (firstAidPayload) {
      const firstAidId = crypto.randomUUID();
      promises.push(
        supabase.from('first_aid_logs').insert([{
          ...firstAidPayload,
          id: firstAidId,
          incident_id: incidentId,
          is_deleted: false
        }])
      );
    }

    const results = await Promise.all(promises);
    
    for (const res of results) {
      if (res.error) throw res.error;
    }

    return true;
  },

  async resolveIncident(id: string, resolutionNotes: string) {
    const { data, error } = await supabase
      .from('incidents')
      .update({
        status: 'RESOLVED',
        resolution_notes: resolutionNotes
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};