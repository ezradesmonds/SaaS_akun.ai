import type { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessIdFromConfig } from '@/lib/whatsapp/config'
import type { WhatsAppTextMessage } from '@/lib/whatsapp/payload'

type AdminSupabase = ReturnType<typeof createAdminClient>

type ResolvedBusiness = {
  businessId: string
  connectionId?: string
  source: 'env' | 'connection'
}

export async function resolveBusinessForMessage(
  supabase: AdminSupabase,
  message: WhatsAppTextMessage,
): Promise<ResolvedBusiness | null> {
  const envBusinessId = resolveBusinessIdFromConfig([
    message.phoneNumberId,
    message.displayPhoneNumber,
    message.from,
  ])

  if (envBusinessId) {
    return { businessId: envBusinessId, source: 'env' }
  }

  const filters = [
    message.phoneNumberId ? `whatsapp_phone_number_id.eq.${message.phoneNumberId}` : null,
    message.displayPhoneNumber ? `display_phone_number.eq.${message.displayPhoneNumber}` : null,
  ].filter(Boolean)

  if (filters.length === 0) return null

  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('id, business_id')
    .eq('provider', 'meta')
    .eq('is_active', true)
    .or(filters.join(','))
    .maybeSingle()

  if (error) {
    console.error('WhatsApp business resolver error:', error)
    return null
  }

  if (!data?.business_id) return null

  return {
    businessId: data.business_id as string,
    connectionId: data.id as string,
    source: 'connection',
  }
}

