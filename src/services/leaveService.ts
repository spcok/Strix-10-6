import { supabase } from '../lib/supabase';

export const leaveService = {
  // For Staff: See only their own history
  async getMyRequests(userId: string) {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // For Managers: See all pending queue + approved history
  async getAllRequests() {
    const { data, error } = await supabase
      .from('leave_requests')
      .select(`
        *,
        users!leave_requests_user_id_fkey (name, role)
      `)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // Staff submits a request (defaults to PENDING)
  async submitRequest(payload: any) {
    const { data, error } = await supabase
      .from('leave_requests')
      .insert([{ ...payload, status: 'PENDING', is_deleted: false }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Manager approves or rejects
  async updateStatus(id: string, status: 'APPROVED' | 'REJECTED', approvedBy: string) {
    const { error } = await supabase
      .from('leave_requests')
      .update({ status, approved_by: approvedBy })
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // Cancel/Delete request
  async deleteRequest(id: string) {
    const { error } = await supabase
      .from('leave_requests')
      .update({ is_deleted: true })
      .eq('id', id);
    if (error) throw error;
    return true;
  }
};