export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      agile_regions: {
        Row: {
          code: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      buildings: {
        Row: {
          address: string | null
          created_at: string
          csv_matched_name: string
          custom_display_name: string
          gsp_region_code: string | null
          id: string
          organization_id: string
          schedule_override_enabled: boolean
        }
        Insert: {
          address?: string | null
          created_at?: string
          csv_matched_name?: string
          custom_display_name: string
          gsp_region_code?: string | null
          id?: string
          organization_id: string
          schedule_override_enabled?: boolean
        }
        Update: {
          address?: string | null
          created_at?: string
          csv_matched_name?: string
          custom_display_name?: string
          gsp_region_code?: string | null
          id?: string
          organization_id?: string
          schedule_override_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "buildings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_rows: {
        Row: {
          building_id: string | null
          created_at: string
          half_hourly_values: number[]
          id: string
          interval_date: string
          meter_display_name: string | null
          meter_factor: number
          meter_name: string
          organization_id: string
          original_org_unit_name: string
          variable_category: string
          variable_code: string
          variable_name: string
        }
        Insert: {
          building_id?: string | null
          created_at?: string
          half_hourly_values?: number[]
          id?: string
          interval_date: string
          meter_display_name?: string | null
          meter_factor?: number
          meter_name: string
          organization_id: string
          original_org_unit_name?: string
          variable_category?: string
          variable_code?: string
          variable_name?: string
        }
        Update: {
          building_id?: string | null
          created_at?: string
          half_hourly_values?: number[]
          id?: string
          interval_date?: string
          meter_display_name?: string | null
          meter_factor?: number
          meter_name?: string
          organization_id?: string
          original_org_unit_name?: string
          variable_category?: string
          variable_code?: string
          variable_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumption_rows_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_price_sync_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          product_code: string
          region_code: string
          rows_written: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          product_code: string
          region_code: string
          rows_written?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          product_code?: string
          region_code?: string
          rows_written?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      energy_unit_rates: {
        Row: {
          created_at: string
          id: string
          product_code: string
          region_code: string
          updated_at: string
          valid_from: string
          valid_to: string | null
          value_exc_vat: number
          value_inc_vat: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_code: string
          region_code: string
          updated_at?: string
          valid_from: string
          valid_to?: string | null
          value_exc_vat: number
          value_inc_vat: number
        }
        Update: {
          created_at?: string
          id?: string
          product_code?: string
          region_code?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
          value_exc_vat?: number
          value_inc_vat?: number
        }
        Relationships: []
      }
      ingestion_schedules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_rows_imported: number | null
          last_status: string | null
          last_synced_at: string | null
          name: string
          organization_id: string
          scheduled_time: string
          source_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_rows_imported?: number | null
          last_status?: string | null
          last_synced_at?: string | null
          name: string
          organization_id: string
          scheduled_time?: string
          source_url: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_rows_imported?: number | null
          last_status?: string | null
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          scheduled_time?: string
          source_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_settings: {
        Row: {
          id: number
          last_synced_at: string | null
          scheduled_time: string
          source_url: string
          updated_at: string
        }
        Insert: {
          id?: number
          last_synced_at?: string | null
          scheduled_time?: string
          source_url?: string
          updated_at?: string
        }
        Update: {
          id?: number
          last_synced_at?: string | null
          scheduled_time?: string
          source_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      meter_overrides: {
        Row: {
          assigned_building_id: string | null
          calibrated_meter_factor: number | null
          csv_original_building_id: string | null
          csv_original_meter_factor: number | null
          custom_display_name: string | null
          organization_id: string
          raw_meter_name: string
          updated_at: string
        }
        Insert: {
          assigned_building_id?: string | null
          calibrated_meter_factor?: number | null
          csv_original_building_id?: string | null
          csv_original_meter_factor?: number | null
          custom_display_name?: string | null
          organization_id: string
          raw_meter_name: string
          updated_at?: string
        }
        Update: {
          assigned_building_id?: string | null
          calibrated_meter_factor?: number | null
          csv_original_building_id?: string | null
          csv_original_meter_factor?: number | null
          custom_display_name?: string | null
          organization_id?: string
          raw_meter_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_overrides_assigned_building_id_fkey"
            columns: ["assigned_building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_registry_cache: {
        Row: {
          csv_building_id: string | null
          csv_meter_factor: number
          current_meter_factor: number
          latest_interval_date: string | null
          organization_id: string
          raw_meter_name: string
          row_count: number
          updated_at: string
          utility_category: string
        }
        Insert: {
          csv_building_id?: string | null
          csv_meter_factor?: number
          current_meter_factor?: number
          latest_interval_date?: string | null
          organization_id: string
          raw_meter_name: string
          row_count?: number
          updated_at?: string
          utility_category?: string
        }
        Update: {
          csv_building_id?: string | null
          csv_meter_factor?: number
          current_meter_factor?: number
          latest_interval_date?: string | null
          organization_id?: string
          raw_meter_name?: string
          row_count?: number
          updated_at?: string
          utility_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_registry_cache_csv_building_id_fkey"
            columns: ["csv_building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_registry_cache_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      neutral_home_categories: {
        Row: {
          code: string
          created_at: string
          hidden: boolean
          id: string
          label: string
          organization_id: string
          site_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          hidden?: boolean
          id?: string
          label: string
          organization_id: string
          site_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          hidden?: boolean
          id?: string
          label?: string
          organization_id?: string
          site_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neutral_home_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neutral_home_categories_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "neutral_home_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      neutral_home_circuits: {
        Row: {
          blended_p_kwh: number | null
          category: string
          circuit_name: string
          co2_kg: number | null
          co2_kg_per_m2: number | null
          co2_kg_per_person: number | null
          cost_p_per_m2: number | null
          cost_p_per_person: number | null
          created_at: string
          day_kwh: number | null
          day_p_kwh: number | null
          day_pct: number | null
          daynight_total_kwh: number | null
          id: string
          is_aggregate: boolean
          night_kwh: number | null
          night_p_kwh: number | null
          night_pct: number | null
          organization_id: string
          period_id: string
          total_cost_p: number | null
          usage_kwh: number | null
          usage_kwh_per_m2: number | null
          usage_kwh_per_person: number | null
        }
        Insert: {
          blended_p_kwh?: number | null
          category?: string
          circuit_name: string
          co2_kg?: number | null
          co2_kg_per_m2?: number | null
          co2_kg_per_person?: number | null
          cost_p_per_m2?: number | null
          cost_p_per_person?: number | null
          created_at?: string
          day_kwh?: number | null
          day_p_kwh?: number | null
          day_pct?: number | null
          daynight_total_kwh?: number | null
          id?: string
          is_aggregate?: boolean
          night_kwh?: number | null
          night_p_kwh?: number | null
          night_pct?: number | null
          organization_id: string
          period_id: string
          total_cost_p?: number | null
          usage_kwh?: number | null
          usage_kwh_per_m2?: number | null
          usage_kwh_per_person?: number | null
        }
        Update: {
          blended_p_kwh?: number | null
          category?: string
          circuit_name?: string
          co2_kg?: number | null
          co2_kg_per_m2?: number | null
          co2_kg_per_person?: number | null
          cost_p_per_m2?: number | null
          cost_p_per_person?: number | null
          created_at?: string
          day_kwh?: number | null
          day_p_kwh?: number | null
          day_pct?: number | null
          daynight_total_kwh?: number | null
          id?: string
          is_aggregate?: boolean
          night_kwh?: number | null
          night_p_kwh?: number | null
          night_pct?: number | null
          organization_id?: string
          period_id?: string
          total_cost_p?: number | null
          usage_kwh?: number | null
          usage_kwh_per_m2?: number | null
          usage_kwh_per_person?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "neutral_home_circuits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neutral_home_circuits_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "neutral_home_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      neutral_home_meter_categories: {
        Row: {
          category: string | null
          circuit_name: string
          kind: string
          organization_id: string
          site_id: string
          updated_at: string
          zone_circuit_name: string | null
        }
        Insert: {
          category?: string | null
          circuit_name: string
          kind?: string
          organization_id: string
          site_id: string
          updated_at?: string
          zone_circuit_name?: string | null
        }
        Update: {
          category?: string | null
          circuit_name?: string
          kind?: string
          organization_id?: string
          site_id?: string
          updated_at?: string
          zone_circuit_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "neutral_home_meter_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neutral_home_meter_categories_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "neutral_home_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      neutral_home_metrics: {
        Row: {
          circuit_names: string[]
          created_at: string
          id: string
          lower_is_better: boolean
          name: string
          organization_id: string
          site_id: string
          sort_order: number
          source: string
          unit: string
          updated_at: string
        }
        Insert: {
          circuit_names?: string[]
          created_at?: string
          id?: string
          lower_is_better?: boolean
          name: string
          organization_id: string
          site_id: string
          sort_order?: number
          source?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          circuit_names?: string[]
          created_at?: string
          id?: string
          lower_is_better?: boolean
          name?: string
          organization_id?: string
          site_id?: string
          sort_order?: number
          source?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neutral_home_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neutral_home_metrics_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "neutral_home_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      neutral_home_periods: {
        Row: {
          created_at: string
          id: string
          label: string
          organization_id: string
          period_end: string
          period_start: string
          site_id: string
          source_daynight_filename: string | null
          source_headline_filename: string | null
          source_temperature_filename: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          organization_id: string
          period_end: string
          period_start: string
          site_id: string
          source_daynight_filename?: string | null
          source_headline_filename?: string | null
          source_temperature_filename?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          site_id?: string
          source_daynight_filename?: string | null
          source_headline_filename?: string | null
          source_temperature_filename?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neutral_home_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neutral_home_periods_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "neutral_home_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      neutral_home_room_hours: {
        Row: {
          created_at: string
          hour_ts: string
          id: string
          on_share: number | null
          organization_id: string
          period_id: string
          reading_count: number
          room_name: string
          set_temp_avg: number | null
          site_id: string
          temp_avg: number | null
          temp_max: number | null
          temp_min: number | null
        }
        Insert: {
          created_at?: string
          hour_ts: string
          id?: string
          on_share?: number | null
          organization_id: string
          period_id: string
          reading_count?: number
          room_name: string
          set_temp_avg?: number | null
          site_id: string
          temp_avg?: number | null
          temp_max?: number | null
          temp_min?: number | null
        }
        Update: {
          created_at?: string
          hour_ts?: string
          id?: string
          on_share?: number | null
          organization_id?: string
          period_id?: string
          reading_count?: number
          room_name?: string
          set_temp_avg?: number | null
          site_id?: string
          temp_avg?: number | null
          temp_max?: number | null
          temp_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "neutral_home_room_hours_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neutral_home_room_hours_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "neutral_home_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neutral_home_room_hours_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "neutral_home_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      neutral_home_room_map: {
        Row: {
          auto_matched: boolean
          circuit_name: string | null
          confidence: number | null
          created_at: string
          organization_id: string
          room_name: string
          site_id: string
          updated_at: string
        }
        Insert: {
          auto_matched?: boolean
          circuit_name?: string | null
          confidence?: number | null
          created_at?: string
          organization_id: string
          room_name: string
          site_id: string
          updated_at?: string
        }
        Update: {
          auto_matched?: boolean
          circuit_name?: string | null
          confidence?: number | null
          created_at?: string
          organization_id?: string
          room_name?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neutral_home_room_map_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neutral_home_room_map_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "neutral_home_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      neutral_home_site_settings: {
        Row: {
          comfort_max_c: number
          comfort_min_c: number
          comparison_metrics: string[]
          organization_id: string
          site_id: string
          updated_at: string
        }
        Insert: {
          comfort_max_c?: number
          comfort_min_c?: number
          comparison_metrics?: string[]
          organization_id: string
          site_id: string
          updated_at?: string
        }
        Update: {
          comfort_max_c?: number
          comfort_min_c?: number
          comparison_metrics?: string[]
          organization_id?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neutral_home_site_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neutral_home_site_settings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "neutral_home_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      neutral_home_sites: {
        Row: {
          address: string | null
          created_at: string
          floor_area_m2: number | null
          hdd_base_c: number
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          occupancy: number | null
          organization_id: string
          postcode: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          floor_area_m2?: number | null
          hdd_base_c?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          occupancy?: number | null
          organization_id: string
          postcode?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          floor_area_m2?: number | null
          hdd_base_c?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          occupancy?: number | null
          organization_id?: string
          postcode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neutral_home_sites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      neutral_home_weather_days: {
        Row: {
          created_at: string
          day: string
          hdd: number | null
          id: string
          organization_id: string
          site_id: string
          temp_max: number | null
          temp_mean: number | null
          temp_min: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          day: string
          hdd?: number | null
          id?: string
          organization_id: string
          site_id: string
          temp_max?: number | null
          temp_mean?: number | null
          temp_min?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          day?: string
          hdd?: number | null
          id?: string
          organization_id?: string
          site_id?: string
          temp_max?: number | null
          temp_mean?: number | null
          temp_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neutral_home_weather_days_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neutral_home_weather_days_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "neutral_home_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          active_days: number[]
          active_from: string
          active_to: string
          co2_factor_electricity_kg_per_kwh: number | null
          co2_factor_gas_kg_per_kwh: number | null
          co2_factor_water_kg_per_m3: number | null
          completeness_flatline_hours: number
          completeness_missing_pct: number
          created_at: string
          default_gsp_region_code: string | null
          holidays: string[]
          id: string
          location: string | null
          organization_name: string
          peak_season_months: number[]
          profile_type: string
          shiftable_load_pct: number
          summer_gas_months: number[]
          tariff_electricity_pence_per_kwh: number | null
          tariff_gas_pence_per_kwh: number | null
          tariff_water_pence_per_m3: number | null
        }
        Insert: {
          active_days?: number[]
          active_from?: string
          active_to?: string
          co2_factor_electricity_kg_per_kwh?: number | null
          co2_factor_gas_kg_per_kwh?: number | null
          co2_factor_water_kg_per_m3?: number | null
          completeness_flatline_hours?: number
          completeness_missing_pct?: number
          created_at?: string
          default_gsp_region_code?: string | null
          holidays?: string[]
          id?: string
          location?: string | null
          organization_name: string
          peak_season_months?: number[]
          profile_type?: string
          shiftable_load_pct?: number
          summer_gas_months?: number[]
          tariff_electricity_pence_per_kwh?: number | null
          tariff_gas_pence_per_kwh?: number | null
          tariff_water_pence_per_m3?: number | null
        }
        Update: {
          active_days?: number[]
          active_from?: string
          active_to?: string
          co2_factor_electricity_kg_per_kwh?: number | null
          co2_factor_gas_kg_per_kwh?: number | null
          co2_factor_water_kg_per_m3?: number | null
          completeness_flatline_hours?: number
          completeness_missing_pct?: number
          created_at?: string
          default_gsp_region_code?: string | null
          holidays?: string[]
          id?: string
          location?: string | null
          organization_name?: string
          peak_season_months?: number[]
          profile_type?: string
          shiftable_load_pct?: number
          summer_gas_months?: number[]
          tariff_electricity_pence_per_kwh?: number | null
          tariff_gas_pence_per_kwh?: number | null
          tariff_water_pence_per_m3?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      refrigeration_alarm_logs: {
        Row: {
          alarm_csv: string
          building_id: string
          created_at: string
          id: string
          organization_id: string
          source_filename: string | null
          updated_at: string
        }
        Insert: {
          alarm_csv: string
          building_id: string
          created_at?: string
          id?: string
          organization_id: string
          source_filename?: string | null
          updated_at?: string
        }
        Update: {
          alarm_csv?: string
          building_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          source_filename?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refrigeration_alarm_logs_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: true
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refrigeration_alarm_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      refrigeration_cases: {
        Row: {
          building_id: string
          case_id: string
          controller: string
          controller_description: string
          created_at: string
          csv_text: string | null
          description: string
          efficiency_amber: number
          efficiency_red: number
          id: string
          label: string
          max_safe_temp: number
          organization_id: string
          source_filename: string | null
          status: string
          updated_at: string
        }
        Insert: {
          building_id: string
          case_id: string
          controller?: string
          controller_description?: string
          created_at?: string
          csv_text?: string | null
          description?: string
          efficiency_amber?: number
          efficiency_red?: number
          id?: string
          label?: string
          max_safe_temp?: number
          organization_id: string
          source_filename?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          building_id?: string
          case_id?: string
          controller?: string
          controller_description?: string
          created_at?: string
          csv_text?: string | null
          description?: string
          efficiency_amber?: number
          efficiency_red?: number
          id?: string
          label?: string
          max_safe_temp?: number
          organization_id?: string
          source_filename?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refrigeration_cases_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refrigeration_cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      refrigeration_settings: {
        Row: {
          created_at: string
          default_efficiency_amber: number
          default_efficiency_red: number
          default_max_safe_temp: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_efficiency_amber?: number
          default_efficiency_red?: number
          default_max_safe_temp?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_efficiency_amber?: number
          default_efficiency_red?: number
          default_max_safe_temp?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refrigeration_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          building_id: string
          created_at: string
          day: string
          from_time: string
          id: string
          months: number[]
          name: string
          to_time: string
        }
        Insert: {
          building_id: string
          created_at?: string
          day: string
          from_time: string
          id?: string
          months?: number[]
          name: string
          to_time: string
        }
        Update: {
          building_id?: string
          created_at?: string
          day?: string
          from_time?: string
          id?: string
          months?: number[]
          name?: string
          to_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_labels: {
        Row: {
          key: string
          label: string
          updated_at: string
        }
        Insert: {
          key: string
          label: string
          updated_at?: string
        }
        Update: {
          key?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      sustainability_categories: {
        Row: {
          code: string
          id: string
          name: string
          scope: number
          sort_order: number
        }
        Insert: {
          code: string
          id?: string
          name: string
          scope?: number
          sort_order?: number
        }
        Update: {
          code?: string
          id?: string
          name?: string
          scope?: number
          sort_order?: number
        }
        Relationships: []
      }
      sustainability_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          item_id: string
          notes: string | null
          organization_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date: string
          id?: string
          item_id: string
          notes?: string | null
          organization_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          item_id?: string
          notes?: string | null
          organization_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sustainability_entries_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "sustainability_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sustainability_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      sustainability_items: {
        Row: {
          active: boolean
          category_id: string
          created_at: string
          emission_factor: number
          factor_source: string | null
          id: string
          is_preset: boolean
          name: string
          organization_id: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id: string
          created_at?: string
          emission_factor: number
          factor_source?: string | null
          id?: string
          is_preset?: boolean
          name: string
          organization_id?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          created_at?: string
          emission_factor?: number
          factor_source?: string | null
          id?: string
          is_preset?: boolean
          name?: string
          organization_id?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sustainability_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "sustainability_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sustainability_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      sustainability_targets: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          organization_id: string
          period_end: string
          period_start: string
          scope: number
          target_tco2e: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          scope: number
          target_tco2e: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          scope?: number
          target_tco2e?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sustainability_targets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "sustainability_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sustainability_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_app_access: {
        Row: {
          app_slug: string
          created_at: string
          user_id: string
        }
        Insert: {
          app_slug: string
          created_at?: string
          user_id: string
        }
        Update: {
          app_slug?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_organisations: {
        Row: {
          created_at: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organisations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      water_leak_acknowledgements: {
        Row: {
          acknowledged_by: string | null
          created_at: string
          id: string
          note: string | null
          organization_id: string
          period_end: string | null
          period_start: string | null
          raw_meter_name: string
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          raw_meter_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          raw_meter_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      water_sentinel_settings: {
        Row: {
          consecutive_intervals: number
          created_at: string
          organization_id: string
          sensitivity_m3: number
          updated_at: string
          wastewater_pence_per_m3: number
          window_end: string
          window_start: string
        }
        Insert: {
          consecutive_intervals?: number
          created_at?: string
          organization_id: string
          sensitivity_m3?: number
          updated_at?: string
          wastewater_pence_per_m3?: number
          window_end?: string
          window_start?: string
        }
        Update: {
          consecutive_intervals?: number
          created_at?: string
          organization_id?: string
          sensitivity_m3?: number
          updated_at?: string
          wastewater_pence_per_m3?: number
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      meter_registry: {
        Row: {
          csv_meter_factor: number | null
          custom_display_name: string | null
          effective_building_id: string | null
          effective_building_name: string | null
          effective_meter_factor: number | null
          has_override: boolean | null
          organization_id: string | null
          raw_meter_name: string | null
          row_count: number | null
          utility_category: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meter_registry_cache_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager: { Args: { _user_id: string }; Returns: boolean }
      refresh_meter_registry_cache_one: {
        Args: { _organization_id: string; _raw_meter_name: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "user"],
    },
  },
} as const
