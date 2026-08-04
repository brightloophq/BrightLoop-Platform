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
      action_definition: {
        Row: {
          client_id: string | null
          config: Json
          created_at: string
          execution_intent_id: string
          id: string
          integration_binding_id: string | null
          kind: string
          name: string
          workflow_definition_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          config?: Json
          created_at?: string
          execution_intent_id: string
          id: string
          integration_binding_id?: string | null
          kind: string
          name: string
          workflow_definition_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          config?: Json
          created_at?: string
          execution_intent_id?: string
          id?: string
          integration_binding_id?: string | null
          kind?: string
          name?: string
          workflow_definition_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_definition_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_definition_execution_intent_id_fkey"
            columns: ["execution_intent_id"]
            isOneToOne: false
            referencedRelation: "execution_intent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_definition_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definition"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_approval: {
        Row: {
          approval_class: string
          assigned_approver_user_id: string | null
          client_id: string | null
          created_at: string
          decided_at: string | null
          decided_by_user_id: string | null
          decision_reason: string | null
          expires_at: string | null
          id: string
          mission_id: string
          payload: Json
          payload_hash: string
          requested_at: string
          requested_by_role: string
          status: string
          task_key: string
          version: number
          workspace_id: string
        }
        Insert: {
          approval_class: string
          assigned_approver_user_id?: string | null
          client_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          decision_reason?: string | null
          expires_at?: string | null
          id: string
          mission_id: string
          payload?: Json
          payload_hash: string
          requested_at: string
          requested_by_role: string
          status?: string
          task_key: string
          version?: number
          workspace_id: string
        }
        Update: {
          approval_class?: string
          assigned_approver_user_id?: string | null
          client_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          decision_reason?: string | null
          expires_at?: string | null
          id?: string
          mission_id?: string
          payload?: Json
          payload_hash?: string
          requested_at?: string
          requested_by_role?: string
          status?: string
          task_key?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_approval_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approval_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_artifact: {
        Row: {
          citations: Json
          client_id: string | null
          created_at: string
          id: string
          kind: string
          mission_id: string
          produced_by_role: string
          ref_context: string
          ref_id: string
          snapshot: Json
          task_key: string | null
          title: string
          workspace_id: string
        }
        Insert: {
          citations?: Json
          client_id?: string | null
          created_at?: string
          id: string
          kind: string
          mission_id: string
          produced_by_role: string
          ref_context: string
          ref_id: string
          snapshot?: Json
          task_key?: string | null
          title?: string
          workspace_id: string
        }
        Update: {
          citations?: Json
          client_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          mission_id?: string
          produced_by_role?: string
          ref_context?: string
          ref_id?: string
          snapshot?: Json
          task_key?: string | null
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_artifact_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_artifact_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_checkpoint: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          label: string
          mission_id: string
          mission_status: string
          sequence: number
          snapshot: Json
          state_hash: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id: string
          label?: string
          mission_id: string
          mission_status: string
          sequence?: number
          snapshot?: Json
          state_hash: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          label?: string
          mission_id?: string
          mission_status?: string
          sequence?: number
          snapshot?: Json
          state_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_checkpoint_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_checkpoint_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_decision: {
        Row: {
          client_id: string | null
          created_at: string
          data: Json
          id: string
          kind: string
          mission_id: string
          rationale: string
          run_id: string | null
          task_key: string | null
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          data?: Json
          id: string
          kind: string
          mission_id: string
          rationale?: string
          run_id?: string | null
          task_key?: string | null
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          mission_id?: string
          rationale?: string
          run_id?: string | null
          task_key?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_decision_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_decision_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_delegation: {
        Row: {
          client_id: string | null
          constraints: string
          created_at: string
          deadline: string | null
          delegating_role: string
          depth: number
          expected_output: string
          failure_reason: string | null
          id: string
          mission_id: string
          parent_run_id: string
          receiving_role: string
          result_artifact_id: string | null
          status: string
          task_key: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          constraints?: string
          created_at?: string
          deadline?: string | null
          delegating_role: string
          depth?: number
          expected_output?: string
          failure_reason?: string | null
          id: string
          mission_id: string
          parent_run_id: string
          receiving_role: string
          result_artifact_id?: string | null
          status?: string
          task_key: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          constraints?: string
          created_at?: string
          deadline?: string | null
          delegating_role?: string
          depth?: number
          expected_output?: string
          failure_reason?: string | null
          id?: string
          mission_id?: string
          parent_run_id?: string
          receiving_role?: string
          result_artifact_id?: string | null
          status?: string
          task_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_delegation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_delegation_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_evaluation: {
        Row: {
          client_id: string | null
          completeness: number
          confidence: number
          correctness: number
          cost_efficiency: number
          created_at: string
          evaluator_role: string
          evidence: Json
          evidence_quality: number
          execution_efficiency: number
          goal_alignment: number
          human_accepted: boolean | null
          id: string
          mission_id: string
          policy_compliance: number
          rationale: string
          required_remediation: string
          score: number
          target_key: string
          target_kind: string
          verdict: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          completeness?: number
          confidence?: number
          correctness?: number
          cost_efficiency?: number
          created_at?: string
          evaluator_role: string
          evidence?: Json
          evidence_quality?: number
          execution_efficiency?: number
          goal_alignment?: number
          human_accepted?: boolean | null
          id: string
          mission_id: string
          policy_compliance?: number
          rationale?: string
          required_remediation?: string
          score?: number
          target_key: string
          target_kind: string
          verdict: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          completeness?: number
          confidence?: number
          correctness?: number
          cost_efficiency?: number
          created_at?: string
          evaluator_role?: string
          evidence?: Json
          evidence_quality?: number
          execution_efficiency?: number
          goal_alignment?: number
          human_accepted?: boolean | null
          id?: string
          mission_id?: string
          policy_compliance?: number
          rationale?: string
          required_remediation?: string
          score?: number
          target_key?: string
          target_kind?: string
          verdict?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_evaluation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_evaluation_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_failure: {
        Row: {
          affected_capability: string | null
          affected_task_key: string | null
          category: string
          cause: string
          client_id: string | null
          created_at: string
          id: string
          mission_id: string
          resolution: string
          retry_count: number
          retryable: boolean
          run_id: string | null
          stage: string
          workspace_id: string
        }
        Insert: {
          affected_capability?: string | null
          affected_task_key?: string | null
          category: string
          cause?: string
          client_id?: string | null
          created_at?: string
          id: string
          mission_id: string
          resolution?: string
          retry_count?: number
          retryable?: boolean
          run_id?: string | null
          stage?: string
          workspace_id: string
        }
        Update: {
          affected_capability?: string | null
          affected_task_key?: string | null
          category?: string
          cause?: string
          client_id?: string | null
          created_at?: string
          id?: string
          mission_id?: string
          resolution?: string
          retry_count?: number
          retryable?: boolean
          run_id?: string | null
          stage?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_failure_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_failure_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_feedback: {
        Row: {
          client_id: string | null
          comment: string | null
          created_at: string
          id: string
          kind: string
          mission_id: string
          rating: number | null
          subject_user_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          comment?: string | null
          created_at?: string
          id: string
          kind: string
          mission_id: string
          rating?: number | null
          subject_user_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          kind?: string
          mission_id?: string
          rating?: number | null
          subject_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_feedback_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          key: string
          mission_id: string
          redacted: boolean
          sensitivity: string
          source_ref: string | null
          ttl_seconds: number | null
          type: string
          value: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id: string
          key: string
          mission_id: string
          redacted?: boolean
          sensitivity?: string
          source_ref?: string | null
          ttl_seconds?: number | null
          type: string
          value?: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          key?: string
          mission_id?: string
          redacted?: boolean
          sensitivity?: string
          source_ref?: string | null
          ttl_seconds?: number | null
          type?: string
          value?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_memory_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_message: {
        Row: {
          client_id: string | null
          correlation_id: string
          created_at: string
          id: string
          kind: string
          mission_id: string
          parent_message_id: string | null
          payload: Json
          receiver_role: string | null
          receiver_user_id: string | null
          run_id: string | null
          sender_role: string | null
          sender_user_id: string | null
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          correlation_id: string
          created_at?: string
          id: string
          kind: string
          mission_id: string
          parent_message_id?: string | null
          payload?: Json
          receiver_role?: string | null
          receiver_user_id?: string | null
          run_id?: string | null
          sender_role?: string | null
          sender_user_id?: string | null
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          correlation_id?: string
          created_at?: string
          id?: string
          kind?: string
          mission_id?: string
          parent_message_id?: string | null
          payload?: Json
          receiver_role?: string | null
          receiver_user_id?: string | null
          run_id?: string | null
          sender_role?: string | null
          sender_user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_message_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_message_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_mission: {
        Row: {
          approval_wait_ms: number
          automation_intent_id: string | null
          capability_calls: number
          checkpoint_count: number
          client_id: string | null
          coordinator_profile_id: string
          correlation_id: string
          cost: number
          created_at: string
          delegation_count: number
          duration_ms: number
          failed_capability_calls: number
          goal: string
          id: string
          limits: Json
          model: string | null
          plan_hash: string
          plan_locked: boolean
          planning_duration_ms: number
          planning_session_id: string | null
          progress: number
          provider: string | null
          requested_by_user_id: string
          resumable_checkpoint_id: string | null
          retry_count: number
          run_count: number
          status: string
          strategy_session_id: string | null
          task_count: number
          termination_reason: string
          title: string
          token_total: number
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          approval_wait_ms?: number
          automation_intent_id?: string | null
          capability_calls?: number
          checkpoint_count?: number
          client_id?: string | null
          coordinator_profile_id: string
          correlation_id: string
          cost?: number
          created_at?: string
          delegation_count?: number
          duration_ms?: number
          failed_capability_calls?: number
          goal?: string
          id: string
          limits?: Json
          model?: string | null
          plan_hash?: string
          plan_locked?: boolean
          planning_duration_ms?: number
          planning_session_id?: string | null
          progress?: number
          provider?: string | null
          requested_by_user_id: string
          resumable_checkpoint_id?: string | null
          retry_count?: number
          run_count?: number
          status?: string
          strategy_session_id?: string | null
          task_count?: number
          termination_reason?: string
          title: string
          token_total?: number
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          approval_wait_ms?: number
          automation_intent_id?: string | null
          capability_calls?: number
          checkpoint_count?: number
          client_id?: string | null
          coordinator_profile_id?: string
          correlation_id?: string
          cost?: number
          created_at?: string
          delegation_count?: number
          duration_ms?: number
          failed_capability_calls?: number
          goal?: string
          id?: string
          limits?: Json
          model?: string | null
          plan_hash?: string
          plan_locked?: boolean
          planning_duration_ms?: number
          planning_session_id?: string | null
          progress?: number
          provider?: string | null
          requested_by_user_id?: string
          resumable_checkpoint_id?: string | null
          retry_count?: number
          run_count?: number
          status?: string
          strategy_session_id?: string | null
          task_count?: number
          termination_reason?: string
          title?: string
          token_total?: number
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_mission_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_mission_coordinator_profile_id_fkey"
            columns: ["coordinator_profile_id"]
            isOneToOne: false
            referencedRelation: "agent_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_observation: {
        Row: {
          capability_key: string | null
          client_id: string | null
          created_at: string
          data: Json
          id: string
          mission_id: string
          provenance: Json
          run_id: string | null
          summary: string
          task_key: string | null
          workspace_id: string
        }
        Insert: {
          capability_key?: string | null
          client_id?: string | null
          created_at?: string
          data?: Json
          id: string
          mission_id: string
          provenance?: Json
          run_id?: string | null
          summary?: string
          task_key?: string | null
          workspace_id: string
        }
        Update: {
          capability_key?: string | null
          client_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          mission_id?: string
          provenance?: Json
          run_id?: string | null
          summary?: string
          task_key?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_observation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_observation_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_profile: {
        Row: {
          allowed_capabilities: Json
          approval_requirements: Json
          client_id: string | null
          created_at: string
          escalation_policy: string
          id: string
          input_contract: Json
          max_delegation_depth: number
          max_retries: number
          name: string
          output_contract: Json
          prohibited_capabilities: Json
          purpose: string
          role: string
          status: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          allowed_capabilities?: Json
          approval_requirements?: Json
          client_id?: string | null
          created_at?: string
          escalation_policy?: string
          id: string
          input_contract?: Json
          max_delegation_depth?: number
          max_retries?: number
          name: string
          output_contract?: Json
          prohibited_capabilities?: Json
          purpose?: string
          role: string
          status?: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          allowed_capabilities?: Json
          approval_requirements?: Json
          client_id?: string | null
          created_at?: string
          escalation_policy?: string
          id?: string
          input_contract?: Json
          max_delegation_depth?: number
          max_retries?: number
          name?: string
          output_contract?: Json
          prohibited_capabilities?: Json
          purpose?: string
          role?: string
          status?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_profile_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_run: {
        Row: {
          agent_profile_id: string
          client_id: string | null
          correlation_id: string
          created_at: string
          delegation_depth: number
          ended_at: string | null
          id: string
          mission_id: string
          parent_run_id: string | null
          role: string
          started_at: string | null
          status: string
          trace_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          agent_profile_id: string
          client_id?: string | null
          correlation_id: string
          created_at?: string
          delegation_depth?: number
          ended_at?: string | null
          id: string
          mission_id: string
          parent_run_id?: string | null
          role: string
          started_at?: string | null
          status?: string
          trace_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          agent_profile_id?: string
          client_id?: string | null
          correlation_id?: string
          created_at?: string
          delegation_depth?: number
          ended_at?: string | null
          id?: string
          mission_id?: string
          parent_run_id?: string | null
          role?: string
          started_at?: string | null
          status?: string
          trace_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_run_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_task: {
        Row: {
          approval_class: string | null
          approval_gated: boolean
          assigned_role: string
          capability_input: Json
          capability_key: string | null
          claimed_at: string | null
          claimed_by: string | null
          client_id: string | null
          compensates_task_key: string | null
          completion_criteria: string
          created_at: string
          depends_on: Json
          expected_output: string
          heartbeat_at: string | null
          id: string
          key: string
          kind: string
          lease_expires_at: string | null
          mission_id: string
          optional: boolean
          order_index: number
          parallelizable: boolean
          result_artifact_id: string | null
          retry_count: number
          retryable: boolean
          status: string
          title: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          approval_class?: string | null
          approval_gated?: boolean
          assigned_role: string
          capability_input?: Json
          capability_key?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          client_id?: string | null
          compensates_task_key?: string | null
          completion_criteria?: string
          created_at?: string
          depends_on?: Json
          expected_output?: string
          heartbeat_at?: string | null
          id: string
          key: string
          kind: string
          lease_expires_at?: string | null
          mission_id: string
          optional?: boolean
          order_index?: number
          parallelizable?: boolean
          result_artifact_id?: string | null
          retry_count?: number
          retryable?: boolean
          status?: string
          title: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          approval_class?: string | null
          approval_gated?: boolean
          assigned_role?: string
          capability_input?: Json
          capability_key?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          client_id?: string | null
          compensates_task_key?: string | null
          completion_criteria?: string
          created_at?: string
          depends_on?: Json
          expected_output?: string
          heartbeat_at?: string | null
          id?: string
          key?: string
          kind?: string
          lease_expires_at?: string | null
          mission_id?: string
          optional?: boolean
          order_index?: number
          parallelizable?: boolean
          result_artifact_id?: string | null
          retry_count?: number
          retryable?: boolean
          status?: string
          title?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_task_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_task_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tool_call: {
        Row: {
          capability_key: string
          client_id: string | null
          correlation_id: string
          cost: number
          created_at: string
          duration_ms: number
          error_code: string | null
          id: string
          idempotency_key: string
          input: Json
          mission_id: string
          ok: boolean
          output_ref: string | null
          required_permission: string
          run_id: string | null
          side_effect: string
          task_key: string | null
          token_total: number
          workspace_id: string
        }
        Insert: {
          capability_key: string
          client_id?: string | null
          correlation_id: string
          cost?: number
          created_at?: string
          duration_ms?: number
          error_code?: string | null
          id: string
          idempotency_key: string
          input?: Json
          mission_id: string
          ok: boolean
          output_ref?: string | null
          required_permission: string
          run_id?: string | null
          side_effect: string
          task_key?: string | null
          token_total?: number
          workspace_id: string
        }
        Update: {
          capability_key?: string
          client_id?: string | null
          correlation_id?: string
          cost?: number
          created_at?: string
          duration_ms?: number
          error_code?: string | null
          id?: string
          idempotency_key?: string
          input?: Json
          mission_id?: string
          ok?: boolean
          output_ref?: string | null
          required_permission?: string
          run_id?: string | null
          side_effect?: string
          task_key?: string | null
          token_total?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tool_call_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tool_call_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agent_mission"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_audit_event: {
        Row: {
          at: string
          client_id: string | null
          currency: string
          duration_ms: number
          execution_id: string
          fallback_provider: string | null
          id: string
          model: string
          prompt_version: number | null
          provider: string
          retry_count: number
          status: string
          total_cost: number
          total_tokens: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          at?: string
          client_id?: string | null
          currency?: string
          duration_ms?: number
          execution_id: string
          fallback_provider?: string | null
          id: string
          model: string
          prompt_version?: number | null
          provider: string
          retry_count?: number
          status: string
          total_cost?: number
          total_tokens?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          at?: string
          client_id?: string | null
          currency?: string
          duration_ms?: number
          execution_id?: string
          fallback_provider?: string | null
          id?: string
          model?: string
          prompt_version?: number | null
          provider?: string
          retry_count?: number
          status?: string
          total_cost?: number
          total_tokens?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_event_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_audit_event_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt_execution"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversation: {
        Row: {
          client_id: string | null
          completion_tokens_total: number
          created_at: string
          created_by_user_id: string
          currency: string
          id: string
          message_count: number
          model: string
          participants: Json
          prompt_tokens_total: number
          provider: string
          status: string
          title: string
          total_cost: number
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          completion_tokens_total?: number
          created_at?: string
          created_by_user_id: string
          currency?: string
          id: string
          message_count?: number
          model: string
          participants?: Json
          prompt_tokens_total?: number
          provider: string
          status?: string
          title?: string
          total_cost?: number
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          completion_tokens_total?: number
          created_at?: string
          created_by_user_id?: string
          currency?: string
          id?: string
          message_count?: number
          model?: string
          participants?: Json
          prompt_tokens_total?: number
          provider?: string
          status?: string
          title?: string
          total_cost?: number
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversation_message: {
        Row: {
          at: string
          client_id: string | null
          completion_tokens: number
          content: string
          conversation_id: string
          id: string
          prompt_tokens: number
          role: string
          sequence: number
          workspace_id: string
        }
        Insert: {
          at?: string
          client_id?: string | null
          completion_tokens?: number
          content: string
          conversation_id: string
          id: string
          prompt_tokens?: number
          role: string
          sequence: number
          workspace_id: string
        }
        Update: {
          at?: string
          client_id?: string | null
          completion_tokens?: number
          content?: string
          conversation_id?: string
          id?: string
          prompt_tokens?: number
          role?: string
          sequence?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_message_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversation_message_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversation"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_cost_record: {
        Row: {
          at: string
          client_id: string | null
          currency: string
          execution_id: string
          id: string
          input_cost: number
          output_cost: number
          pricing_version: string
          total_cost: number
          workspace_id: string
        }
        Insert: {
          at?: string
          client_id?: string | null
          currency?: string
          execution_id: string
          id: string
          input_cost?: number
          output_cost?: number
          pricing_version: string
          total_cost?: number
          workspace_id: string
        }
        Update: {
          at?: string
          client_id?: string | null
          currency?: string
          execution_id?: string
          id?: string
          input_cost?: number
          output_cost?: number
          pricing_version?: string
          total_cost?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_cost_record_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_cost_record_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt_execution"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_evaluation_result: {
        Row: {
          at: string
          client_id: string | null
          evaluator: string
          execution_id: string
          id: string
          notes: string | null
          outcome: string
          score: number | null
          workspace_id: string
        }
        Insert: {
          at?: string
          client_id?: string | null
          evaluator: string
          execution_id: string
          id: string
          notes?: string | null
          outcome: string
          score?: number | null
          workspace_id: string
        }
        Update: {
          at?: string
          client_id?: string | null
          evaluator?: string
          execution_id?: string
          id?: string
          notes?: string | null
          outcome?: string
          score?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_evaluation_result_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_evaluation_result_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt_execution"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt: {
        Row: {
          active_version: number | null
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          owner_user_id: string
          status: string
          tags: Json
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          active_version?: number | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id: string
          name: string
          owner_user_id: string
          status?: string
          tags?: Json
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          active_version?: number | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          status?: string
          tags?: Json
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_execution: {
        Row: {
          client_id: string | null
          created_at: string
          duration_ms: number
          fallback_provider: string | null
          id: string
          mode: string
          model: string
          prompt_id: string | null
          prompt_version: number | null
          provider: string
          requested_by_user_id: string
          retry_count: number
          status: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          duration_ms?: number
          fallback_provider?: string | null
          id: string
          mode: string
          model: string
          prompt_id?: string | null
          prompt_version?: number | null
          provider: string
          requested_by_user_id: string
          retry_count?: number
          status: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          duration_ms?: number
          fallback_provider?: string | null
          id?: string
          mode?: string
          model?: string
          prompt_id?: string | null
          prompt_version?: number | null
          provider?: string
          requested_by_user_id?: string
          retry_count?: number
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_execution_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_prompt_execution_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_result: {
        Row: {
          client_id: string | null
          content: string
          created_at: string
          execution_id: string
          finish_reason: string
          id: string
          structured_valid: boolean | null
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          content?: string
          created_at?: string
          execution_id: string
          finish_reason?: string
          id: string
          structured_valid?: boolean | null
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          content?: string
          created_at?: string
          execution_id?: string
          finish_reason?: string
          id?: string
          structured_valid?: boolean | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_result_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_prompt_result_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt_execution"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_version: {
        Row: {
          client_id: string | null
          created_at: string
          created_by_user_id: string
          id: string
          max_tokens: number
          model: string | null
          notes: string | null
          prompt_id: string
          provider_preference: string | null
          status: string
          system_prompt: string
          temperature: number
          user_template: string
          variables: Json
          version: number
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by_user_id: string
          id: string
          max_tokens?: number
          model?: string | null
          notes?: string | null
          prompt_id: string
          provider_preference?: string | null
          status?: string
          system_prompt?: string
          temperature?: number
          user_template?: string
          variables?: Json
          version: number
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by_user_id?: string
          id?: string
          max_tokens?: number
          model?: string | null
          notes?: string | null
          prompt_id?: string
          provider_preference?: string | null
          status?: string
          system_prompt?: string
          temperature?: number
          user_template?: string
          variables?: Json
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_version_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_prompt_version_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider: {
        Row: {
          client_id: string | null
          created_at: string
          default_model: string | null
          enabled: boolean
          id: string
          kind: string
          label: string
          priority: number
          updated_at: string
          version: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          default_model?: string | null
          enabled?: boolean
          id: string
          kind: string
          label: string
          priority?: number
          updated_at?: string
          version?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          default_model?: string | null
          enabled?: boolean
          id?: string
          kind?: string
          label?: string
          priority?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_record: {
        Row: {
          at: string
          cached_tokens: number
          client_id: string | null
          completion_tokens: number
          execution_id: string
          id: string
          model: string
          prompt_tokens: number
          provider: string
          total_tokens: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          at?: string
          cached_tokens?: number
          client_id?: string | null
          completion_tokens?: number
          execution_id: string
          id: string
          model: string
          prompt_tokens?: number
          provider: string
          total_tokens?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          at?: string
          cached_tokens?: number
          client_id?: string | null
          completion_tokens?: number
          execution_id?: string
          id?: string
          model?: string
          prompt_tokens?: number
          provider?: string
          total_tokens?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_record_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_record_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt_execution"
            referencedColumns: ["id"]
          },
        ]
      }
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
      automation_feedback: {
        Row: {
          client_id: string | null
          comment: string | null
          created_at: string
          execution_intent_id: string
          id: string
          kind: string
          rating: number | null
          subject_user_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          comment?: string | null
          created_at?: string
          execution_intent_id: string
          id: string
          kind: string
          rating?: number | null
          subject_user_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          comment?: string | null
          created_at?: string
          execution_intent_id?: string
          id?: string
          kind?: string
          rating?: number | null
          subject_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_feedback_execution_intent_id_fkey"
            columns: ["execution_intent_id"]
            isOneToOne: false
            referencedRelation: "execution_intent"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_plan: {
        Row: {
          action_count: number
          client_id: string | null
          created_at: string
          execution_intent_id: string
          id: string
          integration_count: number
          status: string
          step_count: number
          summary: string
          trigger_count: number
          variable_count: number
          workflow_count: number
          workspace_id: string
        }
        Insert: {
          action_count?: number
          client_id?: string | null
          created_at?: string
          execution_intent_id: string
          id: string
          integration_count?: number
          status?: string
          step_count?: number
          summary?: string
          trigger_count?: number
          variable_count?: number
          workflow_count?: number
          workspace_id: string
        }
        Update: {
          action_count?: number
          client_id?: string | null
          created_at?: string
          execution_intent_id?: string
          id?: string
          integration_count?: number
          status?: string
          step_count?: number
          summary?: string
          trigger_count?: number
          variable_count?: number
          workflow_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_plan_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_plan_execution_intent_id_fkey"
            columns: ["execution_intent_id"]
            isOneToOne: false
            referencedRelation: "execution_intent"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_version: {
        Row: {
          client_id: string | null
          created_at: string
          execution_intent_id: string
          id: string
          note: string
          snapshot: Json
          status: string
          version: number
          workflow_definition_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          execution_intent_id: string
          id: string
          note?: string
          snapshot?: Json
          status?: string
          version: number
          workflow_definition_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          execution_intent_id?: string
          id?: string
          note?: string
          snapshot?: Json
          status?: string
          version?: number
          workflow_definition_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_version_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_version_execution_intent_id_fkey"
            columns: ["execution_intent_id"]
            isOneToOne: false
            referencedRelation: "execution_intent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_version_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definition"
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
      business_finding: {
        Row: {
          business_impact: string
          category: string
          client_id: string | null
          confidence: number
          created_at: string
          detail: string
          dimension: string
          evidence_count: number
          id: string
          session_id: string
          title: string
          workspace_id: string
        }
        Insert: {
          business_impact?: string
          category: string
          client_id?: string | null
          confidence?: number
          created_at?: string
          detail?: string
          dimension: string
          evidence_count?: number
          id: string
          session_id: string
          title: string
          workspace_id: string
        }
        Update: {
          business_impact?: string
          category?: string
          client_id?: string | null
          confidence?: number
          created_at?: string
          detail?: string
          dimension?: string
          evidence_count?: number
          id?: string
          session_id?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_finding_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_finding_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "strategy_session"
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
      business_insight: {
        Row: {
          affected_metrics: Json
          client_id: string | null
          confidence: number
          created_at: string
          id: string
          recommended_actions: Json
          report_id: string
          severity: string
          summary: string
          supporting_evidence: Json
          title: string
          workspace_id: string
        }
        Insert: {
          affected_metrics?: Json
          client_id?: string | null
          confidence: number
          created_at?: string
          id: string
          recommended_actions?: Json
          report_id: string
          severity: string
          summary?: string
          supporting_evidence?: Json
          title: string
          workspace_id: string
        }
        Update: {
          affected_metrics?: Json
          client_id?: string | null
          confidence?: number
          created_at?: string
          id?: string
          recommended_actions?: Json
          report_id?: string
          severity?: string
          summary?: string
          supporting_evidence?: Json
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_insight_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_insight_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "executive_report"
            referencedColumns: ["id"]
          },
        ]
      }
      business_metric: {
        Row: {
          category: string
          client_id: string | null
          created_at: string
          id: string
          key: string
          name: string
          report_id: string
          sample_size: number
          source: string
          unit: string
          value: number
          workspace_id: string
        }
        Insert: {
          category: string
          client_id?: string | null
          created_at?: string
          id: string
          key: string
          name: string
          report_id: string
          sample_size?: number
          source: string
          unit?: string
          value?: number
          workspace_id: string
        }
        Update: {
          category?: string
          client_id?: string | null
          created_at?: string
          id?: string
          key?: string
          name?: string
          report_id?: string
          sample_size?: number
          source?: string
          unit?: string
          value?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_metric_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_metric_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "executive_report"
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
      capability_definition: {
        Row: {
          approval: string
          cost_category: string
          created_at: string
          description: string
          idempotency: string
          key: string
          owning_context: string
          required_permission: string
          retry: string
          service: string
          side_effect: string
          timeout_ms: number
        }
        Insert: {
          approval?: string
          cost_category?: string
          created_at?: string
          description?: string
          idempotency?: string
          key: string
          owning_context: string
          required_permission: string
          retry?: string
          service: string
          side_effect: string
          timeout_ms?: number
        }
        Update: {
          approval?: string
          cost_category?: string
          created_at?: string
          description?: string
          idempotency?: string
          key?: string
          owning_context?: string
          required_permission?: string
          retry?: string
          service?: string
          side_effect?: string
          timeout_ms?: number
        }
        Relationships: []
      }
      certification_exception: {
        Row: {
          approved_by_user_id: string
          client_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          issue_code: string
          reason: string
          run_id: string
          workspace_id: string
        }
        Insert: {
          approved_by_user_id: string
          client_id?: string | null
          created_at?: string
          expires_at?: string | null
          id: string
          issue_code: string
          reason: string
          run_id: string
          workspace_id: string
        }
        Update: {
          approved_by_user_id?: string
          client_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          issue_code?: string
          reason?: string
          run_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certification_exception_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certification_exception_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "certification_run"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_issue: {
        Row: {
          bounded_context: string
          category: string
          client_id: string | null
          code: string
          created_at: string
          detail: string
          id: string
          result_id: string | null
          run_id: string
          severity: string
          status: string
          title: string
          workspace_id: string
        }
        Insert: {
          bounded_context?: string
          category: string
          client_id?: string | null
          code: string
          created_at?: string
          detail?: string
          id: string
          result_id?: string | null
          run_id: string
          severity: string
          status?: string
          title: string
          workspace_id: string
        }
        Update: {
          bounded_context?: string
          category?: string
          client_id?: string | null
          code?: string
          created_at?: string
          detail?: string
          id?: string
          result_id?: string | null
          run_id?: string
          severity?: string
          status?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certification_issue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certification_issue_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "certification_run"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_result: {
        Row: {
          category: string
          checks_passed: number
          checks_total: number
          client_id: string | null
          created_at: string
          id: string
          outcome: string
          run_id: string
          score: number
          summary: string
          workspace_id: string
        }
        Insert: {
          category: string
          checks_passed?: number
          checks_total?: number
          client_id?: string | null
          created_at?: string
          id: string
          outcome: string
          run_id: string
          score?: number
          summary?: string
          workspace_id: string
        }
        Update: {
          category?: string
          checks_passed?: number
          checks_total?: number
          client_id?: string | null
          created_at?: string
          id?: string
          outcome?: string
          run_id?: string
          score?: number
          summary?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certification_result_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certification_result_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "certification_run"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_run: {
        Row: {
          categories_covered: number
          client_id: string | null
          correlation_id: string
          created_at: string
          duration_ms: number
          failed_checks: number
          id: string
          outcome: string
          passed_checks: number
          published: boolean
          requested_by_user_id: string
          score: number
          status: string
          title: string
          total_checks: number
          updated_at: string
          version: number
          warning_count: number
          workspace_id: string
        }
        Insert: {
          categories_covered?: number
          client_id?: string | null
          correlation_id: string
          created_at?: string
          duration_ms?: number
          failed_checks?: number
          id: string
          outcome?: string
          passed_checks?: number
          published?: boolean
          requested_by_user_id: string
          score?: number
          status?: string
          title: string
          total_checks?: number
          updated_at?: string
          version?: number
          warning_count?: number
          workspace_id: string
        }
        Update: {
          categories_covered?: number
          client_id?: string | null
          correlation_id?: string
          created_at?: string
          duration_ms?: number
          failed_checks?: number
          id?: string
          outcome?: string
          passed_checks?: number
          published?: boolean
          requested_by_user_id?: string
          score?: number
          status?: string
          title?: string
          total_checks?: number
          updated_at?: string
          version?: number
          warning_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certification_run_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      citation: {
        Row: {
          chunk_id: string
          client_id: string | null
          collection_id: string
          created_at: string
          document_id: string
          heading: string | null
          id: string
          page: number | null
          score: number
          session_id: string
          source_type: string
          workspace_id: string
        }
        Insert: {
          chunk_id: string
          client_id?: string | null
          collection_id: string
          created_at?: string
          document_id: string
          heading?: string | null
          id: string
          page?: number | null
          score: number
          session_id: string
          source_type: string
          workspace_id: string
        }
        Update: {
          chunk_id?: string
          client_id?: string | null
          collection_id?: string
          created_at?: string
          document_id?: string
          heading?: string | null
          id?: string
          page?: number | null
          score?: number
          session_id?: string
          source_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "citation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citation_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "retrieval_session"
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
      collaboration_inbox_item: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          notification_id: string
          status: string
          updated_at: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id: string
          notification_id: string
          status?: string
          updated_at?: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          notification_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_inbox_item_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_inbox_item_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "collaboration_notification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_inbox_item_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "transformation_workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      collaboration_mention: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          mentioned_by_user_id: string
          mentioned_user_id: string
          note: string | null
          subject_id: string
          subject_type: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id: string
          mentioned_by_user_id: string
          mentioned_user_id: string
          note?: string | null
          subject_id: string
          subject_type: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          mentioned_by_user_id?: string
          mentioned_user_id?: string
          note?: string | null
          subject_id?: string
          subject_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_mention_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_mention_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "transformation_workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      collaboration_notification: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          recipient_user_id: string
          source_activity_id: string | null
          subject_id: string
          subject_type: string
          summary: string
          type: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id: string
          recipient_user_id: string
          source_activity_id?: string | null
          subject_id: string
          subject_type: string
          summary: string
          type: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          recipient_user_id?: string
          source_activity_id?: string | null
          subject_id?: string
          subject_type?: string
          summary?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_notification_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_notification_source_activity_id_fkey"
            columns: ["source_activity_id"]
            isOneToOne: false
            referencedRelation: "transformation_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_notification_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "transformation_workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      collaboration_read_receipt: {
        Row: {
          entity_id: string
          entity_type: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          entity_id: string
          entity_type: string
          id: string
          read_at?: string
          user_id: string
        }
        Update: {
          entity_id?: string
          entity_type?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      collaboration_subscription: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          target_id: string
          target_type: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id: string
          target_id: string
          target_type: string
          user_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_subscription_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_subscription_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "transformation_workspace"
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
      condition_definition: {
        Row: {
          client_id: string | null
          created_at: string
          execution_intent_id: string
          expression: string
          false_step_key: string | null
          id: string
          name: string
          true_step_key: string | null
          workflow_definition_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          execution_intent_id: string
          expression: string
          false_step_key?: string | null
          id: string
          name: string
          true_step_key?: string | null
          workflow_definition_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          execution_intent_id?: string
          expression?: string
          false_step_key?: string | null
          id?: string
          name?: string
          true_step_key?: string | null
          workflow_definition_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "condition_definition_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_definition_execution_intent_id_fkey"
            columns: ["execution_intent_id"]
            isOneToOne: false
            referencedRelation: "execution_intent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_definition_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definition"
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
      connector_audit_event: {
        Row: {
          actor_user_id: string | null
          client_id: string | null
          connector_installation_id: string
          correlation_id: string
          created_at: string
          from_status: string | null
          id: string
          operation: string
          summary: string
          to_status: string | null
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          client_id?: string | null
          connector_installation_id: string
          correlation_id: string
          created_at?: string
          from_status?: string | null
          id: string
          operation: string
          summary?: string
          to_status?: string | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          client_id?: string | null
          connector_installation_id?: string
          correlation_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          operation?: string
          summary?: string
          to_status?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_audit_event_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_audit_event_connector_installation_id_fkey"
            columns: ["connector_installation_id"]
            isOneToOne: false
            referencedRelation: "connector_installation"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_event: {
        Row: {
          client_id: string | null
          connector_id: string
          connector_installation_id: string
          created_at: string
          external_id: string
          id: string
          idempotency_key: string
          ingested_at: string
          occurred_at: string
          payload: Json
          provenance: string
          source: string
          status: string
          type: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          connector_id: string
          connector_installation_id: string
          created_at?: string
          external_id: string
          id: string
          idempotency_key: string
          ingested_at: string
          occurred_at: string
          payload?: Json
          provenance?: string
          source: string
          status?: string
          type: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          connector_id?: string
          connector_installation_id?: string
          created_at?: string
          external_id?: string
          id?: string
          idempotency_key?: string
          ingested_at?: string
          occurred_at?: string
          payload?: Json
          provenance?: string
          source?: string
          status?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_event_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_event_connector_installation_id_fkey"
            columns: ["connector_installation_id"]
            isOneToOne: false
            referencedRelation: "connector_installation"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_health_snapshot: {
        Row: {
          checked_at: string
          client_id: string | null
          connector_installation_id: string
          created_at: string
          detail: Json
          id: string
          latency_ms: number
          level: string
          workspace_id: string
        }
        Insert: {
          checked_at: string
          client_id?: string | null
          connector_installation_id: string
          created_at?: string
          detail?: Json
          id: string
          latency_ms?: number
          level: string
          workspace_id: string
        }
        Update: {
          checked_at?: string
          client_id?: string | null
          connector_installation_id?: string
          created_at?: string
          detail?: Json
          id?: string
          latency_ms?: number
          level?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_health_snapshot_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_health_snapshot_connector_installation_id_fkey"
            columns: ["connector_installation_id"]
            isOneToOne: false
            referencedRelation: "connector_installation"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_installation: {
        Row: {
          auth_method: string
          client_id: string | null
          config: Json
          connector_id: string
          correlation_id: string
          created_at: string
          created_by_user_id: string
          display_name: string
          enabled_capabilities: Json
          health_level: string
          id: string
          idempotency_key: string
          last_health_check_at: string | null
          polling_cursor: string | null
          secret_reference_id: string | null
          status: string
          trigger_kind: string
          updated_at: string
          version: number
          webhook_endpoint_id: string | null
          workspace_id: string
        }
        Insert: {
          auth_method: string
          client_id?: string | null
          config?: Json
          connector_id: string
          correlation_id: string
          created_at?: string
          created_by_user_id: string
          display_name: string
          enabled_capabilities?: Json
          health_level?: string
          id: string
          idempotency_key: string
          last_health_check_at?: string | null
          polling_cursor?: string | null
          secret_reference_id?: string | null
          status?: string
          trigger_kind?: string
          updated_at?: string
          version?: number
          webhook_endpoint_id?: string | null
          workspace_id: string
        }
        Update: {
          auth_method?: string
          client_id?: string | null
          config?: Json
          connector_id?: string
          correlation_id?: string
          created_at?: string
          created_by_user_id?: string
          display_name?: string
          enabled_capabilities?: Json
          health_level?: string
          id?: string
          idempotency_key?: string
          last_health_check_at?: string | null
          polling_cursor?: string | null
          secret_reference_id?: string | null
          status?: string
          trigger_kind?: string
          updated_at?: string
          version?: number
          webhook_endpoint_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_installation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_oauth_grant: {
        Row: {
          authorization_url: string
          client_id: string | null
          connector_id: string
          connector_installation_id: string
          created_at: string
          created_by_user_id: string
          expires_at: string | null
          id: string
          redirect_uri: string
          scopes: Json
          secret_reference_id: string | null
          state_token: string
          status: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          authorization_url?: string
          client_id?: string | null
          connector_id: string
          connector_installation_id: string
          created_at?: string
          created_by_user_id: string
          expires_at?: string | null
          id: string
          redirect_uri: string
          scopes?: Json
          secret_reference_id?: string | null
          state_token: string
          status?: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          authorization_url?: string
          client_id?: string | null
          connector_id?: string
          connector_installation_id?: string
          created_at?: string
          created_by_user_id?: string
          expires_at?: string | null
          id?: string
          redirect_uri?: string
          scopes?: Json
          secret_reference_id?: string | null
          state_token?: string
          status?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_oauth_grant_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_oauth_grant_connector_installation_id_fkey"
            columns: ["connector_installation_id"]
            isOneToOne: false
            referencedRelation: "connector_installation"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_polling_cursor: {
        Row: {
          client_id: string | null
          connector_installation_id: string
          created_at: string
          event_count: number
          from_cursor: string | null
          id: string
          idempotency_key: string
          polled_at: string
          sequence: number
          to_cursor: string | null
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          connector_installation_id: string
          created_at?: string
          event_count?: number
          from_cursor?: string | null
          id: string
          idempotency_key: string
          polled_at: string
          sequence?: number
          to_cursor?: string | null
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          connector_installation_id?: string
          created_at?: string
          event_count?: number
          from_cursor?: string | null
          id?: string
          idempotency_key?: string
          polled_at?: string
          sequence?: number
          to_cursor?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_polling_cursor_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_polling_cursor_connector_installation_id_fkey"
            columns: ["connector_installation_id"]
            isOneToOne: false
            referencedRelation: "connector_installation"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_secret_reference: {
        Row: {
          client_id: string | null
          connector_id: string
          connector_installation_id: string
          created_at: string
          created_by_user_id: string
          expires_at: string | null
          id: string
          metadata: Json
          purpose: string
          rotated_at: string | null
          secret_ref: string
          secret_version: string
          updated_at: string
          validation_state: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          connector_id: string
          connector_installation_id: string
          created_at?: string
          created_by_user_id: string
          expires_at?: string | null
          id: string
          metadata?: Json
          purpose: string
          rotated_at?: string | null
          secret_ref: string
          secret_version?: string
          updated_at?: string
          validation_state?: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          connector_id?: string
          connector_installation_id?: string
          created_at?: string
          created_by_user_id?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          purpose?: string
          rotated_at?: string | null
          secret_ref?: string
          secret_version?: string
          updated_at?: string
          validation_state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_secret_reference_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_secret_reference_connector_installation_id_fkey"
            columns: ["connector_installation_id"]
            isOneToOne: false
            referencedRelation: "connector_installation"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_webhook_receipt: {
        Row: {
          client_id: string | null
          connector_id: string
          connector_installation_id: string
          created_at: string
          event_count: number
          external_event_id: string
          id: string
          idempotency_key: string
          processed_at: string | null
          received_at: string
          signature_valid: boolean
          status: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          connector_id: string
          connector_installation_id: string
          created_at?: string
          event_count?: number
          external_event_id: string
          id: string
          idempotency_key: string
          processed_at?: string | null
          received_at: string
          signature_valid?: boolean
          status?: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          connector_id?: string
          connector_installation_id?: string
          created_at?: string
          event_count?: number
          external_event_id?: string
          id?: string
          idempotency_key?: string
          processed_at?: string | null
          received_at?: string
          signature_valid?: boolean
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_webhook_receipt_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_webhook_receipt_connector_installation_id_fkey"
            columns: ["connector_installation_id"]
            isOneToOne: false
            referencedRelation: "connector_installation"
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
      copilot_action: {
        Row: {
          capability_key: string | null
          client_id: string | null
          conversation_id: string
          created_at: string
          enabled: boolean
          href: string
          id: string
          kind: string
          label: string
          message_id: string | null
          required_permission: string | null
          requires_approval: boolean
          workspace_id: string
        }
        Insert: {
          capability_key?: string | null
          client_id?: string | null
          conversation_id: string
          created_at?: string
          enabled?: boolean
          href?: string
          id: string
          kind: string
          label: string
          message_id?: string | null
          required_permission?: string | null
          requires_approval?: boolean
          workspace_id: string
        }
        Update: {
          capability_key?: string | null
          client_id?: string | null
          conversation_id?: string
          created_at?: string
          enabled?: boolean
          href?: string
          id?: string
          kind?: string
          label?: string
          message_id?: string | null
          required_permission?: string | null
          requires_approval?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_action_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_action_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "copilot_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_action_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "copilot_message"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_citation: {
        Row: {
          client_id: string | null
          conversation_id: string
          created_at: string
          href: string
          id: string
          kind: string
          message_id: string
          ref_id: string
          title: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          conversation_id: string
          created_at?: string
          href?: string
          id: string
          kind: string
          message_id: string
          ref_id: string
          title?: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          conversation_id?: string
          created_at?: string
          href?: string
          id?: string
          kind?: string
          message_id?: string
          ref_id?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_citation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_citation_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "copilot_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_citation_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "copilot_message"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_conversation: {
        Row: {
          client_id: string | null
          correlation_id: string
          cost: number
          created_at: string
          id: string
          last_intent: string | null
          last_references: Json
          message_count: number
          panel: string
          pinned: boolean
          requested_by_user_id: string
          status: string
          title: string
          token_total: number
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          correlation_id: string
          cost?: number
          created_at?: string
          id: string
          last_intent?: string | null
          last_references?: Json
          message_count?: number
          panel?: string
          pinned?: boolean
          requested_by_user_id: string
          status?: string
          title: string
          token_total?: number
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          correlation_id?: string
          cost?: number
          created_at?: string
          id?: string
          last_intent?: string | null
          last_references?: Json
          message_count?: number
          panel?: string
          pinned?: boolean
          requested_by_user_id?: string
          status?: string
          title?: string
          token_total?: number
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_conversation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_message: {
        Row: {
          capability_key: string | null
          client_id: string | null
          content: string
          conversation_id: string
          cost: number
          created_at: string
          id: string
          intent: string | null
          ok: boolean
          order_index: number
          role: string
          state: string
          token_total: number
          workspace_id: string
        }
        Insert: {
          capability_key?: string | null
          client_id?: string | null
          content?: string
          conversation_id: string
          cost?: number
          created_at?: string
          id: string
          intent?: string | null
          ok?: boolean
          order_index?: number
          role: string
          state?: string
          token_total?: number
          workspace_id: string
        }
        Update: {
          capability_key?: string | null
          client_id?: string | null
          content?: string
          conversation_id?: string
          cost?: number
          created_at?: string
          id?: string
          intent?: string | null
          ok?: boolean
          order_index?: number
          role?: string
          state?: string
          token_total?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_message_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_message_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "copilot_conversation"
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
      dependency_plan: {
        Row: {
          client_id: string | null
          created_at: string
          from_task_id: string
          id: string
          kind: string
          planning_session_id: string
          to_task_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          from_task_id: string
          id: string
          kind: string
          planning_session_id: string
          to_task_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          from_task_id?: string
          id?: string
          kind?: string
          planning_session_id?: string
          to_task_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependency_plan_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dependency_plan_planning_session_id_fkey"
            columns: ["planning_session_id"]
            isOneToOne: false
            referencedRelation: "planning_session"
            referencedColumns: ["id"]
          },
        ]
      }
      deployment_package: {
        Row: {
          checksum: string
          client_id: string | null
          created_at: string
          execution_intent_id: string
          format: string
          id: string
          payload: Json
          status: string
          target: string
          workflow_definition_id: string
          workspace_id: string
        }
        Insert: {
          checksum?: string
          client_id?: string | null
          created_at?: string
          execution_intent_id: string
          format?: string
          id: string
          payload?: Json
          status?: string
          target: string
          workflow_definition_id: string
          workspace_id: string
        }
        Update: {
          checksum?: string
          client_id?: string | null
          created_at?: string
          execution_intent_id?: string
          format?: string
          id?: string
          payload?: Json
          status?: string
          target?: string
          workflow_definition_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deployment_package_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployment_package_execution_intent_id_fkey"
            columns: ["execution_intent_id"]
            isOneToOne: false
            referencedRelation: "execution_intent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployment_package_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definition"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunk: {
        Row: {
          checksum: string
          client_id: string | null
          collection_id: string
          content: string
          created_at: string
          document_id: string
          document_version: number
          heading: string | null
          id: string
          index: number
          page: number | null
          strategy: string
          token_count: number
          workspace_id: string
        }
        Insert: {
          checksum: string
          client_id?: string | null
          collection_id: string
          content: string
          created_at?: string
          document_id: string
          document_version: number
          heading?: string | null
          id: string
          index: number
          page?: number | null
          strategy: string
          token_count?: number
          workspace_id: string
        }
        Update: {
          checksum?: string
          client_id?: string | null
          collection_id?: string
          content?: string
          created_at?: string
          document_id?: string
          document_version?: number
          heading?: string | null
          id?: string
          index?: number
          page?: number | null
          strategy?: string
          token_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunk_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunk_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "knowledge_collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunk_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_document"
            referencedColumns: ["id"]
          },
        ]
      }
      document_version: {
        Row: {
          checksum: string
          client_id: string | null
          created_at: string
          created_by_user_id: string
          document_id: string
          id: string
          mime_type: string
          parse_metadata: Json
          parse_status: string
          size_bytes: number
          storage_ref: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          checksum: string
          client_id?: string | null
          created_at?: string
          created_by_user_id: string
          document_id: string
          id: string
          mime_type: string
          parse_metadata?: Json
          parse_status?: string
          size_bytes?: number
          storage_ref?: string | null
          version: number
          workspace_id: string
        }
        Update: {
          checksum?: string
          client_id?: string | null
          created_at?: string
          created_by_user_id?: string
          document_id?: string
          id?: string
          mime_type?: string
          parse_metadata?: Json
          parse_status?: string
          size_bytes?: number
          storage_ref?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_version_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_version_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_document"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding_job: {
        Row: {
          chunk_count: number
          client_id: string | null
          collection_id: string
          cost: number
          created_at: string
          currency: string
          document_id: string
          document_version: number
          duration_ms: number
          error: string | null
          id: string
          model: string
          provider: string
          retry_count: number
          status: string
          strategy: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          chunk_count?: number
          client_id?: string | null
          collection_id: string
          cost?: number
          created_at?: string
          currency?: string
          document_id: string
          document_version: number
          duration_ms?: number
          error?: string | null
          id: string
          model: string
          provider: string
          retry_count?: number
          status?: string
          strategy?: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          chunk_count?: number
          client_id?: string | null
          collection_id?: string
          cost?: number
          created_at?: string
          currency?: string
          document_id?: string
          document_version?: number
          duration_ms?: number
          error?: string | null
          id?: string
          model?: string
          provider?: string
          retry_count?: number
          status?: string
          strategy?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "embedding_job_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_job_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "knowledge_collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_job_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_document"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding_vector: {
        Row: {
          chunk_id: string
          client_id: string | null
          collection_id: string
          created_at: string
          dimensions: number
          document_id: string
          embedding: Json
          id: string
          model: string
          provider: string
          workspace_id: string
        }
        Insert: {
          chunk_id: string
          client_id?: string | null
          collection_id: string
          created_at?: string
          dimensions: number
          document_id: string
          embedding: Json
          id: string
          model: string
          provider: string
          workspace_id: string
        }
        Update: {
          chunk_id?: string
          client_id?: string | null
          collection_id?: string
          created_at?: string
          dimensions?: number
          document_id?: string
          embedding?: Json
          id?: string
          model?: string
          provider?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "embedding_vector_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_vector_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_vector_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "knowledge_collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_vector_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_document"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_intent: {
        Row: {
          branch_count: number
          client_id: string | null
          cost: number
          created_at: string
          currency: string
          estimated_runtime_ms: number
          execution_plan_id: string | null
          generation_duration_ms: number
          id: string
          model: string | null
          objective: string
          planning_session_id: string
          prompt_id: string | null
          provider: string | null
          requested_by_user_id: string
          simulation_duration_ms: number
          status: string
          step_count: number
          title: string
          token_total: number
          updated_at: string
          validation_duration_ms: number
          variable_count: number
          version: number
          workspace_id: string
        }
        Insert: {
          branch_count?: number
          client_id?: string | null
          cost?: number
          created_at?: string
          currency?: string
          estimated_runtime_ms?: number
          execution_plan_id?: string | null
          generation_duration_ms?: number
          id: string
          model?: string | null
          objective?: string
          planning_session_id: string
          prompt_id?: string | null
          provider?: string | null
          requested_by_user_id: string
          simulation_duration_ms?: number
          status?: string
          step_count?: number
          title: string
          token_total?: number
          updated_at?: string
          validation_duration_ms?: number
          variable_count?: number
          version?: number
          workspace_id: string
        }
        Update: {
          branch_count?: number
          client_id?: string | null
          cost?: number
          created_at?: string
          currency?: string
          estimated_runtime_ms?: number
          execution_plan_id?: string | null
          generation_duration_ms?: number
          id?: string
          model?: string | null
          objective?: string
          planning_session_id?: string
          prompt_id?: string | null
          provider?: string | null
          requested_by_user_id?: string
          simulation_duration_ms?: number
          status?: string
          step_count?: number
          title?: string
          token_total?: number
          updated_at?: string
          validation_duration_ms?: number
          variable_count?: number
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_intent_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_plan: {
        Row: {
          client_id: string | null
          confidence: number
          created_at: string
          critical_path_duration_days: number
          id: string
          initiative_count: number
          kpi_count: number
          milestone_count: number
          planning_session_id: string
          risk_count: number
          status: string
          summary: string
          task_count: number
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          confidence?: number
          created_at?: string
          critical_path_duration_days?: number
          id: string
          initiative_count?: number
          kpi_count?: number
          milestone_count?: number
          planning_session_id: string
          risk_count?: number
          status?: string
          summary?: string
          task_count?: number
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          confidence?: number
          created_at?: string
          critical_path_duration_days?: number
          id?: string
          initiative_count?: number
          kpi_count?: number
          milestone_count?: number
          planning_session_id?: string
          risk_count?: number
          status?: string
          summary?: string
          task_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_plan_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_plan_planning_session_id_fkey"
            columns: ["planning_session_id"]
            isOneToOne: false
            referencedRelation: "planning_session"
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
      execution_risk: {
        Row: {
          category: string
          client_id: string | null
          contingency: string
          created_at: string
          description: string
          id: string
          likelihood: string
          mitigation: string
          planning_session_id: string
          severity: string
          title: string
          workspace_id: string
        }
        Insert: {
          category: string
          client_id?: string | null
          contingency?: string
          created_at?: string
          description?: string
          id: string
          likelihood: string
          mitigation?: string
          planning_session_id: string
          severity: string
          title: string
          workspace_id: string
        }
        Update: {
          category?: string
          client_id?: string | null
          contingency?: string
          created_at?: string
          description?: string
          id?: string
          likelihood?: string
          mitigation?: string
          planning_session_id?: string
          severity?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_risk_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_risk_planning_session_id_fkey"
            columns: ["planning_session_id"]
            isOneToOne: false
            referencedRelation: "planning_session"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_report: {
        Row: {
          ai_duration_ms: number
          analysis_duration_ms: number
          client_id: string | null
          collection_duration_ms: number
          confidence: number
          cost: number
          created_at: string
          currency: string
          forecast_count: number
          generation_duration_ms: number
          id: string
          insight_count: number
          kind: string
          metric_count: number
          model: string | null
          period: string
          prompt_id: string | null
          provider: string | null
          report_size: number
          requested_by_user_id: string
          status: string
          title: string
          token_total: number
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          ai_duration_ms?: number
          analysis_duration_ms?: number
          client_id?: string | null
          collection_duration_ms?: number
          confidence?: number
          cost?: number
          created_at?: string
          currency?: string
          forecast_count?: number
          generation_duration_ms?: number
          id: string
          insight_count?: number
          kind: string
          metric_count?: number
          model?: string | null
          period?: string
          prompt_id?: string | null
          provider?: string | null
          report_size?: number
          requested_by_user_id: string
          status?: string
          title: string
          token_total?: number
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          ai_duration_ms?: number
          analysis_duration_ms?: number
          client_id?: string | null
          collection_duration_ms?: number
          confidence?: number
          cost?: number
          created_at?: string
          currency?: string
          forecast_count?: number
          generation_duration_ms?: number
          id?: string
          insight_count?: number
          kind?: string
          metric_count?: number
          model?: string | null
          period?: string
          prompt_id?: string | null
          provider?: string | null
          report_size?: number
          requested_by_user_id?: string
          status?: string
          title?: string
          token_total?: number
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "executive_report_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_summary: {
        Row: {
          client_id: string | null
          created_at: string
          headline: string
          highlights: Json
          id: string
          key_metrics: Json
          overall_confidence: number
          report_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          headline?: string
          highlights?: Json
          id: string
          key_metrics?: Json
          overall_confidence?: number
          report_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          headline?: string
          highlights?: Json
          id?: string
          key_metrics?: Json
          overall_confidence?: number
          report_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "executive_summary_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "executive_summary_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "executive_report"
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
      forecast: {
        Row: {
          basis: string
          client_id: string | null
          confidence: number
          created_at: string
          horizon_days: number
          id: string
          kind: string
          metric_key: string
          projected_value: number
          report_id: string
          workspace_id: string
        }
        Insert: {
          basis?: string
          client_id?: string | null
          confidence: number
          created_at?: string
          horizon_days?: number
          id: string
          kind: string
          metric_key: string
          projected_value?: number
          report_id: string
          workspace_id: string
        }
        Update: {
          basis?: string
          client_id?: string | null
          confidence?: number
          created_at?: string
          horizon_days?: number
          id?: string
          kind?: string
          metric_key?: string
          projected_value?: number
          report_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "executive_report"
            referencedColumns: ["id"]
          },
        ]
      }
      initiative_plan: {
        Row: {
          business_objective: string
          client_id: string | null
          created_at: string
          expected_outcome: string
          id: string
          linked_initiative_id: string | null
          linked_recommendation_ids: Json
          order_index: number
          owner: string | null
          planning_session_id: string
          priority: string
          roadmap_phase: number | null
          timeline_end: string | null
          timeline_start: string | null
          title: string
          workspace_id: string
        }
        Insert: {
          business_objective?: string
          client_id?: string | null
          created_at?: string
          expected_outcome?: string
          id: string
          linked_initiative_id?: string | null
          linked_recommendation_ids?: Json
          order_index?: number
          owner?: string | null
          planning_session_id: string
          priority?: string
          roadmap_phase?: number | null
          timeline_end?: string | null
          timeline_start?: string | null
          title: string
          workspace_id: string
        }
        Update: {
          business_objective?: string
          client_id?: string | null
          created_at?: string
          expected_outcome?: string
          id?: string
          linked_initiative_id?: string | null
          linked_recommendation_ids?: Json
          order_index?: number
          owner?: string | null
          planning_session_id?: string
          priority?: string
          roadmap_phase?: number | null
          timeline_end?: string | null
          timeline_start?: string | null
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "initiative_plan_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "initiative_plan_planning_session_id_fkey"
            columns: ["planning_session_id"]
            isOneToOne: false
            referencedRelation: "planning_session"
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
      integration_binding: {
        Row: {
          bound: boolean
          capability: string
          client_id: string | null
          config: Json
          created_at: string
          execution_intent_id: string
          id: string
          name: string
          provider: string
          workflow_definition_id: string
          workspace_id: string
        }
        Insert: {
          bound?: boolean
          capability?: string
          client_id?: string | null
          config?: Json
          created_at?: string
          execution_intent_id: string
          id: string
          name: string
          provider: string
          workflow_definition_id: string
          workspace_id: string
        }
        Update: {
          bound?: boolean
          capability?: string
          client_id?: string | null
          config?: Json
          created_at?: string
          execution_intent_id?: string
          id?: string
          name?: string
          provider?: string
          workflow_definition_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_binding_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_binding_execution_intent_id_fkey"
            columns: ["execution_intent_id"]
            isOneToOne: false
            referencedRelation: "execution_intent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_binding_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definition"
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
      knowledge_collection: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          document_count: number
          id: string
          kind: string
          name: string
          owner_user_id: string
          status: string
          updated_at: string
          version: number
          visibility: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          document_count?: number
          id: string
          kind: string
          name: string
          owner_user_id: string
          status?: string
          updated_at?: string
          version?: number
          visibility?: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          document_count?: number
          id?: string
          kind?: string
          name?: string
          owner_user_id?: string
          status?: string
          updated_at?: string
          version?: number
          visibility?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_collection_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_document: {
        Row: {
          checksum: string
          client_id: string | null
          collection_id: string
          created_at: string
          current_version: number
          id: string
          language: string | null
          metadata: Json
          mime_type: string
          owner_user_id: string
          size_bytes: number
          source_type: string
          status: string
          title: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          checksum: string
          client_id?: string | null
          collection_id: string
          created_at?: string
          current_version?: number
          id: string
          language?: string | null
          metadata?: Json
          mime_type: string
          owner_user_id: string
          size_bytes?: number
          source_type: string
          status?: string
          title: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          checksum?: string
          client_id?: string | null
          collection_id?: string
          created_at?: string
          current_version?: number
          id?: string
          language?: string | null
          metadata?: Json
          mime_type?: string
          owner_user_id?: string
          size_bytes?: number
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_document_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_document_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "knowledge_collection"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_permission: {
        Row: {
          client_id: string | null
          collection_id: string
          created_at: string
          id: string
          level: string
          subject_id: string
          subject_type: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          collection_id: string
          created_at?: string
          id: string
          level: string
          subject_id: string
          subject_type: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          collection_id?: string
          created_at?: string
          id?: string
          level?: string
          subject_id?: string
          subject_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_permission_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_permission_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "knowledge_collection"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_source: {
        Row: {
          client_id: string | null
          collection_id: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          label: string
          source_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          collection_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id: string
          label: string
          source_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          collection_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          source_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_source_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_source_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "knowledge_collection"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_plan: {
        Row: {
          baseline: number
          client_id: string | null
          created_at: string
          formula: string
          id: string
          measurement_frequency: string
          name: string
          planning_session_id: string
          target: number
          unit: string
          workspace_id: string
        }
        Insert: {
          baseline?: number
          client_id?: string | null
          created_at?: string
          formula: string
          id: string
          measurement_frequency?: string
          name: string
          planning_session_id: string
          target: number
          unit?: string
          workspace_id: string
        }
        Update: {
          baseline?: number
          client_id?: string | null
          created_at?: string
          formula?: string
          id?: string
          measurement_frequency?: string
          name?: string
          planning_session_id?: string
          target?: number
          unit?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_plan_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_plan_planning_session_id_fkey"
            columns: ["planning_session_id"]
            isOneToOne: false
            referencedRelation: "planning_session"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_result: {
        Row: {
          baseline: number
          client_id: string | null
          created_at: string
          current: number
          id: string
          measurement_frequency: string
          name: string
          owner: string | null
          report_id: string
          status: string
          target: number
          trend: string
          variance: number
          workspace_id: string
        }
        Insert: {
          baseline?: number
          client_id?: string | null
          created_at?: string
          current?: number
          id: string
          measurement_frequency?: string
          name: string
          owner?: string | null
          report_id: string
          status: string
          target?: number
          trend: string
          variance?: number
          workspace_id: string
        }
        Update: {
          baseline?: number
          client_id?: string | null
          created_at?: string
          current?: number
          id?: string
          measurement_frequency?: string
          name?: string
          owner?: string | null
          report_id?: string
          status?: string
          target?: number
          trend?: string
          variance?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_result_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_result_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "executive_report"
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
      milestone_plan: {
        Row: {
          client_id: string | null
          created_at: string
          deliverables: Json
          entry_criteria: string
          exit_criteria: string
          id: string
          initiative_plan_id: string
          order_index: number
          planned_date: string | null
          planning_session_id: string
          title: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          deliverables?: Json
          entry_criteria?: string
          exit_criteria?: string
          id: string
          initiative_plan_id: string
          order_index?: number
          planned_date?: string | null
          planning_session_id: string
          title: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          deliverables?: Json
          entry_criteria?: string
          exit_criteria?: string
          id?: string
          initiative_plan_id?: string
          order_index?: number
          planned_date?: string | null
          planning_session_id?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestone_plan_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_plan_initiative_plan_id_fkey"
            columns: ["initiative_plan_id"]
            isOneToOne: false
            referencedRelation: "initiative_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_plan_planning_session_id_fkey"
            columns: ["planning_session_id"]
            isOneToOne: false
            referencedRelation: "planning_session"
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
      observation_snapshot: {
        Row: {
          client_id: string | null
          created_at: string
          data: Json
          id: string
          label: string
          observed_at: string
          provenance: Json
          report_id: string
          source: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          data?: Json
          id: string
          label?: string
          observed_at: string
          provenance?: Json
          report_id: string
          source: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          label?: string
          observed_at?: string
          provenance?: Json
          report_id?: string
          source?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observation_snapshot_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_snapshot_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "executive_report"
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
      planning_feedback: {
        Row: {
          client_id: string | null
          comment: string | null
          created_at: string
          id: string
          kind: string
          planning_session_id: string
          rating: number | null
          subject_user_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          comment?: string | null
          created_at?: string
          id: string
          kind: string
          planning_session_id: string
          rating?: number | null
          subject_user_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          kind?: string
          planning_session_id?: string
          rating?: number | null
          subject_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_feedback_planning_session_id_fkey"
            columns: ["planning_session_id"]
            isOneToOne: false
            referencedRelation: "planning_session"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_session: {
        Row: {
          ai_duration_ms: number
          client_id: string | null
          confidence: number
          cost: number
          created_at: string
          currency: string
          id: string
          model: string | null
          plan_size: number
          planning_duration_ms: number
          prompt_id: string | null
          provider: string | null
          requested_by_user_id: string
          retrieval_duration_ms: number
          status: string
          strategy_session_id: string
          title: string
          token_total: number
          updated_at: string
          validation_duration_ms: number
          version: number
          workspace_id: string
        }
        Insert: {
          ai_duration_ms?: number
          client_id?: string | null
          confidence?: number
          cost?: number
          created_at?: string
          currency?: string
          id: string
          model?: string | null
          plan_size?: number
          planning_duration_ms?: number
          prompt_id?: string | null
          provider?: string | null
          requested_by_user_id: string
          retrieval_duration_ms?: number
          status?: string
          strategy_session_id: string
          title: string
          token_total?: number
          updated_at?: string
          validation_duration_ms?: number
          version?: number
          workspace_id: string
        }
        Update: {
          ai_duration_ms?: number
          client_id?: string | null
          confidence?: number
          cost?: number
          created_at?: string
          currency?: string
          id?: string
          model?: string | null
          plan_size?: number
          planning_duration_ms?: number
          prompt_id?: string | null
          provider?: string | null
          requested_by_user_id?: string
          retrieval_duration_ms?: number
          status?: string
          strategy_session_id?: string
          title?: string
          token_total?: number
          updated_at?: string
          validation_duration_ms?: number
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_session_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      priority_score: {
        Row: {
          automation_potential: number
          business_impact: number
          client_id: string | null
          created_at: string
          customer_value: number
          id: string
          implementation_effort: number
          recommendation_id: string
          risk_reduction: number
          session_id: string
          strategic_alignment: number
          total: number
          urgency: number
          workspace_id: string
        }
        Insert: {
          automation_potential: number
          business_impact: number
          client_id?: string | null
          created_at?: string
          customer_value: number
          id: string
          implementation_effort: number
          recommendation_id: string
          risk_reduction: number
          session_id: string
          strategic_alignment: number
          total: number
          urgency: number
          workspace_id: string
        }
        Update: {
          automation_potential?: number
          business_impact?: number
          client_id?: string | null
          created_at?: string
          customer_value?: number
          id?: string
          implementation_effort?: number
          recommendation_id?: string
          risk_reduction?: number
          session_id?: string
          strategic_alignment?: number
          total?: number
          urgency?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "priority_score_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "priority_score_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "priority_score_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "strategy_session"
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
      recommendation: {
        Row: {
          client_id: string | null
          confidence: number
          created_at: string
          dependencies: Json
          description: string
          effort: string
          estimated_timeline: string | null
          expected_impact: string
          id: string
          order_index: number
          priority: number
          reasoning: string
          recommended_owner: string | null
          session_id: string
          title: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          confidence?: number
          created_at?: string
          dependencies?: Json
          description?: string
          effort?: string
          estimated_timeline?: string | null
          expected_impact?: string
          id: string
          order_index?: number
          priority?: number
          reasoning?: string
          recommended_owner?: string | null
          session_id: string
          title: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          confidence?: number
          created_at?: string
          dependencies?: Json
          description?: string
          effort?: string
          estimated_timeline?: string | null
          expected_impact?: string
          id?: string
          order_index?: number
          priority?: number
          reasoning?: string
          recommended_owner?: string | null
          session_id?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "strategy_session"
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
      report_feedback: {
        Row: {
          client_id: string | null
          comment: string | null
          created_at: string
          id: string
          kind: string
          rating: number | null
          report_id: string
          subject_user_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          comment?: string | null
          created_at?: string
          id: string
          kind: string
          rating?: number | null
          report_id: string
          subject_user_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          kind?: string
          rating?: number | null
          report_id?: string
          subject_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_feedback_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "executive_report"
            referencedColumns: ["id"]
          },
        ]
      }
      report_narrative: {
        Row: {
          client_id: string | null
          content: string
          cost: number
          created_at: string
          generated_by_ai: boolean
          id: string
          model: string | null
          provider: string | null
          report_id: string
          token_total: number
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          content?: string
          cost?: number
          created_at?: string
          generated_by_ai?: boolean
          id: string
          model?: string | null
          provider?: string | null
          report_id: string
          token_total?: number
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          content?: string
          cost?: number
          created_at?: string
          generated_by_ai?: boolean
          id?: string
          model?: string | null
          provider?: string | null
          report_id?: string
          token_total?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_narrative_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_narrative_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "executive_report"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedule: {
        Row: {
          client_id: string | null
          created_at: string
          created_by_user_id: string
          enabled: boolean
          frequency: string
          id: string
          kind: string
          next_run_at: string | null
          recipients_note: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by_user_id: string
          enabled?: boolean
          frequency: string
          id: string
          kind: string
          next_run_at?: string | null
          recipients_note?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by_user_id?: string
          enabled?: boolean
          frequency?: string
          id?: string
          kind?: string
          next_run_at?: string | null
          recipients_note?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_schedule_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      report_section: {
        Row: {
          body: string
          client_id: string | null
          created_at: string
          id: string
          key: string
          order_index: number
          report_id: string
          title: string
          workspace_id: string
        }
        Insert: {
          body?: string
          client_id?: string | null
          created_at?: string
          id: string
          key: string
          order_index?: number
          report_id: string
          title: string
          workspace_id: string
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string
          id?: string
          key?: string
          order_index?: number
          report_id?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_section_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_section_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "executive_report"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_estimate: {
        Row: {
          client_id: string | null
          complexity: string
          confidence: number
          cost_category: string
          created_at: string
          duration_days: number
          id: string
          initiative_plan_id: string
          people: number
          planning_session_id: string
          skills: Json
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          complexity?: string
          confidence?: number
          cost_category?: string
          created_at?: string
          duration_days?: number
          id: string
          initiative_plan_id: string
          people?: number
          planning_session_id: string
          skills?: Json
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          complexity?: string
          confidence?: number
          cost_category?: string
          created_at?: string
          duration_days?: number
          id?: string
          initiative_plan_id?: string
          people?: number
          planning_session_id?: string
          skills?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_estimate_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_estimate_initiative_plan_id_fkey"
            columns: ["initiative_plan_id"]
            isOneToOne: false
            referencedRelation: "initiative_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_estimate_planning_session_id_fkey"
            columns: ["planning_session_id"]
            isOneToOne: false
            referencedRelation: "planning_session"
            referencedColumns: ["id"]
          },
        ]
      }
      retrieval_session: {
        Row: {
          cache_hit: boolean
          client_id: string | null
          collection_ids: Json
          created_at: string
          id: string
          latency_ms: number
          max_tokens: number
          model: string
          provider: string
          query: string
          requested_by_user_id: string
          result_count: number
          threshold: number
          top_k: number
          workspace_id: string
        }
        Insert: {
          cache_hit?: boolean
          client_id?: string | null
          collection_ids?: Json
          created_at?: string
          id: string
          latency_ms?: number
          max_tokens?: number
          model: string
          provider: string
          query: string
          requested_by_user_id: string
          result_count?: number
          threshold?: number
          top_k?: number
          workspace_id: string
        }
        Update: {
          cache_hit?: boolean
          client_id?: string | null
          collection_ids?: Json
          created_at?: string
          id?: string
          latency_ms?: number
          max_tokens?: number
          model?: string
          provider?: string
          query?: string
          requested_by_user_id?: string
          result_count?: number
          threshold?: number
          top_k?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retrieval_session_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      retrieved_context: {
        Row: {
          chunk_id: string
          client_id: string | null
          collection_id: string
          content: string
          created_at: string
          document_id: string
          id: string
          rank: number
          score: number
          session_id: string
          token_count: number
          workspace_id: string
        }
        Insert: {
          chunk_id: string
          client_id?: string | null
          collection_id: string
          content: string
          created_at?: string
          document_id: string
          id: string
          rank: number
          score: number
          session_id: string
          token_count?: number
          workspace_id: string
        }
        Update: {
          chunk_id?: string
          client_id?: string | null
          collection_id?: string
          content?: string
          created_at?: string
          document_id?: string
          id?: string
          rank?: number
          score?: number
          session_id?: string
          token_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retrieved_context_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retrieved_context_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "retrieval_session"
            referencedColumns: ["id"]
          },
        ]
      }
      review_plan: {
        Row: {
          approval_gates: Json
          cadence: string
          client_id: string | null
          created_at: string
          id: string
          planning_session_id: string
          quality_gates: Json
          success_metrics: Json
          workspace_id: string
        }
        Insert: {
          approval_gates?: Json
          cadence?: string
          client_id?: string | null
          created_at?: string
          id: string
          planning_session_id: string
          quality_gates?: Json
          success_metrics?: Json
          workspace_id: string
        }
        Update: {
          approval_gates?: Json
          cadence?: string
          client_id?: string | null
          created_at?: string
          id?: string
          planning_session_id?: string
          quality_gates?: Json
          success_metrics?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_plan_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_plan_planning_session_id_fkey"
            columns: ["planning_session_id"]
            isOneToOne: false
            referencedRelation: "planning_session"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_assessment: {
        Row: {
          client_id: string | null
          confidence: number
          created_at: string
          description: string
          id: string
          likelihood: string
          mitigation: string
          session_id: string
          severity: string
          title: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          confidence?: number
          created_at?: string
          description?: string
          id: string
          likelihood: string
          mitigation?: string
          session_id: string
          severity: string
          title: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          confidence?: number
          created_at?: string
          description?: string
          id?: string
          likelihood?: string
          mitigation?: string
          session_id?: string
          severity?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessment_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_assessment_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "strategy_session"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_capability_snapshot: {
        Row: {
          capabilities: Json
          client_id: string | null
          created_at: string
          discovered_at: string
          id: string
          provider: string
          provider_version: string | null
          runtime_registration_id: string
          workspace_id: string
        }
        Insert: {
          capabilities?: Json
          client_id?: string | null
          created_at?: string
          discovered_at: string
          id: string
          provider: string
          provider_version?: string | null
          runtime_registration_id: string
          workspace_id: string
        }
        Update: {
          capabilities?: Json
          client_id?: string | null
          created_at?: string
          discovered_at?: string
          id?: string
          provider?: string
          provider_version?: string | null
          runtime_registration_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_capability_snapshot_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_capability_snapshot_runtime_registration_id_fkey"
            columns: ["runtime_registration_id"]
            isOneToOne: false
            referencedRelation: "runtime_registration"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_credential_reference: {
        Row: {
          client_id: string | null
          created_at: string
          created_by_user_id: string
          expires_at: string | null
          id: string
          metadata: Json
          provider: string
          rotated_at: string | null
          runtime_registration_id: string | null
          secret_ref: string
          secret_version: string
          updated_at: string
          validation_state: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by_user_id: string
          expires_at?: string | null
          id: string
          metadata?: Json
          provider: string
          rotated_at?: string | null
          runtime_registration_id?: string | null
          secret_ref: string
          secret_version?: string
          updated_at?: string
          validation_state?: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by_user_id?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          provider?: string
          rotated_at?: string | null
          runtime_registration_id?: string | null
          secret_ref?: string
          secret_version?: string
          updated_at?: string
          validation_state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_credential_reference_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_deployment: {
        Row: {
          activation_state: string
          approval_expires_at: string | null
          approval_reference_id: string | null
          approved_by_user_id: string | null
          client_id: string | null
          correlation_id: string
          created_at: string
          deployed_at: string | null
          deployed_by_user_id: string | null
          deployment_package_id: string
          deployment_version: number
          external_workflow_id: string | null
          external_workflow_version: string | null
          id: string
          package_hash: string
          previous_deployment_id: string | null
          provider: string
          requested_by_user_id: string
          rollback_source_deployment_id: string | null
          runtime_registration_id: string
          status: string
          target_environment: string
          trace_id: string
          translated_workflow_hash: string
          updated_at: string
          version: number
          workflow_definition_id: string
          workspace_id: string
        }
        Insert: {
          activation_state?: string
          approval_expires_at?: string | null
          approval_reference_id?: string | null
          approved_by_user_id?: string | null
          client_id?: string | null
          correlation_id: string
          created_at?: string
          deployed_at?: string | null
          deployed_by_user_id?: string | null
          deployment_package_id: string
          deployment_version?: number
          external_workflow_id?: string | null
          external_workflow_version?: string | null
          id: string
          package_hash: string
          previous_deployment_id?: string | null
          provider: string
          requested_by_user_id: string
          rollback_source_deployment_id?: string | null
          runtime_registration_id: string
          status?: string
          target_environment: string
          trace_id: string
          translated_workflow_hash?: string
          updated_at?: string
          version?: number
          workflow_definition_id: string
          workspace_id: string
        }
        Update: {
          activation_state?: string
          approval_expires_at?: string | null
          approval_reference_id?: string | null
          approved_by_user_id?: string | null
          client_id?: string | null
          correlation_id?: string
          created_at?: string
          deployed_at?: string | null
          deployed_by_user_id?: string | null
          deployment_package_id?: string
          deployment_version?: number
          external_workflow_id?: string | null
          external_workflow_version?: string | null
          id?: string
          package_hash?: string
          previous_deployment_id?: string | null
          provider?: string
          requested_by_user_id?: string
          rollback_source_deployment_id?: string | null
          runtime_registration_id?: string
          status?: string
          target_environment?: string
          trace_id?: string
          translated_workflow_hash?: string
          updated_at?: string
          version?: number
          workflow_definition_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_deployment_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_deployment_runtime_registration_id_fkey"
            columns: ["runtime_registration_id"]
            isOneToOne: false
            referencedRelation: "runtime_registration"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_deployment_attempt: {
        Row: {
          attempt_number: number
          client_id: string | null
          created_at: string
          deployment_id: string
          failure_category: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          operation: string
          provider_code: string | null
          started_at: string
          status: string
          workspace_id: string
        }
        Insert: {
          attempt_number?: number
          client_id?: string | null
          created_at?: string
          deployment_id: string
          failure_category?: string | null
          finished_at?: string | null
          id: string
          idempotency_key: string
          operation: string
          provider_code?: string | null
          started_at: string
          status?: string
          workspace_id: string
        }
        Update: {
          attempt_number?: number
          client_id?: string | null
          created_at?: string
          deployment_id?: string
          failure_category?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          operation?: string
          provider_code?: string | null
          started_at?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_deployment_attempt_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_deployment_attempt_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "runtime_deployment"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_deployment_event: {
        Row: {
          actor_user_id: string | null
          client_id: string | null
          correlation_id: string
          created_at: string
          deployment_id: string
          from_status: string | null
          id: string
          operation: string | null
          reason: string
          to_status: string | null
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          client_id?: string | null
          correlation_id: string
          created_at?: string
          deployment_id: string
          from_status?: string | null
          id: string
          operation?: string | null
          reason?: string
          to_status?: string | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          client_id?: string | null
          correlation_id?: string
          created_at?: string
          deployment_id?: string
          from_status?: string | null
          id?: string
          operation?: string | null
          reason?: string
          to_status?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_deployment_event_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_deployment_event_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "runtime_deployment"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_deployment_log: {
        Row: {
          client_id: string | null
          correlation_id: string
          created_at: string
          deployment_id: string | null
          execution_id: string | null
          id: string
          message: string
          metadata: Json
          operation: string
          provider: string
          runtime_registration_id: string | null
          severity: string
          trace_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          correlation_id: string
          created_at?: string
          deployment_id?: string | null
          execution_id?: string | null
          id: string
          message?: string
          metadata?: Json
          operation: string
          provider: string
          runtime_registration_id?: string | null
          severity?: string
          trace_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          correlation_id?: string
          created_at?: string
          deployment_id?: string | null
          execution_id?: string | null
          id?: string
          message?: string
          metadata?: Json
          operation?: string
          provider?: string
          runtime_registration_id?: string | null
          severity?: string
          trace_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_deployment_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      runtime_execution: {
        Row: {
          client_id: string | null
          correlation_id: string
          created_at: string
          deployment_id: string
          duration_ms: number
          error_summary: string
          external_execution_id: string
          external_workflow_id: string | null
          failure_category: string | null
          id: string
          last_node: string | null
          retry_number: number
          runtime_registration_id: string
          started_at: string | null
          status: string
          stopped_at: string | null
          trace_id: string
          trigger_type: string | null
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          correlation_id: string
          created_at?: string
          deployment_id: string
          duration_ms?: number
          error_summary?: string
          external_execution_id: string
          external_workflow_id?: string | null
          failure_category?: string | null
          id: string
          last_node?: string | null
          retry_number?: number
          runtime_registration_id: string
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          trace_id: string
          trigger_type?: string | null
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          correlation_id?: string
          created_at?: string
          deployment_id?: string
          duration_ms?: number
          error_summary?: string
          external_execution_id?: string
          external_workflow_id?: string | null
          failure_category?: string | null
          id?: string
          last_node?: string | null
          retry_number?: number
          runtime_registration_id?: string
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          trace_id?: string
          trigger_type?: string | null
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_execution_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_execution_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "runtime_deployment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_execution_runtime_registration_id_fkey"
            columns: ["runtime_registration_id"]
            isOneToOne: false
            referencedRelation: "runtime_registration"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_execution_attempt: {
        Row: {
          attempt_number: number
          client_id: string | null
          created_at: string
          deployment_id: string
          failure_category: string | null
          finished_at: string | null
          id: string
          runtime_execution_id: string
          started_at: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          attempt_number?: number
          client_id?: string | null
          created_at?: string
          deployment_id: string
          failure_category?: string | null
          finished_at?: string | null
          id: string
          runtime_execution_id: string
          started_at?: string | null
          status: string
          workspace_id: string
        }
        Update: {
          attempt_number?: number
          client_id?: string | null
          created_at?: string
          deployment_id?: string
          failure_category?: string | null
          finished_at?: string | null
          id?: string
          runtime_execution_id?: string
          started_at?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_execution_attempt_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_execution_attempt_runtime_execution_id_fkey"
            columns: ["runtime_execution_id"]
            isOneToOne: false
            referencedRelation: "runtime_execution"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_execution_failure: {
        Row: {
          category: string
          client_id: string | null
          created_at: string
          deployment_id: string
          id: string
          last_node: string | null
          message: string
          provider_code: string | null
          retryable: boolean
          runtime_execution_id: string
          workspace_id: string
        }
        Insert: {
          category: string
          client_id?: string | null
          created_at?: string
          deployment_id: string
          id: string
          last_node?: string | null
          message?: string
          provider_code?: string | null
          retryable?: boolean
          runtime_execution_id: string
          workspace_id: string
        }
        Update: {
          category?: string
          client_id?: string | null
          created_at?: string
          deployment_id?: string
          id?: string
          last_node?: string | null
          message?: string
          provider_code?: string | null
          retryable?: boolean
          runtime_execution_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_execution_failure_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_execution_failure_runtime_execution_id_fkey"
            columns: ["runtime_execution_id"]
            isOneToOne: false
            referencedRelation: "runtime_execution"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_health_snapshot: {
        Row: {
          checked_at: string
          client_id: string | null
          created_at: string
          detail: Json
          id: string
          latency_ms: number
          level: string
          provider_version: string | null
          runtime_registration_id: string
          workspace_id: string
        }
        Insert: {
          checked_at: string
          client_id?: string | null
          created_at?: string
          detail?: Json
          id: string
          latency_ms?: number
          level: string
          provider_version?: string | null
          runtime_registration_id: string
          workspace_id: string
        }
        Update: {
          checked_at?: string
          client_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          latency_ms?: number
          level?: string
          provider_version?: string | null
          runtime_registration_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_health_snapshot_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_health_snapshot_runtime_registration_id_fkey"
            columns: ["runtime_registration_id"]
            isOneToOne: false
            referencedRelation: "runtime_registration"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_policy: {
        Row: {
          allowed_deployer_roles: Json
          auto_activate: boolean
          client_id: string | null
          created_at: string
          created_by_user_id: string
          environment: string
          exact_hash_approval: boolean
          health_check_required: boolean
          id: string
          max_execution_ms: number
          max_retries: number
          provider: string
          requires_approval: boolean
          rollback_required: boolean
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          allowed_deployer_roles?: Json
          auto_activate?: boolean
          client_id?: string | null
          created_at?: string
          created_by_user_id: string
          environment: string
          exact_hash_approval?: boolean
          health_check_required?: boolean
          id: string
          max_execution_ms?: number
          max_retries?: number
          provider: string
          requires_approval?: boolean
          rollback_required?: boolean
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          allowed_deployer_roles?: Json
          auto_activate?: boolean
          client_id?: string | null
          created_at?: string
          created_by_user_id?: string
          environment?: string
          exact_hash_approval?: boolean
          health_check_required?: boolean
          id?: string
          max_execution_ms?: number
          max_retries?: number
          provider?: string
          requires_approval?: boolean
          rollback_required?: boolean
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_policy_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_reconciliation: {
        Row: {
          client_id: string | null
          created_at: string
          deployment_id: string | null
          detail: string
          drift_class: string
          expected_hash: string
          id: string
          kind: string
          provider_hash: string
          runtime_registration_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          deployment_id?: string | null
          detail?: string
          drift_class?: string
          expected_hash?: string
          id: string
          kind: string
          provider_hash?: string
          runtime_registration_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          deployment_id?: string | null
          detail?: string
          drift_class?: string
          expected_hash?: string
          id?: string
          kind?: string
          provider_hash?: string
          runtime_registration_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_reconciliation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_reconciliation_runtime_registration_id_fkey"
            columns: ["runtime_registration_id"]
            isOneToOne: false
            referencedRelation: "runtime_registration"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_registration: {
        Row: {
          base_url_ref: string
          client_id: string | null
          correlation_id: string
          created_at: string
          created_by_user_id: string
          credential_reference_id: string | null
          display_name: string
          environment: string
          health_state: string
          id: string
          last_health_check_at: string | null
          provider: string
          provider_version: string | null
          status: string
          supported_capabilities: Json
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          base_url_ref: string
          client_id?: string | null
          correlation_id: string
          created_at?: string
          created_by_user_id: string
          credential_reference_id?: string | null
          display_name: string
          environment: string
          health_state?: string
          id: string
          last_health_check_at?: string | null
          provider: string
          provider_version?: string | null
          status?: string
          supported_capabilities?: Json
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          base_url_ref?: string
          client_id?: string | null
          correlation_id?: string
          created_at?: string
          created_by_user_id?: string
          credential_reference_id?: string | null
          display_name?: string
          environment?: string
          health_state?: string
          id?: string
          last_health_check_at?: string | null
          provider?: string
          provider_version?: string | null
          status?: string
          supported_capabilities?: Json
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_registration_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_rollback_request: {
        Row: {
          approval_reference_id: string | null
          client_id: string | null
          correlation_id: string
          created_at: string
          id: string
          reason: string
          requested_by_user_id: string
          result_deployment_id: string | null
          source_deployment_id: string
          status: string
          target_deployment_id: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          approval_reference_id?: string | null
          client_id?: string | null
          correlation_id: string
          created_at?: string
          id: string
          reason: string
          requested_by_user_id: string
          result_deployment_id?: string | null
          source_deployment_id: string
          status?: string
          target_deployment_id: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          approval_reference_id?: string | null
          client_id?: string | null
          correlation_id?: string
          created_at?: string
          id?: string
          reason?: string
          requested_by_user_id?: string
          result_deployment_id?: string | null
          source_deployment_id?: string
          status?: string
          target_deployment_id?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_rollback_request_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_rollback_request_source_deployment_id_fkey"
            columns: ["source_deployment_id"]
            isOneToOne: false
            referencedRelation: "runtime_deployment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_rollback_request_target_deployment_id_fkey"
            columns: ["target_deployment_id"]
            isOneToOne: false
            referencedRelation: "runtime_deployment"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_webhook_receipt: {
        Row: {
          client_id: string | null
          created_at: string
          external_event_id: string
          id: string
          idempotency_key: string
          processed_at: string | null
          provider: string
          received_at: string
          runtime_registration_id: string
          signature_valid: boolean
          status: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          external_event_id: string
          id: string
          idempotency_key: string
          processed_at?: string | null
          provider: string
          received_at: string
          runtime_registration_id: string
          signature_valid?: boolean
          status?: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          external_event_id?: string
          id?: string
          idempotency_key?: string
          processed_at?: string | null
          provider?: string
          received_at?: string
          runtime_registration_id?: string
          signature_valid?: boolean
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_webhook_receipt_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_webhook_receipt_runtime_registration_id_fkey"
            columns: ["runtime_registration_id"]
            isOneToOne: false
            referencedRelation: "runtime_registration"
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
      strategy_analysis: {
        Row: {
          ai_duration_ms: number
          clarifications: Json
          client_id: string | null
          confidence: number
          confidence_reason: string
          created_at: string
          current_state: string
          executive_summary: string
          expected_impact: string
          id: string
          missing_information: Json
          model: string | null
          prompt_version: number | null
          provider: string | null
          retrieval_latency_ms: number
          session_id: string
          tokens_used: number
          workspace_id: string
        }
        Insert: {
          ai_duration_ms?: number
          clarifications?: Json
          client_id?: string | null
          confidence?: number
          confidence_reason?: string
          created_at?: string
          current_state?: string
          executive_summary?: string
          expected_impact?: string
          id: string
          missing_information?: Json
          model?: string | null
          prompt_version?: number | null
          provider?: string | null
          retrieval_latency_ms?: number
          session_id: string
          tokens_used?: number
          workspace_id: string
        }
        Update: {
          ai_duration_ms?: number
          clarifications?: Json
          client_id?: string | null
          confidence?: number
          confidence_reason?: string
          created_at?: string
          current_state?: string
          executive_summary?: string
          expected_impact?: string
          id?: string
          missing_information?: Json
          model?: string | null
          prompt_version?: number | null
          provider?: string | null
          retrieval_latency_ms?: number
          session_id?: string
          tokens_used?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_analysis_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_analysis_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "strategy_session"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_citation: {
        Row: {
          chunk_id: string
          client_id: string | null
          collection_id: string
          created_at: string
          document_id: string
          finding_id: string | null
          heading: string | null
          id: string
          page: number | null
          recommendation_id: string | null
          session_id: string
          similarity: number
          workspace_id: string
        }
        Insert: {
          chunk_id: string
          client_id?: string | null
          collection_id: string
          created_at?: string
          document_id: string
          finding_id?: string | null
          heading?: string | null
          id: string
          page?: number | null
          recommendation_id?: string | null
          session_id: string
          similarity: number
          workspace_id: string
        }
        Update: {
          chunk_id?: string
          client_id?: string | null
          collection_id?: string
          created_at?: string
          document_id?: string
          finding_id?: string | null
          heading?: string | null
          id?: string
          page?: number | null
          recommendation_id?: string | null
          session_id?: string
          similarity?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_citation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_citation_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "strategy_session"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_feedback: {
        Row: {
          client_id: string | null
          comment: string | null
          created_at: string
          id: string
          kind: string
          rating: number | null
          session_id: string
          subject_user_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          comment?: string | null
          created_at?: string
          id: string
          kind: string
          rating?: number | null
          session_id: string
          subject_user_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          kind?: string
          rating?: number | null
          session_id?: string
          subject_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "strategy_session"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_session: {
        Row: {
          analysis_duration_ms: number
          client_id: string | null
          collection_ids: Json
          confidence: number
          cost: number
          created_at: string
          currency: string
          dimensions: Json
          goal: string
          id: string
          model: string | null
          prompt_id: string | null
          prompt_version: number | null
          provider: string | null
          requested_by_user_id: string
          retrieval_count: number
          status: string
          title: string
          token_total: number
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          analysis_duration_ms?: number
          client_id?: string | null
          collection_ids?: Json
          confidence?: number
          cost?: number
          created_at?: string
          currency?: string
          dimensions?: Json
          goal?: string
          id: string
          model?: string | null
          prompt_id?: string | null
          prompt_version?: number | null
          provider?: string | null
          requested_by_user_id: string
          retrieval_count?: number
          status?: string
          title: string
          token_total?: number
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          analysis_duration_ms?: number
          client_id?: string | null
          collection_ids?: Json
          confidence?: number
          cost?: number
          created_at?: string
          currency?: string
          dimensions?: Json
          goal?: string
          id?: string
          model?: string | null
          prompt_id?: string | null
          prompt_version?: number | null
          provider?: string | null
          requested_by_user_id?: string
          retrieval_count?: number
          status?: string
          title?: string
          token_total?: number
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_session_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      task_plan: {
        Row: {
          acceptance_criteria: Json
          client_id: string | null
          created_at: string
          dependency_task_ids: Json
          description: string
          effort: string
          estimated_duration_days: number
          id: string
          initiative_plan_id: string
          order_index: number
          owner: string | null
          planning_session_id: string
          priority: string
          related_recommendation_id: string | null
          required_knowledge: Json
          title: string
          workspace_id: string
        }
        Insert: {
          acceptance_criteria?: Json
          client_id?: string | null
          created_at?: string
          dependency_task_ids?: Json
          description?: string
          effort?: string
          estimated_duration_days?: number
          id: string
          initiative_plan_id: string
          order_index?: number
          owner?: string | null
          planning_session_id: string
          priority?: string
          related_recommendation_id?: string | null
          required_knowledge?: Json
          title: string
          workspace_id: string
        }
        Update: {
          acceptance_criteria?: Json
          client_id?: string | null
          created_at?: string
          dependency_task_ids?: Json
          description?: string
          effort?: string
          estimated_duration_days?: number
          id?: string
          initiative_plan_id?: string
          order_index?: number
          owner?: string | null
          planning_session_id?: string
          priority?: string
          related_recommendation_id?: string | null
          required_knowledge?: Json
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_plan_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_plan_initiative_plan_id_fkey"
            columns: ["initiative_plan_id"]
            isOneToOne: false
            referencedRelation: "initiative_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_plan_planning_session_id_fkey"
            columns: ["planning_session_id"]
            isOneToOne: false
            referencedRelation: "planning_session"
            referencedColumns: ["id"]
          },
        ]
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
      timeline_plan: {
        Row: {
          client_id: string | null
          created_at: string
          duration_days: number
          finish_day: number
          id: string
          initiative_plan_id: string
          on_critical_path: boolean
          planning_session_id: string
          slack_days: number
          start_day: number
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          duration_days: number
          finish_day: number
          id: string
          initiative_plan_id: string
          on_critical_path?: boolean
          planning_session_id: string
          slack_days?: number
          start_day: number
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          duration_days?: number
          finish_day?: number
          id?: string
          initiative_plan_id?: string
          on_critical_path?: boolean
          planning_session_id?: string
          slack_days?: number
          start_day?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_plan_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_plan_initiative_plan_id_fkey"
            columns: ["initiative_plan_id"]
            isOneToOne: false
            referencedRelation: "initiative_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_plan_planning_session_id_fkey"
            columns: ["planning_session_id"]
            isOneToOne: false
            referencedRelation: "planning_session"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_activity: {
        Row: {
          actor_id: string | null
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
          actor_id?: string | null
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
          actor_id?: string | null
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
      transformation_assignment: {
        Row: {
          action: string
          assigned_by_actor_id: string
          assignee_actor_id: string | null
          at: string
          client_id: string | null
          id: string
          task_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          assigned_by_actor_id: string
          assignee_actor_id?: string | null
          at?: string
          client_id?: string | null
          id: string
          task_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          assigned_by_actor_id?: string
          assignee_actor_id?: string | null
          at?: string
          client_id?: string | null
          id?: string
          task_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_assignment_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_assignment_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "transformation_task"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_assignment_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "transformation_workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_dependency: {
        Row: {
          client_id: string | null
          created_at: string
          from_initiative_id: string
          id: string
          to_initiative_id: string
          type: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          from_initiative_id: string
          id: string
          to_initiative_id: string
          type: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          from_initiative_id?: string
          id?: string
          to_initiative_id?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_dependency_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_dependency_from_initiative_id_fkey"
            columns: ["from_initiative_id"]
            isOneToOne: false
            referencedRelation: "transformation_initiative"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_dependency_to_initiative_id_fkey"
            columns: ["to_initiative_id"]
            isOneToOne: false
            referencedRelation: "transformation_initiative"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_dependency_workspace_id_fkey"
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
      transformation_kpi: {
        Row: {
          client_id: string | null
          created_at: string
          current: number
          id: string
          last_updated: string
          name: string
          status: string
          target: number
          unit: string
          version: number
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          current?: number
          id: string
          last_updated?: string
          name: string
          status?: string
          target: number
          unit?: string
          version?: number
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          current?: number
          id?: string
          last_updated?: string
          name?: string
          status?: string
          target?: number
          unit?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_kpi_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_kpi_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "transformation_workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_milestone: {
        Row: {
          client_id: string | null
          completed_date: string | null
          created_at: string
          description: string | null
          id: string
          initiative_id: string
          order_index: number
          planned_date: string
          status: string
          title: string
          version: number
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          completed_date?: string | null
          created_at?: string
          description?: string | null
          id: string
          initiative_id: string
          order_index?: number
          planned_date: string
          status?: string
          title: string
          version?: number
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          completed_date?: string | null
          created_at?: string
          description?: string | null
          id?: string
          initiative_id?: string
          order_index?: number
          planned_date?: string
          status?: string
          title?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_milestone_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_milestone_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "transformation_initiative"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_milestone_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "transformation_workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_progress_snapshot: {
        Row: {
          at: string
          client_id: string | null
          dependency_completion: number
          health: string | null
          id: string
          milestone_completion: number
          progress: number
          review_completion: number
          scope: string
          subject_id: string
          task_completion: number
          timeline_variance: number | null
          workspace_id: string
        }
        Insert: {
          at?: string
          client_id?: string | null
          dependency_completion: number
          health?: string | null
          id: string
          milestone_completion: number
          progress: number
          review_completion: number
          scope: string
          subject_id: string
          task_completion: number
          timeline_variance?: number | null
          workspace_id: string
        }
        Update: {
          at?: string
          client_id?: string | null
          dependency_completion?: number
          health?: string | null
          id?: string
          milestone_completion?: number
          progress?: number
          review_completion?: number
          scope?: string
          subject_id?: string
          task_completion?: number
          timeline_variance?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_progress_snapshot_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_progress_snapshot_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "transformation_workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_review: {
        Row: {
          client_id: string | null
          created_at: string
          decision_actor_id: string | null
          id: string
          initiative_id: string
          note: string | null
          status: string
          version: number
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          decision_actor_id?: string | null
          id: string
          initiative_id: string
          note?: string | null
          status?: string
          version?: number
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          decision_actor_id?: string | null
          id?: string
          initiative_id?: string
          note?: string | null
          status?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_review_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_review_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "transformation_initiative"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_review_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "transformation_workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_roadmap: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          phases: Json
          session_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id: string
          phases?: Json
          session_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          phases?: Json
          session_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_roadmap_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_roadmap_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "strategy_session"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_task: {
        Row: {
          assignee_actor_id: string | null
          client_id: string | null
          created_at: string
          dependency_ids: Json
          description: string | null
          estimate: string | null
          id: string
          initiative_id: string
          order_index: number
          priority: string
          status: string
          title: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          assignee_actor_id?: string | null
          client_id?: string | null
          created_at?: string
          dependency_ids?: Json
          description?: string | null
          estimate?: string | null
          id: string
          initiative_id: string
          order_index?: number
          priority?: string
          status?: string
          title: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          assignee_actor_id?: string | null
          client_id?: string | null
          created_at?: string
          dependency_ids?: Json
          description?: string | null
          estimate?: string | null
          id?: string
          initiative_id?: string
          order_index?: number
          priority?: string
          status?: string
          title?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_task_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_task_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "transformation_initiative"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_task_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "transformation_workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_timeline: {
        Row: {
          actual_end_date: string | null
          client_id: string | null
          created_at: string
          id: string
          initiative_id: string
          start_date: string
          status: string
          target_end_date: string
          version: number
          workspace_id: string
        }
        Insert: {
          actual_end_date?: string | null
          client_id?: string | null
          created_at?: string
          id: string
          initiative_id: string
          start_date: string
          status?: string
          target_end_date: string
          version?: number
          workspace_id: string
        }
        Update: {
          actual_end_date?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          initiative_id?: string
          start_date?: string
          status?: string
          target_end_date?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_timeline_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_timeline_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: true
            referencedRelation: "transformation_initiative"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_timeline_workspace_id_fkey"
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
      trend_analysis: {
        Row: {
          change_percent: number
          client_id: string | null
          created_at: string
          direction: string
          id: string
          metric_key: string
          period_count: number
          report_id: string
          significant: boolean
          summary: string
          workspace_id: string
        }
        Insert: {
          change_percent?: number
          client_id?: string | null
          created_at?: string
          direction: string
          id: string
          metric_key: string
          period_count?: number
          report_id: string
          significant?: boolean
          summary?: string
          workspace_id: string
        }
        Update: {
          change_percent?: number
          client_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          metric_key?: string
          period_count?: number
          report_id?: string
          significant?: boolean
          summary?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trend_analysis_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trend_analysis_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "executive_report"
            referencedColumns: ["id"]
          },
        ]
      }
      trigger_definition: {
        Row: {
          client_id: string | null
          config: Json
          created_at: string
          execution_intent_id: string
          id: string
          kind: string
          name: string
          workflow_definition_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          config?: Json
          created_at?: string
          execution_intent_id: string
          id: string
          kind: string
          name: string
          workflow_definition_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          config?: Json
          created_at?: string
          execution_intent_id?: string
          id?: string
          kind?: string
          name?: string
          workflow_definition_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trigger_definition_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trigger_definition_execution_intent_id_fkey"
            columns: ["execution_intent_id"]
            isOneToOne: false
            referencedRelation: "execution_intent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trigger_definition_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definition"
            referencedColumns: ["id"]
          },
        ]
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
      variable_definition: {
        Row: {
          client_id: string | null
          created_at: string
          default_value: string | null
          execution_intent_id: string
          id: string
          key: string
          required: boolean
          scope: string
          type: string
          workflow_definition_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          default_value?: string | null
          execution_intent_id: string
          id: string
          key: string
          required?: boolean
          scope: string
          type: string
          workflow_definition_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          default_value?: string | null
          execution_intent_id?: string
          id?: string
          key?: string
          required?: boolean
          scope?: string
          type?: string
          workflow_definition_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variable_definition_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variable_definition_execution_intent_id_fkey"
            columns: ["execution_intent_id"]
            isOneToOne: false
            referencedRelation: "execution_intent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variable_definition_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definition"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_definition: {
        Row: {
          automation_plan_id: string
          client_id: string | null
          created_at: string
          description: string
          entry_step_key: string | null
          execution_intent_id: string
          id: string
          name: string
          status: string
          version: number
          workspace_id: string
        }
        Insert: {
          automation_plan_id: string
          client_id?: string | null
          created_at?: string
          description?: string
          entry_step_key?: string | null
          execution_intent_id: string
          id: string
          name: string
          status?: string
          version?: number
          workspace_id: string
        }
        Update: {
          automation_plan_id?: string
          client_id?: string | null
          created_at?: string
          description?: string
          entry_step_key?: string | null
          execution_intent_id?: string
          id?: string
          name?: string
          status?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_definition_automation_plan_id_fkey"
            columns: ["automation_plan_id"]
            isOneToOne: false
            referencedRelation: "automation_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_definition_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_definition_execution_intent_id_fkey"
            columns: ["execution_intent_id"]
            isOneToOne: false
            referencedRelation: "execution_intent"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_step: {
        Row: {
          client_id: string | null
          condition_expression: string | null
          created_at: string
          estimated_runtime_ms: number
          execution_intent_id: string
          id: string
          key: string
          kind: string
          name: string
          next_step_keys: Json
          on_error_step_key: string | null
          order_index: number
          ref_id: string | null
          retry_max: number
          timeout_ms: number
          workflow_definition_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: string | null
          condition_expression?: string | null
          created_at?: string
          estimated_runtime_ms?: number
          execution_intent_id: string
          id: string
          key: string
          kind: string
          name: string
          next_step_keys?: Json
          on_error_step_key?: string | null
          order_index?: number
          ref_id?: string | null
          retry_max?: number
          timeout_ms?: number
          workflow_definition_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string | null
          condition_expression?: string | null
          created_at?: string
          estimated_runtime_ms?: number
          execution_intent_id?: string
          id?: string
          key?: string
          kind?: string
          name?: string
          next_step_keys?: Json
          on_error_step_key?: string | null
          order_index?: number
          ref_id?: string | null
          retry_max?: number
          timeout_ms?: number
          workflow_definition_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_step_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_step_execution_intent_id_fkey"
            columns: ["execution_intent_id"]
            isOneToOne: false
            referencedRelation: "execution_intent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_step_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definition"
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

