-- ============================================================
-- AKUN.AI - Migration 003: Admin System
-- Run AFTER 002_subscriptions_roles_usage.sql
-- ============================================================

-- ============================================================
-- SUPER ADMINS
-- Completely separate from business roles
-- ============================================================
CREATE TABLE super_admins (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Only super_admins can see this table (via service role)
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admins_self" ON super_admins
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- AUDIT LOGS
-- Track all admin actions
-- ============================================================
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID NOT NULL REFERENCES auth.users(id),
  action      TEXT NOT NULL, -- e.g. 'suspend_user', 'override_plan', 'delete_business'
  target_type TEXT,          -- 'user' | 'business' | 'subscription'
  target_id   UUID,
  metadata    JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- Only service role can insert; no user reads (admin reads via API)

-- ============================================================
-- USER SUSPENSIONS
-- ============================================================
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS
  suspended_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS
  suspended_reason TEXT DEFAULT NULL;

-- ============================================================
-- FUNCTION: Check if user is super admin (used in API routes)
-- ============================================================
CREATE OR REPLACE FUNCTION is_super_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM super_admins WHERE user_id = p_user_id);
$$ LANGUAGE SQL SECURITY DEFINER;

-- ============================================================
-- ADMIN STATS VIEW
-- ============================================================
CREATE OR REPLACE VIEW admin_stats AS
SELECT
  (SELECT COUNT(*) FROM auth.users) AS total_users,
  (SELECT COUNT(*) FROM businesses WHERE suspended_at IS NULL) AS total_businesses,
  (SELECT COUNT(*) FROM subscriptions WHERE plan = 'starter') AS starter_count,
  (SELECT COUNT(*) FROM subscriptions WHERE plan = 'pro') AS pro_count,
  (SELECT COUNT(*) FROM subscriptions WHERE plan = 'free') AS free_count,
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'past_due') AS past_due_count,
  (SELECT COUNT(*) FROM businesses WHERE created_at > NOW() - INTERVAL '30 days') AS new_businesses_30d,
  (SELECT COUNT(*) FROM auth.users WHERE created_at > NOW() - INTERVAL '30 days') AS new_users_30d,
  (SELECT COUNT(*) FROM transactions WHERE created_at > NOW() - INTERVAL '30 days') AS transactions_30d,
  (SELECT COUNT(*) FROM chat_messages WHERE role = 'user' AND created_at > NOW() - INTERVAL '30 days') AS ai_calls_30d;

-- ============================================================
-- HOW TO ADD YOUR FIRST SUPER ADMIN:
-- Run this in Supabase SQL Editor with your user UUID:
--
-- INSERT INTO super_admins (user_id)
-- VALUES ('your-user-uuid-here');
--
-- Find your UUID: Auth > Users in Supabase dashboard
-- ============================================================
