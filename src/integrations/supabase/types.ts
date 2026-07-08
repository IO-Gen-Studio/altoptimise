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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      buildings: {
        Row: {
          address: string | null
          created_at: string
          csv_matched_name: string
          custom_display_name: string
          id: string
          organization_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          csv_matched_name?: string
          custom_display_name: string
          id?: string
          organization_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          csv_matched_name?: string
          custom_display_name?: string
          id?: string
          organization_id?: string
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
      organisations: {
        Row: {
          created_at: string
          id: string
          location: string | null
          organization_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          organization_name: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          organization_name?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "viewer"
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
      app_role: ["admin", "viewer"],
    },
  },
} as const
