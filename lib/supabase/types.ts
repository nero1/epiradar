/**
 * TypeScript types derived from the EpiRadar database schema.
 * These mirror the Supabase table definitions in supabase/schema.sql.
 */

export type Plan = "public" | "free" | "paid";
export type AlertMode = "daily" | "immediate";
export type WatchlistType = "country" | "pathogen" | "region";
export type IngestionStatus = "running" | "completed" | "failed";
export type BillingProvider = "paystack" | "dodopayments";
export type IngestionSource = "WHO" | "ProMED" | "ReliefWeb" | "PubMed" | "GoogleNews" | "Twitter";

export interface Alert {
  id: string;
  source: IngestionSource;
  source_url: string;
  content_hash: string;
  country_iso: string[];
  pathogen: string | null;
  risk_score: number;
  severity_score: number;
  spread_score: number;
  novelty_score: number;
  ai_summary: string | null;
  case_count: number | null;
  death_count: number | null;
  published_at: string;
  ingested_at: string;
  is_active: boolean;
}

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  plan: Plan;
  plan_expires_at: string | null;
  pdf_export_count: number;
  pdf_export_reset_at: string | null;
  api_key_hash: string | null;
  api_key_last_used_at: string | null;
  totp_secret: string | null;
  pin_hash: string | null;
  is_admin: boolean;
  deleted_at: string | null;
  created_at: string;
}

export interface Watchlist {
  id: string;
  user_id: string;
  type: WatchlistType;
  value: string;
  alert_mode: AlertMode;
  created_at: string;
}

export interface IngestionRun {
  id: string;
  triggered_by: "cron" | "manual" | "external";
  status: IngestionStatus;
  sources_fetched: number;
  items_ingested: number;
  items_skipped: number;
  errors: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
}

export interface BillingEvent {
  id: string;
  user_id: string;
  provider: BillingProvider;
  event_type: string;
  amount: number;
  currency: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Required by Supabase GenericTable constraint */
type Relationships = never[];

/** Supabase Database type map for typed client */
export interface Database {
  public: {
    Tables: {
      alerts: {
        Row: Alert;
        Insert: Omit<Alert, "id" | "ingested_at"> & { id?: string };
        Update: Partial<Omit<Alert, "id">>;
        Relationships: Relationships;
      };
      users: {
        Row: User;
        Insert: Omit<User, "created_at"> & {
          plan?: Plan;
          pdf_export_count?: number;
          is_admin?: boolean;
        };
        Update: Partial<Omit<User, "id" | "created_at">>;
        Relationships: Relationships;
      };
      watchlists: {
        Row: Watchlist;
        Insert: Omit<Watchlist, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<Watchlist, "id" | "created_at">>;
        Relationships: Relationships;
      };
      ingestion_runs: {
        Row: IngestionRun;
        Insert: Omit<IngestionRun, "id"> & { id?: string };
        Update: Partial<Omit<IngestionRun, "id">>;
        Relationships: Relationships;
      };
      billing_events: {
        Row: BillingEvent;
        Insert: Omit<BillingEvent, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<BillingEvent, "id" | "created_at">>;
        Relationships: Relationships;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, string>;
  };
}
