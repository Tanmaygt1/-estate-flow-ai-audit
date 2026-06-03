-- ============================================================
-- Estate Flow AI v2 — Supabase Schema
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_submissions (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  source                  TEXT DEFAULT 'reel-audit',

  -- Auth
  user_id                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Lead contact
  lead_name               TEXT,
  lead_email              TEXT,
  lead_phone              TEXT,
  lead_company            TEXT,

  -- Section 1: Business Snapshot
  industry                TEXT,
  team_size               TEXT,
  revenue_tier            TEXT,
  region                  TEXT,
  biggest_challenge       TEXT,
  growth_goals            TEXT,

  -- Section 2: Leads & Sales
  response_speed          TEXT,
  out_of_hours            TEXT,
  follow_up_method        TEXT,
  loses_leads             TEXT,
  appointment_booking     TEXT,
  sales_inefficiency      TEXT,

  -- Section 3: Operations
  time_consuming_tasks    TEXT,
  admin_hours             TEXT,
  repetitive_questions    TEXT,
  appt_management         TEXT,
  operational_bottleneck  TEXT,
  no_show_impact          TEXT,

  -- Section 4: Customer Experience
  contact_channels        TEXT,
  cx_out_of_hours         TEXT,
  repeat_questions        TEXT,
  customer_frustration    TEXT,

  -- Section 5: AI Readiness
  used_ai                 TEXT,
  ai_concerns             TEXT,
  automate_one            TEXT,
  wants_roadmap           TEXT,

  -- Audit output
  ai_score                INTEGER,
  currency                TEXT,
  ai_report               TEXT
);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE audit_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_insert"  ON audit_submissions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_select"  ON audit_submissions FOR SELECT TO service_role USING (true);
CREATE POLICY "user_own_select" ON audit_submissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR lead_email = auth.jwt()->>'email');

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_user_id    ON audit_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_lead_email ON audit_submissions (lead_email);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_score      ON audit_submissions (ai_score);
CREATE INDEX IF NOT EXISTS idx_audit_industry   ON audit_submissions (industry);

-- ── Useful views ──────────────────────────────────────────────
CREATE OR REPLACE VIEW audit_summary AS
SELECT id, created_at, lead_name, lead_email, lead_company,
       industry, team_size, revenue_tier, region, response_speed,
       ai_score, currency, biggest_challenge, wants_roadmap, source
FROM audit_submissions ORDER BY created_at DESC;

-- ============================================================
-- Verify: SELECT COUNT(*) FROM audit_submissions;
-- ============================================================
