-- ============================================================
-- AKUN.AI - Migration 014: Secure ledger RPCs and atomic invoices
-- Run after 013_ledger_posting_and_idempotency.sql.
-- ============================================================

-- SECURITY DEFINER routines must never treat an anonymous caller as trusted.
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to post a transaction';
  END IF;

  IF NOT is_business_member(p_business_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to post a transaction for this business';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'A journal requires at least two lines';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_transaction
    FROM transactions
    WHERE business_id = p_business_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_transaction; END IF;
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to reverse a transaction';
  END IF;

  SELECT * INTO v_original FROM transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT is_business_admin(v_original.business_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to reverse this transaction';
  END IF;

  SELECT * INTO v_reversal FROM transactions WHERE reversal_of = v_original.id;
  IF FOUND THEN RETURN v_reversal; END IF;
  IF v_original.status <> 'posted' THEN RAISE EXCEPTION 'Only posted transactions can be reversed'; END IF;
  IF v_original.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'A reversal entry cannot be reversed again'; END IF;

  INSERT INTO transactions (business_id, date, description, reference, source, status, posted_at, reversal_of)
  VALUES (
    v_original.business_id, v_original.date,
    'Reversal: ' || v_original.description || COALESCE(' (' || NULLIF(p_reason, '') || ')', ''),
    v_original.reference, 'manual', 'posted', NOW(), v_original.id
  ) RETURNING * INTO v_reversal;

  INSERT INTO transaction_lines (transaction_id, account_id, debit, credit, note)
  SELECT v_reversal.id, account_id, credit, debit, 'Reversal of ' || v_original.id::TEXT
  FROM transaction_lines WHERE transaction_id = v_original.id;

  UPDATE transactions SET status = 'voided', voided_at = NOW(), updated_at = NOW()
  WHERE id = v_original.id;
  RETURN v_reversal;
END;
$$;

REVOKE ALL ON FUNCTION post_journal_transaction(UUID, DATE, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION reverse_journal_transaction(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_journal_transaction(UUID, DATE, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION reverse_journal_transaction(UUID, TEXT) TO authenticated, service_role;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS payments_business_idempotency_key_idx
  ON payments (business_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_idx
  ON payments (payment_provider, provider_payment_id)
  WHERE payment_provider IS NOT NULL AND provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_invoice_provider_transaction_idx
  ON payments (invoice_id, payment_provider, provider_transaction_id)
  WHERE payment_provider IS NOT NULL AND provider_transaction_id IS NOT NULL;

-- Webhook delivery is at-least-once. Persist and uniquely claim every provider
-- event before applying subscription or invoice side effects.
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_key TEXT NOT NULL,
  event_type TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'received',
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_events_status_check CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  CONSTRAINT webhook_events_provider_key_unique UNIQUE (provider, event_key)
);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS webhook_events_status_created_idx ON webhook_events(status, created_at);

-- Posts the receivable/revenue journal and links it to the invoice in one DB transaction.
CREATE OR REPLACE FUNCTION post_invoice_issuance(
  p_invoice_id UUID,
  p_business_id UUID,
  p_receivable_account_id UUID,
  p_revenue_account_id UUID,
  p_idempotency_key TEXT
)
RETURNS transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice invoices;
  v_transaction transactions;
BEGIN
  IF auth.uid() IS NULL OR NOT is_business_member(p_business_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to issue invoices for this business';
  END IF;

  SELECT * INTO v_invoice FROM invoices
  WHERE id = p_invoice_id AND business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_invoice.transaction_id IS NOT NULL THEN
    SELECT * INTO v_transaction FROM transactions WHERE id = v_invoice.transaction_id;
    RETURN v_transaction;
  END IF;
  IF v_invoice.status <> 'issued' THEN RAISE EXCEPTION 'Only issued invoices can be posted'; END IF;

  SELECT * INTO v_transaction FROM post_journal_transaction(
    p_business_id, v_invoice.issue_date, 'Invoice ' || v_invoice.invoice_number,
    v_invoice.invoice_number, 'invoice',
    jsonb_build_array(
      jsonb_build_object('account_id', p_receivable_account_id, 'debit', v_invoice.total_amount, 'credit', 0, 'note', 'Piutang invoice ' || v_invoice.invoice_number),
      jsonb_build_object('account_id', p_revenue_account_id, 'debit', 0, 'credit', v_invoice.total_amount, 'note', 'Pendapatan invoice ' || v_invoice.invoice_number)
    ),
    p_idempotency_key
  );

  UPDATE invoices SET transaction_id = v_transaction.id, updated_at = NOW() WHERE id = v_invoice.id;
  RETURN v_transaction;
END;
$$;

-- Records an invoice payment, updates the receivable balance, and posts its journal atomically.
CREATE OR REPLACE FUNCTION record_invoice_payment_atomic(
  p_invoice_id UUID,
  p_business_id UUID,
  p_amount NUMERIC,
  p_paid_at TIMESTAMPTZ,
  p_method TEXT,
  p_reference TEXT,
  p_payment_provider TEXT,
  p_provider_payment_id TEXT,
  p_provider_transaction_id TEXT,
  p_provider_status TEXT,
  p_mayar_status TEXT,
  p_payment_account_id UUID,
  p_idempotency_key TEXT
)
RETURNS payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice invoices;
  v_payment payments;
  v_receivable_account_id UUID;
  v_transaction transactions;
  v_next_paid NUMERIC;
BEGIN
  IF auth.uid() IS NULL OR NOT is_business_member(p_business_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to record payments for this business';
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_payment FROM payments
    WHERE business_id = p_business_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_payment; END IF;
  END IF;

  SELECT * INTO v_invoice FROM invoices
  WHERE id = p_invoice_id AND business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_invoice.status NOT IN ('issued', 'paid') THEN RAISE EXCEPTION 'Only issued invoices can receive payments'; END IF;
  IF p_amount > (v_invoice.total_amount - v_invoice.amount_paid) THEN RAISE EXCEPTION 'Payment exceeds invoice balance'; END IF;

  SELECT id INTO v_receivable_account_id FROM accounts
  WHERE business_id = p_business_id AND code = '1-003' AND is_active = true;
  IF v_receivable_account_id IS NULL THEN RAISE EXCEPTION 'Active receivable account is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_payment_account_id AND business_id = p_business_id AND type = 'ASSET' AND is_active = true) THEN
    RAISE EXCEPTION 'Active cash or bank account is required';
  END IF;

  SELECT * INTO v_transaction FROM post_journal_transaction(
    p_business_id, p_paid_at::DATE, 'Pembayaran invoice ' || v_invoice.invoice_number,
    COALESCE(NULLIF(p_reference, ''), v_invoice.invoice_number), 'payment',
    jsonb_build_array(
      jsonb_build_object('account_id', p_payment_account_id, 'debit', p_amount, 'credit', 0, 'note', COALESCE(NULLIF(p_method, ''), 'Pembayaran invoice')),
      jsonb_build_object('account_id', v_receivable_account_id, 'debit', 0, 'credit', p_amount, 'note', 'Pelunasan ' || v_invoice.invoice_number)
    ),
    p_idempotency_key
  );

  INSERT INTO payments (
    business_id, invoice_id, transaction_id, amount, paid_at, method, reference, payment_provider,
    provider_payment_id, provider_transaction_id, provider_status, mayar_status, idempotency_key
  ) VALUES (
    p_business_id, p_invoice_id, v_transaction.id, p_amount, COALESCE(p_paid_at, NOW()), NULLIF(p_method, ''),
    NULLIF(p_reference, ''), NULLIF(p_payment_provider, ''), NULLIF(p_provider_payment_id, ''),
    NULLIF(p_provider_transaction_id, ''), NULLIF(p_provider_status, ''), NULLIF(p_mayar_status, ''), p_idempotency_key
  ) RETURNING * INTO v_payment;

  v_next_paid := v_invoice.amount_paid + p_amount;
  UPDATE invoices
  SET amount_paid = v_next_paid,
      status = CASE WHEN v_next_paid >= v_invoice.total_amount THEN 'paid' ELSE 'issued' END,
      updated_at = NOW()
  WHERE id = v_invoice.id;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION post_invoice_issuance(UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_invoice_payment_atomic(UUID, UUID, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_invoice_issuance(UUID, UUID, UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION record_invoice_payment_atomic(UUID, UUID, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION post_invoice_issuance(UUID, UUID, UUID, UUID, TEXT)
IS 'Atomic invoice issuance: posts receivable/revenue journal and links it to the invoice in one database transaction.';
COMMENT ON FUNCTION record_invoice_payment_atomic(UUID, UUID, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT)
IS 'Atomic receivable settlement: idempotently creates payment, journal entry, and invoice balance update together.';
