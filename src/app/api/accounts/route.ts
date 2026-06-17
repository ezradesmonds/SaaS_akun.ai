import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const businessId = searchParams.get('business_id')
  const detect = searchParams.get('detect')

  // Auto-detect user's business
  if (detect === 'true' || !businessId) {
    const { data: membership } = await supabase
      .from('business_members')
      .select('business_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) return NextResponse.json({ error: 'No business found' }, { status: 404 })

    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, code, name, type, is_active')
      .eq('business_id', membership.business_id)
      .eq('is_active', true)
      .order('code')

    return NextResponse.json({ business_id: membership.business_id, accounts: accounts || [] })
  }

  // Explicit business_id
  const { data: membership } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type, is_active')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('code')

  return NextResponse.json({ business_id: businessId, accounts: accounts || [] })
}
