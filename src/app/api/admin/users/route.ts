import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, ADMIN_FORBIDDEN, logAdminAction } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

// GET /api/admin/users?page=1&search=xxx&plan=xxx
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return ADMIN_FORBIDDEN

  const supabase = createAdminClient()
  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''
  const plan = searchParams.get('plan') || ''
  const limit = 20

  // Join businesses + subscriptions + usage
  let query = supabase
    .from('businesses')
    .select(`
      id, name, type, created_at, suspended_at, suspended_reason,
      user_id,
      subscription:subscriptions(plan, status, current_period_end, payment_provider, provider_customer_id),
      usage:usage_records(tx_count, ai_calls, period)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data: businesses, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get user emails via auth admin API
  const userIds = Array.from(new Set((businesses || []).map(b => b.user_id)))
  const userEmails: Record<string, string> = {}

  // Batch fetch users
  await Promise.all(
    userIds.map(async uid => {
      const { data } = await supabase.auth.admin.getUserById(uid)
      if (data.user) userEmails[uid] = data.user.email || ''
    })
  )

  const result = (businesses || []).map(b => {
    const currentPeriod = new Date().toISOString().slice(0, 7) // YYYY-MM
    const currentUsage = Array.isArray(b.usage)
      ? b.usage.find((u: { period: string }) => u.period === currentPeriod)
      : null

    // Filter by plan if specified
    const bPlan = Array.isArray(b.subscription) ? b.subscription[0]?.plan : (b.subscription as { plan: string } | null)?.plan
    if (plan && bPlan !== plan) return null

    return {
      business_id: b.id,
      business_name: b.name,
      business_type: b.type,
      created_at: b.created_at,
      suspended_at: b.suspended_at,
      suspended_reason: b.suspended_reason,
      user_id: b.user_id,
      email: userEmails[b.user_id] || '',
      plan: bPlan || 'free',
      subscription_status: Array.isArray(b.subscription) ? b.subscription[0]?.status : (b.subscription as { status: string } | null)?.status,
      payment_provider: Array.isArray(b.subscription) ? b.subscription[0]?.payment_provider : (b.subscription as { payment_provider: string } | null)?.payment_provider,
      provider_customer_id: Array.isArray(b.subscription) ? b.subscription[0]?.provider_customer_id : (b.subscription as { provider_customer_id: string } | null)?.provider_customer_id,
      usage_this_month: {
        tx_count: currentUsage?.tx_count || 0,
        ai_calls: currentUsage?.ai_calls || 0,
      },
    }
  }).filter(Boolean)

  return NextResponse.json({ data: result, total: count, page, per_page: limit })
}

const ActionSchema = z.object({
  action: z.enum(['suspend', 'unsuspend', 'override_plan', 'delete']),
  business_id: z.string().uuid(),
  reason: z.string().optional(),
  plan: z.enum(['free', 'starter', 'pro']).optional(),
})

// POST /api/admin/users — admin actions
export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return ADMIN_FORBIDDEN

  const body = await request.json()
  const parsed = ActionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { action, business_id, reason, plan } = parsed.data
  const supabase = createAdminClient()
  const ip = request.headers.get('x-forwarded-for') || ''

  switch (action) {
    case 'suspend': {
      await supabase
        .from('businesses')
        .update({ suspended_at: new Date().toISOString(), suspended_reason: reason })
        .eq('id', business_id)
      await logAdminAction(admin.userId, 'suspend_business', 'business', business_id, { reason }, ip)
      return NextResponse.json({ success: true, message: 'Bisnis disuspend' })
    }

    case 'unsuspend': {
      await supabase
        .from('businesses')
        .update({ suspended_at: null, suspended_reason: null })
        .eq('id', business_id)
      await logAdminAction(admin.userId, 'unsuspend_business', 'business', business_id, {}, ip)
      return NextResponse.json({ success: true, message: 'Bisnis direaktivasi' })
    }

    case 'override_plan': {
      if (!plan) return NextResponse.json({ error: 'plan required' }, { status: 400 })
      await supabase
        .from('subscriptions')
        .update({ plan, updated_at: new Date().toISOString() })
        .eq('business_id', business_id)
      await logAdminAction(admin.userId, 'override_plan', 'subscription', business_id, { plan }, ip)
      return NextResponse.json({ success: true, message: `Plan diubah ke ${plan}` })
    }

    case 'delete': {
      // Cascade delete (business → subscriptions → transactions etc)
      const { data: biz } = await supabase.from('businesses').select('user_id').eq('id', business_id).single()
      await supabase.from('businesses').delete().eq('id', business_id)
      await logAdminAction(admin.userId, 'delete_business', 'business', business_id, { user_id: biz?.user_id }, ip)
      return NextResponse.json({ success: true, message: 'Bisnis dihapus' })
    }
  }
}
