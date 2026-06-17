import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

  const { data: existingBusiness, error: lookupError } = await supabase
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
    const { data: createdBusiness, error: createError } = await supabase
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

  try {
    await ensureDefaultAccounts(supabase, business.id)
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create default accounts',
      business_id: business.id,
      retryable: true,
    }, { status: 500 })
  }

  return NextResponse.json({ business, created: !existingBusiness })
}
