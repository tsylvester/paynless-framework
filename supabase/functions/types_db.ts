export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_providers: {
        Row: {
          api_identifier: string
          config: Json | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_enabled: boolean
          name: string
          provider: string | null
          updated_at: string
        }
        Insert: {
          api_identifier: string
          config?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_enabled?: boolean
          name: string
          provider?: string | null
          updated_at?: string
        }
        Update: {
          api_identifier?: string
          config?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_enabled?: boolean
          name?: string
          provider?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          ai_provider_id: string | null
          chat_id: string
          content: string
          created_at: string
          error_type: string | null
          id: string
          is_active_in_thread: boolean
          response_to_message_id: string | null
          role: string
          system_prompt_id: string | null
          token_usage: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai_provider_id?: string | null
          chat_id: string
          content: string
          created_at?: string
          error_type?: string | null
          id?: string
          is_active_in_thread?: boolean
          response_to_message_id?: string | null
          role: string
          system_prompt_id?: string | null
          token_usage?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai_provider_id?: string | null
          chat_id?: string
          content?: string
          created_at?: string
          error_type?: string | null
          id?: string
          is_active_in_thread?: boolean
          response_to_message_id?: string | null
          role?: string
          system_prompt_id?: string | null
          token_usage?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_ai_provider_id_fkey"
            columns: ["ai_provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_system_prompt_id_fkey"
            columns: ["system_prompt_id"]
            isOneToOne: false
            referencedRelation: "system_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_chat_messages_response_to_message_id"
            columns: ["response_to_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          system_prompt_id: string | null
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          system_prompt_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          system_prompt_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_system_prompt_id_fkey"
            columns: ["system_prompt_id"]
            isOneToOne: false
            referencedRelation: "system_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      dialectic_artifact_types: {
        Row: {
          created_at: string
          default_file_extension: string | null
          description: string | null
          id: string
          mime_type: string
          name: string
        }
        Insert: {
          created_at?: string
          default_file_extension?: string | null
          description?: string | null
          id?: string
          mime_type: string
          name: string
        }
        Update: {
          created_at?: string
          default_file_extension?: string | null
          description?: string | null
          id?: string
          mime_type?: string
          name?: string
        }
        Relationships: []
      }
      dialectic_contributions: {
        Row: {
          citations: Json | null
          content_mime_type: string
          content_size_bytes: number | null
          content_storage_bucket: string
          content_storage_path: string
          contribution_type: string | null
          created_at: string
          edit_version: number
          error: string | null
          id: string
          is_latest_edit: boolean
          iteration_number: number
          model_id: string | null
          model_name: string | null
          original_model_contribution_id: string | null
          processing_time_ms: number | null
          prompt_template_id_used: string | null
          raw_response_storage_path: string | null
          seed_prompt_url: string | null
          session_id: string
          stage: string
          target_contribution_id: string | null
          tokens_used_input: number | null
          tokens_used_output: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          citations?: Json | null
          content_mime_type?: string
          content_size_bytes?: number | null
          content_storage_bucket?: string
          content_storage_path: string
          contribution_type?: string | null
          created_at?: string
          edit_version?: number
          error?: string | null
          id?: string
          is_latest_edit?: boolean
          iteration_number?: number
          model_id?: string | null
          model_name?: string | null
          original_model_contribution_id?: string | null
          processing_time_ms?: number | null
          prompt_template_id_used?: string | null
          raw_response_storage_path?: string | null
          seed_prompt_url?: string | null
          session_id: string
          stage: string
          target_contribution_id?: string | null
          tokens_used_input?: number | null
          tokens_used_output?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          citations?: Json | null
          content_mime_type?: string
          content_size_bytes?: number | null
          content_storage_bucket?: string
          content_storage_path?: string
          contribution_type?: string | null
          created_at?: string
          edit_version?: number
          error?: string | null
          id?: string
          is_latest_edit?: boolean
          iteration_number?: number
          model_id?: string | null
          model_name?: string | null
          original_model_contribution_id?: string | null
          processing_time_ms?: number | null
          prompt_template_id_used?: string | null
          raw_response_storage_path?: string | null
          seed_prompt_url?: string | null
          session_id?: string
          stage?: string
          target_contribution_id?: string | null
          tokens_used_input?: number | null
          tokens_used_output?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dialectic_contributions_original_model_contribution_id_fkey"
            columns: ["original_model_contribution_id"]
            isOneToOne: false
            referencedRelation: "dialectic_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialectic_contributions_prompt_template_id_used_fkey"
            columns: ["prompt_template_id_used"]
            isOneToOne: false
            referencedRelation: "system_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialectic_contributions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialectic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialectic_contributions_target_contribution_id_fkey"
            columns: ["target_contribution_id"]
            isOneToOne: false
            referencedRelation: "dialectic_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dialectic_contributions_model_id"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      dialectic_domains: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          parent_domain_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_domain_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_domain_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialectic_domains_parent_domain_id_fkey"
            columns: ["parent_domain_id"]
            isOneToOne: false
            referencedRelation: "dialectic_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      dialectic_feedback: {
        Row: {
          contribution_id: string | null
          created_at: string
          feedback_type: string
          feedback_value_structured: Json | null
          feedback_value_text: string | null
          id: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contribution_id?: string | null
          created_at?: string
          feedback_type: string
          feedback_value_structured?: Json | null
          feedback_value_text?: string | null
          id?: string
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contribution_id?: string | null
          created_at?: string
          feedback_type?: string
          feedback_value_structured?: Json | null
          feedback_value_text?: string | null
          id?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialectic_feedback_contribution_id_fkey"
            columns: ["contribution_id"]
            isOneToOne: false
            referencedRelation: "dialectic_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialectic_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialectic_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dialectic_process_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          starting_stage_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          starting_stage_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          starting_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dialectic_process_templates_starting_stage_id_fkey"
            columns: ["starting_stage_id"]
            isOneToOne: false
            referencedRelation: "dialectic_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      dialectic_project_resources: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string
          project_id: string
          resource_description: string | null
          size_bytes: number
          storage_bucket: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          project_id: string
          resource_description?: string | null
          size_bytes: number
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          project_id?: string
          resource_description?: string | null
          size_bytes?: number
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialectic_project_resources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "dialectic_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dialectic_projects: {
        Row: {
          created_at: string
          id: string
          initial_prompt_resource_id: string | null
          initial_user_prompt: string
          process_template_id: string | null
          project_name: string
          repo_url: Json | null
          selected_domain_id: string
          selected_domain_overlay_id: string | null
          status: string
          updated_at: string
          user_domain_overlay_values: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          initial_prompt_resource_id?: string | null
          initial_user_prompt: string
          process_template_id?: string | null
          project_name: string
          repo_url?: Json | null
          selected_domain_id: string
          selected_domain_overlay_id?: string | null
          status?: string
          updated_at?: string
          user_domain_overlay_values?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          initial_prompt_resource_id?: string | null
          initial_user_prompt?: string
          process_template_id?: string | null
          project_name?: string
          repo_url?: Json | null
          selected_domain_id?: string
          selected_domain_overlay_id?: string | null
          status?: string
          updated_at?: string
          user_domain_overlay_values?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialectic_projects_process_template_id_fkey"
            columns: ["process_template_id"]
            isOneToOne: false
            referencedRelation: "dialectic_process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialectic_projects_selected_domain_id_fkey"
            columns: ["selected_domain_id"]
            isOneToOne: false
            referencedRelation: "dialectic_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dialectic_projects_selected_domain_overlay"
            columns: ["selected_domain_overlay_id"]
            isOneToOne: false
            referencedRelation: "domain_specific_prompt_overlays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_initial_prompt_resource"
            columns: ["initial_prompt_resource_id"]
            isOneToOne: false
            referencedRelation: "dialectic_project_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      dialectic_sessions: {
        Row: {
          associated_chat_id: string | null
          created_at: string
          current_stage_id: string
          id: string
          iteration_count: number
          project_id: string
          selected_model_catalog_ids: string[] | null
          session_description: string | null
          status: string
          updated_at: string
          user_input_reference_url: string | null
        }
        Insert: {
          associated_chat_id?: string | null
          created_at?: string
          current_stage_id: string
          id?: string
          iteration_count?: number
          project_id: string
          selected_model_catalog_ids?: string[] | null
          session_description?: string | null
          status?: string
          updated_at?: string
          user_input_reference_url?: string | null
        }
        Update: {
          associated_chat_id?: string | null
          created_at?: string
          current_stage_id?: string
          id?: string
          iteration_count?: number
          project_id?: string
          selected_model_catalog_ids?: string[] | null
          session_description?: string | null
          status?: string
          updated_at?: string
          user_input_reference_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dialectic_sessions_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "dialectic_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_project"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "dialectic_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dialectic_stage_transitions: {
        Row: {
          condition_description: string | null
          created_at: string
          id: string
          process_template_id: string
          source_stage_id: string
          target_stage_id: string
        }
        Insert: {
          condition_description?: string | null
          created_at?: string
          id?: string
          process_template_id: string
          source_stage_id: string
          target_stage_id: string
        }
        Update: {
          condition_description?: string | null
          created_at?: string
          id?: string
          process_template_id?: string
          source_stage_id?: string
          target_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialectic_stage_transitions_process_template_id_fkey"
            columns: ["process_template_id"]
            isOneToOne: false
            referencedRelation: "dialectic_process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialectic_stage_transitions_source_stage_id_fkey"
            columns: ["source_stage_id"]
            isOneToOne: false
            referencedRelation: "dialectic_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialectic_stage_transitions_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "dialectic_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      dialectic_stages: {
        Row: {
          created_at: string
          default_system_prompt_id: string | null
          description: string | null
          display_name: string
          expected_output_artifacts: Json | null
          id: string
          input_artifact_rules: Json | null
          slug: string
        }
        Insert: {
          created_at?: string
          default_system_prompt_id?: string | null
          description?: string | null
          display_name: string
          expected_output_artifacts?: Json | null
          id?: string
          input_artifact_rules?: Json | null
          slug: string
        }
        Update: {
          created_at?: string
          default_system_prompt_id?: string | null
          description?: string | null
          display_name?: string
          expected_output_artifacts?: Json | null
          id?: string
          input_artifact_rules?: Json | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialectic_stages_default_system_prompt_id_fkey"
            columns: ["default_system_prompt_id"]
            isOneToOne: false
            referencedRelation: "system_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_process_associations: {
        Row: {
          created_at: string
          domain_id: string
          id: string
          is_default_for_domain: boolean
          process_template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain_id: string
          id?: string
          is_default_for_domain?: boolean
          process_template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain_id?: string
          id?: string
          is_default_for_domain?: boolean
          process_template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_process_associations_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "dialectic_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_process_associations_process_template_id_fkey"
            columns: ["process_template_id"]
            isOneToOne: false
            referencedRelation: "dialectic_process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_specific_prompt_overlays: {
        Row: {
          created_at: string
          description: string | null
          domain_id: string
          id: string
          is_active: boolean
          overlay_values: Json
          system_prompt_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          domain_id: string
          id?: string
          is_active?: boolean
          overlay_values: Json
          system_prompt_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          domain_id?: string
          id?: string
          is_active?: boolean
          overlay_values?: Json
          system_prompt_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "domain_specific_prompt_overlays_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "dialectic_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_specific_prompt_overlays_system_prompt_id_fkey"
            columns: ["system_prompt_id"]
            isOneToOne: false
            referencedRelation: "system_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          invite_token: string
          invited_by_user_id: string | null
          invited_email: string
          invited_user_id: string | null
          inviter_email: string | null
          inviter_first_name: string | null
          inviter_last_name: string | null
          organization_id: string
          role_to_assign: string
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          invite_token: string
          invited_by_user_id?: string | null
          invited_email: string
          invited_user_id?: string | null
          inviter_email?: string | null
          inviter_first_name?: string | null
          inviter_last_name?: string | null
          organization_id: string
          role_to_assign?: string
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          invite_token?: string
          invited_by_user_id?: string | null
          invited_email?: string
          invited_user_id?: string | null
          inviter_email?: string | null
          inviter_first_name?: string | null
          inviter_last_name?: string | null
          organization_id?: string
          role_to_assign?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          read?: boolean
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          allow_member_chat_creation: boolean
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          token_usage_policy: Database["public"]["Enums"]["org_token_usage_policy_enum"]
          visibility: string
        }
        Insert: {
          allow_member_chat_creation?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          token_usage_policy?: Database["public"]["Enums"]["org_token_usage_policy_enum"]
          visibility?: string
        }
        Update: {
          allow_member_chat_creation?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          token_usage_policy?: Database["public"]["Enums"]["org_token_usage_policy_enum"]
          visibility?: string
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount_requested_crypto: number | null
          amount_requested_fiat: number | null
          created_at: string
          currency_requested_crypto: string | null
          currency_requested_fiat: string | null
          gateway_transaction_id: string | null
          id: string
          metadata_json: Json | null
          organization_id: string | null
          payment_gateway_id: string
          status: string
          target_wallet_id: string
          tokens_to_award: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_requested_crypto?: number | null
          amount_requested_fiat?: number | null
          created_at?: string
          currency_requested_crypto?: string | null
          currency_requested_fiat?: string | null
          gateway_transaction_id?: string | null
          id?: string
          metadata_json?: Json | null
          organization_id?: string | null
          payment_gateway_id: string
          status?: string
          target_wallet_id: string
          tokens_to_award: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_requested_crypto?: number | null
          amount_requested_fiat?: number | null
          created_at?: string
          currency_requested_crypto?: string | null
          currency_requested_fiat?: string | null
          gateway_transaction_id?: string | null
          id?: string
          metadata_json?: Json | null
          organization_id?: string | null
          payment_gateway_id?: string
          status?: string
          target_wallet_id?: string
          tokens_to_award?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_target_wallet_id_fkey"
            columns: ["target_wallet_id"]
            isOneToOne: false
            referencedRelation: "token_wallets"
            referencedColumns: ["wallet_id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          active: boolean
          amount: number | null
          created_at: string
          currency: string | null
          description: Json | null
          id: string
          interval: string | null
          interval_count: number | null
          item_id_internal: string | null
          metadata: Json | null
          name: string
          plan_type: string
          stripe_price_id: string | null
          stripe_product_id: string | null
          tokens_to_award: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number | null
          created_at?: string
          currency?: string | null
          description?: Json | null
          id?: string
          interval?: string | null
          interval_count?: number | null
          item_id_internal?: string | null
          metadata?: Json | null
          name: string
          plan_type?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          tokens_to_award?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number | null
          created_at?: string
          currency?: string | null
          description?: Json | null
          id?: string
          interval?: string | null
          interval_count?: number | null
          item_id_internal?: string | null
          metadata?: Json | null
          name?: string
          plan_type?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          tokens_to_award?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      subscription_transactions: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_event_id: string
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
          user_subscription_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_event_id: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
          user_subscription_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_event_id?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
          user_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_transactions_user_subscription_id_fkey"
            columns: ["user_subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_prompts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          prompt_text: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          prompt_text: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          prompt_text?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      token_wallet_transactions: {
        Row: {
          amount: number
          balance_after_txn: number
          idempotency_key: string
          notes: string | null
          payment_transaction_id: string | null
          recorded_by_user_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          timestamp: string
          transaction_id: string
          transaction_type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after_txn: number
          idempotency_key: string
          notes?: string | null
          payment_transaction_id?: string | null
          recorded_by_user_id: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          timestamp?: string
          transaction_id?: string
          transaction_type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after_txn?: number
          idempotency_key?: string
          notes?: string | null
          payment_transaction_id?: string | null
          recorded_by_user_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          timestamp?: string
          transaction_id?: string
          transaction_type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_wallet_transactions_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "token_wallets"
            referencedColumns: ["wallet_id"]
          },
        ]
      }
      token_wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          organization_id: string | null
          updated_at: string
          user_id: string | null
          wallet_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          organization_id?: string | null
          updated_at?: string
          user_id?: string | null
          wallet_id?: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          organization_id?: string | null
          updated_at?: string
          user_id?: string | null
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_wallets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          chat_context: Json | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          last_selected_org_id: string | null
          profile_privacy_setting: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          chat_context?: Json | null
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          last_selected_org_id?: string | null
          profile_privacy_setting?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          chat_context?: Json | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_selected_org_id?: string | null
          profile_privacy_setting?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_last_selected_org_id_fkey"
            columns: ["last_selected_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_pending_membership_requests: {
        Row: {
          created_at: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          organization_id: string | null
          role: string | null
          status: string | null
          user_email: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      begin_transaction: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      can_select_chat: {
        Args: { check_chat_id: string }
        Returns: boolean
      }
      check_existing_member_by_email: {
        Args: { target_org_id: string; target_email: string }
        Returns: {
          membership_status: string
        }[]
      }
      check_org_chat_creation_permission: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      create_notification_for_user: {
        Args: {
          target_user_id: string
          notification_type: string
          notification_data: Json
        }
        Returns: undefined
      }
      create_org_and_admin_member: {
        Args: {
          p_user_id: string
          p_org_name: string
          p_org_visibility: string
        }
        Returns: string
      }
      delete_chat_and_messages: {
        Args: { p_chat_id: string; p_user_id: string }
        Returns: string
      }
      delete_chat_and_messages_debug: {
        Args: { p_chat_id: string; p_user_id: string }
        Returns: string
      }
      execute_sql: {
        Args: { query: string }
        Returns: Json[]
      }
      grant_initial_free_tokens_to_user: {
        Args: { p_user_id: string; p_free_plan_id: string }
        Returns: undefined
      }
      is_admin_of_org_for_wallet: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      is_org_admin: {
        Args: { org_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: {
          p_org_id: string
          p_user_id: string
          required_status: string
          required_role?: string
        }
        Returns: boolean
      }
      perform_chat_rewind: {
        Args: {
          p_chat_id: string
          p_rewind_from_message_id: string
          p_user_id: string
          p_new_user_message_content: string
          p_new_user_message_ai_provider_id: string
          p_new_assistant_message_content: string
          p_new_assistant_message_ai_provider_id: string
          p_new_user_message_system_prompt_id?: string
          p_new_assistant_message_token_usage?: Json
          p_new_assistant_message_system_prompt_id?: string
          p_new_assistant_message_error_type?: string
        }
        Returns: {
          new_user_message_id: string
          new_assistant_message_id: string
        }[]
      }
      record_token_transaction: {
        Args: {
          p_wallet_id: string
          p_transaction_type: string
          p_input_amount_text: string
          p_recorded_by_user_id: string
          p_idempotency_key: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_notes?: string
          p_payment_transaction_id?: string
        }
        Returns: {
          transaction_id: string
          wallet_id: string
          transaction_type: string
          amount: number
          balance_after_txn: number
          recorded_by_user_id: string
          idempotency_key: string
          related_entity_id: string
          related_entity_type: string
          notes: string
          timestamp: string
          payment_transaction_id: string
        }[]
      }
      rollback_transaction: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      save_contribution_edit_atomic: {
        Args:
          | {
              p_original_contribution_id: string
              p_session_id: string
              p_user_id: string
              p_stage: string
              p_iteration_number: number
              p_actual_prompt_sent: string
              p_content_storage_bucket: string
              p_content_storage_path: string
              p_content_mime_type: string
              p_content_size_bytes: number
              p_raw_response_storage_path: string
              p_tokens_used_input: number
              p_tokens_used_output: number
              p_processing_time_ms: number
              p_citations: Json
              p_target_contribution_id: string
              p_edit_version: number
              p_is_latest_edit: boolean
              p_original_model_contribution_id: string
              p_error_details: string
              p_model_id: string
              p_contribution_type: string
            }
          | {
              p_original_contribution_id: string
              p_session_id: string
              p_user_id: string
              p_stage: string
              p_iteration_number: number
              p_content_storage_bucket: string
              p_content_storage_path: string
              p_content_mime_type: string
              p_content_size_bytes: number
              p_raw_response_storage_path: string
              p_tokens_used_input: number
              p_tokens_used_output: number
              p_processing_time_ms: number
              p_citations: Json
              p_target_contribution_id: string
              p_edit_version: number
              p_is_latest_edit: boolean
              p_original_model_contribution_id: string
              p_error_details: string
              p_model_id: string
              p_contribution_type: string
            }
        Returns: string
      }
    }
    Enums: {
      dialectic_stage_enum:
        | "THESIS"
        | "ANTITHESIS"
        | "SYNTHESIS"
        | "PARENTHESIS"
        | "PARALYSIS"
      org_token_usage_policy_enum: "member_tokens" | "organization_tokens"
      user_role: "user" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      dialectic_stage_enum: [
        "THESIS",
        "ANTITHESIS",
        "SYNTHESIS",
        "PARENTHESIS",
        "PARALYSIS",
      ],
      org_token_usage_policy_enum: ["member_tokens", "organization_tokens"],
      user_role: ["user", "admin"],
    },
  },
} as const

