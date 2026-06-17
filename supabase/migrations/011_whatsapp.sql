-- ============================================================
-- AKUN.AI - Migration 011: WhatsApp chatbot skeleton
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta',
  whatsapp_phone_number_id TEXT,
  display_phone_number TEXT,
  access_token_hint TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT whatsapp_connections_provider_check CHECK (provider IN ('meta')),
  CONSTRAINT whatsapp_connections_lookup_present_check CHECK (
    whatsapp_phone_number_id IS NOT NULL OR display_phone_number IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES whatsapp_connections(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'meta',
  provider_message_id TEXT,
  direction TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  from_wa_id TEXT,
  to_phone_number_id TEXT,
  body TEXT,
  intent TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  response_body TEXT,
  error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT whatsapp_messages_provider_check CHECK (provider IN ('meta')),
  CONSTRAINT whatsapp_messages_direction_check CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT whatsapp_messages_status_check CHECK (status IN ('received', 'processed', 'ignored', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_connections_phone_number_id_idx
  ON whatsapp_connections(provider, whatsapp_phone_number_id)
  WHERE whatsapp_phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_connections_business_idx
  ON whatsapp_connections(business_id, is_active);

CREATE INDEX IF NOT EXISTS whatsapp_connections_display_phone_idx
  ON whatsapp_connections(provider, display_phone_number)
  WHERE display_phone_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_provider_message_idx
  ON whatsapp_messages(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_messages_business_created_idx
  ON whatsapp_messages(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_messages_from_created_idx
  ON whatsapp_messages(from_wa_id, created_at DESC)
  WHERE from_wa_id IS NOT NULL;

ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_connections_member_select" ON whatsapp_connections;
DROP POLICY IF EXISTS "whatsapp_connections_admin_insert" ON whatsapp_connections;
DROP POLICY IF EXISTS "whatsapp_connections_admin_update" ON whatsapp_connections;
DROP POLICY IF EXISTS "whatsapp_connections_admin_delete" ON whatsapp_connections;

CREATE POLICY "whatsapp_connections_member_select" ON whatsapp_connections
  FOR SELECT USING (is_business_member(business_id));
CREATE POLICY "whatsapp_connections_admin_insert" ON whatsapp_connections
  FOR INSERT WITH CHECK (is_business_admin(business_id));
CREATE POLICY "whatsapp_connections_admin_update" ON whatsapp_connections
  FOR UPDATE USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
CREATE POLICY "whatsapp_connections_admin_delete" ON whatsapp_connections
  FOR DELETE USING (is_business_admin(business_id));

DROP POLICY IF EXISTS "whatsapp_messages_member_select" ON whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_admin_insert" ON whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_admin_update" ON whatsapp_messages;

CREATE POLICY "whatsapp_messages_member_select" ON whatsapp_messages
  FOR SELECT USING (business_id IS NOT NULL AND is_business_member(business_id));
CREATE POLICY "whatsapp_messages_admin_insert" ON whatsapp_messages
  FOR INSERT WITH CHECK (business_id IS NOT NULL AND is_business_admin(business_id));
CREATE POLICY "whatsapp_messages_admin_update" ON whatsapp_messages
  FOR UPDATE USING (business_id IS NOT NULL AND is_business_admin(business_id))
  WITH CHECK (business_id IS NOT NULL AND is_business_admin(business_id));

COMMENT ON TABLE whatsapp_connections
IS 'Per-business WhatsApp Cloud API connection metadata. Secrets stay in environment variables, not in this table.';

COMMENT ON COLUMN whatsapp_connections.whatsapp_phone_number_id
IS 'Meta WhatsApp phone_number_id from webhook metadata, used to map inbound webhooks to a business.';

COMMENT ON COLUMN whatsapp_connections.access_token_hint
IS 'Optional non-secret label for the token source. Do not store WHATSAPP_ACCESS_TOKEN here.';

COMMENT ON TABLE whatsapp_messages
IS 'Inbound/outbound WhatsApp message audit log. Webhook processing dispatches to fixed internal tools and does not store SQL.';

COMMENT ON COLUMN whatsapp_messages.intent
IS 'Rule-based intent selected by the WhatsApp dispatcher, for example ask_cash_summary or ask_sales_summary.';

COMMENT ON COLUMN whatsapp_messages.payload
IS 'Trimmed provider payload context for troubleshooting. Avoid storing long-lived secrets or raw access tokens.';

