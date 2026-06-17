-- ============================================================
-- AKUN.AI - Migration 012: Review hardening
-- Run AFTER 011_whatsapp.sql. Fresh installs should apply all
-- migrations in numeric order so early extension setup is present.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Replaces earlier transaction-line balance triggers and includes DELETE.
-- Routes that delete/reinsert lines should use replace_transaction_lines()
-- so the temporary unbalanced state remains inside one database transaction.
CREATE OR REPLACE FUNCTION validate_transaction_is_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_transaction_exists BOOLEAN;
  v_total_debit NUMERIC;
  v_total_credit NUMERIC;
  v_line_count INT;
BEGIN
  v_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  SELECT EXISTS (
    SELECT 1
    FROM transactions
    WHERE id = v_transaction_id
  ) INTO v_transaction_exists;

  IF NOT v_transaction_exists THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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
IS 'Accounting integrity: deferred trigger requiring every surviving journal entry to have at least two lines and equal debit/credit totals after insert, update, or delete.';

DROP TRIGGER IF EXISTS transaction_lines_balance_after_insert_update ON transaction_lines;
DROP TRIGGER IF EXISTS transaction_lines_balance_after_write ON transaction_lines;

CREATE CONSTRAINT TRIGGER transaction_lines_balance_after_write
AFTER INSERT OR UPDATE OR DELETE ON transaction_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_transaction_is_balanced();

CREATE OR REPLACE FUNCTION replace_transaction_lines(
  p_transaction_id UUID,
  p_lines JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
BEGIN
  IF jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'Transaction lines payload must be a JSON array';
  END IF;

  SELECT business_id INTO v_business_id
  FROM transactions
  WHERE id = p_transaction_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Transaction % does not exist', p_transaction_id;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT is_business_member(v_business_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to replace transaction lines for this business';
  END IF;

  DELETE FROM transaction_lines
  WHERE transaction_id = p_transaction_id;

  INSERT INTO transaction_lines (
    transaction_id,
    account_id,
    debit,
    credit,
    note
  )
  SELECT
    p_transaction_id,
    (line_item->>'account_id')::UUID,
    COALESCE((line_item->>'debit')::NUMERIC, 0),
    COALESCE((line_item->>'credit')::NUMERIC, 0),
    NULLIF(line_item->>'note', '')
  FROM jsonb_array_elements(p_lines) AS line_item;
END;
$$;

COMMENT ON FUNCTION replace_transaction_lines(UUID, JSONB)
IS 'Atomically replaces all transaction lines for one transaction; use this for edit flows that would otherwise delete then reinsert lines across separate statements.';

CREATE OR REPLACE FUNCTION validate_invoice_item_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_invoice_business UUID;
BEGIN
  SELECT business_id INTO v_invoice_business
  FROM invoices
  WHERE id = NEW.invoice_id;

  IF v_invoice_business IS NULL OR v_invoice_business <> NEW.business_id THEN
    RAISE EXCEPTION 'Invoice item invoice must belong to the same business';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_invoice_item_business()
IS 'Tenant integrity: prevents invoice items from referencing invoices owned by another business.';

DROP TRIGGER IF EXISTS invoice_items_invoice_business ON invoice_items;
CREATE TRIGGER invoice_items_invoice_business
BEFORE INSERT OR UPDATE ON invoice_items
FOR EACH ROW
EXECUTE FUNCTION validate_invoice_item_business();

CREATE OR REPLACE FUNCTION validate_payment_invoice_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_invoice_business UUID;
BEGIN
  SELECT business_id INTO v_invoice_business
  FROM invoices
  WHERE id = NEW.invoice_id;

  IF v_invoice_business IS NULL OR v_invoice_business <> NEW.business_id THEN
    RAISE EXCEPTION 'Payment invoice must belong to the same business';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_payment_invoice_business()
IS 'Tenant integrity: prevents payments from referencing invoices owned by another business.';

DROP TRIGGER IF EXISTS payments_invoice_business ON payments;
CREATE TRIGGER payments_invoice_business
BEFORE INSERT OR UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION validate_payment_invoice_business();

CREATE OR REPLACE FUNCTION validate_receivable_reminder_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_invoice_business UUID;
BEGIN
  SELECT business_id INTO v_invoice_business
  FROM invoices
  WHERE id = NEW.invoice_id;

  IF v_invoice_business IS NULL OR v_invoice_business <> NEW.business_id THEN
    RAISE EXCEPTION 'Receivable reminder invoice must belong to the same business';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_receivable_reminder_business()
IS 'Tenant integrity: prevents receivable reminders from referencing invoices owned by another business.';

DROP TRIGGER IF EXISTS receivable_reminders_invoice_business ON receivable_reminders;
CREATE TRIGGER receivable_reminders_invoice_business
BEFORE INSERT OR UPDATE ON receivable_reminders
FOR EACH ROW
EXECUTE FUNCTION validate_receivable_reminder_business();

CREATE OR REPLACE FUNCTION validate_tax_report_profile_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tax_profile_business UUID;
BEGIN
  IF NEW.tax_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT business_id INTO v_tax_profile_business
  FROM tax_profiles
  WHERE id = NEW.tax_profile_id;

  IF v_tax_profile_business IS NULL OR v_tax_profile_business <> NEW.business_id THEN
    RAISE EXCEPTION 'Tax report profile must belong to the same business';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_tax_report_profile_business()
IS 'Tenant integrity: prevents tax reports from referencing tax profiles owned by another business.';

DROP TRIGGER IF EXISTS tax_reports_profile_business ON tax_reports;
CREATE TRIGGER tax_reports_profile_business
BEFORE INSERT OR UPDATE ON tax_reports
FOR EACH ROW
EXECUTE FUNCTION validate_tax_report_profile_business();

CREATE OR REPLACE FUNCTION validate_import_job_connection_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_connection_business UUID;
BEGIN
  IF NEW.integration_connection_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT business_id INTO v_connection_business
  FROM integration_connections
  WHERE id = NEW.integration_connection_id;

  IF v_connection_business IS NULL OR v_connection_business <> NEW.business_id THEN
    RAISE EXCEPTION 'Import job connection must belong to the same business';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_import_job_connection_business()
IS 'Tenant integrity: prevents import jobs from referencing integration connections owned by another business.';

DROP TRIGGER IF EXISTS import_jobs_connection_business ON import_jobs;
CREATE TRIGGER import_jobs_connection_business
BEFORE INSERT OR UPDATE ON import_jobs
FOR EACH ROW
EXECUTE FUNCTION validate_import_job_connection_business();

COMMENT ON FUNCTION validate_invoice_customer_business()
IS 'Tenant integrity: prevents invoices from referencing customers owned by another business.';
