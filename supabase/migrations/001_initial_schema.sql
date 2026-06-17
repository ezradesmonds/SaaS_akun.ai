-- ============================================================
-- AKUN.AI - Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- BUSINESSES (Multi-tenant core)
-- ============================================================
CREATE TABLE businesses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'umkm', -- umkm | freelancer | toko | jasa
  currency    TEXT NOT NULL DEFAULT 'IDR',
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CHART OF ACCOUNTS
-- ============================================================
CREATE TABLE accounts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL, -- ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Unique code per business
CREATE UNIQUE INDEX accounts_business_code_idx ON accounts(business_id, code);

-- ============================================================
-- TRANSACTIONS (Journal Entries)
-- ============================================================
CREATE TABLE transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  reference   TEXT, -- no. referensi/invoice
  source      TEXT NOT NULL DEFAULT 'manual', -- manual | ai | import
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRANSACTION LINES (Double-entry bookkeeping)
-- ============================================================
CREATE TABLE transaction_lines (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id),
  debit          DECIMAL(20, 2) NOT NULL DEFAULT 0,
  credit         DECIMAL(20, 2) NOT NULL DEFAULT 0,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: either debit or credit must be > 0, not both
  CONSTRAINT debit_or_credit CHECK (
    (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
  )
);

-- ============================================================
-- CHAT SESSIONS & MESSAGES
-- ============================================================
CREATE TABLE chat_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  title       TEXT DEFAULT 'Chat Baru',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role            TEXT NOT NULL, -- user | assistant
  content         TEXT NOT NULL,
  tool_calls      JSONB, -- store tool call data from LLM
  transaction_id  UUID REFERENCES transactions(id), -- linked transaction if created
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (Multi-tenant safety)
-- ============================================================
ALTER TABLE businesses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages     ENABLE ROW LEVEL SECURITY;

-- Businesses: user only sees their own
CREATE POLICY "businesses_owner" ON businesses
  FOR ALL USING (auth.uid() = user_id);

-- Accounts: via business ownership
CREATE POLICY "accounts_via_business" ON accounts
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
    )
  );

-- Transactions: via business ownership
CREATE POLICY "transactions_via_business" ON transactions
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
    )
  );

-- Transaction lines: via transaction → business
CREATE POLICY "lines_via_transaction" ON transaction_lines
  FOR ALL USING (
    transaction_id IN (
      SELECT t.id FROM transactions t
      JOIN businesses b ON b.id = t.business_id
      WHERE b.user_id = auth.uid()
    )
  );

-- Chat sessions
CREATE POLICY "chat_sessions_owner" ON chat_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Chat messages: via session ownership
CREATE POLICY "chat_messages_via_session" ON chat_messages
  FOR ALL USING (
    session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- FUNCTION: Auto-create default Chart of Accounts
-- Called after new business is created
-- ============================================================
CREATE OR REPLACE FUNCTION create_default_accounts(p_business_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO accounts (business_id, code, name, type) VALUES
    -- ASET
    (p_business_id, '1-001', 'Kas',                     'ASSET'),
    (p_business_id, '1-002', 'Bank',                    'ASSET'),
    (p_business_id, '1-003', 'Piutang Usaha',           'ASSET'),
    (p_business_id, '1-004', 'Persediaan Barang',       'ASSET'),
    (p_business_id, '1-005', 'Perlengkapan Kantor',     'ASSET'),
    (p_business_id, '1-006', 'Peralatan',               'ASSET'),
    -- KEWAJIBAN
    (p_business_id, '2-001', 'Hutang Usaha',            'LIABILITY'),
    (p_business_id, '2-002', 'Hutang Bank',             'LIABILITY'),
    -- EKUITAS
    (p_business_id, '3-001', 'Modal Pemilik',           'EQUITY'),
    (p_business_id, '3-002', 'Laba Ditahan',            'EQUITY'),
    -- PENDAPATAN
    (p_business_id, '4-001', 'Pendapatan Penjualan',    'REVENUE'),
    (p_business_id, '4-002', 'Pendapatan Jasa',         'REVENUE'),
    (p_business_id, '4-003', 'Pendapatan Lain-lain',    'REVENUE'),
    -- BEBAN
    (p_business_id, '5-001', 'Beban Pembelian',         'EXPENSE'),
    (p_business_id, '5-002', 'Beban Gaji',              'EXPENSE'),
    (p_business_id, '5-003', 'Beban Sewa',              'EXPENSE'),
    (p_business_id, '5-004', 'Beban Listrik & Air',     'EXPENSE'),
    (p_business_id, '5-005', 'Beban Transportasi',      'EXPENSE'),
    (p_business_id, '5-006', 'Beban Pemasaran',         'EXPENSE'),
    (p_business_id, '5-007', 'Beban Perlengkapan',      'EXPENSE'),
    (p_business_id, '5-008', 'Beban Lain-lain',         'EXPENSE');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- VIEWS: Useful for reports
-- ============================================================

-- Account balances view
CREATE OR REPLACE VIEW account_balances AS
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

-- Monthly summary view
CREATE OR REPLACE VIEW monthly_summary AS
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
