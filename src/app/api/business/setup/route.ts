import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { ensureDefaultAccounts } from '@/lib/business/default-accounts'
import { z } from 'zod'

const SetupBusinessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(['umkm', 'freelancer', 'toko', 'jasa']).default('umkm'),
})

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = SetupBusinessSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid business setup' }, { status: 400 })
  }

  const { name, type } = parsed.data
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const workspaceClient = hasServiceRole ? createAdminClient() : supabase

  // The service-role client is only used after getUser() has authenticated the
  // request. Every privileged query is still scoped to the authenticated owner.
  const { data: existingBusiness, error: lookupError } = await workspaceClient
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }

  let business = existingBusiness

  if (!business) {
    const { data: createdBusiness, error: createError } = await workspaceClient
      .from('businesses')
      .insert({
        user_id: user.id,
        name,
        type,
      })
      .select()
      .single()

    if (createError || !createdBusiness) {
      return NextResponse.json({
        error: createError?.message || 'Failed to create business',
      }, { status: 500 })
    }

    business = createdBusiness
  }

  const { error: membershipError } = await workspaceClient
    .from('business_members')
    .upsert({
      business_id: business.id,
      user_id: user.id,
      role: 'owner',
    }, { onConflict: 'business_id,user_id' })

  if (membershipError) {
    return NextResponse.json({
      error: hasServiceRole
        ? `Failed to repair business membership: ${membershipError.message}`
        : 'Business membership belum terbentuk. Tambahkan SUPABASE_SERVICE_ROLE_KEY atau jalankan migrasi database terbaru.',
      business_id: business.id,
      retryable: true,
    }, { status: 500 })
  }

  const { data: existingSubscription, error: subscriptionLookupError } = await workspaceClient
    .from('subscriptions')
    .select('id')
    .eq('business_id', business.id)
    .maybeSingle()

  if (subscriptionLookupError) {
    return NextResponse.json({ error: subscriptionLookupError.message }, { status: 500 })
  }

  if (!existingSubscription) {
    const { error: subscriptionError } = await workspaceClient
      .from('subscriptions')
      .insert({ business_id: business.id, plan: 'free', status: 'active' })

    if (subscriptionError) {
      return NextResponse.json({ error: subscriptionError.message }, { status: 500 })
    }
  }

  try {
    await ensureDefaultAccounts(workspaceClient, business.id)
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create default accounts',
      business_id: business.id,
      retryable: true,
    }, { status: 500 })
  }

  return NextResponse.json({ business, created: !existingBusiness })
}
