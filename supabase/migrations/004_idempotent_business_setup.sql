-- ============================================================
-- AKUN.AI - Migration 004: Idempotent business setup helpers
-- Run AFTER 003_admin_system.sql
-- ============================================================

CREATE OR REPLACE FUNCTION create_default_accounts(p_business_id UUID)
RETURNS void AS $$
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
