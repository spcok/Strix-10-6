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
  
  location: string | null; // Added from DB schema
  
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
  
  // Note: Your DB schema lists this as 'text', not 'jsonb'. 
  // If Supabase returns it as a string, you'll need to JSON.parse() it on the frontend.
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
  requires_followup: boolean | null; // Added from DB schema
  followup_notes: string | null; // Added from DB schema
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
  quantity_unit: string; // Added from DB schema
  status: string; // DB uses status instead of 'is_completed'
  notes: string | null; // Added from DB schema
  supplements: string | null; // Replaces 'calci_dust' in DB
  presentation_method: string | null; // Added from DB schema
  completed_at?: string | null;
  completed_by?: string | null;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  modified_by?: string | null;
  // CRITICAL WARNING: 'interval_days' DOES NOT EXIST in your DB schema. 
  // You will hit a 400 Bad Request if your UI tries to save it.
}

export interface OperationalList {
  id: string;
  name: string; 
  category: string;
  description?: string | null; // Added from DB schema
  status?: string | null; // Added from DB schema
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