-- ============================================================
-- AKUN.AI - Migration 013: Atomic journal posting and reversals
-- Every financial write is made through the functions below. This avoids
-- partial journal entries when an API request or webhook is retried.
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversal_of UUID REFERENCES transactions(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_status_check CHECK (status IN ('posted', 'voided'));

CREATE UNIQUE INDEX IF NOT EXISTS transactions_business_idempotency_key_idx
  ON transactions (business_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_reversal_of_idx
  ON transactions (reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_business_status_date_idx
  ON transactions (business_id, status, date DESC);

-- Atomically validates accounts, creates a journal header, and inserts every
-- line. The deferred line trigger remains the final accounting backstop.
CREATE OR REPLACE FUNCTION post_journal_transaction(
  p_business_id UUID,
  p_date DATE,
  p_description TEXT,
  p_reference TEXT,
  p_source TEXT,
  p_lines JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction transactions;
  v_line_count INT;
  v_debit NUMERIC;
  v_credit NUMERIC;
  v_invalid_line BOOLEAN;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_business_member(p_business_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to post a transaction for this business';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'A journal requires at least two lines';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_transaction
    FROM transactions
    WHERE business_id = p_business_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN v_transaction;
    END IF;
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM(COALESCE((line_item->>'debit')::NUMERIC, 0)), 0),
    COALESCE(SUM(COALESCE((line_item->>'credit')::NUMERIC, 0)), 0),
    COALESCE(BOOL_OR(
      (COALESCE((line_item->>'debit')::NUMERIC, 0) > 0 AND COALESCE((line_item->>'credit')::NUMERIC, 0) > 0)
      OR (COALESCE((line_item->>'debit')::NUMERIC, 0) = 0 AND COALESCE((line_item->>'credit')::NUMERIC, 0) = 0)
    ), false)
  INTO v_line_count, v_debit, v_credit, v_invalid_line
  FROM jsonb_array_elements(p_lines) AS line_item;

  IF v_line_count < 2 OR v_invalid_line OR ABS(v_debit - v_credit) > 0.01 THEN
    RAISE EXCEPTION 'Journal lines must have one positive debit or credit each and balance exactly';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_lines) AS line_item
    LEFT JOIN accounts account ON account.id = (line_item->>'account_id')::UUID
    WHERE account.id IS NULL OR account.business_id <> p_business_id OR account.is_active = false
  ) THEN
    RAISE EXCEPTION 'Every journal account must be active and belong to the business';
  END IF;

  INSERT INTO transactions (
    business_id, date, description, reference, source, status, posted_at, idempotency_key
  ) VALUES (
    p_business_id, p_date, p_description, NULLIF(p_reference, ''), p_source, 'posted', NOW(), p_idempotency_key
  )
  ON CONFLICT (business_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_transaction;

  IF NOT FOUND THEN
    SELECT * INTO v_transaction
    FROM transactions
    WHERE business_id = p_business_id AND idempotency_key = p_idempotency_key;
    RETURN v_transaction;
  END IF;

  INSERT INTO transaction_lines (transaction_id, account_id, debit, credit, note)
  SELECT
    v_transaction.id,
    (line_item->>'account_id')::UUID,
    COALESCE((line_item->>'debit')::NUMERIC, 0),
    COALESCE((line_item->>'credit')::NUMERIC, 0),
    NULLIF(line_item->>'note', '')
  FROM jsonb_array_elements(p_lines) AS line_item;

  RETURN v_transaction;
END;
$$;

COMMENT ON FUNCTION post_journal_transaction(UUID, DATE, TEXT, TEXT, TEXT, JSONB, TEXT)
IS 'Accounting write boundary: atomically validates and posts a balanced journal entry. Idempotency keys make request retries safe.';

-- A posted transaction is never deleted. Reversing lines preserve the audit
-- trail and keep reports mathematically correct without mutating history.
CREATE OR REPLACE FUNCTION reverse_journal_transaction(
  p_transaction_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original transactions;
  v_reversal transactions;
BEGIN
  SELECT * INTO v_original FROM transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  IF auth.uid() IS NOT NULL AND NOT is_business_admin(v_original.business_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to reverse this transaction';
  END IF;

  SELECT * INTO v_reversal FROM transactions WHERE reversal_of = v_original.id;
  IF FOUND THEN RETURN v_reversal; END IF;

  IF v_original.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted transactions can be reversed';
  END IF;

  IF v_original.reversal_of IS NOT NULL THEN
    RAISE EXCEPTION 'A reversal entry cannot be reversed again';
  END IF;

  INSERT INTO transactions (
    business_id, date, description, reference, source, status, posted_at, reversal_of
  ) VALUES (
    v_original.business_id,
    v_original.date,
    'Reversal: ' || v_original.description || COALESCE(' (' || NULLIF(p_reason, '') || ')', ''),
    v_original.reference,
    'manual',
    'posted',
    NOW(),
    v_original.id
  ) RETURNING * INTO v_reversal;

  INSERT INTO transaction_lines (transaction_id, account_id, debit, credit, note)
  SELECT v_reversal.id, account_id, credit, debit, 'Reversal of ' || v_original.id::TEXT
  FROM transaction_lines
  WHERE transaction_id = v_original.id;

  UPDATE transactions
  SET status = 'voided', voided_at = NOW(), updated_at = NOW()
  WHERE id = v_original.id;

  RETURN v_reversal;
END;
$$;

COMMENT ON FUNCTION reverse_journal_transaction(UUID, TEXT)
IS 'Accounting correction boundary: creates one equal-and-opposite entry and marks the original as voided without deleting ledger history.';
