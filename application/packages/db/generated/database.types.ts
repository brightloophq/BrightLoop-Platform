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
      configurations: {
        Row: {
          assessment_id: string | null
          client_id: string | null
          estimate_high: number
          estimate_low: number
          id: string
          modules: Json
          owned_assets: Json
          status: Database["public"]["Enums"]["onboarding_status"]
          updated_at: string
        }
        Insert: {
          assessment_id?: string | null
          client_id?: string | null
          estimate_high?: number
          estimate_low?: number
          id: string
          modules?: Json
          owned_assets?: Json
          status?: Database["public"]["Enums"]["onboarding_status"]
          updated_at?: string
        }
        Update: {
          assessment_id?: string | null
          client_id?: string | null
          estimate_high?: number
          estimate_low?: number
          id?: string
          modules?: Json
          owned_assets?: Json
          status?: Database["public"]["Enums"]["onboarding_status"]
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
      bl_client_id: { Args: never; Returns: string }
      bl_is_finance: { Args: never; Returns: boolean }
      bl_is_internal: { Args: never; Returns: boolean }
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
      deliverable_status:
        | "draft"
        | "submitted"
        | "in_review"
        | "approved"
        | "revision_requested"
        | "rejected"
        | "final"
      file_upload_status: "queued" | "uploading" | "success" | "failed"
      invoice_status:
        | "draft"
        | "sent"
        | "pending"
        | "paid"
        | "overdue"
        | "failed"
        | "refunded"
      invoice_type: "deposit" | "milestone" | "final" | "retainer"
      lead_stage: "new" | "qualified" | "proposal_sent" | "won" | "lost"
      meeting_status: "scheduled" | "completed" | "cancelled"
      milestone_status:
        | "pending"
        | "in_progress"
        | "waiting_client_approval"
        | "revision_requested"
        | "approved"
        | "completed"
      onboarding_status:
        | "not_started"
        | "in_progress"
        | "abandoned"
        | "completed"
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
      deliverable_status: [
        "draft",
        "submitted",
        "in_review",
        "approved",
        "revision_requested",
        "rejected",
        "final",
      ],
      file_upload_status: ["queued", "uploading", "success", "failed"],
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
      onboarding_status: [
        "not_started",
        "in_progress",
        "abandoned",
        "completed",
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
      user_account_status: ["invited", "active", "suspended"],
    },
  },
} as const
