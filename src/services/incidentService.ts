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

  async commitIncident(incidentPayload: any, firstAidPayload?: any) {
    const promises = [];
    
    // ENTERPRISE FIX: Mutate payload reference so offline retries use the exact same UUID
    if (!incidentPayload.id) {
      incidentPayload.id = crypto.randomUUID();
    }
    const incidentId = incidentPayload.id;

    promises.push(
      supabase.from('incidents').insert([{
        ...incidentPayload,
        is_deleted: false,
        status: incidentPayload.status || 'OPEN'
      }])
    );

    if (firstAidPayload) {
      if (!firstAidPayload.id) {
        firstAidPayload.id = crypto.randomUUID();
      }
      promises.push(
        supabase.from('first_aid_logs').insert([{
          ...firstAidPayload,
          incident_id: incidentId, // Perfect relational mapping retained offline
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