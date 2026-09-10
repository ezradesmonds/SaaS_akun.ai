import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AUTH_ERRORS, getAuthContext, trackUsage } from '@/lib/permissions/guard'
import { createIdempotencyKey, JournalEntrySchema, validateJournalLines } from '@/lib/accounting/journal'
import { logAuditAction } from '@/lib/audit/log'

// GET /api/transactions?business_id=xxx&page=1&limit=20
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const businessId = searchParams.get('business_id')
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
  const search = searchParams.get('search') || ''
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })

  const supabase = createClient()
  let query = supabase
    .from('transactions')
    .select(`
      *,
      lines:transaction_lines(
        id, account_id, debit, credit, note,
        account:accounts(id, code, name, type)
      )
    `, { count: 'exact' })
    .eq('business_id', ctx.businessId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (search) query = query.ilike('description', `%${search}%`)
  if (dateFrom) query = query.gte('date', dateFrom)
  if (dateTo) query = query.lte('date', dateTo)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    per_page: limit,
  })
}

// POST /api/transactions - manual create
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const body = await request.json()
  const parsed = JournalEntrySchema.safeParse({ ...body, source: 'manual' })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { business_id, date, description, reference, entries } = parsed.data
  const ctx = await getAuthContext(business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('create_transaction')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })
  if (!ctx.withinLimit('tx')) {
    return NextResponse.json({ ...AUTH_ERRORS.plan_limit_tx, usage: ctx.usage, plan: ctx.plan }, { status: 402 })
  }

  const validation = validateJournalLines(entries)
  if (validation.error) return NextResponse.json({ error: validation.error }, { status: 400 })

  const idempotencyKey = request.headers.get('idempotency-key') || createIdempotencyKey()
  const { data: tx, error: txError } = await supabase.rpc('post_journal_transaction', {
    p_business_id: ctx.businessId,
    p_date: date,
    p_description: description,
    p_reference: reference || null,
    p_source: 'manual',
    p_lines: validation.entries,
    p_idempotency_key: idempotencyKey,
  })

  if (txError || !tx) {
    return NextResponse.json({
      error: txError?.message || 'Transaction could not be posted',
      hint: 'Pastikan migration 013_ledger_posting_and_idempotency.sql sudah dijalankan di Supabase.',
    }, { status: 500 })
  }

  await trackUsage(ctx.businessId, 'tx_count')
  await logAuditAction({
    actorId: ctx.userId,
    action: 'transaction_posted',
    targetType: 'transaction',
    targetId: tx.id,
    metadata: { business_id: ctx.businessId, source: 'manual', idempotency_key: idempotencyKey },
  })

  return NextResponse.json({ data: tx }, { status: 201 })
}
