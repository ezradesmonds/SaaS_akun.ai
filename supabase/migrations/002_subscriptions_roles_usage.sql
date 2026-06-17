-- ============================================================
-- AKUN.AI - Migration 002: Subscriptions, Roles, Usage
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- Required by invitations.token DEFAULT encode(gen_random_bytes(...)).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- SUBSCRIPTIONS
-- Tracks Stripe subscription per business
-- ============================================================
CREATE TABLE subscriptions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id          UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Plan
  plan                 TEXT NOT NULL DEFAULT 'free', -- free | starter | pro
  status               TEXT NOT NULL DEFAULT 'active', -- active | past_due | canceled | trialing
  
  -- Stripe IDs (null for free plan)
  stripe_customer_id   TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id      TEXT,
  
  -- Dates
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  trial_end            TIMESTAMPTZ,
  
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX subscriptions_business_idx ON subscriptions(business_id);

-- ============================================================
-- BUSINESS MEMBERS (Team / Multi-user)
-- ============================================================
CREATE TABLE business_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member', -- owner | admin | member
  invited_by  UUID REFERENCES auth.users(id),
  joined_at   TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(business_id, user_id)
);

-- ============================================================
-- INVITATIONS
-- ============================================================
CREATE TABLE invitations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by  UUID NOT NULL REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USAGE TRACKING
-- Per-business monthly usage counter
-- ============================================================
CREATE TABLE usage_records (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period      TEXT NOT NULL, -- format: YYYY-MM
  
  tx_count    INTEGER NOT NULL DEFAULT 0,  -- transactions created
  ai_calls    INTEGER NOT NULL DEFAULT 0,  -- LLM calls made
  
  updated_at  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(business_id, period)
);

-- ============================================================
-- RLS for new tables
-- ============================================================
ALTER TABLE subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records      ENABLE ROW LEVEL SECURITY;

-- Subscriptions: only owner/members of business can read
CREATE POLICY "subscriptions_via_business" ON subscriptions
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );

-- Business members: members can see their team
CREATE POLICY "members_in_same_business" ON business_members
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );

-- Invitations: owner/admin can see invitations for their business
CREATE POLICY "invitations_via_business" ON invitations
  FOR ALL USING (
    business_id IN (
      SELECT business_id FROM business_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Usage: members can read
CREATE POLICY "usage_via_business" ON usage_records
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- FUNCTION: Auto-insert owner as business_member on business create
-- ============================================================
CREATE OR REPLACE FUNCTION auto_add_owner_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO business_members (business_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner');
  
  -- Also create free subscription
  INSERT INTO subscriptions (business_id, plan, status)
  VALUES (NEW.id, 'free', 'active');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_business_created
  AFTER INSERT ON businesses
  FOR EACH ROW EXECUTE FUNCTION auto_add_owner_member();

-- ============================================================
-- FUNCTION: Increment usage counter (safe upsert)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_usage(
  p_business_id UUID,
  p_field TEXT,  -- 'tx_count' or 'ai_calls'
  p_amount INT DEFAULT 1
)
RETURNS void AS $$
BEGIN
  INSERT INTO usage_records (business_id, period, tx_count, ai_calls)
  VALUES (
    p_business_id,
    TO_CHAR(NOW(), 'YYYY-MM'),
    CASE WHEN p_field = 'tx_count' THEN p_amount ELSE 0 END,
    CASE WHEN p_field = 'ai_calls' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (business_id, period)
  DO UPDATE SET
    tx_count = CASE WHEN p_field = 'tx_count'
      THEN usage_records.tx_count + p_amount ELSE usage_records.tx_count END,
    ai_calls = CASE WHEN p_field = 'ai_calls'
      THEN usage_records.ai_calls + p_amount ELSE usage_records.ai_calls END,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PLAN LIMITS VIEW (easy to query)
-- ============================================================
CREATE OR REPLACE VIEW business_plan_info AS
SELECT
  b.id AS business_id,
  b.user_id AS owner_id,
  s.plan,
  s.status,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  s.current_period_end,
  s.cancel_at_period_end,
  -- Current month usage
  COALESCE(u.tx_count, 0) AS tx_count_this_month,
  COALESCE(u.ai_calls, 0) AS ai_calls_this_month,
  -- Limits per plan
  CASE s.plan
    WHEN 'free'    THEN 50
    WHEN 'starter' THEN 500
    WHEN 'pro'     THEN 999999
  END AS tx_limit,
  CASE s.plan
    WHEN 'free'    THEN 30
    WHEN 'starter' THEN 300
    WHEN 'pro'     THEN 999999
  END AS ai_calls_limit,
  -- Derived flags
  (s.plan != 'free') AS is_paid,
  (s.plan = 'pro')   AS is_pro
FROM businesses b
LEFT JOIN subscriptions s ON s.business_id = b.id
LEFT JOIN usage_records u ON u.business_id = b.id
  AND u.period = TO_CHAR(NOW(), 'YYYY-MM');
