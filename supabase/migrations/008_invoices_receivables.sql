-- ============================================================
-- AKUN.AI - Migration 008: Customers, invoices, and receivables
-- Run AFTER 007_mayar_billing.sql
-- ============================================================

CREATE TABLE customers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code        TEXT,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  address     TEXT,
  city        TEXT,
  province    TEXT,
  postal_code TEXT,
  npwp        TEXT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT customers_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT customers_email_shape CHECK (email IS NULL OR position('@' in email) > 1)
);

CREATE UNIQUE INDEX customers_business_code_idx
  ON customers(business_id, lower(code))
  WHERE code IS NOT NULL;
CREATE INDEX customers_business_name_idx ON customers(business_id, lower(name));
CREATE INDEX customers_business_active_idx ON customers(business_id, is_active);

CREATE TABLE invoices (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date   DATE,
  status     TEXT NOT NULL DEFAULT 'draft',
  currency   TEXT NOT NULL DEFAULT 'IDR',
  subtotal_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
  ppn_rate   NUMERIC(5, 4) NOT NULL DEFAULT 0,
  ppn_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(20, 2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(20, 2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  notes TEXT,
  terms TEXT,

  -- Provider-neutral payment references. Mayar fields are optional operational
  -- metadata for Indonesian checkout flows, not subscription billing fields.
  payment_provider TEXT,
  provider_invoice_id TEXT,
  provider_transaction_id TEXT,
  provider_checkout_url TEXT,
  provider_payment_status TEXT,
  mayar_checkout_url TEXT,
  mayar_status TEXT,

  -- e-Faktur metadata only. This module does not claim full e-Faktur compliance.
  npwp TEXT,
  tax_invoice_number TEXT,
  tax_invoice_status TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT invoices_status_check CHECK (status IN ('draft', 'issued', 'paid', 'void')),
  CONSTRAINT invoices_currency_check CHECK (currency IN ('IDR')),
  CONSTRAINT invoices_amounts_non_negative CHECK (
    subtotal_amount >= 0
    AND discount_amount >= 0
    AND ppn_rate >= 0
    AND ppn_amount >= 0
    AND total_amount >= 0
    AND amount_paid >= 0
    AND amount_paid <= total_amount
  ),
  CONSTRAINT invoices_due_after_issue CHECK (due_date IS NULL OR due_date >= issue_date),
  CONSTRAINT invoices_number_not_blank CHECK (length(trim(invoice_number)) > 0)
);

CREATE UNIQUE INDEX invoices_business_number_idx ON invoices(business_id, lower(invoice_number));
CREATE INDEX invoices_business_status_idx ON invoices(business_id, status);
CREATE INDEX invoices_business_due_idx ON invoices(business_id, due_date) WHERE status IN ('issued', 'paid');
CREATE INDEX invoices_customer_idx ON invoices(customer_id);
CREATE INDEX invoices_provider_invoice_idx ON invoices(provider_invoice_id) WHERE provider_invoice_id IS NOT NULL;
CREATE INDEX invoices_provider_transaction_idx ON invoices(provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

CREATE TABLE invoice_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity    NUMERIC(20, 4) NOT NULL DEFAULT 1,
  unit_price  NUMERIC(20, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
  line_total  NUMERIC(20, 2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT invoice_items_description_not_blank CHECK (length(trim(description)) > 0),
  CONSTRAINT invoice_items_amounts_check CHECK (
    quantity > 0
    AND unit_price >= 0
    AND discount_amount >= 0
    AND line_total >= 0
  )
);

CREATE INDEX invoice_items_invoice_idx ON invoice_items(invoice_id);
CREATE INDEX invoice_items_business_idx ON invoice_items(business_id);

CREATE TABLE payments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  amount      NUMERIC(20, 2) NOT NULL,
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method      TEXT,
  reference   TEXT,
  notes       TEXT,
  payment_provider TEXT,
  provider_payment_id TEXT,
  provider_transaction_id TEXT,
  provider_status TEXT,
  mayar_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT payments_amount_positive CHECK (amount > 0)
);

CREATE INDEX payments_invoice_paid_idx ON payments(invoice_id, paid_at DESC);
CREATE INDEX payments_business_paid_idx ON payments(business_id, paid_at DESC);
CREATE INDEX payments_provider_transaction_idx ON payments(provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

CREATE TABLE receivable_reminders (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  remind_at   TIMESTAMPTZ NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'manual',
  status      TEXT NOT NULL DEFAULT 'scheduled',
  message     TEXT,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT receivable_reminders_channel_check CHECK (channel IN ('manual', 'email', 'whatsapp')),
  CONSTRAINT receivable_reminders_status_check CHECK (status IN ('scheduled', 'sent', 'dismissed'))
);

CREATE INDEX receivable_reminders_business_status_idx ON receivable_reminders(business_id, status, remind_at);
CREATE INDEX receivable_reminders_invoice_idx ON receivable_reminders(invoice_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE receivable_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_member_select" ON customers
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "customers_member_insert" ON customers
  FOR INSERT WITH CHECK (is_business_member(business_id));
CREATE POLICY "customers_member_update" ON customers
  FOR UPDATE USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "customers_admin_delete" ON customers
  FOR DELETE USING (is_business_admin(business_id));

CREATE POLICY "invoices_member_select" ON invoices
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "invoices_member_insert" ON invoices
  FOR INSERT WITH CHECK (is_business_member(business_id));
CREATE POLICY "invoices_member_update" ON invoices
  FOR UPDATE USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "invoices_admin_delete" ON invoices
  FOR DELETE USING (is_business_admin(business_id));

CREATE POLICY "invoice_items_member_select" ON invoice_items
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "invoice_items_member_insert" ON invoice_items
  FOR INSERT WITH CHECK (
    is_business_member(business_id)
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_id
        AND i.business_id = invoice_items.business_id
    )
  );
CREATE POLICY "invoice_items_member_update" ON invoice_items
  FOR UPDATE USING (is_business_member(business_id))
  WITH CHECK (
    is_business_member(business_id)
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_id
        AND i.business_id = invoice_items.business_id
    )
  );
CREATE POLICY "invoice_items_member_delete" ON invoice_items
  FOR DELETE USING (is_business_member(business_id));

CREATE POLICY "payments_member_select" ON payments
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "payments_member_insert" ON payments
  FOR INSERT WITH CHECK (
    is_business_member(business_id)
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_id
        AND i.business_id = payments.business_id
    )
  );
CREATE POLICY "payments_member_update" ON payments
  FOR UPDATE USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "payments_admin_delete" ON payments
  FOR DELETE USING (is_business_admin(business_id));

CREATE POLICY "receivable_reminders_member_select" ON receivable_reminders
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "receivable_reminders_member_insert" ON receivable_reminders
  FOR INSERT WITH CHECK (
    is_business_member(business_id)
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_id
        AND i.business_id = receivable_reminders.business_id
    )
  );
CREATE POLICY "receivable_reminders_member_update" ON receivable_reminders
  FOR UPDATE USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "receivable_reminders_admin_delete" ON receivable_reminders
  FOR DELETE USING (is_business_admin(business_id));

CREATE OR REPLACE FUNCTION validate_invoice_customer_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_customer_business UUID;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT business_id INTO v_customer_business
  FROM customers
  WHERE id = NEW.customer_id;

  IF v_customer_business IS NULL OR v_customer_business <> NEW.business_id THEN
    RAISE EXCEPTION 'Invoice customer must belong to the same business';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_customer_business
BEFORE INSERT OR UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION validate_invoice_customer_business();

COMMENT ON TABLE customers IS 'Tenant-scoped customer directory for Indonesian UMKM invoicing.';
COMMENT ON TABLE invoices IS 'Customer invoices and receivable balances. e-Faktur fields are metadata only, not a full tax filing integration.';
COMMENT ON TABLE invoice_items IS 'Line items attached to customer invoices.';
COMMENT ON TABLE payments IS 'Receipts against invoices with provider-neutral and optional Mayar payment references.';
COMMENT ON TABLE receivable_reminders IS 'Manual or scheduled receivable follow-up reminders.';
COMMENT ON COLUMN invoices.npwp IS 'Customer NPWP metadata copied onto the invoice; not a full e-Faktur compliance workflow.';
COMMENT ON COLUMN invoices.tax_invoice_number IS 'Optional e-Faktur tax invoice number metadata.';
COMMENT ON COLUMN invoices.tax_invoice_status IS 'Optional e-Faktur metadata status such as draft/requested/issued.';
COMMENT ON COLUMN invoices.mayar_checkout_url IS 'Optional Mayar checkout URL for this receivable invoice, separate from SaaS subscription billing.';
COMMENT ON COLUMN invoices.mayar_status IS 'Optional Mayar invoice/payment status metadata for this receivable invoice.';
