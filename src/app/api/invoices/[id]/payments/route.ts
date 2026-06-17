import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AUTH_ERRORS, getAuthContext } from '@/lib/permissions/guard'
import {
  PaymentSchema,
  canPostInvoiceSafely,
  getInvoiceBusiness,
  recordInvoicePayment,
} from '../../invoice-helpers'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await request.json().catch(() => null)
  const parsed = PaymentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = createClient()
  const owned = await getInvoiceBusiness(supabase, params.id).catch(() => null)
  if (!owned || owned.business_id !== parsed.data.business_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ctx = await getAuthContext(owned.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('create_transaction')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })
  if (!ctx.withinLimit('tx')) {
    return NextResponse.json({ ...AUTH_ERRORS.plan_limit_tx, usage: ctx.usage, plan: ctx.plan }, { status: 402 })
  }

  if (owned.status === 'draft' || owned.status === 'void') {
    return NextResponse.json({ error: 'Pembayaran hanya bisa dicatat untuk invoice issued.' }, { status: 409 })
  }

  const remaining = Number(owned.total_amount || 0) - Number(owned.amount_paid || 0)
  if (parsed.data.amount > remaining) {
    return NextResponse.json({ error: 'Nominal pembayaran melebihi sisa tagihan.' }, { status: 400 })
  }

  const safePosting = await canPostInvoiceSafely(
    supabase,
    ctx.businessId,
    Number(owned.total_amount || 0),
    0,
    parsed.data.payment_account_id,
    true,
  )
  if (!safePosting.ok) return NextResponse.json({ error: safePosting.reason }, { status: 400 })

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('id', params.id)
    .eq('business_id', ctx.businessId)
    .single()

  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })

  try {
    const payment = await recordInvoicePayment(
      supabase,
      ctx.businessId,
      params.id,
      invoice.invoice_number,
      parsed.data,
      safePosting.receivable!.id,
      safePosting.paymentAccount!.id,
    )
    return NextResponse.json({ data: payment }, { status: 201 })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Gagal mencatat pembayaran.',
    }, { status: 500 })
  }
}
