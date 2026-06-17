import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AUTH_ERRORS, getAuthContext } from '@/lib/permissions/guard'
import {
  InvoiceBaseSchema,
  calculateInvoiceAmounts,
  canPostInvoiceSafely,
  customerBelongsToBusiness,
  getInvoiceBusiness,
  postInvoiceIssuance,
} from '../invoice-helpers'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const owned = await getInvoiceBusiness(supabase, params.id).catch(() => null)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ctx = await getAuthContext(owned.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })

  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(id, name, email, phone, npwp, address),
      items:invoice_items(*),
      payments(*),
      reminders:receivable_reminders(*)
    `)
    .eq('id', params.id)
    .eq('business_id', ctx.businessId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await request.json().catch(() => null)
  const parsed = InvoiceBaseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = createClient()
  const owned = await getInvoiceBusiness(supabase, params.id).catch(() => null)
  if (!owned || owned.business_id !== parsed.data.business_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ctx = await getAuthContext(owned.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('create_transaction')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

  if (owned.transaction_id && owned.status !== 'draft') {
    return NextResponse.json({
      error: 'Invoice yang sudah diposting ke jurnal belum bisa diedit dari modul ini.',
    }, { status: 409 })
  }

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
    false,
  )
  const shouldPost = requestedStatus === 'issued' && safePosting.ok
  const status = shouldPost ? 'issued' : 'draft'
  if (shouldPost && !ctx.withinLimit('tx')) {
    return NextResponse.json({ ...AUTH_ERRORS.plan_limit_tx, usage: ctx.usage, plan: ctx.plan }, { status: 402 })
  }

  const { error: updateError } = await supabase
    .from('invoices')
    .update({
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
      amount_paid: 0,
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
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('business_id', ctx.businessId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { error: deleteItemsError } = await supabase
    .from('invoice_items')
    .delete()
    .eq('invoice_id', params.id)
    .eq('business_id', ctx.businessId)

  if (deleteItemsError) return NextResponse.json({ error: deleteItemsError.message }, { status: 500 })

  const { error: insertItemsError } = await supabase
    .from('invoice_items')
    .insert(amounts.items.map((item) => ({ ...item, invoice_id: params.id, business_id: ctx.businessId })))

  if (insertItemsError) return NextResponse.json({ error: insertItemsError.message }, { status: 500 })

  let accounting_posting_status = shouldPost ? 'posted' : requestedStatus === 'draft' ? 'not_requested' : 'kept_as_draft'
  let accounting_posting_reason = shouldPost ? null : safePosting.reason

  if (shouldPost && safePosting.ok) {
    try {
      await postInvoiceIssuance(
        supabase,
        ctx.businessId,
        params.id,
        parsed.data.invoice_number,
        parsed.data.issue_date,
        amounts.total_amount,
        safePosting.receivable!.id,
        safePosting.revenue!.id,
      )
    } catch (error) {
      accounting_posting_status = 'kept_as_draft'
      accounting_posting_reason = error instanceof Error ? error.message : 'Gagal membuat jurnal invoice.'
      await supabase
        .from('invoices')
        .update({ status: 'draft', transaction_id: null, updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .eq('business_id', ctx.businessId)
    }
  }

  const { data } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(id, name, email, phone, npwp),
      items:invoice_items(*),
      payments(*)
    `)
    .eq('id', params.id)
    .eq('business_id', ctx.businessId)
    .single()

  return NextResponse.json({
    data,
    accounting_posting_status,
    accounting_posting_reason,
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const owned = await getInvoiceBusiness(supabase, params.id).catch(() => null)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ctx = await getAuthContext(owned.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('delete_transaction')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

  if (owned.transaction_id || owned.status !== 'draft') {
    return NextResponse.json({
      error: 'Hanya invoice draft yang belum diposting yang bisa dihapus.',
    }, { status: 409 })
  }

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', params.id)
    .eq('business_id', ctx.businessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
