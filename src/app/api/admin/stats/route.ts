import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, ADMIN_FORBIDDEN } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return ADMIN_FORBIDDEN

  const supabase = createAdminClient()

  // Platform stats from view
  const { data: stats } = await supabase
    .from('admin_stats')
    .select('*')
    .single()

  // MRR from active Mayar-backed subscriptions
  let mrr = 0
  let paymentProviderError = null
  try {
    // Sum active subscriptions
    const subs = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('status', 'active')
      .neq('plan', 'free')

    const PRICES = { starter: 29000, pro: 79000 }
    mrr = (subs.data || []).reduce((sum, s) => {
      return sum + (PRICES[s.plan as keyof typeof PRICES] || 0)
    }, 0)
  } catch (e) {
    paymentProviderError = 'Payment provider data unavailable'
  }

  // Growth: new signups per day last 14 days
  const { data: dailySignups } = await supabase
    .from('businesses')
    .select('created_at')
    .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at')

  // Bucket by day
  const signupsByDay: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    signupsByDay[d.toISOString().split('T')[0]] = 0
  }
  ;(dailySignups || []).forEach(b => {
    const day = b.created_at.split('T')[0]
    if (signupsByDay[day] !== undefined) signupsByDay[day]++
  })

  const growthChart = Object.entries(signupsByDay).map(([date, count]) => ({
    date,
    label: new Date(date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }),
    count,
  }))

  return NextResponse.json({
    stats: {
      ...stats,
      mrr,
    },
    growth_chart: growthChart,
    payment_provider_error: paymentProviderError,
  })
}
