// ============================================================================
// STRIX-OS V3 DATABASE SCHEMA ALIGNMENT
// ============================================================================
// This file strictly mirrors the v3-database schema.csv definitions.
// ----------------------------------------------------------------------------

// --- Core Enums ---
export type AnimalCategory = 'OWL' | 'RAPTOR' | 'MAMMAL' | 'EXOTIC';
export type AnimalStatus = 'ON_DISPLAY' | 'OFF_DISPLAY' | 'QUARANTINE' | 'MEDICAL' | 'OFFSITE' | 'ARCHIVED';
export type RecordType = 'INDIVIDUAL' | 'GROUP';
export type EncounterType = 'ROUTINE_CHECK' | 'ILLNESS' | 'INJURY' | 'SURGERY' | 'FOLLOW_UP';
export type ConductorRole = 'VOLUNTEER' | 'KEEPER' | 'SENIOR_KEEPER' | 'HEAD_KEEPER_VOLUNTEER' | 'OWNER_DIRECTOR';
export type ScheduleStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

// ============================================================================
// ANIMALS TABLE
// ============================================================================
export interface Animal {
  id: string; // uuid, NO
  parent_group_id?: string | null; // uuid, YES
  census_count: number; // integer, NO
  name?: string | null; // text, YES
  species?: string | null; // text, YES
  latin_name?: string | null; // text, YES
  category?: AnimalCategory | string | null; // text, YES
  location?: string | null; // text, YES
  profile_image_url?: string | null; // text, YES
  distribution_map_url?: string | null; // text, YES
  hazard_rating?: string | null; // text, YES
  is_venomous?: boolean | null; // boolean, YES
  weight_unit: string; // text, NO
  flying_weight?: number | null; // numeric, YES
  winter_weight?: number | null; // numeric, YES
  average_target_weight?: number | null; // numeric, YES
  date_of_birth?: string | null; // date, YES
  is_dob_unknown?: boolean | null; // boolean, YES
  gender?: string | null; // text, YES
  microchip_id?: string | null; // text, YES
  ring_number?: string | null; // text, YES
  has_no_id?: boolean | null; // boolean, YES
  red_list_status: string; // text, NO
  description?: string | null; // text, YES
  special_requirements?: string | null; // text, YES
  critical_husbandry_notes?: string | null; // text, YES
  ambient_temp_only?: boolean | null; // boolean, YES
  target_day_temp_c?: number | null; // numeric, YES
  target_night_temp_c?: number | null; // numeric, YES
  water_tipping_temp?: number | null; // numeric, YES
  target_humidity_min_percent?: number | null; // numeric, YES
  target_humidity_max_percent?: number | null; // numeric, YES
  misting_frequency?: string | null; // text, YES
  acquisition_date?: string | null; // date, YES
  acquisition_type?: string | null; // text, YES
  origin?: string | null; // text, YES
  origin_location?: string | null; // text, YES
  lineage_unknown?: boolean | null; // boolean, YES
  sire_id?: string | null; // uuid, YES
  dam_id?: string | null; // uuid, YES
  is_boarding?: boolean | null; // boolean, YES
  is_quarantine?: boolean | null; // boolean, YES
  display_order: number; // integer, NO
  is_deleted?: boolean | null; // boolean, YES
  created_at?: string | null; // timestamp with time zone, YES
  updated_at?: string | null; // timestamp with time zone, YES
  created_by?: string | null; // uuid, YES
  modified_by?: string | null; // uuid, YES
  status?: AnimalStatus | string | null; // text, YES
  record_type?: RecordType | string | null; // text, YES
  archive_reason?: string | null; // text, YES
}

// ============================================================================
// CLINICAL RECORDS TABLE (SOAP FORMAT)
// ============================================================================
export interface ClinicalRecord {
  id?: string; // uuid, NO (Optional on creation)
  animal_id: string; // uuid, NO
  record_type: string; // text, NO
  record_date: string; // timestamp with time zone, NO
  
  // SOAP Format (Strictly NOT NULL)
  soap_subjective: string; // text, NO
  soap_objective: string; // text, NO
  soap_assessment: string; // text, NO
  soap_plan: string; // text, NO
  
  weight_grams: number; // numeric, NO
  conductor_role: ConductorRole | string; // text, NO
  conducted_by: string; // uuid, NO
  
  external_vet_name?: string | null; // text, YES
  external_vet_clinic?: string | null; // text, YES
  is_deleted?: boolean | null; // boolean, YES
  
  created_by: string; // uuid, NO
  modified_by: string; // uuid, NO
  created_at?: string | null; // timestamp with time zone, YES
  updated_at?: string | null; // timestamp with time zone, YES
  encounter_type?: EncounterType | string | null; // text, YES

  // UI Relational Joins
  animals?: {
    id?: string;
    name?: string | null;
    species?: string | null;
  };
  users?: {
    first_name?: string;
    last_name?: string;
  };
}

// ============================================================================
// CLINICAL ATTACHMENTS TABLE
// ============================================================================
export interface ClinicalAttachment {
  id?: string; // uuid, NO
  record_id: string; // uuid, NO
  file_name: string; // text, NO
  file_type: string; // text, NO
  file_url: string; // text, NO
  is_deleted?: boolean | null; // boolean, YES
  created_at?: string | null; // timestamp with time zone, YES
  updated_at?: string | null; // timestamp with time zone, YES
}

// ============================================================================
// CLINICAL SCHEDULE TABLE
// ============================================================================
export interface ClinicalSchedule {
  id?: string; // uuid, NO
  animal_id: string; // uuid, NO
  schedule_type: string; // text, NO
  medication_name: string; // text, NO
  dosage: string; // text, NO
  frequency: string; // text, NO
  start_date: string; // timestamp with time zone, NO
  end_date?: string | null; // timestamp with time zone, YES
  status: ScheduleStatus | string; // text, NO
  is_deleted?: boolean | null; // boolean, YES
  
  created_by: string; // uuid, NO
  modified_by: string; // uuid, NO
  created_at?: string | null; // timestamp with time zone, YES
  updated_at?: string | null; // timestamp with time zone, YES
  
  notes?: string | null; // text, YES
  instructions?: string | null; // text, YES

  // UI Relational Joins
  animals?: {
    name?: string | null;
    species?: string | null;
  };
}

// ============================================================================
// DAILY LOGS TABLE
// ============================================================================
export interface DailyLog {
  id?: string; // uuid, NO
  animal_id: string; // uuid, NO
  log_type: string; // text, NO
  log_date: string; // timestamp with time zone, NO
  notes?: string | null; // text, YES
  weight_grams?: number | null; // numeric, YES
  
  // Standard operational columns often expected by the UI
  is_deleted?: boolean;
  created_by?: string;
  modified_by?: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// EXTERNAL / OPERATIONAL LISTS (If utilized by other modules)
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
  animal_category?: string | null;
}