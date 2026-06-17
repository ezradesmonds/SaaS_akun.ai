type BusinessMapping = Record<string, string>

function normalizePhone(value?: string | null) {
  return (value || '').replace(/[^\d]/g, '')
}

function parseJsonMapping(value?: string) {
  if (!value) return {}

  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.entries(parsed as Record<string, unknown>).reduce<BusinessMapping>((acc, [key, businessId]) => {
      if (typeof businessId === 'string' && businessId.trim()) {
        acc[key] = businessId.trim()

        const normalizedKey = normalizePhone(key)
        if (normalizedKey) acc[normalizedKey] = businessId.trim()
      }
      return acc
    }, {})
  } catch {
    return {}
  }
}

function parsePairMapping(value?: string) {
  if (!value) return {}
  if (value.trim().startsWith('{')) return {}

  return value.split(',').reduce<BusinessMapping>((acc, pair) => {
    const [rawKey, rawBusinessId] = pair.split(':')
    const key = rawKey?.trim()
    const businessId = rawBusinessId?.trim()

    if (key && businessId) {
      acc[key] = businessId

      const normalizedKey = normalizePhone(key)
      if (normalizedKey) acc[normalizedKey] = businessId
    }

    return acc
  }, {})
}

export function getWhatsAppConfig() {
  const businessMap = {
    ...parseJsonMapping(process.env.WHATSAPP_BUSINESS_MAP),
    ...parsePairMapping(process.env.WHATSAPP_BUSINESS_MAP),
    ...parseJsonMapping(process.env.WHATSAPP_PHONE_BUSINESS_MAP),
    ...parsePairMapping(process.env.WHATSAPP_PHONE_BUSINESS_MAP),
  }

  return {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessMap,
  }
}

export function hasSupabaseAdminConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function resolveBusinessIdFromConfig(keys: Array<string | null | undefined>) {
  const { businessMap } = getWhatsAppConfig()

  for (const key of keys) {
    if (!key) continue

    const exact = businessMap[key]
    if (exact) return exact

    const normalized = normalizePhone(key)
    if (normalized && businessMap[normalized]) return businessMap[normalized]
  }

  return null
}
