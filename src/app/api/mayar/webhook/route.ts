import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getPlanFromMayarPayload, verifyMayarWebhookSecret } from '@/lib/mayar/client'
import { logAuditAction } from '@/lib/audit/log'

type MayarWebhookPayload = {
  event?: string
  data?: {
    id?: string
    transactionId?: string
    transaction_id?: string
    paymentLinkTransactionId?: string
    status?: string | boolean
    transactionStatus?: string
    customerEmail?: string
    amount?: number
    nettAmount?: number
    productName?: string
    paymentMethod?: string
    extraData?: {
      business_id?: string
      plan?: string
    }
  }
}

type PendingSubscription = {
  business_id: string
  pending_plan: 'starter' | 'pro' | null
  provider_transaction_id: string | null
  provider_invoice_id: string | null
}

function isPaidPayload(payload: MayarWebhookPayload) {
  const event = payload.event || ''
  const status = String(payload.data?.status || payload.data?.transactionStatus || '').toLowerCase()
  return event === 'payment.received' || status === 'success' || status === 'paid' || status === 'settled'
}

async function getBusinessOwnerId(businessId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('businesses')
    .select('user_id')
    .eq('id', businessId)
    .single()

  return data?.user_id || null
}

export async function POST(request: NextRequest) {
  if (!process.env.MAYAR_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Mayar webhook secret is not configured' }, { status: 503 })
  }

  if (!verifyMayarWebhookSecret(request.url, request.headers.get('x-mayar-webhook-secret'))) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
  }

  let payload: MayarWebhookPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  if (!isPaidPayload(payload)) {
    return NextResponse.json({ received: true, ignored: true })
  }

  const data = payload.data || {}
  const transactionId = data.transactionId || data.transaction_id || data.paymentLinkTransactionId || data.id

  const supabase = createAdminClient()
  let subscription: PendingSubscription | null = null

  if (transactionId) {
    const { data: byTransaction } = await supabase
      .from('subscriptions')
      .select('business_id, pending_plan, provider_transaction_id, provider_invoice_id')
      .eq('provider_transaction_id', transactionId)
      .maybeSingle()

    subscription = byTransaction as PendingSubscription | null
  }

  if (!subscription && data.id) {
    const { data: byInvoice } = await supabase
      .from('subscriptions')
      .select('business_id, pending_plan, provider_transaction_id, provider_invoice_id')
      .eq('provider_invoice_id', data.id)
      .maybeSingle()

    subscription = byInvoice as PendingSubscription | null
  }

  if (!subscription?.business_id) {
    return NextResponse.json({ error: 'Unable to map Mayar payment to a pending subscription' }, { status: 202 })
  }

  if (!subscription.pending_plan) {
    return NextResponse.json({ received: true, ignored: true, reason: 'No pending plan for matched subscription' })
  }

  const payloadPlan = getPlanFromMayarPayload(payload)
  if (payloadPlan !== 'free' && payloadPlan !== subscription.pending_plan) {
    return NextResponse.json({ error: 'Mayar payload plan does not match pending plan' }, { status: 409 })
  }

  const businessId = subscription.business_id
  const plan = subscription.pending_plan
  const periodStart = new Date()
  const periodEnd = new Date(periodStart)
  periodEnd.setMonth(periodEnd.getMonth() + 1)

  await supabase
    .from('subscriptions')
    .upsert({
      business_id: businessId,
      payment_provider: 'mayar',
      plan,
      status: 'active',
      provider_transaction_id: transactionId || null,
      provider_invoice_id: data.id || null,
      provider_customer_id: data.customerEmail || null,
      provider_price_id: plan,
      provider_checkout_url: null,
      pending_plan: null,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' })

  const ownerId = await getBusinessOwnerId(businessId)
  if (ownerId) {
    await logAuditAction({
      actorId: ownerId,
      action: 'mayar_payment_received',
      targetType: 'subscription',
      targetId: businessId,
      metadata: {
        plan,
        transaction_id: transactionId,
        amount: data.amount,
        nett_amount: data.nettAmount,
        payment_method: data.paymentMethod,
      },
    })
  }

  return NextResponse.json({ received: true })
}
