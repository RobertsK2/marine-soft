export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      audit_events: {
        Row: {
          id: number;
          marina_id: string;
          event_type: string;
          entity_type: "booking" | "berth" | "payment" | "assignment";
          entity_id: string;
          booking_id: string | null;
          berth_id: string | null;
          actor_id: string | null;
          actor_email: string | null;
          actor_type: "member" | "guest" | "system";
          summary: string;
          before_data: Json | null;
          after_data: Json | null;
          metadata: Json;
          occurred_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      booking_price_adjustments: {
        Row: {
          id: string;
          marina_id: string;
          booking_id: string;
          previous_price_total_minor: number;
          revised_price_total_minor: number;
          difference_from_paid_minor: number;
          currency: string;
          previous_price_snapshot: Json;
          revised_price_snapshot: Json;
          changed_at: string;
          changed_by: string | null;
        };
        Insert: {
          id?: string;
          marina_id: string;
          booking_id: string;
          previous_price_total_minor: number;
          revised_price_total_minor: number;
          difference_from_paid_minor: number;
          currency: string;
          previous_price_snapshot: Json;
          revised_price_snapshot: Json;
          changed_at?: string;
          changed_by?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      booking_berth_assignments: {
        Row: {
          id: string;
          marina_id: string;
          booking_id: string;
          berth_id: string;
          arrival_date: string;
          departure_date: string;
          assigned_at: string;
          assigned_by: string | null;
          assignment_kind: "stay" | "planned_move";
          ended_at: string | null;
          ended_by: string | null;
          ended_reason: string | null;
        };
        Insert: {
          id?: string;
          marina_id: string;
          booking_id: string;
          berth_id: string;
          arrival_date: string;
          departure_date: string;
          assigned_at?: string;
          assigned_by?: string | null;
          assignment_kind?: "stay" | "planned_move";
          ended_at?: string | null;
          ended_by?: string | null;
          ended_reason?: string | null;
        };
        Update: { ended_at?: string | null; ended_by?: string | null; ended_reason?: string | null };
        Relationships: [];
      };
      guest_booking_access_grants: {
        Row: {
          id: string;
          booking_id: string;
          issued_at: string;
          expires_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          booking_id: string;
          issued_at?: string;
          expires_at: string;
          revoked_at?: string | null;
        };
        Update: { expires_at?: string; revoked_at?: string | null };
        Relationships: [];
      };
      bookings: {
        Row: {
          arrival_date: string;
          actual_check_in_at: string | null;
          actual_check_out_at: string | null;
          booking_hold_id: string | null;
          booking_payment_id: string | null;
          created_at: string;
          customer_email: string;
          customer_name: string;
          customer_phone: string;
          customer_snapshot: Json | null;
          check_in_assignment_exception_by: string | null;
          check_in_without_assignment: boolean;
          departure_date: string;
          eta: string;
          etd: string;
          id: string;
          marina_id: string;
          price_currency: string | null;
          price_snapshot: Json | null;
          price_total_minor: number | null;
          reference: string;
          source: Database["public"]["Enums"]["booking_source"];
          status: Database["public"]["Enums"]["booking_status"];
          updated_at: string;
          vessel_beam_m: number;
          vessel_draft_m: number;
          vessel_length_m: number;
          vessel_name: string | null;
          vessel_snapshot: Json | null;
        };
        Insert: {
          arrival_date: string;
          actual_check_in_at?: string | null;
          actual_check_out_at?: string | null;
          booking_hold_id?: string | null;
          booking_payment_id?: string | null;
          created_at?: string;
          customer_email: string;
          customer_name: string;
          customer_phone: string;
          customer_snapshot?: Json | null;
          check_in_assignment_exception_by?: string | null;
          check_in_without_assignment?: boolean;
          departure_date: string;
          eta: string;
          etd: string;
          id?: string;
          marina_id: string;
          price_currency?: string | null;
          price_snapshot?: Json | null;
          price_total_minor?: number | null;
          reference?: string;
          source?: Database["public"]["Enums"]["booking_source"];
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
          vessel_beam_m: number;
          vessel_draft_m: number;
          vessel_length_m: number;
          vessel_name?: string | null;
          vessel_snapshot?: Json | null;
        };
        Update: {
          actual_check_in_at?: string | null;
          actual_check_out_at?: string | null;
          arrival_date?: string;
          check_in_assignment_exception_by?: string | null;
          check_in_without_assignment?: boolean;
          customer_email?: string;
          customer_name?: string;
          customer_phone?: string;
          departure_date?: string;
          eta?: string;
          etd?: string;
          price_currency?: string | null;
          price_snapshot?: Json | null;
          price_total_minor?: number | null;
          status?: Database["public"]["Enums"]["booking_status"];
          customer_snapshot?: Json | null;
          vessel_snapshot?: Json | null;
          vessel_beam_m?: number;
          vessel_draft_m?: number;
          vessel_length_m?: number;
          vessel_name?: string | null;
        };
        Relationships: [];
      };
      booking_holds: {
        Row: {
          id: string; public_token: string; marina_id: string; idempotency_key: string;
          arrival_date: string; departure_date: string; eta: string; etd: string;
          vessel_name: string | null; vessel_length_m: number; vessel_beam_m: number;
          vessel_draft_m: number; status: Database["public"]["Enums"]["booking_hold_status"];
          expires_at: string; price_currency: string; price_total_minor: number;
          price_snapshot: Json; released_at: string | null; release_reason: string | null; payment_confirmed_at: string | null; consumed_at: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; public_token?: string; marina_id: string; idempotency_key: string;
          arrival_date: string; departure_date: string; eta: string; etd: string;
          vessel_name?: string | null; vessel_length_m: number; vessel_beam_m: number;
          vessel_draft_m: number; status?: Database["public"]["Enums"]["booking_hold_status"];
          expires_at: string; price_currency: string; price_total_minor: number;
          price_snapshot: Json; released_at?: string | null; release_reason?: string | null; payment_confirmed_at?: string | null; consumed_at?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["booking_holds"]["Insert"]>;
        Relationships: [];
      };
      booking_payments: {
        Row: { id: string; hold_id: string; marina_id: string; stripe_account_id: string; stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null; status: Database["public"]["Enums"]["booking_payment_status"]; amount_total_minor: number; currency: string; price_snapshot: Json; paid_at: string | null; failed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; hold_id: string; marina_id: string; stripe_account_id: string; stripe_checkout_session_id?: string | null; stripe_payment_intent_id?: string | null; status?: Database["public"]["Enums"]["booking_payment_status"]; amount_total_minor: number; currency: string; price_snapshot: Json; paid_at?: string | null; failed_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["booking_payments"]["Insert"]>;
        Relationships: [];
      };
      booking_payment_balances: {
        Row: {
          id: string;
          marina_id: string;
          booking_id: string;
          state: Database["public"]["Enums"]["booking_payment_state"];
          collection_method: Database["public"]["Enums"]["booking_collection_method"];
          currency: string | null;
          total_due_minor: number | null;
          paid_minor: number;
          balance_due_minor: number;
          due_at: string | null;
          payment_link_url: string | null;
          note: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string; marina_id: string; booking_id: string;
          state: Database["public"]["Enums"]["booking_payment_state"];
          collection_method: Database["public"]["Enums"]["booking_collection_method"];
          currency?: string | null; total_due_minor?: number | null; paid_minor?: number;
          balance_due_minor?: number; due_at?: string | null; payment_link_url?: string | null;
          note?: string | null; updated_at?: string; updated_by?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      stripe_webhook_events: {
        Row: { stripe_event_id: string; event_type: string; stripe_account_id: string; stripe_checkout_session_id: string | null; outcome: string; processed_at: string; booking_id: string | null; error_detail: string | null };
        Insert: { stripe_event_id: string; event_type: string; stripe_account_id: string; stripe_checkout_session_id?: string | null; outcome: string; processed_at?: string; booking_id?: string | null; error_detail?: string | null };
        Update: { outcome?: string; booking_id?: string | null; error_detail?: string | null; processed_at?: string };
        Relationships: [];
      };
      marina_mandatory_fees: {
        Row: {
          amount_minor: number | null;
          created_at: string;
          fee_type: Database["public"]["Enums"]["mandatory_fee_type"];
          id: string;
          marina_id: string;
          name: string;
          percentage_bps: number | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          amount_minor?: number | null;
          created_at?: string;
          fee_type: Database["public"]["Enums"]["mandatory_fee_type"];
          id?: string;
          marina_id: string;
          name: string;
          percentage_bps?: number | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          amount_minor?: number | null;
          fee_type?: Database["public"]["Enums"]["mandatory_fee_type"];
          marina_id?: string;
          name?: string;
          percentage_bps?: number | null;
          sort_order?: number;
        };
        Relationships: [];
      };
      marina_pricing_configs: {
        Row: {
          created_at: string;
          currency: string;
          marina_id: string;
          model: Database["public"]["Enums"]["pricing_model"];
          tax_behavior: Database["public"]["Enums"]["tax_behavior"];
          tax_rate_bps: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency: string;
          marina_id: string;
          model: Database["public"]["Enums"]["pricing_model"];
          tax_behavior: Database["public"]["Enums"]["tax_behavior"];
          tax_rate_bps?: number;
          updated_at?: string;
        };
        Update: {
          currency?: string;
          model?: Database["public"]["Enums"]["pricing_model"];
          tax_behavior?: Database["public"]["Enums"]["tax_behavior"];
          tax_rate_bps?: number;
        };
        Relationships: [];
      };
      berths: {
        Row: {
          allow_smaller_vessels: boolean;
          code: string;
          created_at: string;
          id: string;
          marina_id: string;
          max_beam_m: number;
          max_draft_m: number;
          max_length_m: number;
          priority: number;
          status: Database["public"]["Enums"]["berth_status"];
          updated_at: string;
          zone: string;
        };
        Insert: {
          allow_smaller_vessels?: boolean;
          code: string;
          created_at?: string;
          id?: string;
          marina_id: string;
          max_beam_m: number;
          max_draft_m: number;
          max_length_m: number;
          priority?: number;
          status?: Database["public"]["Enums"]["berth_status"];
          updated_at?: string;
          zone: string;
        };
        Update: {
          allow_smaller_vessels?: boolean;
          code?: string;
          max_beam_m?: number;
          max_draft_m?: number;
          max_length_m?: number;
          priority?: number;
          status?: Database["public"]["Enums"]["berth_status"];
          zone?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          name?: string;
        };
        Relationships: [];
      };
      marinas: {
        Row: {
          cover_image_url: string | null;
          created_at: string;
          id: string;
          is_public: boolean;
          local_language: string | null;
          logo_url: string | null;
          map_image_url: string | null;
          name: string;
          organization_id: string;
          primary_color: string;
          public_description: string | null;
          public_description_local: string | null;
          slug: string;
          timezone: string;
          stripe_account_id: string | null;
          updated_at: string;
        };
        Insert: {
          cover_image_url?: string | null;
          created_at?: string;
          id?: string;
          is_public?: boolean;
          local_language?: string | null;
          logo_url?: string | null;
          map_image_url?: string | null;
          name: string;
          organization_id: string;
          primary_color?: string;
          public_description?: string | null;
          public_description_local?: string | null;
          slug: string;
          timezone?: string;
          stripe_account_id?: string | null;
          updated_at?: string;
        };
        Update: {
          cover_image_url?: string | null;
          is_public?: boolean;
          local_language?: string | null;
          logo_url?: string | null;
          map_image_url?: string | null;
          name?: string;
          primary_color?: string;
          public_description?: string | null;
          public_description_local?: string | null;
          slug?: string;
          timezone?: string;
          stripe_account_id?: string | null;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["organization_role"];
          status: Database["public"]["Enums"]["membership_status"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          role: Database["public"]["Enums"]["organization_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          user_id: string;
        };
        Update: {
          role?: Database["public"]["Enums"]["organization_role"];
          status?: Database["public"]["Enums"]["membership_status"];
        };
        Relationships: [];
      };
      pricing_season_length_rates: {
        Row: {
          created_at: string;
          id: string;
          marina_id: string;
          max_length_m: number;
          min_length_m: number;
          nightly_rate_minor: number;
          season_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          marina_id: string;
          max_length_m: number;
          min_length_m: number;
          nightly_rate_minor: number;
          season_id: string;
          updated_at?: string;
        };
        Update: {
          marina_id?: string;
          max_length_m?: number;
          min_length_m?: number;
          nightly_rate_minor?: number;
          season_id?: string;
        };
        Relationships: [];
      };
      pricing_season_meter_rates: {
        Row: {
          created_at: string;
          marina_id: string;
          nightly_rate_per_meter_minor: number;
          season_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          marina_id: string;
          nightly_rate_per_meter_minor: number;
          season_id: string;
          updated_at?: string;
        };
        Update: {
          marina_id?: string;
          nightly_rate_per_meter_minor?: number;
          season_id?: string;
        };
        Relationships: [];
      };
      pricing_seasons: {
        Row: {
          created_at: string;
          ends_on: string;
          id: string;
          marina_id: string;
          name: string;
          starts_on: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ends_on: string;
          id?: string;
          marina_id: string;
          name: string;
          starts_on: string;
          updated_at?: string;
        };
        Update: {
          ends_on?: string;
          marina_id?: string;
          name?: string;
          starts_on?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      audited_update_booking_details: {
        Args: {
          target_marina_id: string;
          target_booking_id: string;
          target_actor_id: string;
          expected_updated_at: string;
          requested_arrival: string;
          requested_departure: string;
          requested_eta: string;
          requested_etd: string;
          requested_customer_name: string;
          requested_customer_email: string;
          requested_customer_phone: string;
          requested_vessel_name: string | null;
          requested_length_m: number;
          requested_beam_m: number;
          requested_draft_m: number;
          calculated_price_snapshot: Json | null;
        };
        Returns: {
          outcome: string;
          price_difference_minor: number | null;
          revised_total_minor: number | null;
          price_currency: string | null;
          assignment_preserved: boolean;
        }[];
      };
      audited_confirm_booking_extension: {
        Args: {
          target_marina_id: string;
          target_booking_id: string;
          target_actor_id: string;
          expected_updated_at: string;
          requested_departure: string;
          requested_move_berth_id: string | null;
          calculated_price_snapshot: Json | null;
        };
        Returns: {
          outcome: string;
          current_berth_code: string | null;
          move_berth_code: string | null;
          price_difference_minor: number | null;
          revised_total_minor: number | null;
          price_currency: string | null;
        }[];
      };
      audited_confirm_booking_cancellation: {
        Args: {
          target_marina_id: string;
          target_booking_id: string;
          target_actor_id: string;
          expected_updated_at: string;
          cancellation_reason: string;
        };
        Returns: {
          outcome: string;
          policy_code: string | null;
          refund_percent: number | null;
          refund_recommendation_minor: number | null;
          currency: string | null;
          released_assignment_count: number;
        }[];
      };
      update_booking_details: {
        Args: {
          target_marina_id: string;
          target_booking_id: string;
          target_actor_id: string;
          expected_updated_at: string;
          requested_arrival: string;
          requested_departure: string;
          requested_eta: string;
          requested_etd: string;
          requested_customer_name: string;
          requested_customer_email: string;
          requested_customer_phone: string;
          requested_vessel_name: string | null;
          requested_length_m: number;
          requested_beam_m: number;
          requested_draft_m: number;
          calculated_price_snapshot: Json | null;
        };
        Returns: {
          outcome: string;
          price_difference_minor: number | null;
          revised_total_minor: number | null;
          price_currency: string | null;
          assignment_preserved: boolean;
        }[];
      };
      assign_booking_berth: {
        Args: { target_booking_id: string; target_berth_id: string };
        Returns: { outcome: string; assignment_id: string | null; berth_code: string | null }[];
      };
      preview_booking_extension: {
        Args: {
          target_marina_id: string;
          target_booking_id: string;
          target_actor_id: string;
          expected_updated_at: string;
          requested_departure: string;
        };
        Returns: {
          outcome: string;
          current_berth_id: string | null;
          current_berth_code: string | null;
          move_required: boolean;
          berth_options: Json;
        }[];
      };
      confirm_booking_extension: {
        Args: {
          target_marina_id: string;
          target_booking_id: string;
          target_actor_id: string;
          expected_updated_at: string;
          requested_departure: string;
          requested_move_berth_id: string | null;
          calculated_price_snapshot: Json | null;
        };
        Returns: {
          outcome: string;
          current_berth_code: string | null;
          move_berth_code: string | null;
          price_difference_minor: number | null;
          revised_total_minor: number | null;
          price_currency: string | null;
        }[];
      };
      preview_berth_block_impact: {
        Args: {
          target_marina_id: string;
          target_berth_id: string;
          target_actor_id: string;
          target_status: string;
        };
        Returns: {
          outcome: string;
          berth_code: string | null;
          requested_status: string;
          affected_count: number;
          unresolved_count: number;
          affected_bookings: Json;
        }[];
      };
      preview_booking_cancellation: {
        Args: {
          target_marina_id: string;
          target_booking_id: string;
          target_actor_id: string;
          expected_updated_at: string;
        };
        Returns: {
          outcome: string;
          booking_status: Database["public"]["Enums"]["booking_status"] | null;
          policy_code: string | null;
          refund_percent: number | null;
          refund_recommendation_minor: number | null;
          paid_total_minor: number | null;
          currency: string | null;
          assignment_count: number;
        }[];
      };
      confirm_booking_cancellation: {
        Args: {
          target_marina_id: string;
          target_booking_id: string;
          target_actor_id: string;
          expected_updated_at: string;
          cancellation_reason: string;
        };
        Returns: {
          outcome: string;
          policy_code: string | null;
          refund_percent: number | null;
          refund_recommendation_minor: number | null;
          currency: string | null;
          released_assignment_count: number;
        }[];
      };
      transition_booking_stay: {
        Args: {
          target_booking_id: string;
          target_status: Database["public"]["Enums"]["booking_status"];
          allow_unassigned_check_in?: boolean;
        };
        Returns: {
          outcome: string;
          actual_at: string | null;
          berth_code: string | null;
          used_assignment_exception: boolean;
        }[];
      };
      ensure_guest_booking_access: {
        Args: { target_booking_id: string; requested_ttl?: string };
        Returns: { grant_id: string; expires_at: string }[];
      };
      rotate_guest_booking_access: {
        Args: { target_booking_id: string; requested_ttl?: string };
        Returns: { grant_id: string; expires_at: string }[];
      };
      revoke_guest_booking_access: {
        Args: { target_grant_id: string };
        Returns: boolean;
      };
      get_guest_booking: {
        Args: { target_grant_id: string };
        Returns: {
          booking_reference: string;
          marina_name: string;
          arrival_date: string;
          departure_date: string;
          eta: string;
          etd: string;
          vessel_name: string | null;
          vessel_length_m: number;
          vessel_beam_m: number;
          vessel_draft_m: number;
          price_total_minor: number;
          price_currency: string;
          booking_status: Database["public"]["Enums"]["booking_status"];
          access_expires_at: string;
        }[];
      };
      update_guest_booking_times: {
        Args: { target_grant_id: string; requested_eta: string; requested_etd: string };
        Returns: boolean;
      };
      create_booking_hold: {
        Args: {
          target_marina_id: string; request_idempotency_key: string;
          requested_arrival: string; requested_departure: string;
          requested_eta: string; requested_etd: string; requested_vessel_name: string | null;
          requested_length_m: number; requested_beam_m: number; requested_draft_m: number;
          calculated_price_currency: string; calculated_price_total_minor: number;
          calculated_price_snapshot: Json;
        };
        Returns: { outcome: string; hold_token: string | null; hold_expires_at: string | null; total_minor: number | null; currency: string | null }[];
      };
      release_booking_hold_after_checkout_failure: {
        Args: { target_hold_token: string };
        Returns: boolean;
      };
      prepare_booking_checkout: {
        Args: { target_hold_token: string };
        Returns: { outcome: string; payment_id: string | null; hold_id: string | null; marina_id: string | null; marina_slug: string | null; marina_name: string | null; stripe_account_id: string | null; amount_total_minor: number | null; currency: string | null; price_snapshot: Json | null; hold_expires_at: string | null; existing_checkout_session_id: string | null }[];
      };
      attach_booking_checkout_session: { Args: { target_payment_id: string; target_session_id: string }; Returns: boolean };
      fail_booking_checkout_creation: { Args: { target_payment_id: string }; Returns: boolean };
      process_stripe_checkout_event: {
        Args: { target_event_id: string; target_event_type: string; target_stripe_account_id: string; target_session_id: string; target_payment_intent_id: string | null; target_payment_status: string; target_amount_total_minor: number; target_currency: string; target_hold_token: string; target_customer_name?: string | null; target_customer_email?: string | null; target_customer_phone?: string | null };
        Returns: string;
      };
      set_booking_payment_state: {
        Args: {
          target_marina_id: string;
          target_booking_id: string;
          target_actor_id: string;
          requested_state: Database["public"]["Enums"]["booking_payment_state"];
          requested_method: Database["public"]["Enums"]["booking_collection_method"];
          requested_currency: string | null;
          requested_total_minor: number | null;
          requested_paid_minor: number;
          requested_due_at: string | null;
          requested_payment_link_url: string | null;
          requested_note: string | null;
        };
        Returns: {
          outcome: string;
          state: Database["public"]["Enums"]["booking_payment_state"] | null;
          collection_method: Database["public"]["Enums"]["booking_collection_method"] | null;
          total_due_minor: number | null;
          paid_minor: number | null;
          balance_due_minor: number | null;
          due_at: string | null;
          overdue: boolean;
        }[];
      };
    };
    Enums: {
      berth_status: "available" | "blocked" | "out_of_service";
      booking_hold_status: "active" | "released" | "expired" | "consumed";
      booking_payment_status: "pending" | "paid" | "failed" | "expired";
      booking_payment_state: "paid_in_full" | "deposit_paid" | "balance_due" | "paid_outside_berthio" | "payment_link_required";
      booking_collection_method: "berthio" | "outside_berthio" | "payment_link" | "on_site";
      booking_source: "manual" | "online";
      booking_status: "confirmed" | "cancelled" | "checked_in" | "checked_out";
      mandatory_fee_type:
        | "per_booking"
        | "per_night"
        | "per_vessel"
        | "percentage";
      membership_status: "active" | "suspended";
      organization_role: "marina_admin" | "marina_staff";
      pricing_model: "length_interval" | "per_meter";
      tax_behavior: "exclusive" | "inclusive";
    };
    CompositeTypes: Record<string, never>;
  };
};
