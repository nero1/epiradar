-- EpiRadar Database Schema
-- Run this in the Supabase SQL editor to initialize the database.
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Users table (mirrors auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  plan            TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('public', 'free', 'paid')),
  plan_expires_at TIMESTAMPTZ,
  pdf_export_count INTEGER NOT NULL DEFAULT 0,
  pdf_export_reset_at DATE,
  api_key_hash    TEXT,
  totp_secret     TEXT, -- encrypted at application level before storage
  pin_hash        TEXT,
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alerts table
CREATE TABLE IF NOT EXISTS public.alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source          TEXT NOT NULL CHECK (source IN ('WHO', 'ProMED', 'ReliefWeb', 'PubMed', 'GoogleNews', 'Twitter')),
  source_url      TEXT NOT NULL,
  content_hash    TEXT NOT NULL UNIQUE, -- SHA-256 dedup key
  country_iso     TEXT[] NOT NULL DEFAULT '{}',
  pathogen        TEXT,
  risk_score      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  severity_score  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (severity_score BETWEEN 0 AND 100),
  spread_score    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (spread_score BETWEEN 0 AND 100),
  novelty_score   NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (novelty_score BETWEEN 0 AND 100),
  ai_summary      TEXT,
  case_count      INTEGER,
  death_count     INTEGER,
  published_at    TIMESTAMPTZ NOT NULL,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Watchlists table
CREATE TABLE IF NOT EXISTS public.watchlists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('country', 'pathogen', 'region')),
  value       TEXT NOT NULL,
  alert_mode  TEXT NOT NULL DEFAULT 'daily' CHECK (alert_mode IN ('daily', 'immediate')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, type, value)
);

-- Ingestion runs log
CREATE TABLE IF NOT EXISTS public.ingestion_runs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  triggered_by     TEXT NOT NULL CHECK (triggered_by IN ('cron', 'manual', 'external')),
  status           TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  sources_fetched  INTEGER NOT NULL DEFAULT 0,
  items_ingested   INTEGER NOT NULL DEFAULT 0,
  items_skipped    INTEGER NOT NULL DEFAULT 0,
  errors           JSONB NOT NULL DEFAULT '{}',
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

-- Billing events (idempotent webhook log)
CREATE TABLE IF NOT EXISTS public.billing_events (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('paystack', 'dodopayments')),
  event_type       TEXT NOT NULL,
  amount           NUMERIC(12,2) NOT NULL,
  currency         TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL UNIQUE,
  payload          JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_id   UUID,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_alerts_published_at ON public.alerts (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_risk_score ON public.alerts (risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_is_active ON public.alerts (is_active);
CREATE INDEX IF NOT EXISTS idx_alerts_country_iso ON public.alerts USING GIN (country_iso);
CREATE INDEX IF NOT EXISTS idx_alerts_pathogen ON public.alerts (pathogen);
CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON public.watchlists (user_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started_at ON public.ingestion_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_plan ON public.users (plan);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Users: each user can read/update their own profile
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id AND deleted_at IS NULL);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id AND deleted_at IS NULL);

-- Admins can read all users (verified DB-side in application code)
CREATE POLICY "users_admin_select_all" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = TRUE
    )
  );

-- Alerts: public read access (filtered by tier in application layer)
CREATE POLICY "alerts_public_read" ON public.alerts
  FOR SELECT USING (is_active = TRUE);

-- Watchlists: users can manage their own watchlists only
CREATE POLICY "watchlists_select_own" ON public.watchlists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "watchlists_insert_own" ON public.watchlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "watchlists_delete_own" ON public.watchlists
  FOR DELETE USING (auth.uid() = user_id);

-- Ingestion runs: admin read only
CREATE POLICY "ingestion_runs_admin_read" ON public.ingestion_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = TRUE
    )
  );

-- Billing events: users see their own, admins see all
CREATE POLICY "billing_events_select_own" ON public.billing_events
  FOR SELECT USING (auth.uid() = user_id);

-- Admin audit log: admin read only
CREATE POLICY "admin_audit_log_admin_read" ON public.admin_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = TRUE
    )
  );

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Atomic PDF export quota decrement (race condition safe)
CREATE OR REPLACE FUNCTION public.decrement_pdf_export_quota(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_plan TEXT;
BEGIN
  SELECT pdf_export_count, plan INTO v_count, v_plan
  FROM public.users
  WHERE id = p_user_id AND deleted_at IS NULL
  FOR UPDATE; -- row-level lock prevents race conditions

  IF v_plan = 'free' AND v_count >= 3 THEN
    RETURN FALSE; -- quota exhausted
  END IF;

  UPDATE public.users
  SET pdf_export_count = pdf_export_count + 1
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

-- Reset PDF export quotas for all free users (called by monthly CRON)
CREATE OR REPLACE FUNCTION public.reset_monthly_pdf_quotas()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.users
  SET
    pdf_export_count = 0,
    pdf_export_reset_at = DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
  WHERE plan = 'free' AND deleted_at IS NULL;
END;
$$;

-- Trigger: create user profile on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, plan)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    'free'
  )
  ON CONFLICT (id) DO NOTHING; -- idempotent
  RETURN NEW;
END;
$$;
