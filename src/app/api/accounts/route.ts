import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/permissions/guard'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const businessId = searchParams.get('business_id')
  const detect = searchParams.get('detect')

  const ctx = await getAuthContext(detect === 'true' ? null : businessId)
  if (!ctx) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type, is_active')
    .eq('business_id', ctx.businessId)
    .eq('is_active', true)
    .order('code')

  return NextResponse.json({ business_id: ctx.businessId, accounts: accounts || [] })
}
