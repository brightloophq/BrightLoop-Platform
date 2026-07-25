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
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
      analytics_events: {
        Row: {
          actor_id: string | null
          at: string
          client_id: string | null
          id: number
          name: string
          props: Json
          role: string | null
          source: string
        }
        Insert: {
          actor_id?: string | null
          at?: string
          client_id?: string | null
          id?: never
          name: string
          props?: Json
          role?: string | null
          source?: string
        }
        Update: {
          actor_id?: string | null
          at?: string
          client_id?: string | null
          id?: never
          name?: string
          props?: Json
          role?: string | null
          source?: string
        }
        Relationships: []
      }
      approvals: {
        Row: {
          approver_user_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          decision: Database["public"]["Enums"]["approval_decision"]
          id: string
          reason: string | null
          requested_at: string
          subject_id: string
          subject_type: Database["public"]["Enums"]["approval_subject_type"]
        }
        Insert: {
          approver_user_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["approval_decision"]
          id: string
          reason?: string | null
          requested_at?: string
          subject_id: string
          subject_type: Database["public"]["Enums"]["approval_subject_type"]
        }
        Update: {
          approver_user_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["approval_decision"]
          id?: string
          reason?: string | null
          requested_at?: string
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["approval_subject_type"]
        }
        Relationships: [
          {
            foreignKeyName: "approvals_approver_user_id_fkey"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          answers: Json
          client_id: string | null
          health_score: number | null
          id: string
          recommendations: Json
          scores: Json
          status: Database["public"]["Enums"]["onboarding_status"]
          submitted_at: string | null
        }
        Insert: {
          answers?: Json
          client_id?: string | null
          health_score?: number | null
          id: string
          recommendations?: Json
          scores?: Json
          status?: Database["public"]["Enums"]["onboarding_status"]
          submitted_at?: string | null
        }
        Update: {
          answers?: Json
          client_id?: string | null
          health_score?: number | null
          id?: string
          recommendations?: Json
          scores?: Json
          status?: Database["public"]["Enums"]["onboarding_status"]
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          client_id: string | null
          id: string
          last_error: string | null
          last_run_at: string | null
          name: string
          provider: string
          runs: number
          status: Database["public"]["Enums"]["automation_status"]
          trigger: string | null
        }
        Insert: {
          client_id?: string | null
          id: string
          last_error?: string | null
          last_run_at?: string | null
          name: string
          provider?: string
          runs?: number
          status?: Database["public"]["Enums"]["automation_status"]
          trigger?: string | null
        }
        Update: {
          client_id?: string | null
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          name?: string
          provider?: string
          runs?: number
          status?: Database["public"]["Enums"]["automation_status"]
          trigger?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      business_domains: {
        Row: {
          baseline_score: number | null
          client_id: string
          created_at: string
          current_score: number | null
          id: string
          key: Database["public"]["Enums"]["domain_key"]
          status: Database["public"]["Enums"]["domain_status"]
        }
        Insert: {
          baseline_score?: number | null
          client_id: string
          created_at?: string
          current_score?: number | null
          id: string
          key: Database["public"]["Enums"]["domain_key"]
          status?: Database["public"]["Enums"]["domain_status"]
        }
        Update: {
          baseline_score?: number | null
          client_id?: string
          created_at?: string
          current_score?: number | null
          id?: string
          key?: Database["public"]["Enums"]["domain_key"]
          status?: Database["public"]["Enums"]["domain_status"]
        }
        Relationships: [
          {
            foreignKeyName: "business_domains_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      business_health: {
        Row: {
          basis: string | null
          captured_at: string
          client_id: string
          created_at: string
          dimensions: Json
          id: string
          score: number
        }
        Insert: {
          basis?: string | null
          captured_at: string
          client_id: string
          created_at?: string
          dimensions?: Json
          id: string
          score: number
        }
        Update: {
          basis?: string | null
          captured_at?: string
          client_id?: string
          created_at?: string
          dimensions?: Json
          id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_health_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      business_scans: {
        Row: {
          baseline_index: number
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          status: Database["public"]["Enums"]["scan_status"]
          target_index: number
        }
        Insert: {
          baseline_index: number
          client_id: string
          created_at?: string
          created_by?: string | null
          id: string
          status?: Database["public"]["Enums"]["scan_status"]
          target_index?: number
        }
        Update: {
          baseline_index?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["scan_status"]
          target_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_scans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_scans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          author_id: string
          body: string
          conversation_id: string
          created_at: string
          id: string
          kind: string
        }
        Insert: {
          author_id: string
          body?: string
          conversation_id: string
          created_at?: string
          id: string
          kind?: string
        }
        Update: {
          author_id?: string
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_manager_id: string | null
          company: string
          created_at: string
          health_score: number | null
          id: string
          industry: string | null
          lifecycle: Database["public"]["Enums"]["client_lifecycle"]
          mrr: number
          plan: string | null
          seats: number
        }
        Insert: {
          account_manager_id?: string | null
          company: string
          created_at?: string
          health_score?: number | null
          id: string
          industry?: string | null
          lifecycle?: Database["public"]["Enums"]["client_lifecycle"]
          mrr?: number
          plan?: string | null
          seats?: number
        }
        Update: {
          account_manager_id?: string | null
          company?: string
          created_at?: string
          health_score?: number | null
          id?: string
          industry?: string | null
          lifecycle?: Database["public"]["Enums"]["client_lifecycle"]
          mrr?: number
          plan?: string | null
          seats?: number
        }
        Relationships: [
          {
            foreignKeyName: "clients_account_manager_fk"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_snapshots: {
        Row: {
          checksum: string
          client_id: string | null
          competitor_count: number
          created_at: string
          created_by: string | null
          envelope: Json
          id: string
          idempotency_key: string
          run_id: string
          scan_id: string
          source_artifact_ids: string[]
          version: number
        }
        Insert: {
          checksum: string
          client_id?: string | null
          competitor_count?: number
          created_at?: string
          created_by?: string | null
          envelope?: Json
          id: string
          idempotency_key: string
          run_id: string
          scan_id: string
          source_artifact_ids?: string[]
          version?: number
        }
        Update: {
          checksum?: string
          client_id?: string | null
          competitor_count?: number
          created_at?: string
          created_by?: string | null
          envelope?: Json
          id?: string
          idempotency_key?: string
          run_id?: string
          scan_id?: string
          source_artifact_ids?: string[]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "competitor_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      configurations: {
        Row: {
          assessment_id: string | null
          budget_band: string | null
          client_id: string | null
          goal: string | null
          id: string
          modules: Json
          notes: string | null
          owned_assets: Json
          status: Database["public"]["Enums"]["onboarding_status"]
          timeline: string | null
          updated_at: string
        }
        Insert: {
          assessment_id?: string | null
          budget_band?: string | null
          client_id?: string | null
          goal?: string | null
          id: string
          modules?: Json
          notes?: string | null
          owned_assets?: Json
          status?: Database["public"]["Enums"]["onboarding_status"]
          timeline?: string | null
          updated_at?: string
        }
        Update: {
          assessment_id?: string | null
          budget_band?: string | null
          client_id?: string | null
          goal?: string | null
          id?: string
          modules?: Json
          notes?: string | null
          owned_assets?: Json
          status?: Database["public"]["Enums"]["onboarding_status"]
          timeline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configurations_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configurations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          granted: boolean
          id: string
          ip: unknown
          timestamp: string
          type: string
          user_id: string
          version: string
        }
        Insert: {
          granted: boolean
          id: string
          ip?: unknown
          timestamp?: string
          type: string
          user_id: string
          version: string
        }
        Update: {
          granted?: boolean
          id?: string
          ip?: unknown
          timestamp?: string
          type?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          client_id: string
          client_signature: string | null
          countersignature: string | null
          id: string
          proposal_id: string
          signed_at: string | null
          sow_url: string | null
          status: Database["public"]["Enums"]["contract_status"]
        }
        Insert: {
          client_id: string
          client_signature?: string | null
          countersignature?: string | null
          id: string
          proposal_id: string
          signed_at?: string | null
          sow_url?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
        }
        Update: {
          client_id?: string
          client_signature?: string | null
          countersignature?: string | null
          id?: string
          proposal_id?: string
          signed_at?: string | null
          sow_url?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_assignments: {
        Row: {
          assigned_by: string | null
          assignee_user_id: string | null
          at: string
          conversation_id: string
        }
        Insert: {
          assigned_by?: string | null
          assignee_user_id?: string | null
          at?: string
          conversation_id: string
        }
        Update: {
          assigned_by?: string | null
          assignee_user_id?: string | null
          at?: string
          conversation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          added_at: string
          conversation_id: string
          role_in_convo: string
          user_id: string
        }
        Insert: {
          added_at?: string
          conversation_id: string
          role_in_convo?: string
          user_id: string
        }
        Update: {
          added_at?: string
          conversation_id?: string
          role_in_convo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assessment_id: string | null
          client_id: string
          configuration_id: string | null
          created_at: string
          id: string
          last_message_at: string
          state: Database["public"]["Enums"]["conversation_state"]
          subject: string
        }
        Insert: {
          assessment_id?: string | null
          client_id: string
          configuration_id?: string | null
          created_at?: string
          id: string
          last_message_at?: string
          state?: Database["public"]["Enums"]["conversation_state"]
          subject?: string
        }
        Update: {
          assessment_id?: string | null
          client_id?: string
          configuration_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          state?: Database["public"]["Enums"]["conversation_state"]
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_configuration_id_fkey"
            columns: ["configuration_id"]
            isOneToOne: false
            referencedRelation: "configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          feedback: string | null
          file_url: string | null
          id: string
          milestone_id: string | null
          project_id: string
          status: Database["public"]["Enums"]["deliverable_status"]
          submitted_at: string | null
          title: string
          type: string | null
          version: number
        }
        Insert: {
          feedback?: string | null
          file_url?: string | null
          id: string
          milestone_id?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["deliverable_status"]
          submitted_at?: string | null
          title: string
          type?: string | null
          version?: number
        }
        Update: {
          feedback?: string | null
          file_url?: string | null
          id?: string
          milestone_id?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["deliverable_status"]
          submitted_at?: string | null
          title?: string
          type?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_records: {
        Row: {
          attempts: number
          client_id: string
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          move_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["execution_record_status"]
        }
        Insert: {
          attempts?: number
          client_id: string
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id: string
          idempotency_key?: string | null
          last_error?: string | null
          move_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["execution_record_status"]
        }
        Update: {
          attempts?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          move_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["execution_record_status"]
        }
        Relationships: [
          {
            foreignKeyName: "execution_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_records_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: false
            referencedRelation: "moves"
            referencedColumns: ["id"]
          },
        ]
      }
      file_uploads: {
        Row: {
          deliverable_id: string | null
          error: string | null
          id: string
          mime: string
          name: string
          owner_id: string
          progress: number
          size: number
          status: Database["public"]["Enums"]["file_upload_status"]
          uploaded_at: string | null
        }
        Insert: {
          deliverable_id?: string | null
          error?: string | null
          id: string
          mime: string
          name: string
          owner_id: string
          progress?: number
          size: number
          status?: Database["public"]["Enums"]["file_upload_status"]
          uploaded_at?: string | null
        }
        Update: {
          deliverable_id?: string | null
          error?: string | null
          id?: string
          mime?: string
          name?: string
          owner_id?: string
          progress?: number
          size?: number
          status?: Database["public"]["Enums"]["file_upload_status"]
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_uploads_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_uploads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          client_id: string
          confidence: number | null
          created_at: string
          created_by: string | null
          detail: string | null
          evidence: Json
          id: string
          signal_id: string
          status: Database["public"]["Enums"]["insight_status"]
          summary: string
        }
        Insert: {
          client_id: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          evidence?: Json
          id: string
          signal_id: string
          status?: Database["public"]["Enums"]["insight_status"]
          summary: string
        }
        Update: {
          client_id?: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          evidence?: Json
          id?: string
          signal_id?: string
          status?: Database["public"]["Enums"]["insight_status"]
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_artifacts: {
        Row: {
          checksum: string
          client_id: string | null
          created_at: string
          created_by: string | null
          envelope: Json
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["runtime_artifact_kind"]
          payload_ref: string | null
          run_id: string
          scan_id: string
          source_artifact_ids: string[]
          validation_status: Database["public"]["Enums"]["runtime_artifact_status"]
          version: number
        }
        Insert: {
          checksum: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          envelope?: Json
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["runtime_artifact_kind"]
          payload_ref?: string | null
          run_id: string
          scan_id: string
          source_artifact_ids?: string[]
          validation_status?: Database["public"]["Enums"]["runtime_artifact_status"]
          version?: number
        }
        Update: {
          checksum?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          envelope?: Json
          id?: string
          idempotency_key?: string
          kind?: Database["public"]["Enums"]["runtime_artifact_kind"]
          payload_ref?: string | null
          run_id?: string
          scan_id?: string
          source_artifact_ids?: string[]
          validation_status?: Database["public"]["Enums"]["runtime_artifact_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_artifacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_artifacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_checkpoints: {
        Row: {
          artifact_ids: string[]
          attempt: number
          client_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          invalidation_reason: string | null
          next_stage: string | null
          run_id: string
          scan_id: string
          source_checksums: Json
          stage: string
          status: Database["public"]["Enums"]["runtime_checkpoint_status"]
        }
        Insert: {
          artifact_ids?: string[]
          attempt?: number
          client_id?: string | null
          created_at?: string
          id: string
          idempotency_key: string
          invalidation_reason?: string | null
          next_stage?: string | null
          run_id: string
          scan_id: string
          source_checksums?: Json
          stage: string
          status?: Database["public"]["Enums"]["runtime_checkpoint_status"]
        }
        Update: {
          artifact_ids?: string[]
          attempt?: number
          client_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          invalidation_reason?: string | null
          next_stage?: string | null
          run_id?: string
          scan_id?: string
          source_checksums?: Json
          stage?: string
          status?: Database["public"]["Enums"]["runtime_checkpoint_status"]
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_checkpoints_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_checkpoints_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_findings: {
        Row: {
          checksum: string
          client_id: string | null
          created_at: string
          created_by: string | null
          domain: string | null
          envelope: Json
          id: string
          idempotency_key: string
          run_id: string
          scan_id: string
          severity: string | null
          source_artifact_ids: string[]
          version: number
        }
        Insert: {
          checksum: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string | null
          envelope?: Json
          id: string
          idempotency_key: string
          run_id: string
          scan_id: string
          severity?: string | null
          source_artifact_ids?: string[]
          version?: number
        }
        Update: {
          checksum?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string | null
          envelope?: Json
          id?: string
          idempotency_key?: string
          run_id?: string
          scan_id?: string
          severity?: string | null
          source_artifact_ids?: string[]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_findings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_findings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_recommendations: {
        Row: {
          checksum: string
          client_id: string | null
          created_at: string
          created_by: string | null
          envelope: Json
          id: string
          idempotency_key: string
          priority: number | null
          run_id: string
          scan_id: string
          source_artifact_ids: string[]
          tier: string | null
          version: number
        }
        Insert: {
          checksum: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          envelope?: Json
          id: string
          idempotency_key: string
          priority?: number | null
          run_id: string
          scan_id: string
          source_artifact_ids?: string[]
          tier?: string | null
          version?: number
        }
        Update: {
          checksum?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          envelope?: Json
          id?: string
          idempotency_key?: string
          priority?: number | null
          run_id?: string
          scan_id?: string
          source_artifact_ids?: string[]
          tier?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_recommendations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_recommendations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_recommendations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_run_stages: {
        Row: {
          attempt: number
          cancelled_at: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          failed_at: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          metadata: Json
          run_id: string
          scan_id: string
          stage: string
          started_at: string | null
          status: Database["public"]["Enums"]["runtime_stage_status"]
          updated_at: string | null
        }
        Insert: {
          attempt?: number
          cancelled_at?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_at?: string | null
          id: string
          idempotency_key: string
          last_error?: string | null
          metadata?: Json
          run_id: string
          scan_id: string
          stage: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["runtime_stage_status"]
          updated_at?: string | null
        }
        Update: {
          attempt?: number
          cancelled_at?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          metadata?: Json
          run_id?: string
          scan_id?: string
          stage?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["runtime_stage_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_run_stages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_run_stages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_run_stages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_runs: {
        Row: {
          cancelled: boolean
          cancelled_at: string | null
          checksum: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_stage: string | null
          deadline: string | null
          failed_at: string | null
          failed_stage: string | null
          id: string
          idempotency_key: string
          metadata: Json
          scan_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["runtime_run_status"]
          updated_at: string | null
          version: number
        }
        Insert: {
          cancelled?: boolean
          cancelled_at?: string | null
          checksum?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string | null
          deadline?: string | null
          failed_at?: string | null
          failed_stage?: string | null
          id: string
          idempotency_key: string
          metadata?: Json
          scan_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["runtime_run_status"]
          updated_at?: string | null
          version?: number
        }
        Update: {
          cancelled?: boolean
          cancelled_at?: string | null
          checksum?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string | null
          deadline?: string | null
          failed_at?: string | null
          failed_stage?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          scan_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["runtime_run_status"]
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          author_id: string
          body: string
          conversation_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          conversation_id: string
          created_at?: string
          id: string
        }
        Update: {
          author_id?: string
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_id: string
          due_date: string | null
          id: string
          issued_at: string | null
          paid_at: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          type: Database["public"]["Enums"]["invoice_type"]
        }
        Insert: {
          amount: number
          client_id: string
          due_date?: string | null
          id: string
          issued_at?: string | null
          paid_at?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          type: Database["public"]["Enums"]["invoice_type"]
        }
        Update: {
          amount?: number
          client_id?: string
          due_date?: string | null
          id?: string
          issued_at?: string | null
          paid_at?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          type?: Database["public"]["Enums"]["invoice_type"]
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      job_queue: {
        Row: {
          attempt: number
          available_at: string
          client_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          job_type: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_status: Database["public"]["Enums"]["runtime_lease_status"]
          max_attempts: number
          payload: Json
          payload_ref: string | null
          priority: number
          run_id: string | null
          scan_id: string | null
          stage: string | null
          status: Database["public"]["Enums"]["runtime_queue_status"]
          updated_at: string | null
        }
        Insert: {
          attempt?: number
          available_at?: string
          client_id?: string | null
          created_at?: string
          id: string
          idempotency_key: string
          job_type: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_status?: Database["public"]["Enums"]["runtime_lease_status"]
          max_attempts?: number
          payload?: Json
          payload_ref?: string | null
          priority?: number
          run_id?: string | null
          scan_id?: string | null
          stage?: string | null
          status?: Database["public"]["Enums"]["runtime_queue_status"]
          updated_at?: string | null
        }
        Update: {
          attempt?: number
          available_at?: string
          client_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          job_type?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_status?: Database["public"]["Enums"]["runtime_lease_status"]
          max_attempts?: number
          payload?: Json
          payload_ref?: string | null
          priority?: number
          run_id?: string | null
          scan_id?: string | null
          stage?: string | null
          status?: Database["public"]["Enums"]["runtime_queue_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_queue_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_assets: {
        Row: {
          body: string
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["knowledge_asset_kind"]
          source_ref: string | null
          status: Database["public"]["Enums"]["knowledge_asset_status"]
          title: string
        }
        Insert: {
          body: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id: string
          kind: Database["public"]["Enums"]["knowledge_asset_kind"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["knowledge_asset_status"]
          title: string
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["knowledge_asset_kind"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["knowledge_asset_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          industry: string | null
          name: string
          owner_id: string | null
          source: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          value: number
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id: string
          industry?: string | null
          name: string
          owner_id?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          value?: number
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          industry?: string | null
          name?: string
          owner_id?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      learnings: {
        Row: {
          captured_at: string
          client_id: string
          created_at: string
          created_by: string | null
          detail: string | null
          id: string
          measurement_id: string | null
          move_id: string | null
          summary: string
        }
        Insert: {
          captured_at: string
          client_id: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id: string
          measurement_id?: string | null
          move_id?: string | null
          summary: string
        }
        Update: {
          captured_at?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          measurement_id?: string | null
          move_id?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "learnings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnings_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learnings_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: false
            referencedRelation: "moves"
            referencedColumns: ["id"]
          },
        ]
      }
      measurements: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          delta: number | null
          id: string
          measured_at: string
          metric_key: string
          move_id: string
          observed: number
          target: number | null
          unit: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          delta?: number | null
          id: string
          measured_at: string
          metric_key: string
          move_id: string
          observed: number
          target?: number | null
          unit?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          delta?: number | null
          id?: string
          measured_at?: string
          metric_key?: string
          move_id?: string
          observed?: number
          target?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "measurements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: false
            referencedRelation: "moves"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          attendees: Json
          client_id: string
          duration_min: number
          id: string
          join_url: string | null
          start_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          title: string
          type: string | null
        }
        Insert: {
          attendees?: Json
          client_id: string
          duration_min?: number
          id: string
          join_url?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["meeting_status"]
          title: string
          type?: string | null
        }
        Update: {
          attendees?: Json
          client_id?: string
          duration_min?: number
          id?: string
          join_url?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["meeting_status"]
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          id: string
          message_id: string
          mime: string
          name: string
          size: number
          storage_path: string
        }
        Insert: {
          id: string
          message_id: string
          mime: string
          name: string
          size?: number
          storage_path: string
        }
        Update: {
          id?: string
          message_id?: string
          mime?: string
          name?: string
          size?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          author_id: string
          body: string
          client_id: string
          created_at: string
          id: string
          thread_id: string
        }
        Insert: {
          attachments?: Json
          author_id: string
          body: string
          client_id: string
          created_at?: string
          id: string
          thread_id: string
        }
        Update: {
          attachments?: Json
          author_id?: string
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          approved_at: string | null
          due_date: string | null
          id: string
          order: number
          project_id: string
          status: Database["public"]["Enums"]["milestone_status"]
          title: string
        }
        Insert: {
          approved_at?: string | null
          due_date?: string | null
          id: string
          order?: number
          project_id: string
          status?: Database["public"]["Enums"]["milestone_status"]
          title: string
        }
        Update: {
          approved_at?: string | null
          due_date?: string | null
          id?: string
          order?: number
          project_id?: string
          status?: Database["public"]["Enums"]["milestone_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      moves: {
        Row: {
          approval_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          expected_outcome: string | null
          id: string
          intent: string
          recommendation_id: string | null
          status: Database["public"]["Enums"]["move_status"]
          title: string
        }
        Insert: {
          approval_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          expected_outcome?: string | null
          id: string
          intent: string
          recommendation_id?: string | null
          status?: Database["public"]["Enums"]["move_status"]
          title: string
        }
        Update: {
          approval_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          expected_outcome?: string | null
          id?: string
          intent?: string
          recommendation_id?: string | null
          status?: Database["public"]["Enums"]["move_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "moves_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moves_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moves_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moves_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_versions: {
        Row: {
          audience: string
          checksum: string
          client_id: string | null
          created_at: string
          created_by: string | null
          envelope: Json
          id: string
          idempotency_key: string
          run_id: string
          scan_id: string
          source_artifact_ids: string[]
          status: string
          supersedes_id: string | null
          version: number
        }
        Insert: {
          audience: string
          checksum: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          envelope?: Json
          id: string
          idempotency_key: string
          run_id: string
          scan_id: string
          source_artifact_ids?: string[]
          status: string
          supersedes_id?: string | null
          version?: number
        }
        Update: {
          audience?: string
          checksum?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          envelope?: Json
          id?: string
          idempotency_key?: string
          run_id?: string
          scan_id?: string
          source_artifact_ids?: string[]
          status?: string
          supersedes_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "narrative_versions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrative_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrative_versions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrative_versions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "narrative_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_ref: string | null
          id: string
          kind: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_ref?: string | null
          id: string
          kind: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_ref?: string | null
          id?: string
          kind?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_risks: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          detail: string | null
          evidence: Json
          id: string
          likelihood: Database["public"]["Enums"]["risk_likelihood"]
          move_id: string | null
          owner_user_id: string | null
          severity: Database["public"]["Enums"]["risk_severity"]
          signal_id: string | null
          status: Database["public"]["Enums"]["operational_risk_status"]
          title: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          evidence?: Json
          id: string
          likelihood: Database["public"]["Enums"]["risk_likelihood"]
          move_id?: string | null
          owner_user_id?: string | null
          severity: Database["public"]["Enums"]["risk_severity"]
          signal_id?: string | null
          status?: Database["public"]["Enums"]["operational_risk_status"]
          title: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          evidence?: Json
          id?: string
          likelihood?: Database["public"]["Enums"]["risk_likelihood"]
          move_id?: string | null
          owner_user_id?: string | null
          severity?: Database["public"]["Enums"]["risk_severity"]
          signal_id?: string | null
          status?: Database["public"]["Enums"]["operational_risk_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_risks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_risks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_risks_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: false
            referencedRelation: "moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_risks_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_risks_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          failure_reason: string | null
          id: string
          invoice_id: string
          last4: string | null
          method: string | null
          processed_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          failure_reason?: string | null
          id: string
          invoice_id: string
          last4?: string | null
          method?: string | null
          processed_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          failure_reason?: string | null
          id?: string
          invoice_id?: string
          last4?: string | null
          method?: string | null
          processed_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_projects: {
        Row: {
          approach: string
          awards: Json
          budget: string
          challenge: string
          client: string
          completed_date: string | null
          country: string
          created_at: string
          deliverables_count: number
          featured_on_home: boolean
          gallery_slots: Json
          hero_slot: string
          id: string
          industry: string
          live_url: string
          media: Json
          metrics: Json
          name: string
          order: number
          permission_live_preview: boolean
          platform: string
          project_status: string
          publish: Database["public"]["Enums"]["publish_status"]
          scheduled_publish_at: string | null
          seo: Json
          services: Json
          size: string
          slug: string
          summary: string
          tags: Json
          tech: Json
          testimonial_id: string | null
          timeline: string
          updated_at: string
          year: number
        }
        Insert: {
          approach?: string
          awards?: Json
          budget: string
          challenge?: string
          client: string
          completed_date?: string | null
          country: string
          created_at?: string
          deliverables_count?: number
          featured_on_home?: boolean
          gallery_slots?: Json
          hero_slot?: string
          id: string
          industry: string
          live_url?: string
          media?: Json
          metrics?: Json
          name: string
          order?: number
          permission_live_preview?: boolean
          platform: string
          project_status: string
          publish?: Database["public"]["Enums"]["publish_status"]
          scheduled_publish_at?: string | null
          seo?: Json
          services?: Json
          size: string
          slug: string
          summary?: string
          tags?: Json
          tech?: Json
          testimonial_id?: string | null
          timeline: string
          updated_at?: string
          year: number
        }
        Update: {
          approach?: string
          awards?: Json
          budget?: string
          challenge?: string
          client?: string
          completed_date?: string | null
          country?: string
          created_at?: string
          deliverables_count?: number
          featured_on_home?: boolean
          gallery_slots?: Json
          hero_slot?: string
          id?: string
          industry?: string
          live_url?: string
          media?: Json
          metrics?: Json
          name?: string
          order?: number
          permission_live_preview?: boolean
          platform?: string
          project_status?: string
          publish?: Database["public"]["Enums"]["publish_status"]
          scheduled_publish_at?: string | null
          seo?: Json
          services?: Json
          size?: string
          slug?: string
          summary?: string
          tags?: Json
          tech?: Json
          testimonial_id?: string | null
          timeline?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_projects_testimonial_fk"
            columns: ["testimonial_id"]
            isOneToOne: false
            referencedRelation: "testimonials"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_estimates: {
        Row: {
          client_id: string
          computed_at: string
          configuration_id: string
          effort_points: number
          estimate_high: number
          estimate_low: number
        }
        Insert: {
          client_id: string
          computed_at?: string
          configuration_id: string
          effort_points?: number
          estimate_high?: number
          estimate_low?: number
        }
        Update: {
          client_id?: string
          computed_at?: string
          configuration_id?: string
          effort_points?: number
          estimate_high?: number
          estimate_low?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_estimates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_estimates_configuration_id_fkey"
            columns: ["configuration_id"]
            isOneToOne: true
            referencedRelation: "configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string
          id: string
          manager_id: string | null
          name: string
          progress: number
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          target_date: string | null
        }
        Insert: {
          client_id: string
          id: string
          manager_id?: string | null
          name: string
          progress?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_date?: string | null
        }
        Update: {
          client_id?: string
          id?: string
          manager_id?: string | null
          name?: string
          progress?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_versions: {
        Row: {
          checksum: string
          client_id: string | null
          created_at: string
          created_by: string | null
          envelope: Json
          id: string
          idempotency_key: string
          run_id: string
          scan_id: string
          source_artifact_ids: string[]
          status: string
          supersedes_id: string | null
          version: number
        }
        Insert: {
          checksum: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          envelope?: Json
          id: string
          idempotency_key: string
          run_id: string
          scan_id: string
          source_artifact_ids?: string[]
          status: string
          supersedes_id?: string | null
          version?: number
        }
        Update: {
          checksum?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          envelope?: Json
          id?: string
          idempotency_key?: string
          run_id?: string
          scan_id?: string
          source_artifact_ids?: string[]
          status?: string
          supersedes_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_versions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_versions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_versions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "proposal_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          change_note: string | null
          client_id: string
          configuration_id: string | null
          decided_at: string | null
          deposit: number
          id: string
          line_items: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          subtotal: number
          total: number
          viewed_at: string | null
        }
        Insert: {
          change_note?: string | null
          client_id: string
          configuration_id?: string | null
          decided_at?: string | null
          deposit?: number
          id: string
          line_items?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          subtotal?: number
          total?: number
          viewed_at?: string | null
        }
        Update: {
          change_note?: string | null
          client_id?: string
          configuration_id?: string | null
          decided_at?: string | null
          deposit?: number
          id?: string
          line_items?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          subtotal?: number
          total?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_configuration_id_fkey"
            columns: ["configuration_id"]
            isOneToOne: false
            referencedRelation: "configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_attempts: {
        Row: {
          actual_cost: number | null
          attempt: number
          client_id: string | null
          created_at: string
          estimated_cost: number | null
          id: string
          idempotency_key: string
          input_tokens: number | null
          last_error: string | null
          latency_ms: number | null
          output_tokens: number | null
          provider_id: string
          raw_response_ref: string | null
          reasoning_job_id: string
          retry_disposition:
            | Database["public"]["Enums"]["runtime_retry_disposition"]
            | null
          run_id: string
          scan_id: string
          status: Database["public"]["Enums"]["runtime_provider_attempt_status"]
          usage_estimated: boolean
        }
        Insert: {
          actual_cost?: number | null
          attempt: number
          client_id?: string | null
          created_at?: string
          estimated_cost?: number | null
          id: string
          idempotency_key: string
          input_tokens?: number | null
          last_error?: string | null
          latency_ms?: number | null
          output_tokens?: number | null
          provider_id: string
          raw_response_ref?: string | null
          reasoning_job_id: string
          retry_disposition?:
            | Database["public"]["Enums"]["runtime_retry_disposition"]
            | null
          run_id: string
          scan_id: string
          status: Database["public"]["Enums"]["runtime_provider_attempt_status"]
          usage_estimated?: boolean
        }
        Update: {
          actual_cost?: number | null
          attempt?: number
          client_id?: string | null
          created_at?: string
          estimated_cost?: number | null
          id?: string
          idempotency_key?: string
          input_tokens?: number | null
          last_error?: string | null
          latency_ms?: number | null
          output_tokens?: number | null
          provider_id?: string
          raw_response_ref?: string | null
          reasoning_job_id?: string
          retry_disposition?:
            | Database["public"]["Enums"]["runtime_retry_disposition"]
            | null
          run_id?: string
          scan_id?: string
          status?: Database["public"]["Enums"]["runtime_provider_attempt_status"]
          usage_estimated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "provider_attempts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_attempts_reasoning_job_id_fkey"
            columns: ["reasoning_job_id"]
            isOneToOne: false
            referencedRelation: "reasoning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_attempts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          amount: number
          description: string
          id: string
          label: string
          module_id: string | null
          quantity: number
          quote_id: string
          sort: number
          unit_amount: number
        }
        Insert: {
          amount?: number
          description?: string
          id: string
          label: string
          module_id?: string | null
          quantity?: number
          quote_id: string
          sort?: number
          unit_amount?: number
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          label?: string
          module_id?: string | null
          quantity?: number
          quote_id?: string
          sort?: number
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_revisions: {
        Row: {
          author_id: string | null
          created_at: string
          id: string
          internal_note: string
          quote_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          id: string
          internal_note?: string
          quote_id: string
          snapshot?: Json
          version?: number
        }
        Update: {
          author_id?: string | null
          created_at?: string
          id?: string
          internal_note?: string
          quote_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_revisions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_revisions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_id: string
          client_note: string
          conversation_id: string
          created_at: string
          created_by: string | null
          currency: string
          decided_at: string | null
          discount: number
          id: string
          proposal_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          title: string
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          client_id: string
          client_note?: string
          conversation_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          discount?: number
          id: string
          proposal_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          title?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          client_id?: string
          client_note?: string
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          discount?: number
          id?: string
          proposal_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          title?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reasoning_jobs: {
        Row: {
          attempt: number
          cancelled_at: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          failed_at: string | null
          id: string
          idempotency_key: string
          max_attempts: number
          metadata: Json
          run_id: string
          scan_id: string
          stage: string
          started_at: string | null
          status: Database["public"]["Enums"]["runtime_reasoning_job_status"]
          task_type: string
          updated_at: string | null
        }
        Insert: {
          attempt?: number
          cancelled_at?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          failed_at?: string | null
          id: string
          idempotency_key: string
          max_attempts?: number
          metadata?: Json
          run_id: string
          scan_id: string
          stage: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["runtime_reasoning_job_status"]
          task_type: string
          updated_at?: string | null
        }
        Update: {
          attempt?: number
          cancelled_at?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          max_attempts?: number
          metadata?: Json
          run_id?: string
          scan_id?: string
          stage?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["runtime_reasoning_job_status"]
          task_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reasoning_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reasoning_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reasoning_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          ai_confidence: number | null
          ai_generated_at: string | null
          ai_generation_id: string | null
          ai_model: string | null
          ai_params: Json | null
          ai_prompt_version: string | null
          ai_provider: string | null
          client_id: string
          confidence: number | null
          created_at: string
          created_by: string | null
          evidence: Json
          expected_outcome: string | null
          id: string
          insight_id: string
          rationale: string
          status: Database["public"]["Enums"]["recommendation_status"]
          summary: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_generated_at?: string | null
          ai_generation_id?: string | null
          ai_model?: string | null
          ai_params?: Json | null
          ai_prompt_version?: string | null
          ai_provider?: string | null
          client_id: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          expected_outcome?: string | null
          id: string
          insight_id: string
          rationale: string
          status?: Database["public"]["Enums"]["recommendation_status"]
          summary: string
        }
        Update: {
          ai_confidence?: number | null
          ai_generated_at?: string | null
          ai_generation_id?: string | null
          ai_model?: string | null
          ai_params?: Json | null
          ai_prompt_version?: string | null
          ai_provider?: string | null
          client_id?: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          expected_outcome?: string | null
          id?: string
          insight_id?: string
          rationale?: string
          status?: Database["public"]["Enums"]["recommendation_status"]
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_events: {
        Row: {
          actor: string | null
          aggregate_id: string
          aggregate_type: string
          causation_id: string | null
          client_id: string | null
          correlation_id: string | null
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          run_id: string | null
          scan_id: string | null
          schema_version: string
          sequence: number
          stage: string | null
        }
        Insert: {
          actor?: string | null
          aggregate_id: string
          aggregate_type: string
          causation_id?: string | null
          client_id?: string | null
          correlation_id?: string | null
          event_type: string
          id: string
          occurred_at?: string
          payload?: Json
          run_id?: string | null
          scan_id?: string | null
          schema_version?: string
          sequence: number
          stage?: string | null
        }
        Update: {
          actor?: string | null
          aggregate_id?: string
          aggregate_type?: string
          causation_id?: string | null
          client_id?: string | null
          correlation_id?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          run_id?: string | null
          scan_id?: string | null
          schema_version?: string
          sequence?: number
          stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runtime_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_findings: {
        Row: {
          baseline: string | null
          client_id: string
          created_at: string
          domain_key: Database["public"]["Enums"]["domain_key"]
          finding: string
          id: string
          priority: Database["public"]["Enums"]["finding_priority"]
          scan_id: string
        }
        Insert: {
          baseline?: string | null
          client_id: string
          created_at?: string
          domain_key: Database["public"]["Enums"]["domain_key"]
          finding: string
          id: string
          priority?: Database["public"]["Enums"]["finding_priority"]
          scan_id: string
        }
        Update: {
          baseline?: string | null
          client_id?: string
          created_at?: string
          domain_key?: Database["public"]["Enums"]["domain_key"]
          finding?: string
          id?: string
          priority?: Database["public"]["Enums"]["finding_priority"]
          scan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_findings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_findings_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "business_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          detail: string | null
          evidence: Json
          id: string
          source_ref: string | null
          status: Database["public"]["Enums"]["signal_status"]
          title: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          evidence?: Json
          id: string
          source_ref?: string | null
          status?: Database["public"]["Enums"]["signal_status"]
          title: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          evidence?: Json
          id?: string
          source_ref?: string | null
          status?: Database["public"]["Enums"]["signal_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      state_transitions: {
        Row: {
          from_state: string
          machine: string
          to_state: string
        }
        Insert: {
          from_state: string
          machine: string
          to_state: string
        }
        Update: {
          from_state?: string
          machine?: string
          to_state?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          author: string
          avatar_slot: string
          categories: Json
          company: string
          country: string
          created_at: string
          date: string | null
          featured_on_home: boolean
          id: string
          media: Json
          overall: number
          pinned: boolean
          project_slug: string | null
          publish: Database["public"]["Enums"]["publish_status"]
          quote: string
          role: string
          updated_at: string
        }
        Insert: {
          author: string
          avatar_slot?: string
          categories?: Json
          company: string
          country?: string
          created_at?: string
          date?: string | null
          featured_on_home?: boolean
          id: string
          media?: Json
          overall: number
          pinned?: boolean
          project_slug?: string | null
          publish?: Database["public"]["Enums"]["publish_status"]
          quote: string
          role?: string
          updated_at?: string
        }
        Update: {
          author?: string
          avatar_slot?: string
          categories?: Json
          company?: string
          country?: string
          created_at?: string
          date?: string | null
          featured_on_home?: boolean
          id?: string
          media?: Json
          overall?: number
          pinned?: boolean
          project_slug?: string | null
          publish?: Database["public"]["Enums"]["publish_status"]
          quote?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_project_slug_fkey"
            columns: ["project_slug"]
            isOneToOne: false
            referencedRelation: "portfolio_projects"
            referencedColumns: ["slug"]
          },
        ]
      }
      transformation_activity: {
        Row: {
          at: string
          client_id: string | null
          command_id: string
          id: string
          subject_id: string
          subject_type: string
          summary: string
          type: string
          workspace_id: string
        }
        Insert: {
          at?: string
          client_id?: string | null
          command_id: string
          id: string
          subject_id: string
          subject_type: string
          summary: string
          type: string
          workspace_id: string
        }
        Update: {
          at?: string
          client_id?: string | null
          command_id?: string
          id?: string
          subject_id?: string
          subject_type?: string
          summary?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_activity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "transformation_workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_index: {
        Row: {
          at: string
          basis: string | null
          client_id: string
          created_at: string
          delta: number | null
          id: string
          value: number
        }
        Insert: {
          at: string
          basis?: string | null
          client_id: string
          created_at?: string
          delta?: number | null
          id: string
          value: number
        }
        Update: {
          at?: string
          basis?: string | null
          client_id?: string
          created_at?: string
          delta?: number | null
          id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "transformation_index_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_initiative: {
        Row: {
          business_impact: string
          client_id: string | null
          created_at: string
          dependencies: Json
          effort: string
          execution_status: string
          id: string
          objective: string | null
          priority: string
          proposal_artifact_id: string
          source_proposal_item_id: string
          supporting_evidence_ids: Json
          title: string
          version: number
          workspace_id: string
        }
        Insert: {
          business_impact: string
          client_id?: string | null
          created_at?: string
          dependencies?: Json
          effort: string
          execution_status?: string
          id: string
          objective?: string | null
          priority: string
          proposal_artifact_id?: string
          source_proposal_item_id: string
          supporting_evidence_ids?: Json
          title: string
          version?: number
          workspace_id: string
        }
        Update: {
          business_impact?: string
          client_id?: string | null
          created_at?: string
          dependencies?: Json
          effort?: string
          execution_status?: string
          id?: string
          objective?: string | null
          priority?: string
          proposal_artifact_id?: string
          source_proposal_item_id?: string
          supporting_evidence_ids?: Json
          title?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_initiative_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_initiative_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "transformation_workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_workspace: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          objectives: Json
          proposal_artifact_id: string | null
          report_artifact_id: string | null
          scan_run_id: string
          seed_checksum: string
          status: string
          title: string
          version: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id: string
          objectives?: Json
          proposal_artifact_id?: string | null
          report_artifact_id?: string | null
          scan_run_id: string
          seed_checksum: string
          status?: string
          title: string
          version?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          objectives?: Json
          proposal_artifact_id?: string | null
          report_artifact_id?: string | null
          scan_run_id?: string
          seed_checksum?: string
          status?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "transformation_workspace_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      transition_log: {
        Row: {
          actor_id: string | null
          at: string
          entity_id: string
          entity_type: string
          from_state: string
          id: number
          ip: unknown
          machine: string
          reason: string | null
          to_state: string
        }
        Insert: {
          actor_id?: string | null
          at?: string
          entity_id: string
          entity_type: string
          from_state: string
          id?: never
          ip?: unknown
          machine: string
          reason?: string | null
          to_state: string
        }
        Update: {
          actor_id?: string | null
          at?: string
          entity_id?: string
          entity_type?: string
          from_state?: string
          id?: never
          ip?: unknown
          machine?: string
          reason?: string | null
          to_state?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          accepted_at: string | null
          auth_user_id: string | null
          avatar_url: string | null
          client_id: string | null
          email: string
          id: string
          invited_at: string | null
          last_active_at: string | null
          name: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["user_account_status"]
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          client_id?: string | null
          email: string
          id: string
          invited_at?: string | null
          last_active_at?: string | null
          name: string
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_account_status"]
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          client_id?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          last_active_at?: string | null
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_account_status"]
        }
        Relationships: [
          {
            foreignKeyName: "users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bl_activate_client: { Args: { p_client_id: string }; Returns: boolean }
      bl_can_activate: { Args: { p_client_id: string }; Returns: boolean }
      bl_client_contract_sign: {
        Args: { p_contract_id: string; p_signature: string }
        Returns: Database["public"]["Enums"]["contract_status"]
      }
      bl_client_id: { Args: never; Returns: string }
      bl_client_proposal_action: {
        Args: { p_action: string; p_note?: string; p_proposal_id: string }
        Returns: Database["public"]["Enums"]["proposal_status"]
      }
      bl_client_quote_action: {
        Args: { p_action: string; p_quote_id: string }
        Returns: Database["public"]["Enums"]["quote_status"]
      }
      bl_conversation_client: { Args: { conv_id: string }; Returns: string }
      bl_in_conversation: { Args: { conv_id: string }; Returns: boolean }
      bl_is_finance: { Args: never; Returns: boolean }
      bl_is_internal: { Args: never; Returns: boolean }
      bl_lease_next_job: {
        Args: {
          p_client_id?: string
          p_job_type?: string
          p_lease_seconds: number
          p_owner: string
        }
        Returns: {
          attempt: number
          available_at: string
          client_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          job_type: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_status: Database["public"]["Enums"]["runtime_lease_status"]
          max_attempts: number
          payload: Json
          payload_ref: string | null
          priority: number
          run_id: string | null
          scan_id: string | null
          stage: string | null
          status: Database["public"]["Enums"]["runtime_queue_status"]
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "job_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      bl_rls_audit: {
        Args: never
        Returns: {
          policy_count: number
          rls_enabled: boolean
          table_name: string
        }[]
      }
      bl_role: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
    }
    Enums: {
      app_role:
        | "owner"
        | "admin"
        | "team_member"
        | "client_admin"
        | "client_member"
      approval_decision: "pending" | "granted" | "denied"
      approval_subject_type: "move" | "operational_risk" | "recommendation"
      automation_status: "active" | "running" | "success" | "failed" | "paused"
      client_lifecycle:
        | "prospect"
        | "member"
        | "client_active"
        | "post_launch"
        | "churned"
        | "renewed"
      contract_status:
        | "pending"
        | "sent"
        | "signed_client"
        | "countersigned"
        | "active"
        | "voided"
      conversation_state:
        | "open"
        | "awaiting_client"
        | "awaiting_admin"
        | "closed"
      deliverable_status:
        | "draft"
        | "submitted"
        | "in_review"
        | "approved"
        | "revision_requested"
        | "rejected"
        | "final"
      domain_key:
        | "web"
        | "sales"
        | "crm"
        | "operations"
        | "delivery"
        | "analytics"
        | "ai"
      domain_status: "not_operating" | "assembling" | "operating"
      execution_record_status: "queued" | "running" | "succeeded" | "failed"
      file_upload_status: "queued" | "uploading" | "success" | "failed"
      finding_priority: "low" | "medium" | "high"
      insight_status: "generated" | "endorsed" | "dismissed"
      invoice_status:
        | "draft"
        | "sent"
        | "pending"
        | "paid"
        | "overdue"
        | "failed"
        | "refunded"
      invoice_type: "deposit" | "milestone" | "final" | "retainer"
      knowledge_asset_kind:
        | "playbook"
        | "lesson"
        | "best_practice"
        | "policy"
        | "reference"
      knowledge_asset_status: "draft" | "published" | "deprecated"
      lead_stage: "new" | "qualified" | "proposal_sent" | "won" | "lost"
      meeting_status: "scheduled" | "completed" | "cancelled"
      milestone_status:
        | "pending"
        | "in_progress"
        | "waiting_client_approval"
        | "revision_requested"
        | "approved"
        | "completed"
      move_status:
        | "draft"
        | "recommended"
        | "approved"
        | "executing"
        | "completed"
        | "measured"
      onboarding_status:
        | "not_started"
        | "in_progress"
        | "abandoned"
        | "completed"
      operational_risk_status:
        | "identified"
        | "assessed"
        | "mitigating"
        | "mitigated"
        | "accepted"
        | "dismissed"
      payment_status:
        | "initiated"
        | "processing"
        | "succeeded"
        | "failed"
        | "pending_3ds"
      project_status:
        | "created"
        | "active"
        | "paused"
        | "delayed"
        | "in_review"
        | "completed"
        | "post_launch"
      proposal_status:
        | "draft"
        | "sent"
        | "viewed"
        | "accepted"
        | "change_requested"
        | "revised"
        | "expired"
      publish_status: "featured" | "public" | "draft" | "private"
      quote_status:
        | "draft"
        | "internal_review"
        | "sent"
        | "viewed"
        | "revision_requested"
        | "revised"
        | "accepted"
        | "rejected"
        | "expired"
        | "converted"
      recommendation_status: "proposed" | "adjusted" | "accepted" | "rejected"
      risk_likelihood:
        | "rare"
        | "unlikely"
        | "possible"
        | "likely"
        | "almost_certain"
      risk_severity: "low" | "medium" | "high" | "critical"
      runtime_artifact_kind:
        | "discovery_manifest"
        | "evidence_ingress"
        | "evidence_bundle"
        | "intelligence_graph"
        | "graph_snapshot"
        | "reasoning_jobs"
        | "execution_outcomes"
        | "validated_claims"
        | "findings"
        | "recommendation_candidates"
        | "internal_intelligence_report"
        | "competitor_snapshot"
        | "proposal"
        | "narrative"
      runtime_artifact_status: "valid" | "invalid" | "unvalidated"
      runtime_checkpoint_status: "valid" | "invalidated"
      runtime_lease_status: "unleased" | "leased" | "expired" | "released"
      runtime_provider_attempt_status:
        | "succeeded"
        | "rejected"
        | "failed"
        | "timed_out"
        | "cancelled"
        | "budget_exhausted"
        | "deadline_exceeded"
      runtime_queue_status:
        | "queued"
        | "leased"
        | "completed"
        | "failed"
        | "cancelled"
        | "dead_letter"
      runtime_reasoning_job_status:
        | "pending"
        | "planned"
        | "routed"
        | "running"
        | "validating"
        | "completed"
        | "failed"
        | "cancelled"
        | "blocked"
      runtime_retry_disposition: "retry_same" | "retry_fallback" | "stop"
      runtime_run_status:
        | "pending"
        | "discovering"
        | "ingesting_evidence"
        | "assembling_graph"
        | "planning_reasoning"
        | "executing_reasoning"
        | "validating_results"
        | "synthesizing_findings"
        | "building_recommendations"
        | "preparing_report"
        | "completed"
        | "failed"
        | "cancelled"
        | "blocked"
      runtime_stage_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "skipped"
        | "cancelled"
      scan_status: "diagnosing" | "diagnosed" | "activating" | "operating"
      signal_status: "detected" | "validated" | "prioritized" | "archived"
      user_account_status: "invited" | "active" | "suspended"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "owner",
        "admin",
        "team_member",
        "client_admin",
        "client_member",
      ],
      approval_decision: ["pending", "granted", "denied"],
      approval_subject_type: ["move", "operational_risk", "recommendation"],
      automation_status: ["active", "running", "success", "failed", "paused"],
      client_lifecycle: [
        "prospect",
        "member",
        "client_active",
        "post_launch",
        "churned",
        "renewed",
      ],
      contract_status: [
        "pending",
        "sent",
        "signed_client",
        "countersigned",
        "active",
        "voided",
      ],
      conversation_state: [
        "open",
        "awaiting_client",
        "awaiting_admin",
        "closed",
      ],
      deliverable_status: [
        "draft",
        "submitted",
        "in_review",
        "approved",
        "revision_requested",
        "rejected",
        "final",
      ],
      domain_key: [
        "web",
        "sales",
        "crm",
        "operations",
        "delivery",
        "analytics",
        "ai",
      ],
      domain_status: ["not_operating", "assembling", "operating"],
      execution_record_status: ["queued", "running", "succeeded", "failed"],
      file_upload_status: ["queued", "uploading", "success", "failed"],
      finding_priority: ["low", "medium", "high"],
      insight_status: ["generated", "endorsed", "dismissed"],
      invoice_status: [
        "draft",
        "sent",
        "pending",
        "paid",
        "overdue",
        "failed",
        "refunded",
      ],
      invoice_type: ["deposit", "milestone", "final", "retainer"],
      knowledge_asset_kind: [
        "playbook",
        "lesson",
        "best_practice",
        "policy",
        "reference",
      ],
      knowledge_asset_status: ["draft", "published", "deprecated"],
      lead_stage: ["new", "qualified", "proposal_sent", "won", "lost"],
      meeting_status: ["scheduled", "completed", "cancelled"],
      milestone_status: [
        "pending",
        "in_progress",
        "waiting_client_approval",
        "revision_requested",
        "approved",
        "completed",
      ],
      move_status: [
        "draft",
        "recommended",
        "approved",
        "executing",
        "completed",
        "measured",
      ],
      onboarding_status: [
        "not_started",
        "in_progress",
        "abandoned",
        "completed",
      ],
      operational_risk_status: [
        "identified",
        "assessed",
        "mitigating",
        "mitigated",
        "accepted",
        "dismissed",
      ],
      payment_status: [
        "initiated",
        "processing",
        "succeeded",
        "failed",
        "pending_3ds",
      ],
      project_status: [
        "created",
        "active",
        "paused",
        "delayed",
        "in_review",
        "completed",
        "post_launch",
      ],
      proposal_status: [
        "draft",
        "sent",
        "viewed",
        "accepted",
        "change_requested",
        "revised",
        "expired",
      ],
      publish_status: ["featured", "public", "draft", "private"],
      quote_status: [
        "draft",
        "internal_review",
        "sent",
        "viewed",
        "revision_requested",
        "revised",
        "accepted",
        "rejected",
        "expired",
        "converted",
      ],
      recommendation_status: ["proposed", "adjusted", "accepted", "rejected"],
      risk_likelihood: [
        "rare",
        "unlikely",
        "possible",
        "likely",
        "almost_certain",
      ],
      risk_severity: ["low", "medium", "high", "critical"],
      runtime_artifact_kind: [
        "discovery_manifest",
        "evidence_ingress",
        "evidence_bundle",
        "intelligence_graph",
        "graph_snapshot",
        "reasoning_jobs",
        "execution_outcomes",
        "validated_claims",
        "findings",
        "recommendation_candidates",
        "internal_intelligence_report",
        "competitor_snapshot",
        "proposal",
        "narrative",
      ],
      runtime_artifact_status: ["valid", "invalid", "unvalidated"],
      runtime_checkpoint_status: ["valid", "invalidated"],
      runtime_lease_status: ["unleased", "leased", "expired", "released"],
      runtime_provider_attempt_status: [
        "succeeded",
        "rejected",
        "failed",
        "timed_out",
        "cancelled",
        "budget_exhausted",
        "deadline_exceeded",
      ],
      runtime_queue_status: [
        "queued",
        "leased",
        "completed",
        "failed",
        "cancelled",
        "dead_letter",
      ],
      runtime_reasoning_job_status: [
        "pending",
        "planned",
        "routed",
        "running",
        "validating",
        "completed",
        "failed",
        "cancelled",
        "blocked",
      ],
      runtime_retry_disposition: ["retry_same", "retry_fallback", "stop"],
      runtime_run_status: [
        "pending",
        "discovering",
        "ingesting_evidence",
        "assembling_graph",
        "planning_reasoning",
        "executing_reasoning",
        "validating_results",
        "synthesizing_findings",
        "building_recommendations",
        "preparing_report",
        "completed",
        "failed",
        "cancelled",
        "blocked",
      ],
      runtime_stage_status: [
        "pending",
        "running",
        "completed",
        "failed",
        "skipped",
        "cancelled",
      ],
      scan_status: ["diagnosing", "diagnosed", "activating", "operating"],
      signal_status: ["detected", "validated", "prioritized", "archived"],
      user_account_status: ["invited", "active", "suspended"],
    },
  },
} as const

