// ============================================================================
// HUSBANDRY & CLINICAL TYPES
// ============================================================================
export type AnimalCategory = 'OWL' | 'RAPTOR' | 'MAMMAL' | 'EXOTIC';
export type AnimalStatus = 'ON_DISPLAY' | 'OFF_DISPLAY' | 'QUARANTINE' | 'MEDICAL' | 'OFFSITE' | 'ARCHIVED';
export type RecordType = 'INDIVIDUAL' | 'GROUP';

export interface Animal {
  id: string;
  record_type: RecordType;
  parent_group_id: string | null;
  name: string | null;
  species: string | null;
  latin_name: string | null;
  census_count: number;
  category: AnimalCategory | null;
  status: AnimalStatus | null;
  location: string | null; 
  gender: string | null;
  date_of_birth: string | null;
  is_dob_unknown: boolean;
  flying_weight: number | null;
  winter_weight: number | null;
  average_target_weight: number | null;
  weight_unit: string;
  microchip_id: string | null;
  ring_number: string | null;
  has_no_id: boolean;
  is_boarding: boolean;
  is_quarantine: boolean;
  origin: string | null;
  origin_location: string | null;
  acquisition_date: string | null;
  acquisition_type: string | null;
  display_order: number;
  hazard_rating: string | null;
  is_venomous: boolean;
  red_list_status: string;
  description: string | null;
  special_requirements: string | null;
  critical_husbandry_notes: string | null;
  ambient_temp_only: boolean;
  target_day_temp_c: number | null;
  target_night_temp_c: number | null;
  water_tipping_temp: number | null;
  target_humidity_min_percent: number | null;
  target_humidity_max_percent: number | null;
  misting_frequency: string | null;
  distribution_map_url: string | null;
  profile_image_url: string | null;
  lineage_unknown: boolean;
  sire_id: string | null;
  dam_id: string | null;
  archive_reason: string | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  modified_by?: string | null;

  // UI Only Additions
  location_name?: string; 
  next_feed_date?: string;
  next_feed_note?: string;
  subRows?: Animal[]; 
}

export interface DailyLog {
  id: string;
  animal_id: string;
  log_type: 'WEIGHT' | 'FEEDING' | 'TEMPERATURE' | 'OBSERVATION' | string;
  log_date: string;
  notes?: string | null;
  weight_grams?: number | null;
  weight_unit?: string | null;
  weight_not_required?: boolean;
  temperature_c?: number | null;
  basking_temp_c?: number | null;
  cool_temp_c?: number | null;
  feed_details?: {
    meals?: Array<{
      time: string;
      food_item: string;
      food_offered_g: number;
      food_consumed_g: number;
      calci_dust_added?: boolean;
    }>;
  } | string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  modified_by?: string | null;
  is_deleted?: boolean;
}

export interface DailyRound {
  id: string;
  animal_id: string;
  date: string;
  shift: string;
  section: string | null;
  is_alive: boolean;
  water_checked: boolean;
  locks_secured: boolean;
  animal_issue_note: string | null;
  requires_followup: boolean | null; 
  followup_notes: string | null; 
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  created_by?: string | null;
  modified_by?: string | null;
  created_at?: string;
  updated_at?: string;
  is_deleted: boolean;
}

export interface FeedingSchedule {
  id?: string;
  animal_id: string;
  scheduled_date: string;
  food_type: string;
  quantity: number;
  quantity_unit: string; 
  status: string; 
  notes: string | null; 
  supplements: string | null; 
  presentation_method: string | null; 
  completed_at?: string | null;
  completed_by?: string | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  modified_by?: string | null;
}

export interface ClinicalRecord {
  id: string;
  animal_id: string;
  record_type: string;
  record_date: string;
  soap_subjective: string;
  soap_objective: string;
  soap_assessment: string;
  soap_plan: string;
  weight_grams: number;
  conductor_role: string;
  conducted_by: string;
  external_vet_name?: string | null;
  external_vet_clinic?: string | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// LOGISTICS TYPES
// ============================================================================
export interface OperationalList {
  id: string;
  name: string; 
  category: string;
  description?: string | null; 
  status?: string | null; 
  display_order?: number | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ExternalTransfer {
  id: string;
  animal_id: string;
  transfer_type: string;
  transfer_date: string;
  entity_name: string;
  entity_contact?: string | null;
  reason?: string | null;
  notes?: string | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InternalMovement {
  id: string;
  animal_id: string;
  movement_date: string;
  from_location?: string | null;
  to_location: string;
  reason?: string | null;
  notes?: string | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// STAFF MANAGEMENT TYPES
// ============================================================================
export interface Shift {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  assigned_area?: string | null;
  notes?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
  users?: {
    name: string | null;
    email: string | null;
    role: string | null;
  };
}

export interface Leave {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
  users?: {
    name: string | null;
    email: string | null;
    role: string | null;
  };
}

export interface Timesheet {
  id: string;
  user_id: string;
  shift_date: string;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  status: string; 
  anomaly_reason?: string | null;
  hr_resolution_notes?: string | null;
  created_at?: string;
  updated_at?: string;
  users?: {
    name: string | null;
    email: string | null;
    role: string | null;
  };
}

// ============================================================================
// SAFETY & COMPLIANCE TYPES
// ============================================================================
export interface MaintenanceTicket {
  id: string;
  title: string;
  location: string;
  category: string;
  priority: string; 
  due_date?: string | null;
  assigned_to?: string | null;
  description: string;
  status: string; 
  created_at?: string;
  updated_at?: string;
}

export interface SafetyDrill {
  id: string;
  drill_date: string;
  drill_type: string;
  scenario_description: string;
  areas_involved: string;
  duration_seconds: number;
  roll_call_completed: boolean;
  issues_observed?: string | null;
  corrective_actions?: string | null;
  status: string; 
  is_simulation: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FirstAidLog {
  id: string;
  incident_date: string;
  person_involved_name: string;
  person_type: string; 
  administered_by: string;
  injury_description: string;
  treatment_provided: string;
  referral_needed: boolean;
  referral_details?: string | null;
  incident_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Incident {
  id: string;
  title: string;
  incident_date: string;
  incident_type: string;
  severity: string;
  description: string;
  immediate_action_taken?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}'

// ============================================================================
// USER & SYSTEM AUDIT TYPES
// ============================================================================
export interface User {
  id: string;
  email: string;
  name: string | null;
  initials: string | null;
  pin: string | null;
  role: 'ADMIN' | 'MANAGER' | 'HR' | 'KEEPER' | 'VOLUNTEER' | string | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | string;
  entity_type: string; // e.g., 'timesheets', 'maintenance_tickets'
  entity_id: string;
  details?: string | null; // JSON string payload of changes
  created_at?: string;
}

export interface IsolationLog {
  id: string;
  animal_id: string;
  start_date: string;
  end_date?: string | null;
  reason: string;
  notes?: string | null;
  status: 'ACTIVE' | 'CLEARED' | string;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}