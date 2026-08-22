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
          status?: Database["public"]["Enums"]["booking_status"];
          vessel_beam_m?: number;
          vessel_draft_m?: number;
          vessel_length_m?: number;
          vessel_name?: string | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      berth_status: "available" | "blocked" | "out_of_service";
      booking_source: "manual";
      booking_status: "confirmed" | "cancelled" | "checked_in" | "checked_out";
      membership_status: "active" | "suspended";
      organization_role: "marina_admin" | "marina_staff";
    };
    CompositeTypes: Record<string, never>;
  };
};
