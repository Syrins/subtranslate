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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          message: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          message: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          message?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          audio_codec: string
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          include_watermark: boolean
          keep_audio_tracks: boolean
          mode: string
          output_file_size_bytes: number | null
          output_file_url: string | null
          progress: number
          project_id: string
          resolution: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
          video_codec: string
          watermark_text: string | null
        }
        Insert: {
          audio_codec?: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          include_watermark?: boolean
          keep_audio_tracks?: boolean
          mode?: string
          output_file_size_bytes?: number | null
          output_file_url?: string | null
          progress?: number
          project_id: string
          resolution?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          video_codec?: string
          watermark_text?: string | null
        }
        Update: {
          audio_codec?: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          include_watermark?: boolean
          keep_audio_tracks?: boolean
          mode?: string
          output_file_size_bytes?: number | null
          output_file_url?: string | null
          progress?: number
          project_id?: string
          resolution?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          video_codec?: string
          watermark_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      glossary_terms: {
        Row: {
          created_at: string
          id: string
          source_lang: string
          source_term: string
          target_lang: string
          target_term: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_lang: string
          source_term: string
          target_lang: string
          target_term: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source_lang?: string
          source_term?: string
          target_lang?: string
          target_term?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "glossary_terms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          daily_jobs_used: number
          default_engine: string
          default_source_lang: string
          default_target_lang: string
          email_notifications: boolean
          export_notifications: boolean
          full_name: string | null
          id: string
          last_job_reset_date: string
          lines_used_this_month: number
          locale: string
          plan_id: string
          role: string
          status: string
          storage_used_bytes: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          daily_jobs_used?: number
          default_engine?: string
          default_source_lang?: string
          default_target_lang?: string
          email_notifications?: boolean
          export_notifications?: boolean
          full_name?: string | null
          id: string
          last_job_reset_date?: string
          lines_used_this_month?: number
          locale?: string
          plan_id?: string
          role?: string
          status?: string
          storage_used_bytes?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          daily_jobs_used?: number
          default_engine?: string
          default_source_lang?: string
          default_target_lang?: string
          email_notifications?: boolean
          export_notifications?: boolean
          full_name?: string | null
          id?: string
          last_job_reset_date?: string
          lines_used_this_month?: number
          locale?: string
          plan_id?: string
          role?: string
          status?: string
          storage_used_bytes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          audio_tracks: number | null
          created_at: string
          duration_seconds: number | null
          file_name: string
          file_size_bytes: number
          file_url: string | null
          id: string
          name: string
          source_lang: string
          status: string
          target_lang: string
          thumbnail_url: string | null
          total_lines: number
          translated_lines: number
          updated_at: string
          user_id: string
          video_codec: string | null
        }
        Insert: {
          audio_tracks?: number | null
          created_at?: string
          duration_seconds?: number | null
          file_name: string
          file_size_bytes?: number
          file_url?: string | null
          id?: string
          name: string
          source_lang?: string
          status?: string
          target_lang?: string
          thumbnail_url?: string | null
          total_lines?: number
          translated_lines?: number
          updated_at?: string
          user_id: string
          video_codec?: string | null
        }
        Update: {
          audio_tracks?: number | null
          created_at?: string
          duration_seconds?: number | null
          file_name?: string
          file_size_bytes?: number
          file_url?: string | null
          id?: string
          name?: string
          source_lang?: string
          status?: string
          target_lang?: string
          thumbnail_url?: string | null
          total_lines?: number
          translated_lines?: number
          updated_at?: string
          user_id?: string
          video_codec?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stored_files: {
        Row: {
          cdn_url: string | null
          created_at: string
          expires_at: string
          file_size_bytes: number
          file_type: string
          id: string
          project_id: string | null
          storage_path: string
          uploaded_to_user_storage: boolean
          user_id: string
        }
        Insert: {
          cdn_url?: string | null
          created_at?: string
          expires_at: string
          file_size_bytes?: number
          file_type: string
          id?: string
          project_id?: string | null
          storage_path: string
          uploaded_to_user_storage?: boolean
          user_id: string
        }
        Update: {
          cdn_url?: string | null
          created_at?: string
          expires_at?: string
          file_size_bytes?: number
          file_type?: string
          id?: string
          project_id?: string | null
          storage_path?: string
          uploaded_to_user_storage?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stored_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stored_files_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          api_access: boolean
          can_use_system_keys: boolean
          created_at: string
          currency: string
          daily_job_limit: number
          features: Json
          id: string
          is_active: boolean
          lines_per_month: number
          max_export_resolution: string
          name: string
          price_monthly: number
          priority_queue: boolean
          retention_days: number
          sort_order: number
          storage_gb: number
          team_management: boolean
          updated_at: string
          watermark_required: boolean
        }
        Insert: {
          api_access?: boolean
          can_use_system_keys?: boolean
          created_at?: string
          currency?: string
          daily_job_limit?: number
          features?: Json
          id: string
          is_active?: boolean
          lines_per_month?: number
          max_export_resolution?: string
          name: string
          price_monthly?: number
          priority_queue?: boolean
          retention_days?: number
          sort_order?: number
          storage_gb?: number
          team_management?: boolean
          updated_at?: string
          watermark_required?: boolean
        }
        Update: {
          api_access?: boolean
          can_use_system_keys?: boolean
          created_at?: string
          currency?: string
          daily_job_limit?: number
          features?: Json
          id?: string
          is_active?: boolean
          lines_per_month?: number
          max_export_resolution?: string
          name?: string
          price_monthly?: number
          priority_queue?: boolean
          retention_days?: number
          sort_order?: number
          storage_gb?: number
          team_management?: boolean
          updated_at?: string
          watermark_required?: boolean
        }
        Relationships: []
      }
      subtitle_files: {
        Row: {
          created_at: string
          file_url: string | null
          format: string
          id: string
          language: string | null
          project_id: string
          total_lines: number
          track_index: number
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          format?: string
          id?: string
          language?: string | null
          project_id: string
          total_lines?: number
          track_index?: number
        }
        Update: {
          created_at?: string
          file_url?: string | null
          format?: string
          id?: string
          language?: string | null
          project_id?: string
          total_lines?: number
          track_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "subtitle_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      subtitle_lines: {
        Row: {
          created_at: string
          end_time: string
          id: string
          is_translated: boolean
          line_number: number
          original_text: string
          project_id: string
          start_time: string
          style: Json | null
          subtitle_file_id: string
          translated_text: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          is_translated?: boolean
          line_number: number
          original_text?: string
          project_id: string
          start_time: string
          style?: Json | null
          subtitle_file_id: string
          translated_text?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          is_translated?: boolean
          line_number?: number
          original_text?: string
          project_id?: string
          start_time?: string
          style?: Json | null
          subtitle_file_id?: string
          translated_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtitle_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtitle_lines_subtitle_file_id_fkey"
            columns: ["subtitle_file_id"]
            isOneToOne: false
            referencedRelation: "subtitle_files"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_engines: {
        Row: {
          api_key_encrypted: string | null
          cost_per_line: number
          created_at: string
          docs_url: string | null
          id: string
          is_enabled: boolean
          model: string
          name: string
          rate_limit_per_minute: number
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          cost_per_line?: number
          created_at?: string
          docs_url?: string | null
          id: string
          is_enabled?: boolean
          model: string
          name: string
          rate_limit_per_minute?: number
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          cost_per_line?: number
          created_at?: string
          docs_url?: string | null
          id?: string
          is_enabled?: boolean
          model?: string
          name?: string
          rate_limit_per_minute?: number
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      translation_jobs: {
        Row: {
          completed_at: string | null
          context_enabled: boolean
          cost_usd: number | null
          created_at: string
          duration_ms: number | null
          engine: string
          error_message: string | null
          glossary_enabled: boolean
          id: string
          progress: number
          project_id: string
          source_lang: string
          started_at: string | null
          status: string
          target_lang: string
          total_lines: number
          translated_lines: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          context_enabled?: boolean
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          engine?: string
          error_message?: string | null
          glossary_enabled?: boolean
          id?: string
          progress?: number
          project_id: string
          source_lang: string
          started_at?: string | null
          status?: string
          target_lang: string
          total_lines?: number
          translated_lines?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          context_enabled?: boolean
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          engine?: string
          error_message?: string | null
          glossary_enabled?: boolean
          id?: string
          progress?: number
          project_id?: string
          source_lang?: string
          started_at?: string | null
          status?: string
          target_lang?: string
          total_lines?: number
          translated_lines?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translation_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_api_keys: {
        Row: {
          api_key_encrypted: string
          created_at: string
          engine: string
          id: string
          is_valid: boolean | null
          last_validated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_encrypted: string
          created_at?: string
          engine: string
          id?: string
          is_valid?: boolean | null
          last_validated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_encrypted?: string
          created_at?: string
          engine?: string
          id?: string
          is_valid?: boolean | null
          last_validated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_storage_configs: {
        Row: {
          b2_app_key_encrypted: string | null
          b2_bucket_id: string | null
          b2_bucket_name: string | null
          b2_key_id: string | null
          created_at: string
          id: string
          is_active: boolean
          last_test_result: string | null
          last_tested_at: string | null
          provider: string
          r2_access_key: string | null
          r2_account_id: string | null
          r2_bucket_name: string | null
          r2_endpoint: string | null
          r2_secret_key_encrypted: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          b2_app_key_encrypted?: string | null
          b2_bucket_id?: string | null
          b2_bucket_name?: string | null
          b2_key_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_test_result?: string | null
          last_tested_at?: string | null
          provider: string
          r2_access_key?: string | null
          r2_account_id?: string | null
          r2_bucket_name?: string | null
          r2_endpoint?: string | null
          r2_secret_key_encrypted?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          b2_app_key_encrypted?: string | null
          b2_bucket_id?: string | null
          b2_bucket_name?: string | null
          b2_key_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_test_result?: string | null
          last_tested_at?: string | null
          provider?: string
          r2_access_key?: string | null
          r2_account_id?: string | null
          r2_bucket_name?: string | null
          r2_endpoint?: string | null
          r2_secret_key_encrypted?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_storage_configs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_reset_daily_jobs: {
        Args: { user_id_param: string }
        Returns: number
      }
      increment_daily_jobs: {
        Args: { user_id_param: string }
        Returns: undefined
      }
      increment_lines_used: {
        Args: { lines_count: number; user_id_param: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
