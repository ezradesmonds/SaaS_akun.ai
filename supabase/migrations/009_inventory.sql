-- ============================================================
-- AKUN.AI - Migration 009: Minimal inventory management
-- Run AFTER 007_mayar_billing.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- INVENTORY LOCATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  code        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT inventory_locations_name_present CHECK (length(trim(name)) > 0),
  CONSTRAINT inventory_locations_code_present CHECK (code IS NULL OR length(trim(code)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_business_name_idx
  ON inventory_locations(business_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_business_code_idx
  ON inventory_locations(business_id, lower(code))
  WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_locations_business_active_idx
  ON inventory_locations(business_id, is_active);

COMMENT ON TABLE inventory_locations
IS 'Per-business inventory storage locations such as toko, gudang, or display rack.';
COMMENT ON COLUMN inventory_locations.business_id
IS 'Tenant boundary. All inventory rows are scoped to one business.';

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sku                 TEXT,
  name                TEXT NOT NULL,
  description         TEXT,
  unit                TEXT NOT NULL DEFAULT 'pcs',
  low_stock_threshold NUMERIC(20, 4) NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT products_name_present CHECK (length(trim(name)) > 0),
  CONSTRAINT products_sku_present CHECK (sku IS NULL OR length(trim(sku)) > 0),
  CONSTRAINT products_unit_present CHECK (length(trim(unit)) > 0),
  CONSTRAINT products_low_stock_non_negative CHECK (low_stock_threshold >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS products_business_sku_idx
  ON products(business_id, lower(sku))
  WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_business_name_idx
  ON products(business_id, lower(name));
CREATE INDEX IF NOT EXISTS products_business_active_idx
  ON products(business_id, is_active);

COMMENT ON TABLE products
IS 'Products tracked for stock. Current stock is derived from stock_movements, not stored here.';
COMMENT ON COLUMN products.low_stock_threshold
IS 'Alert threshold per product. A product is low when derived current_stock is <= this value.';

-- ============================================================
-- STOCK MOVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID REFERENCES inventory_locations(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL,
  quantity_delta NUMERIC(20, 4) NOT NULL,
  unit_cost   NUMERIC(20, 2),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference   TEXT,
  note        TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT stock_movements_type_check
    CHECK (movement_type IN ('initial', 'purchase', 'sale', 'adjustment', 'transfer')),
  CONSTRAINT stock_movements_quantity_non_zero CHECK (quantity_delta <> 0),
  CONSTRAINT stock_movements_unit_cost_non_negative CHECK (unit_cost IS NULL OR unit_cost >= 0),
  CONSTRAINT stock_movements_reference_length CHECK (reference IS NULL OR length(trim(reference)) > 0)
);

CREATE INDEX IF NOT EXISTS stock_movements_business_occurred_idx
  ON stock_movements(business_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx
  ON stock_movements(product_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_location_idx
  ON stock_movements(location_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_business_product_location_idx
  ON stock_movements(business_id, product_id, location_id);

COMMENT ON TABLE stock_movements
IS 'Inventory ledger. Each row changes stock by quantity_delta; positive adds stock, negative removes stock.';
COMMENT ON COLUMN stock_movements.quantity_delta
IS 'Signed stock change. Current stock is SUM(quantity_delta) by product and optionally location.';

-- ============================================================
-- INTEGRITY HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION validate_stock_movement_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product_business UUID;
  v_location_business UUID;
BEGIN
  SELECT business_id INTO v_product_business
  FROM products
  WHERE id = NEW.product_id;

  IF v_product_business IS NULL OR v_product_business <> NEW.business_id THEN
    RAISE EXCEPTION 'Stock movement product must belong to the same business';
  END IF;

  IF NEW.location_id IS NOT NULL THEN
    SELECT business_id INTO v_location_business
    FROM inventory_locations
    WHERE id = NEW.location_id;

    IF v_location_business IS NULL OR v_location_business <> NEW.business_id THEN
      RAISE EXCEPTION 'Stock movement location must belong to the same business';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_stock_movement_tenant()
IS 'Inventory integrity: product, location, and movement rows must stay inside the same business tenant.';

DROP TRIGGER IF EXISTS stock_movements_tenant_check ON stock_movements;
CREATE TRIGGER stock_movements_tenant_check
BEFORE INSERT OR UPDATE ON stock_movements
FOR EACH ROW
EXECUTE FUNCTION validate_stock_movement_tenant();

CREATE OR REPLACE FUNCTION touch_inventory_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_locations_touch_updated_at ON inventory_locations;
CREATE TRIGGER inventory_locations_touch_updated_at
BEFORE UPDATE ON inventory_locations
FOR EACH ROW
EXECUTE FUNCTION touch_inventory_updated_at();

DROP TRIGGER IF EXISTS products_touch_updated_at ON products;
CREATE TRIGGER products_touch_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION touch_inventory_updated_at();

DROP TRIGGER IF EXISTS stock_movements_touch_updated_at ON stock_movements;
CREATE TRIGGER stock_movements_touch_updated_at
BEFORE UPDATE ON stock_movements
FOR EACH ROW
EXECUTE FUNCTION touch_inventory_updated_at();

-- ============================================================
-- VIEWS: current stock and derived alerts
-- ============================================================
CREATE OR REPLACE VIEW product_stock_levels WITH (security_invoker = true) AS
SELECT
  p.id AS product_id,
  p.business_id,
  p.sku,
  p.name,
  p.unit,
  p.low_stock_threshold,
  COALESCE(SUM(sm.quantity_delta), 0) AS current_stock,
  MAX(sm.occurred_at) AS last_movement_at
FROM products p
LEFT JOIN stock_movements sm ON sm.product_id = p.id
GROUP BY p.id, p.business_id, p.sku, p.name, p.unit, p.low_stock_threshold;

COMMENT ON VIEW product_stock_levels
IS 'Derived product stock. Queryable in real time from stock_movements without a stored counter.';

CREATE OR REPLACE VIEW low_stock_alerts WITH (security_invoker = true) AS
SELECT
  product_id,
  business_id,
  sku,
  name,
  unit,
  current_stock,
  low_stock_threshold,
  last_movement_at,
  (current_stock <= low_stock_threshold) AS is_low_stock
FROM product_stock_levels
WHERE current_stock <= low_stock_threshold;

COMMENT ON VIEW low_stock_alerts
IS 'Derived low-stock alerts. A row appears when current_stock is at or below the product threshold.';

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_locations_member_select" ON inventory_locations;
DROP POLICY IF EXISTS "inventory_locations_member_insert" ON inventory_locations;
DROP POLICY IF EXISTS "inventory_locations_member_update" ON inventory_locations;
DROP POLICY IF EXISTS "inventory_locations_admin_delete" ON inventory_locations;

CREATE POLICY "inventory_locations_member_select" ON inventory_locations
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "inventory_locations_member_insert" ON inventory_locations
  FOR INSERT WITH CHECK (is_business_member(business_id));
CREATE POLICY "inventory_locations_member_update" ON inventory_locations
  FOR UPDATE USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "inventory_locations_admin_delete" ON inventory_locations
  FOR DELETE USING (is_business_admin(business_id));

DROP POLICY IF EXISTS "products_member_select" ON products;
DROP POLICY IF EXISTS "products_member_insert" ON products;
DROP POLICY IF EXISTS "products_member_update" ON products;
DROP POLICY IF EXISTS "products_admin_delete" ON products;

CREATE POLICY "products_member_select" ON products
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "products_member_insert" ON products
  FOR INSERT WITH CHECK (is_business_member(business_id));
CREATE POLICY "products_member_update" ON products
  FOR UPDATE USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "products_admin_delete" ON products
  FOR DELETE USING (is_business_admin(business_id));

DROP POLICY IF EXISTS "stock_movements_member_select" ON stock_movements;
DROP POLICY IF EXISTS "stock_movements_member_insert" ON stock_movements;
DROP POLICY IF EXISTS "stock_movements_member_update" ON stock_movements;
DROP POLICY IF EXISTS "stock_movements_admin_delete" ON stock_movements;

CREATE POLICY "stock_movements_member_select" ON stock_movements
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "stock_movements_member_insert" ON stock_movements
  FOR INSERT WITH CHECK (is_business_member(business_id));
CREATE POLICY "stock_movements_member_update" ON stock_movements
  FOR UPDATE USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
CREATE POLICY "stock_movements_admin_delete" ON stock_movements
  FOR DELETE USING (is_business_admin(business_id));
