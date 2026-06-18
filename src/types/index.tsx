// ============================================================================
// HUSBANDRY & CLINICAL TYPES
// ============================================================================
export type AnimalCategory = 'OWL' | 'RAPTOR' | 'MAMMAL' | 'EXOTIC';
export type AnimalStatus = 'ON_DISPLAY' | 'OFF_DISPLAY' | 'QUARANTINE' | 'MEDICAL' | 'OFFSITE' | 'ARCHIVED';
export type RecordType = 'INDIVIDUAL' | 'GROUP';

export interface Animal {
  id: string;
  parent_group_id?: string | null;
  census_count: number;
  name?: string | null;
  species?: string | null;
  latin_name?: string | null;
  category?: AnimalCategory | string | null;
  location?: string | null;
  profile_image_url?: string | null;
  distribution_map_url?: string | null;
  hazard_rating?: string | null;
  is_venomous?: boolean | null;
  weight_unit: string;
  flying_weight?: number | null;
  winter_weight?: number | null;
  average_target_weight?: number | null;
  date_of_birth?: string | null;
  is_dob_unknown?: boolean | null;
  gender?: string | null;
  microchip_id?: string | null;
  ring_number?: string | null;
  has_no_id?: boolean | null;
  red_list_status: string;
  description?: string | null;
  special_requirements?: string | null;
  critical_husbandry_notes?: string | null;
  ambient_temp_only?: boolean | null;
  target_day_temp_c?: number | null;
  target_night_temp_c?: number | null;
  water_tipping_temp?: number | null;
  target_humidity_min_percent?: number | null;
  target_humidity_max_percent?: number | null;
  misting_frequency?: string | null;
  acquisition_date?: string | null;
  acquisition_type?: string | null;
  origin?: string | null;
  origin_location?: string | null;
  lineage_unknown?: boolean | null;
  sire_id?: string | null;
  dam_id?: string | null;
  is_boarding?: boolean | null;
  is_quarantine?: boolean | null;
  display_order?: number | null;
  is_deleted?: boolean | null;
  status?: AnimalStatus | string | null;
  record_type?: RecordType | string | null;
  archive_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  modified_by?: string | null;

  // UI Additions
  location_name?: string; 
  next_feed_date?: string;
  next_feed_note?: string;
  subRows?: Animal[]; 
}

export interface DailyLog {
  id: string;
  animal_id: string;
  log_type: string;
  log_date: string;
  notes?: string | null;
  weight_grams?: number | null;
  weight_unit?: string | null;
  basking_temp_c?: number | null;
  cool_temp_c?: number | null;
  temperature_c?: number | null;
  weight_not_required?: boolean | null;
  feed_details?: any | null; // JSONB
  is_deleted?: boolean;
  created_by?: string | null;
  modified_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DailyRound {
  id: string;
  animal_id: string;
  date: string;
  shift: string;
  section?: string | null;
  completed_by?: string | null;
  completed_at?: string | null;
  status?: string | null;
  animal_issue_note?: string | null;
  requires_followup?: boolean | null;
  followup_notes?: string | null;
  is_alive?: boolean | null;
  water_checked?: boolean | null;
  locks_secured?: boolean | null;
  is_deleted?: boolean;
  created_by?: string | null;
  modified_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FeedingSchedule {
  id?: string;
  animal_id: string;
  scheduled_date: string;
  food_type?: string | null;
  quantity?: number | null;
  quantity_unit?: string | null;
  status?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  notes?: string | null;
  supplements?: string | null;
  presentation_method?: string | null;
  is_deleted?: boolean;
  created_by?: string | null;
  modified_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ClinicalRecord {
  id: string;
  animal_id: string;
  record_type?: string | null;
  record_date: string;
  soap_subjective?: string | null;
  soap_objective?: string | null;
  soap_assessment?: string | null;
  soap_plan?: string | null;
  weight_grams?: number | null;
  conductor_role?: string | null;
  conducted_by?: string | null;
  external_vet_name?: string | null;
  external_vet_clinic?: string | null;
  encounter_type?: string | null;
  is_deleted?: boolean;
  created_by?: string | null;
  modified_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface IsolationLog {
  id: string;
  animal_id: string;
  isolation_type?: string | null;
  start_date: string;
  end_date?: string | null;
  reason?: string | null;
  notes?: string | null;
  authorized_by?: string | null;
  is_deleted?: boolean;
  created_by?: string | null;
  modified_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// LOGISTICS TYPES
// ============================================================================
export interface OperationalList {
  id: string;
  name: string; 
  description?: string | null; 
  category: string;
  status?: string | null; 
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
  _modified?: string;
}

export interface ExternalTransfer {
  id: string;
  animal_id: string;
  transfer_type?: string | null;
  transfer_date: string;
  entity_name?: string | null;
  entity_contact?: string | null;
  reason?: string | null;
  notes?: string | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InternalMovement {
  id: string;
  animal_id: string;
  movement_date: string;
  from_location?: string | null;
  to_location?: string | null;
  reason?: string | null;
  notes?: string | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// STAFF MANAGEMENT TYPES
// ============================================================================
export interface User {
  id: string;
  email?: string | null;
  name?: string | null;
  initials?: string | null;
  role?: string | null;
  phone?: string | null;
  address?: string | null;
  signature_url?: string | null;
  pin?: string | null;
  cv_url?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  start_date?: string | null;
  hr_notes?: string | null;
  avatar_url?: string | null;
  dob?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
  requires_password_change?: boolean | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Shift {
  id: string;
  user_id?: string | null;
  start_time: string;
  end_time: string;
  assigned_area?: string | null;
  status?: string | null;
  notes?: string | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
  _modified?: string;
  users?: Partial<User>; // Relation
}

export interface Leave {
  id: string;
  user_id?: string | null;
  start_date: string;
  end_date: string;
  status?: string | null;
  leave_type?: string | null;
  reason?: string | null;
  approved_by?: string | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
  _modified?: string;
  users?: Partial<User>; // Relation
}

export interface Timesheet {
  id: string;
  user_id?: string | null;
  shift_date: string;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  total_hours?: number | null;
  status?: string | null;
  approved_by?: string | null;
  notes?: string | null;
  anomaly_reason?: string | null;        // NEW FROM DB SCRIPT
  hr_resolution_notes?: string | null;   // NEW FROM DB SCRIPT
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
  _modified?: string;
  users?: any; // Relation
}

// ============================================================================
// SAFETY & COMPLIANCE TYPES
// ============================================================================
export interface MaintenanceTicket {
  id: string;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  status?: string | null;
  priority?: string | null;
  reported_by?: string | null;
  assigned_to?: string | null;
  resolution_notes?: string | null;
  due_date?: string | null;
  location?: string | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
  _modified?: string;
}

export interface SafetyDrill {
  id: string;
  drill_date: string;
  drill_type?: string | null;
  scenario_description?: string | null;
  areas_involved?: string | null;
  duration_seconds?: number | null;     // UPDATED FROM DB SCRIPT
  roll_call_completed?: boolean | null; // UPDATED FROM DB SCRIPT
  issues_observed?: string | null;      // UPDATED FROM DB SCRIPT
  corrective_actions?: string | null;   // UPDATED FROM DB SCRIPT
  is_simulation?: boolean | null;       // UPDATED FROM DB SCRIPT
  status?: string | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FirstAidLog {
  id: string;
  incident_id?: string | null;
  person_involved_name?: string | null;
  incident_date: string;
  person_type?: string | null;
  treatment_provided?: string | null;
  administered_by?: string | null;
  injury_description?: string | null;
  referral_needed?: boolean | null;
  referral_details?: string | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
  _modified?: string;
}

export interface Incident {
  id: string;
  title?: string | null;
  incident_date: string;
  incident_type?: string | null;
  severity?: string | null;
  description?: string | null;
  immediate_action_taken?: string | null;
  reported_by?: string | null;
  status?: string | null;
  resolution_notes?: string | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
  _modified?: string;
}

export interface ZLADocument {
  id: string;
  name?: string | null;
  category?: string | null;
  file_url?: string | null;
  upload_date?: string | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
  _modified?: string;
}

// ============================================================================
// SYSTEM CONFIGURATION TYPES
// ============================================================================
export interface OrganizationProfile {
  id?: string;
  org_name: string;
  logo_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  license_number?: string | null;
  website?: string | null;
  adoptionurl?: string | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
  _modified?: string;
}

export interface ExternalContact {
  id: string;
  name: string;
  role: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
  _modified?: string;
}