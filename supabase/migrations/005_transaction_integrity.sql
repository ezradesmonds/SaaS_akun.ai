-- ============================================================
-- AKUN.AI - Migration 005: Transaction accounting integrity
-- Run AFTER 004_idempotent_business_setup.sql
-- ============================================================

ALTER TABLE transaction_lines
  DROP CONSTRAINT IF EXISTS debit_or_credit;

ALTER TABLE transaction_lines
  ADD CONSTRAINT debit_or_credit CHECK (
    (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
  );

CREATE OR REPLACE FUNCTION validate_transaction_is_balanced()
RETURNS TRIGGER AS $$
DECLARE
  v_transaction_id UUID;
  v_total_debit NUMERIC;
  v_total_credit NUMERIC;
BEGIN
  v_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  SELECT
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
  INTO v_total_debit, v_total_credit
  FROM transaction_lines
  WHERE transaction_id = v_transaction_id;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Transaction % is not balanced: debit %, credit %',
      v_transaction_id, v_total_debit, v_total_credit;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS transaction_lines_balance_after_insert_update ON transaction_lines;

CREATE CONSTRAINT TRIGGER transaction_lines_balance_after_insert_update
AFTER INSERT OR UPDATE ON transaction_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_transaction_is_balanced();
