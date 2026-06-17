import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { AUTH_ERRORS, getAuthContext } from '@/lib/permissions/guard'

const Providers = ['tokopedia', 'shopee', 'lazada', 'mayar', 'manual_csv'] as const
const Statuses = ['disconnected', 'pending', 'connected', 'disabled'] as const

const NonSecretConfigSchema = z.record(z.unknown()).optional().default({})

const CreateSchema = z.object({
  business_id: z.string().uuid(),
  provider: z.enum(Providers),
  display_name: z.string().trim().min(1).max(120),
  status: z.enum(Statuses).optional().default('pending'),
  non_secret_config: NonSecretConfigSchema,
})

const UpdateSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  display_name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(Statuses).optional(),
  non_secret_config: NonSecretConfigSchema,
})

const SECRET_KEY_PATTERN = /(secret|token|password|passwd|api[_-]?key|access[_-]?key|refresh|credential|private)/i

function hasSecretLikeField(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false

  for (const [key, nestedValue] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) return true
    if (hasSecretLikeField(nestedValue)) return true
  }

  return false
}

function providerSourceType(provider: typeof Providers[number]) {
  if (provider === 'manual_csv') return 'manual_csv'
  if (provider === 'mayar') return 'payment_gateway_stub'
  return 'marketplace_stub'
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get('business_id')
  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })

  const supabase = createClient()
  const { data, error } = await supabase
    .from('integration_connections')
    .select('id, business_id, provider, display_name, status, non_secret_config, last_sync_at, secret_handling_note, created_at, updated_at')
    .eq('business_id', ctx.businessId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data || [],
    supported_providers: Providers,
    caveat: 'External provider API calls and encrypted secret storage are not implemented yet. Store non-secret metadata only.',
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  if (hasSecretLikeField(parsed.data.non_secret_config)) {
    return NextResponse.json({
      error: 'Secret-like fields are not supported yet. Store tokens, API keys, passwords, and credentials outside this metadata stub.',
    }, { status: 400 })
  }

  const ctx = await getAuthContext(parsed.data.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('edit_business')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

  const supabase = createClient()
  const { data, error } = await supabase
    .from('integration_connections')
    .insert({
      business_id: ctx.businessId,
      provider: parsed.data.provider,
      display_name: parsed.data.display_name,
      status: parsed.data.status,
      non_secret_config: {
        ...parsed.data.non_secret_config,
        source_type: providerSourceType(parsed.data.provider),
      },
      created_by: ctx.userId,
    })
    .select('id, business_id, provider, display_name, status, non_secret_config, last_sync_at, secret_handling_note, created_at, updated_at')
    .single()

  if (error) {
    const status = error.message.includes('duplicate') ? 409 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json({
    data,
    caveat: 'Connection record created only. No external API sync or encrypted secret storage is implemented.',
  }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  if (hasSecretLikeField(parsed.data.non_secret_config)) {
    return NextResponse.json({
      error: 'Secret-like fields are not supported yet. Store tokens, API keys, passwords, and credentials outside this metadata stub.',
    }, { status: 400 })
  }

  const ctx = await getAuthContext(parsed.data.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('edit_business')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (parsed.data.display_name) updates.display_name = parsed.data.display_name
  if (parsed.data.status) updates.status = parsed.data.status
  updates.non_secret_config = parsed.data.non_secret_config

  const supabase = createClient()
  const { data, error } = await supabase
    .from('integration_connections')
    .update(updates)
    .eq('id', parsed.data.id)
    .eq('business_id', ctx.businessId)
    .select('id, business_id, provider, display_name, status, non_secret_config, last_sync_at, secret_handling_note, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    data,
    caveat: 'Connection metadata updated only. Provider sync remains a future integration task.',
  })
}
