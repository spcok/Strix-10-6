import { supabase } from '../lib/supabase';
import { addDays, format, parseISO, getDay } from 'date-fns';

export const rotaService = {
  // O(1) Fetchers for the Grid
  async getRotaData(startStr: string, endStr: string) {
    const [shifts, leave, staff] = await Promise.all([
      supabase.from('shifts').select('*').gte('start_time', `${startStr}T00:00:00Z`).lte('start_time', `${endStr}T23:59:59Z`).eq('is_deleted', false),
      supabase.from('leave_requests').select('*').gte('start_date', startStr).lte('end_date', endStr).eq('is_deleted', false),
      supabase.from('users').select('id, name, initials, role').eq('is_deleted', false)
    ]);
    
    return { 
      shifts: shifts.data || [], 
      leave: leave.data || [], 
      staff: staff.data || [] 
    };
  },

  // Macro Generator: Expands patterns into concrete database rows
  async generateShiftsFromPattern(userId: string, pattern: any, startDateStr: string, days: number = 28) {
    const startDate = parseISO(startDateStr);
    const shifts = [];

    for (let i = 0; i < days; i++) {
      const date = addDays(startDate, i);
      const dayConfig = pattern[getDay(date)]; // Map 0-6 to pattern days
      if (dayConfig) {
        const dStr = format(date, 'yyyy-MM-dd');
        shifts.push({
          user_id: userId,
          start_time: `${dStr}T${dayConfig.start}:00Z`,
          end_time: `${dStr}T${dayConfig.end}:00Z`,
          status: 'SCHEDULED',
          is_deleted: false
        });
      }
    }
    
    const { error } = await supabase.from('shifts').insert(shifts);
    if (error) throw error;
  },

  async deleteShift(id: string) {
    return await supabase.from('shifts').update({ is_deleted: true }).eq('id', id);
  }
};