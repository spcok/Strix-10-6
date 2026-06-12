import { supabase } from '../lib/supabase';

export const maintenanceService = {
  async getTickets() {
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async getStaffMembers() {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, initials, email')
      .eq('is_deleted', false)
      .order('name');

    if (error) throw error;
    return data;
  },

  async saveTicket(payload: any) {
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .insert([{
        ...payload,
        is_deleted: false
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};