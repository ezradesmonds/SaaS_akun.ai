import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AUTH_ERRORS, getAuthContext } from '@/lib/permissions/guard'
import {
  InvoiceBaseSchema,
  calculateInvoiceAmounts,
  canPostInvoiceSafely,
  customerBelongsToBusiness,
  postInvoiceIssuance,
  recordInvoicePayment,
} from './invoice-helpers'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const businessId = searchParams.get('business_id')
  const status = searchParams.get('status')
  const search = searchParams.get('search')?.trim() || ''
  const page = Math.max(1, Number(searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '20')))

  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })

  const supabase = createClient()
  let query = supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(id, name, email, phone, npwp),
      items:invoice_items(*),
      payments(*)
    `, { count: 'exact' })
    .eq('business_id', ctx.businessId)
    .order('issue_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (status && status !== 'all') query = query.eq('status', status)
  if (search) query = query.or(`invoice_number.ilike.%${search}%,notes.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    per_page: limit,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = InvoiceBaseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const ctx = await getAuthContext(parsed.data.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('create_transaction')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

  const supabase = createClient()
  const ownsCustomer = await customerBelongsToBusiness(supabase, ctx.businessId, parsed.data.customer_id)
  if (!ownsCustomer) return NextResponse.json({ error: 'Customer tidak valid untuk bisnis ini' }, { status: 400 })

  const amounts = calculateInvoiceAmounts(parsed.data.items, parsed.data.discount_amount || 0, parsed.data.ppn_rate || 0)
  const requestedStatus = parsed.data.status || 'draft'
  const safePosting = await canPostInvoiceSafely(
    supabase,
    ctx.businessId,
    amounts.total_amount,
    amounts.ppn_amount,
    parsed.data.payment_account_id,
    requestedStatus === 'paid',
  )
  const shouldPost = requestedStatus !== 'draft' && safePosting.ok
  const status = shouldPost ? (requestedStatus === 'paid' ? 'issued' : requestedStatus) : 'draft'
  const transactionCountNeeded = shouldPost ? (requestedStatus === 'paid' ? 2 : 1) : 0
  if (transactionCountNeeded > 0 && ctx.usage.tx_count + transactionCountNeeded > ctx.usage.tx_limit) {
    return NextResponse.json({
      ...AUTH_ERRORS.plan_limit_tx,
      usage: ctx.usage,
      plan: ctx.plan,
      transactions_needed: transactionCountNeeded,
    }, { status: 402 })
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      business_id: ctx.businessId,
      customer_id: parsed.data.customer_id || null,
      invoice_number: parsed.data.invoice_number,
      issue_date: parsed.data.issue_date,
      due_date: parsed.data.due_date || null,
      status,
      subtotal_amount: amounts.subtotal_amount,
      discount_amount: amounts.discount_amount,
      ppn_rate: amounts.ppn_rate,
      ppn_amount: amounts.ppn_amount,
      total_amount: amounts.total_amount,
      notes: parsed.data.notes || null,
      terms: parsed.data.terms || null,
      payment_provider: parsed.data.payment_provider || null,
      provider_invoice_id: parsed.data.provider_invoice_id || null,
      provider_transaction_id: parsed.data.provider_transaction_id || null,
      provider_checkout_url: parsed.data.provider_checkout_url || null,
      provider_payment_status: parsed.data.provider_payment_status || null,
      mayar_checkout_url: parsed.data.mayar_checkout_url || null,
      mayar_status: parsed.data.mayar_status || null,
      npwp: parsed.data.npwp || null,
      tax_invoice_number: parsed.data.tax_invoice_number || null,
      tax_invoice_status: parsed.data.tax_invoice_status || null,
    })
    .select()
    .single()

  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })

  const { error: itemsError } = await supabase
    .from('invoice_items')
    .insert(amounts.items.map((item) => ({ ...item, invoice_id: invoice.id, business_id: ctx.businessId })))

  if (itemsError) {
    await supabase.from('invoices').delete().eq('id', invoice.id).eq('business_id', ctx.businessId)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  let accounting_posting_status = shouldPost ? 'posted' : requestedStatus === 'draft' ? 'not_requested' : 'kept_as_draft'
  let accounting_posting_reason = shouldPost ? null : safePosting.reason

  if (shouldPost && safePosting.ok) {
    try {
      await postInvoiceIssuance(
        supabase,
        ctx.businessId,
        invoice.id,
        parsed.data.invoice_number,
        parsed.data.issue_date,
        amounts.total_amount,
        safePosting.receivable!.id,
        safePosting.revenue!.id,
      )

      if (requestedStatus === 'paid') {
        await recordInvoicePayment(
          supabase,
          ctx.businessId,
          invoice.id,
          parsed.data.invoice_number,
          {
            business_id: ctx.businessId,
            amount: amounts.total_amount,
            method: parsed.data.provider_payment_status ? 'provider' : 'manual',
            reference: parsed.data.provider_transaction_id || parsed.data.invoice_number,
            payment_provider: parsed.data.payment_provider || null,
            provider_transaction_id: parsed.data.provider_transaction_id || null,
            provider_status: parsed.data.provider_payment_status || null,
            mayar_status: parsed.data.mayar_status || null,
            payment_account_id: parsed.data.payment_account_id || null,
          },
          safePosting.receivable!.id,
          safePosting.paymentAccount!.id,
        )
      }
    } catch (error) {
      accounting_posting_status = 'kept_as_draft'
      accounting_posting_reason = error instanceof Error ? error.message : 'Gagal membuat jurnal invoice.'
      await supabase
        .from('invoices')
        .update({ status: 'draft', transaction_id: null, amount_paid: 0, updated_at: new Date().toISOString() })
        .eq('id', invoice.id)
        .eq('business_id', ctx.businessId)
    }
  }

  const { data: saved } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(id, name, email, phone, npwp),
      items:invoice_items(*),
      payments(*)
    `)
    .eq('id', invoice.id)
    .eq('business_id', ctx.businessId)
    .single()

  return NextResponse.json({
    data: saved || invoice,
    accounting_posting_status,
    accounting_posting_reason,
  }, { status: 201 })
}
