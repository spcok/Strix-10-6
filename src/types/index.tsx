// ============================================================================
// CORE HUSBANDRY TYPES
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
}

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

export interface FeedingSchedule {
  id?: string;
  animal_id: string;
  scheduled_date: string;
  food_type: string;
  quantity: number;
  quantity_unit?: string;
  status?: string;
  supplements?: string | null;
  notes?: string | null;
  presentation_method?: string | null;
  is_deleted?: boolean;
  created_by?: string;
  modified_by?: string;
}

export interface ExternalTransfer {
  id?: string;
  animal_id: string;
  transfer_type?: string | null;
  transfer_date: string;
  entity_name?: string | null;
  entity_contact?: string | null;
  reason?: string | null;
  notes?: string | null;
  is_deleted?: boolean;
}

// ============================================================================
// V3 CLINICAL SCHEMA ALIGNMENT (Strictly Mapped to CSV)
// ============================================================================

export type EncounterType = 'ROUTINE_CHECK' | 'ILLNESS_INJURY' | 'SURGERY' | 'FOLLOW_UP';
export type ConductorRole = 'INTERNAL_VET' | 'EXTERNAL_VET' | 'KEEPER' | 'CURATOR';
export type ScheduleStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface ClinicalRecord {
  id?: string;
  animal_id: string;
  record_type: string; // NOT NULL
  record_date: string; // NOT NULL (timestamp with time zone)
  
  // SOAP Format (NOT NULL)
  soap_subjective: string;
  soap_objective: string;
  soap_assessment: string;
  soap_plan: string;
  
  weight_grams: number; // NOT NULL
  
  // Auditing & Conductors (NOT NULL)
  conductor_role: ConductorRole | string;
  conducted_by: string; // UUID of the user
  created_by: string; // UUID of the user
  modified_by: string; // UUID of the user
  
  // Optional Fields
  external_vet_name?: string | null;
  external_vet_clinic?: string | null;
  encounter_type?: EncounterType | string | null;
  is_deleted?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;

  // Relational joins (used by TanStack Query for rendering tables)
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

export interface ClinicalAttachment {
  id?: string;
  record_id: string; // UUID
  file_name: string; // NOT NULL
  file_type: string; // NOT NULL
  file_url: string; // NOT NULL
  is_deleted?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ClinicalSchedule {
  id?: string;
  animal_id: string; // UUID
  schedule_type: string; // NOT NULL
  medication_name: string; // NOT NULL
  dosage: string; // NOT NULL
  frequency: string; // NOT NULL
  start_date: string; // NOT NULL (timestamp with time zone)
  end_date?: string | null;
  status: ScheduleStatus | string; // NOT NULL
  
  notes?: string | null;
  instructions?: string | null;
  
  // Audit Fields (NOT NULL)
  created_by: string; // UUID
  modified_by: string; // UUID
  
  is_deleted?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;

  // Join fields for UI
  animals?: {
    name?: string | null;
    species?: string | null;
  };
}