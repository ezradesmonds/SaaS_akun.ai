-- ============================================================
-- AKUN.AI - Migration 007: Mayar billing provider
-- Run AFTER 006_saas_rls_hardening.sql
-- ============================================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'mayar',
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_price_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_checkout_url TEXT,
  ADD COLUMN IF NOT EXISTS pending_plan TEXT;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_payment_provider_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_payment_provider_check
  CHECK (payment_provider IN ('mayar', 'manual'));

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_pending_plan_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_pending_plan_check
  CHECK (pending_plan IS NULL OR pending_plan IN ('starter', 'pro'));

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_transaction_idx
  ON subscriptions(provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_provider_invoice_idx
  ON subscriptions(provider_invoice_id)
  WHERE provider_invoice_id IS NOT NULL;

COMMENT ON COLUMN subscriptions.payment_provider
IS 'Billing provider for this subscription. Mayar is the primary provider for Indonesian UMKM payments.';

COMMENT ON COLUMN subscriptions.provider_transaction_id
IS 'Provider transaction reference, used by Mayar webhook payment.received events to activate the correct business plan.';

COMMENT ON COLUMN subscriptions.pending_plan
IS 'Plan requested by checkout but not activated yet. Cleared after Mayar confirms payment via webhook.';

CREATE OR REPLACE VIEW business_plan_info WITH (security_invoker = true) AS
SELECT
  b.id AS business_id,
  b.user_id AS owner_id,
  COALESCE(s.plan, 'free') AS plan,
  COALESCE(s.status, 'active') AS status,
  COALESCE(s.payment_provider, 'mayar') AS payment_provider,
  s.provider_customer_id,
  s.provider_subscription_id,
  s.provider_price_id,
  s.provider_invoice_id,
  s.provider_transaction_id,
  s.provider_checkout_url,
  s.pending_plan,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  s.current_period_end,
  s.cancel_at_period_end,
  COALESCE(u.tx_count, 0) AS tx_count_this_month,
  COALESCE(u.ai_calls, 0) AS ai_calls_this_month,
  COALESCE(u.ocr_scans, 0) AS ocr_scans_this_month,
  CASE COALESCE(s.plan, 'free')
    WHEN 'free'    THEN 50
    WHEN 'starter' THEN 500
    WHEN 'pro'     THEN 999999
  END AS tx_limit,
  CASE COALESCE(s.plan, 'free')
    WHEN 'free'    THEN 30
    WHEN 'starter' THEN 300
    WHEN 'pro'     THEN 999999
  END AS ai_calls_limit,
  (COALESCE(s.plan, 'free') != 'free') AS is_paid,
  (COALESCE(s.plan, 'free') = 'pro')   AS is_pro
FROM businesses b
LEFT JOIN subscriptions s ON s.business_id = b.id
LEFT JOIN usage_records u ON u.business_id = b.id
  AND u.period = TO_CHAR(NOW(), 'YYYY-MM');
