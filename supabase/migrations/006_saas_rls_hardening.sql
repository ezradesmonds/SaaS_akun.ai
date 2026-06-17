-- ============================================================
-- AKUN.AI - Migration 006: SaaS RLS and accounting hardening
-- Run AFTER 005_transaction_integrity.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core enum-like checks. Kept as CHECK constraints so existing text columns
-- remain compatible with the generated app code.
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_type_check
  CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'));

ALTER TABLE business_members DROP CONSTRAINT IF EXISTS business_members_role_check;
ALTER TABLE business_members
  ADD CONSTRAINT business_members_role_check
  CHECK (role IN ('owner', 'admin', 'member'));

ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('admin', 'member'));

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('free', 'starter', 'pro'));

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'));

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_role_check;
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_role_check
  CHECK (role IN ('user', 'assistant'));

ALTER TABLE usage_records
  ADD COLUMN IF NOT EXISTS ocr_scans INTEGER NOT NULL DEFAULT 0;

ALTER TABLE usage_records DROP CONSTRAINT IF EXISTS usage_records_non_negative_check;
ALTER TABLE usage_records
  ADD CONSTRAINT usage_records_non_negative_check
  CHECK (tx_count >= 0 AND ai_calls >= 0 AND ocr_scans >= 0);

-- Indexes used by RLS helpers and common SaaS/admin queries.
CREATE INDEX IF NOT EXISTS businesses_user_id_idx ON businesses(user_id);
CREATE INDEX IF NOT EXISTS accounts_business_id_idx ON accounts(business_id);
CREATE INDEX IF NOT EXISTS transactions_business_date_idx ON transactions(business_id, date DESC);
CREATE INDEX IF NOT EXISTS transaction_lines_transaction_id_idx ON transaction_lines(transaction_id);
CREATE INDEX IF NOT EXISTS transaction_lines_account_id_idx ON transaction_lines(account_id);
CREATE INDEX IF NOT EXISTS chat_sessions_business_user_idx ON chat_sessions(business_id, user_id);
CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS business_members_user_business_idx ON business_members(user_id, business_id);
CREATE INDEX IF NOT EXISTS business_members_business_role_idx ON business_members(business_id, role);
CREATE INDEX IF NOT EXISTS invitations_business_email_pending_idx
  ON invitations(business_id, lower(email))
  WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS usage_records_business_period_idx ON usage_records(business_id, period);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON audit_logs(target_type, target_id);

-- SECURITY DEFINER helpers prevent recursive RLS when policies need to ask
-- whether the current user belongs to a business.
CREATE OR REPLACE FUNCTION is_business_member(
  p_business_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM business_members bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION is_business_member(UUID, UUID)
IS 'RLS helper: true when a user is a member of a business. SECURITY DEFINER avoids recursive business_members policies.';

CREATE OR REPLACE FUNCTION is_business_admin(
  p_business_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM business_members bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = p_user_id
      AND bm.role IN ('owner', 'admin')
  );
$$;

COMMENT ON FUNCTION is_business_admin(UUID, UUID)
IS 'RLS helper: true for owner/admin members. Used for team, settings, account, and invitation management.';

CREATE OR REPLACE FUNCTION is_business_owner(
  p_business_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM business_members bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = p_user_id
      AND bm.role = 'owner'
  );
$$;

COMMENT ON FUNCTION is_business_owner(UUID, UUID)
IS 'RLS helper: true only for the owner role. Used for billing and destructive business operations.';

CREATE OR REPLACE FUNCTION is_super_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS(SELECT 1 FROM super_admins WHERE user_id = p_user_id);
$$;

COMMENT ON FUNCTION is_super_admin(UUID)
IS 'Admin helper: super_admins grants platform admin access only and is intentionally separate from business roles.';

-- Replace owner-only initial policies with membership-aware SaaS policies.
DROP POLICY IF EXISTS "businesses_owner" ON businesses;
DROP POLICY IF EXISTS "businesses_member_select" ON businesses;
DROP POLICY IF EXISTS "businesses_owner_insert" ON businesses;
DROP POLICY IF EXISTS "businesses_admin_update" ON businesses;
DROP POLICY IF EXISTS "businesses_owner_delete" ON businesses;

CREATE POLICY "businesses_member_select" ON businesses
  FOR SELECT USING (is_business_member(id));
CREATE POLICY "businesses_owner_insert" ON businesses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "businesses_admin_update" ON businesses
  FOR UPDATE USING (is_business_admin(id)) WITH CHECK (is_business_admin(id));
CREATE POLICY "businesses_owner_delete" ON businesses
  FOR DELETE USING (is_business_owner(id));

DROP POLICY IF EXISTS "accounts_via_business" ON accounts;
DROP POLICY IF EXISTS "accounts_member_select" ON accounts;
DROP POLICY IF EXISTS "accounts_admin_insert" ON accounts;
DROP POLICY IF EXISTS "accounts_admin_update" ON accounts;
DROP POLICY IF EXISTS "accounts_admin_delete" ON accounts;

CREATE POLICY "accounts_member_select" ON accounts
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "accounts_admin_insert" ON accounts
  FOR INSERT WITH CHECK (is_business_admin(business_id));
CREATE POLICY "accounts_admin_update" ON accounts
  FOR UPDATE USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
CREATE POLICY "accounts_admin_delete" ON accounts
  FOR DELETE USING (is_business_admin(business_id));

DROP POLICY IF EXISTS "transactions_via_business" ON transactions;
DROP POLICY IF EXISTS "transactions_member_select" ON transactions;
DROP POLICY IF EXISTS "transactions_member_insert" ON transactions;
DROP POLICY IF EXISTS "transactions_member_update" ON transactions;
DROP POLICY IF EXISTS "transactions_admin_delete" ON transactions;

CREATE POLICY "transactions_member_select" ON transactions
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "transactions_member_insert" ON transactions
  FOR INSERT WITH CHECK (is_business_member(business_id));
CREATE POLICY "transactions_member_update" ON transactions
  FOR UPDATE USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "transactions_admin_delete" ON transactions
  FOR DELETE USING (is_business_admin(business_id));

DROP POLICY IF EXISTS "lines_via_transaction" ON transaction_lines;
DROP POLICY IF EXISTS "transaction_lines_member_select" ON transaction_lines;
DROP POLICY IF EXISTS "transaction_lines_member_insert" ON transaction_lines;
DROP POLICY IF EXISTS "transaction_lines_member_update" ON transaction_lines;
DROP POLICY IF EXISTS "transaction_lines_admin_delete" ON transaction_lines;

CREATE POLICY "transaction_lines_member_select" ON transaction_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_id
        AND is_business_member(t.business_id)
    )
  );
CREATE POLICY "transaction_lines_member_insert" ON transaction_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_id
        AND is_business_member(t.business_id)
    )
  );
CREATE POLICY "transaction_lines_member_update" ON transaction_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_id
        AND is_business_member(t.business_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_id
        AND is_business_member(t.business_id)
    )
  );
CREATE POLICY "transaction_lines_admin_delete" ON transaction_lines
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_id
        AND is_business_admin(t.business_id)
    )
  );

DROP POLICY IF EXISTS "chat_sessions_owner" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_member_user" ON chat_sessions;
CREATE POLICY "chat_sessions_member_user" ON chat_sessions
  FOR ALL USING (auth.uid() = user_id AND is_business_member(business_id))
  WITH CHECK (auth.uid() = user_id AND is_business_member(business_id));

DROP POLICY IF EXISTS "chat_messages_via_session" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_via_member_session" ON chat_messages;
CREATE POLICY "chat_messages_via_member_session" ON chat_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM chat_sessions cs
      WHERE cs.id = session_id
        AND cs.user_id = auth.uid()
        AND is_business_member(cs.business_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions cs
      WHERE cs.id = session_id
        AND cs.user_id = auth.uid()
        AND is_business_member(cs.business_id)
    )
  );

DROP POLICY IF EXISTS "subscriptions_via_business" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_member_select" ON subscriptions;
CREATE POLICY "subscriptions_member_select" ON subscriptions
  FOR SELECT USING (is_business_member(business_id));

DROP POLICY IF EXISTS "members_in_same_business" ON business_members;
DROP POLICY IF EXISTS "business_members_member_select" ON business_members;
DROP POLICY IF EXISTS "business_members_admin_insert" ON business_members;
DROP POLICY IF EXISTS "business_members_admin_update" ON business_members;
DROP POLICY IF EXISTS "business_members_admin_delete" ON business_members;

CREATE POLICY "business_members_member_select" ON business_members
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "business_members_admin_insert" ON business_members
  FOR INSERT WITH CHECK (is_business_admin(business_id));
CREATE POLICY "business_members_admin_update" ON business_members
  FOR UPDATE USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
CREATE POLICY "business_members_admin_delete" ON business_members
  FOR DELETE USING (is_business_admin(business_id) AND role <> 'owner');

DROP POLICY IF EXISTS "invitations_via_business" ON invitations;
DROP POLICY IF EXISTS "invitations_admin_all" ON invitations;
CREATE POLICY "invitations_admin_all" ON invitations
  FOR ALL USING (is_business_admin(business_id))
  WITH CHECK (is_business_admin(business_id));

DROP POLICY IF EXISTS "usage_via_business" ON usage_records;
DROP POLICY IF EXISTS "usage_member_select" ON usage_records;
CREATE POLICY "usage_member_select" ON usage_records
  FOR SELECT USING (is_business_member(business_id));

DROP POLICY IF EXISTS "super_admins_self" ON super_admins;
DROP POLICY IF EXISTS "super_admins_admin_select" ON super_admins;
CREATE POLICY "super_admins_admin_select" ON super_admins
  FOR SELECT USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "audit_logs_super_admin_select" ON audit_logs;
CREATE POLICY "audit_logs_super_admin_select" ON audit_logs
  FOR SELECT USING (is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION create_default_accounts(p_business_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_business_admin(p_business_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to create accounts for this business';
  END IF;

  INSERT INTO accounts (business_id, code, name, type) VALUES
    (p_business_id, '1-001', 'Kas',                     'ASSET'),
    (p_business_id, '1-002', 'Bank',                    'ASSET'),
    (p_business_id, '1-003', 'Piutang Usaha',           'ASSET'),
    (p_business_id, '1-004', 'Persediaan Barang',       'ASSET'),
    (p_business_id, '1-005', 'Perlengkapan Kantor',     'ASSET'),
    (p_business_id, '1-006', 'Peralatan',               'ASSET'),
    (p_business_id, '2-001', 'Hutang Usaha',            'LIABILITY'),
    (p_business_id, '2-002', 'Hutang Bank',             'LIABILITY'),
    (p_business_id, '3-001', 'Modal Pemilik',           'EQUITY'),
    (p_business_id, '3-002', 'Laba Ditahan',            'EQUITY'),
    (p_business_id, '4-001', 'Pendapatan Penjualan',    'REVENUE'),
    (p_business_id, '4-002', 'Pendapatan Jasa',         'REVENUE'),
    (p_business_id, '4-003', 'Pendapatan Lain-lain',    'REVENUE'),
    (p_business_id, '5-001', 'Beban Pembelian',         'EXPENSE'),
    (p_business_id, '5-002', 'Beban Gaji',              'EXPENSE'),
    (p_business_id, '5-003', 'Beban Sewa',              'EXPENSE'),
    (p_business_id, '5-004', 'Beban Listrik & Air',     'EXPENSE'),
    (p_business_id, '5-005', 'Beban Transportasi',      'EXPENSE'),
    (p_business_id, '5-006', 'Beban Pemasaran',         'EXPENSE'),
    (p_business_id, '5-007', 'Beban Perlengkapan',      'EXPENSE'),
    (p_business_id, '5-008', 'Beban Lain-lain',         'EXPENSE')
  ON CONFLICT (business_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    is_active = TRUE;
END;
$$;

COMMENT ON FUNCTION create_default_accounts(UUID)
IS 'Idempotently creates the default chart of accounts for a business. Safe to rerun during setup retries.';

CREATE OR REPLACE FUNCTION auto_add_owner_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO business_members (business_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (business_id, user_id) DO UPDATE SET role = 'owner';

  INSERT INTO subscriptions (business_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (business_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_add_owner_member()
IS 'Trigger helper: every new business gets exactly one owner membership and one free subscription row.';

CREATE OR REPLACE FUNCTION increment_usage(
  p_business_id UUID,
  p_field TEXT,
  p_amount INT DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_field NOT IN ('tx_count', 'ai_calls', 'ocr_scans') THEN
    RAISE EXCEPTION 'Unsupported usage field: %', p_field;
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'Usage increment must be non-negative';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT is_business_member(p_business_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to increment usage for this business';
  END IF;

  INSERT INTO usage_records (business_id, period, tx_count, ai_calls, ocr_scans)
  VALUES (
    p_business_id,
    TO_CHAR(NOW(), 'YYYY-MM'),
    CASE WHEN p_field = 'tx_count' THEN p_amount ELSE 0 END,
    CASE WHEN p_field = 'ai_calls' THEN p_amount ELSE 0 END,
    CASE WHEN p_field = 'ocr_scans' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (business_id, period)
  DO UPDATE SET
    tx_count = CASE WHEN p_field = 'tx_count'
      THEN usage_records.tx_count + p_amount ELSE usage_records.tx_count END,
    ai_calls = CASE WHEN p_field = 'ai_calls'
      THEN usage_records.ai_calls + p_amount ELSE usage_records.ai_calls END,
    ocr_scans = CASE WHEN p_field = 'ocr_scans'
      THEN usage_records.ocr_scans + p_amount ELSE usage_records.ocr_scans END,
    updated_at = NOW();
END;
$$;

COMMENT ON FUNCTION increment_usage(UUID, TEXT, INT)
IS 'Safely increments monthly usage counters for transactions, AI chat, and OCR scans. Validates tenant membership for authenticated callers.';

CREATE OR REPLACE FUNCTION validate_transaction_line_account_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_transaction_business UUID;
  v_account_business UUID;
BEGIN
  SELECT business_id INTO v_transaction_business
  FROM transactions
  WHERE id = NEW.transaction_id;

  SELECT business_id INTO v_account_business
  FROM accounts
  WHERE id = NEW.account_id;

  IF v_transaction_business IS NULL OR v_account_business IS NULL OR v_transaction_business <> v_account_business THEN
    RAISE EXCEPTION 'Transaction line account must belong to the same business as the transaction';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_transaction_line_account_business()
IS 'Accounting integrity: prevents posting a transaction line to an account from another business.';

DROP TRIGGER IF EXISTS transaction_lines_account_business ON transaction_lines;
CREATE TRIGGER transaction_lines_account_business
BEFORE INSERT OR UPDATE ON transaction_lines
FOR EACH ROW
EXECUTE FUNCTION validate_transaction_line_account_business();

CREATE OR REPLACE FUNCTION validate_transaction_is_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_total_debit NUMERIC;
  v_total_credit NUMERIC;
  v_line_count INT;
BEGIN
  v_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  SELECT
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0),
    COUNT(*)
  INTO v_total_debit, v_total_credit, v_line_count
  FROM transaction_lines
  WHERE transaction_id = v_transaction_id;

  IF v_line_count < 2 THEN
    RAISE EXCEPTION 'Transaction % must have at least two journal lines', v_transaction_id;
  END IF;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Transaction % is not balanced: debit %, credit %',
      v_transaction_id, v_total_debit, v_total_credit;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION validate_transaction_is_balanced()
IS 'Accounting integrity: deferred trigger requiring every posted journal entry to have at least two lines and equal debit/credit totals.';

DROP TRIGGER IF EXISTS transaction_lines_balance_after_insert_update ON transaction_lines;
CREATE CONSTRAINT TRIGGER transaction_lines_balance_after_insert_update
AFTER INSERT OR UPDATE ON transaction_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_transaction_is_balanced();

CREATE OR REPLACE VIEW account_balances WITH (security_invoker = true) AS
SELECT
  a.id,
  a.business_id,
  a.code,
  a.name,
  a.type,
  COALESCE(SUM(tl.debit), 0)  AS total_debit,
  COALESCE(SUM(tl.credit), 0) AS total_credit,
  CASE
    WHEN a.type IN ('ASSET', 'EXPENSE')
      THEN COALESCE(SUM(tl.debit), 0) - COALESCE(SUM(tl.credit), 0)
    ELSE
      COALESCE(SUM(tl.credit), 0) - COALESCE(SUM(tl.debit), 0)
  END AS balance
FROM accounts a
LEFT JOIN transaction_lines tl ON tl.account_id = a.id
GROUP BY a.id, a.business_id, a.code, a.name, a.type;

CREATE OR REPLACE VIEW monthly_summary WITH (security_invoker = true) AS
SELECT
  t.business_id,
  DATE_TRUNC('month', t.date) AS month,
  a.type AS account_type,
  SUM(tl.debit)  AS total_debit,
  SUM(tl.credit) AS total_credit
FROM transactions t
JOIN transaction_lines tl ON tl.transaction_id = t.id
JOIN accounts a ON a.id = tl.account_id
GROUP BY t.business_id, DATE_TRUNC('month', t.date), a.type;

CREATE OR REPLACE VIEW business_plan_info WITH (security_invoker = true) AS
SELECT
  b.id AS business_id,
  b.user_id AS owner_id,
  COALESCE(s.plan, 'free') AS plan,
  COALESCE(s.status, 'active') AS status,
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
