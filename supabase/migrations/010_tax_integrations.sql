-- ============================================================
-- AKUN.AI - Migration 010: Tax reporting and integration stubs
-- Run AFTER 007_mayar_billing.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tax_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  npwp TEXT,
  pkp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ppn_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1100,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tax_profiles_business_unique UNIQUE (business_id),
  CONSTRAINT tax_profiles_ppn_rate_check CHECK (ppn_rate >= 0 AND ppn_rate <= 1)
);

CREATE TABLE IF NOT EXISTS tax_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tax_profile_id UUID REFERENCES tax_profiles(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL DEFAULT 'ppn_summary',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  export_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tax_reports_type_check CHECK (report_type IN ('ppn_summary')),
  CONSTRAINT tax_reports_status_check CHECK (status IN ('draft', 'generated', 'export_pending', 'exported')),
  CONSTRAINT tax_reports_period_check CHECK (period_start <= period_end)
);

CREATE TABLE IF NOT EXISTS integration_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  non_secret_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  secret_handling_note TEXT NOT NULL DEFAULT 'Secrets are not stored in this table. Encrypted credential storage is not implemented yet.',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT integration_connections_provider_check CHECK (provider IN ('tokopedia', 'shopee', 'lazada', 'mayar', 'manual_csv')),
  CONSTRAINT integration_connections_status_check CHECK (status IN ('disconnected', 'pending', 'connected', 'disabled')),
  CONSTRAINT integration_connections_business_provider_unique UNIQUE (business_id, provider)
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  integration_connection_id UUID REFERENCES integration_connections(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'manual_csv',
  source_type TEXT NOT NULL DEFAULT 'manual_csv',
  status TEXT NOT NULL DEFAULT 'queued',
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_succeeded INTEGER NOT NULL DEFAULT 0,
  rows_failed INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT import_jobs_provider_check CHECK (provider IN ('tokopedia', 'shopee', 'lazada', 'mayar', 'manual_csv')),
  CONSTRAINT import_jobs_source_type_check CHECK (source_type IN ('marketplace_stub', 'payment_gateway_stub', 'manual_csv')),
  CONSTRAINT import_jobs_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT import_jobs_row_counts_check CHECK (rows_total >= 0 AND rows_succeeded >= 0 AND rows_failed >= 0)
);

CREATE INDEX IF NOT EXISTS tax_profiles_business_idx ON tax_profiles(business_id);
CREATE INDEX IF NOT EXISTS tax_reports_business_period_idx ON tax_reports(business_id, period_start DESC, period_end DESC);
CREATE INDEX IF NOT EXISTS tax_reports_generated_at_idx ON tax_reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS integration_connections_business_provider_idx ON integration_connections(business_id, provider);
CREATE INDEX IF NOT EXISTS integration_connections_status_idx ON integration_connections(status);
CREATE INDEX IF NOT EXISTS import_jobs_business_created_idx ON import_jobs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_connection_idx ON import_jobs(integration_connection_id);

ALTER TABLE tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_profiles_member_select" ON tax_profiles;
DROP POLICY IF EXISTS "tax_profiles_admin_insert" ON tax_profiles;
DROP POLICY IF EXISTS "tax_profiles_admin_update" ON tax_profiles;
DROP POLICY IF EXISTS "tax_profiles_admin_delete" ON tax_profiles;
CREATE POLICY "tax_profiles_member_select" ON tax_profiles
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "tax_profiles_admin_insert" ON tax_profiles
  FOR INSERT WITH CHECK (is_business_admin(business_id));
CREATE POLICY "tax_profiles_admin_update" ON tax_profiles
  FOR UPDATE USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
CREATE POLICY "tax_profiles_admin_delete" ON tax_profiles
  FOR DELETE USING (is_business_admin(business_id));

DROP POLICY IF EXISTS "tax_reports_member_select" ON tax_reports;
DROP POLICY IF EXISTS "tax_reports_member_insert" ON tax_reports;
DROP POLICY IF EXISTS "tax_reports_admin_update" ON tax_reports;
DROP POLICY IF EXISTS "tax_reports_admin_delete" ON tax_reports;
CREATE POLICY "tax_reports_member_select" ON tax_reports
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "tax_reports_member_insert" ON tax_reports
  FOR INSERT WITH CHECK (is_business_member(business_id));
CREATE POLICY "tax_reports_admin_update" ON tax_reports
  FOR UPDATE USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
CREATE POLICY "tax_reports_admin_delete" ON tax_reports
  FOR DELETE USING (is_business_admin(business_id));

DROP POLICY IF EXISTS "integration_connections_member_select" ON integration_connections;
DROP POLICY IF EXISTS "integration_connections_admin_insert" ON integration_connections;
DROP POLICY IF EXISTS "integration_connections_admin_update" ON integration_connections;
DROP POLICY IF EXISTS "integration_connections_admin_delete" ON integration_connections;
CREATE POLICY "integration_connections_member_select" ON integration_connections
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "integration_connections_admin_insert" ON integration_connections
  FOR INSERT WITH CHECK (is_business_admin(business_id));
CREATE POLICY "integration_connections_admin_update" ON integration_connections
  FOR UPDATE USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
CREATE POLICY "integration_connections_admin_delete" ON integration_connections
  FOR DELETE USING (is_business_admin(business_id));

DROP POLICY IF EXISTS "import_jobs_member_select" ON import_jobs;
DROP POLICY IF EXISTS "import_jobs_member_insert" ON import_jobs;
DROP POLICY IF EXISTS "import_jobs_admin_update" ON import_jobs;
DROP POLICY IF EXISTS "import_jobs_admin_delete" ON import_jobs;
CREATE POLICY "import_jobs_member_select" ON import_jobs
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "import_jobs_member_insert" ON import_jobs
  FOR INSERT WITH CHECK (is_business_member(business_id));
CREATE POLICY "import_jobs_admin_update" ON import_jobs
  FOR UPDATE USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
CREATE POLICY "import_jobs_admin_delete" ON import_jobs
  FOR DELETE USING (is_business_admin(business_id));

COMMENT ON TABLE tax_profiles IS 'Per-business Indonesian tax settings used for simple summaries. This is not a full compliance engine.';
COMMENT ON COLUMN tax_profiles.ppn_rate IS 'Configurable PPN rate used by the simple tax report calculation.';
COMMENT ON TABLE tax_reports IS 'Generated tax summary snapshots. e-Faktur export is tracked only as metadata/TODO, not implemented compliance.';
COMMENT ON COLUMN tax_reports.export_metadata IS 'Placeholder metadata for future e-Faktur or Excel exports. No official e-Faktur payload is generated yet.';
COMMENT ON TABLE integration_connections IS 'Marketplace and payment integration connection records. External API calls and encrypted secrets are not implemented yet.';
COMMENT ON COLUMN integration_connections.non_secret_config IS 'Non-secret metadata only, such as store name or import labels. Do not store tokens, API keys, or passwords.';
COMMENT ON TABLE import_jobs IS 'Import job bookkeeping for marketplace/payment/manual CSV import foundations.';
