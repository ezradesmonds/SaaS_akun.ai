import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import {
  createMayarInvoice,
  getMayarConfigStatus,
  getMayarSetupMessage,
  MayarApiError,
  MayarConfigError,
} from '@/lib/mayar/client'
import { PLANS, type Plan } from '@/lib/permissions/plans'
import { logAuditAction } from '@/lib/audit/log'
import { z } from 'zod'

const UpgradeSchema = z.object({
  plan: z.enum(['starter', 'pro']),
  business_id: z.string().uuid(),
  mobile: z.string().trim().min(8).max(20).optional(),
})

// POST /api/billing -> create Mayar invoice checkout
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = UpgradeSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const { plan, business_id, mobile } = parsed.data

    const { data: membership } = await supabase
      .from('business_members')
      .select('role')
      .eq('business_id', business_id)
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only owner can manage billing' }, { status: 403 })
    }

    const mayarConfig = getMayarConfigStatus()
    if (!mayarConfig.checkoutConfigured) {
      return NextResponse.json({
        error: getMayarSetupMessage(),
        setup_required: true,
        missing: mayarConfig.missing,
      }, { status: 503 })
    }

    const [{ data: business }, { data: subscription }] = await Promise.all([
      supabase.from('businesses').select('name').eq('id', business_id).single(),
      supabase
        .from('subscriptions')
        .select('provider_customer_id')
        .eq('business_id', business_id)
        .single(),
    ])

    if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    const invoice = await createMayarInvoice({
      businessId: business_id,
      plan,
      customerName: business.name,
      customerEmail: user.email || '',
      customerMobile: mobile,
      redirectUrl: `${appUrl}/billing?payment=pending`,
    })

    await createAdminClient()
      .from('subscriptions')
      .update({
        payment_provider: 'mayar',
        provider_customer_id: subscription?.provider_customer_id || user.id,
        provider_invoice_id: invoice.invoiceId,
        provider_transaction_id: invoice.transactionId,
        provider_checkout_url: invoice.url,
        pending_plan: plan,
        updated_at: new Date().toISOString(),
      })
      .eq('business_id', business_id)

    await logAuditAction({
      actorId: user.id,
      action: 'create_mayar_invoice',
      targetType: 'subscription',
      targetId: business_id,
      metadata: { plan, invoice_id: invoice.invoiceId, transaction_id: invoice.transactionId },
      ipAddress: request.headers.get('x-forwarded-for'),
    })

    return NextResponse.json({ url: invoice.url })
  } catch (error) {
    if (error instanceof MayarConfigError) {
      return NextResponse.json({ error: error.message, setup_required: true }, { status: 503 })
    }
    if (error instanceof MayarApiError) {
      const status = error.status === 401 || error.status === 403 ? 502 : 503
      return NextResponse.json({ error: error.message }, { status })
    }
    console.error('Mayar billing error:', error)
    return NextResponse.json({ error: 'Gagal membuat invoice Mayar.' }, { status: 500 })
  }
}

// GET /api/billing?business_id=xxx -> current plan and usage
export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const businessId = request.nextUrl.searchParams.get('business_id')
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: membership } = await supabase
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .single()

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owner can manage billing' }, { status: 403 })
  }

  const { data: planInfo } = await supabase
    .from('business_plan_info')
    .select('*')
    .eq('business_id', businessId)
    .single()

  const plan = (planInfo?.plan || 'free') as Plan
  const planConfig = PLANS[plan]

  return NextResponse.json({
    plan,
    status: planInfo?.status || 'active',
    current_period_end: planInfo?.current_period_end,
    cancel_at_period_end: planInfo?.cancel_at_period_end,
    provider_customer_id: planInfo?.provider_customer_id,
    provider_checkout_url: planInfo?.provider_checkout_url,
    payment_provider: planInfo?.payment_provider || 'mayar',
    mayar: {
      ...getMayarConfigStatus(),
      setup_message: getMayarSetupMessage(),
    },
    usage: {
      tx_count: planInfo?.tx_count_this_month || 0,
      ai_calls: planInfo?.ai_calls_this_month || 0,
      tx_limit: planInfo?.tx_limit || planConfig.limits.tx_per_month,
      ai_calls_limit: planInfo?.ai_calls_limit || planConfig.limits.ai_calls_per_month,
    },
  })
}
