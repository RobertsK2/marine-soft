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
      bookings: {
        Row: {
          arrival_date: string;
          created_at: string;
          customer_email: string;
          customer_name: string;
          customer_phone: string;
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
        };
        Insert: {
          arrival_date: string;
          created_at?: string;
          customer_email: string;
          customer_name: string;
          customer_phone: string;
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
        };
        Update: {
          arrival_date?: string;
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
          price_snapshot: Json; released_at: string | null; release_reason: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; public_token?: string; marina_id: string; idempotency_key: string;
          arrival_date: string; departure_date: string; eta: string; etd: string;
          vessel_name?: string | null; vessel_length_m: number; vessel_beam_m: number;
          vessel_draft_m: number; status?: Database["public"]["Enums"]["booking_hold_status"];
          expires_at: string; price_currency: string; price_total_minor: number;
          price_snapshot: Json; released_at?: string | null; release_reason?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["booking_holds"]["Insert"]>;
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
    };
    Enums: {
      berth_status: "available" | "blocked" | "out_of_service";
      booking_hold_status: "active" | "released" | "expired";
      booking_source: "manual";
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
