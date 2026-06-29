import { supabase } from '../lib/supabase';
import { SafetyDrill } from '../types';

export const safetyDrillService = {
  // AUDIT FIX 1: Centralized retrieval layer
  async getDrills() {
    const { data, error } = await supabase
      .from('safety_drills')
      .select('*')
      .eq('is_deleted', false)
      .order('drill_date', { ascending: false });

    if (error) throw error;
    return data as SafetyDrill[];
  },

  // AUDIT FIX 2 & 3: Centralized mutation layer & database-assigned UUIDs
  async saveDrill(payload: Partial<SafetyDrill>) {
    const { data, error } = await supabase
      .from('safety_drills')
      .insert([payload])
      .select('id')
      .single();

    if (error) throw error;
    return data;
  },

  // AUDIT FIX 5 & 19: Activated previously orphaned functions for roll-call cross-referencing
  async getStaffMembers() {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, initials, role')
      .eq('is_deleted', false);

    if (error) throw error;
    return data;
  },

  async getActiveTimesheets() {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('timesheets')
      .select('user_id, clock_in_time, clock_out_time')
      .eq('shift_date', today)
      .is('clock_out_time', null)
      .eq('is_deleted', false);

    if (error) throw error;
    return data;
  }
};