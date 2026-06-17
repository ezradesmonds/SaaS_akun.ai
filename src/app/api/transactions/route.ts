import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AUTH_ERRORS, getAuthContext, trackUsage } from '@/lib/permissions/guard'
import { z } from 'zod'

const EntrySchema = z.object({
  account_id: z.string().uuid(),
  debit: z.number().min(0),
  credit: z.number().min(0),
  note: z.string().trim().max(250).optional(),
})

const CreateSchema = z.object({
  business_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(120).optional(),
  entries: z.array(EntrySchema).min(2),
})

type Entry = z.infer<typeof EntrySchema>

function validateEntries(entries: Entry[]) {
  const validEntries = entries.filter((entry) => entry.debit > 0 || entry.credit > 0)

  if (validEntries.length < 2) {
    return { error: 'Minimal 2 baris jurnal dengan nilai debit atau kredit' }
  }

  const invalidLine = validEntries.find((entry) =>
    (entry.debit > 0 && entry.credit > 0) || (entry.debit === 0 && entry.credit === 0)
  )

  if (invalidLine) {
    return { error: 'Setiap baris harus berisi debit atau kredit saja, tidak keduanya' }
  }

  const totalDebit = validEntries.reduce((sum, entry) => sum + entry.debit, 0)
  const totalCredit = validEntries.reduce((sum, entry) => sum + entry.credit, 0)

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      error: `Tidak balance: total debit (${totalDebit}) tidak sama dengan total kredit (${totalCredit})`,
    }
  }

  return { entries: validEntries }
}

async function validateAccountOwnership(
  supabase: ReturnType<typeof createClient>,
  businessId: string,
  entries: Entry[],
) {
  const accountIds = Array.from(new Set(entries.map((entry) => entry.account_id)))
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id')
    .eq('business_id', businessId)
    .in('id', accountIds)

  if (error) throw new Error(error.message)
  return (accounts || []).length === accountIds.length
}

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
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { business_id, date, description, reference, entries } = parsed.data
  const ctx = await getAuthContext(business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('create_transaction')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })
  if (!ctx.withinLimit('tx')) {
    return NextResponse.json({ ...AUTH_ERRORS.plan_limit_tx, usage: ctx.usage, plan: ctx.plan }, { status: 402 })
  }

  const validation = validateEntries(entries)
  if (validation.error) return NextResponse.json({ error: validation.error }, { status: 400 })

  try {
    const accountsAreOwned = await validateAccountOwnership(supabase, ctx.businessId, validation.entries!)
    if (!accountsAreOwned) {
      return NextResponse.json({ error: 'Ada akun yang tidak valid untuk bisnis ini' }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to validate transaction' }, { status: 500 })
  }

  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .insert({ business_id: ctx.businessId, date, description, reference: reference || null, source: 'manual' })
    .select()
    .single()

  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 })

  const { error: linesError } = await supabase
    .from('transaction_lines')
    .insert(validation.entries!.map((entry) => ({ ...entry, transaction_id: tx.id })))

  if (linesError) {
    await supabase.from('transactions').delete().eq('id', tx.id).eq('business_id', ctx.businessId)
    return NextResponse.json({ error: linesError.message }, { status: 500 })
  }

  await trackUsage(ctx.businessId, 'tx_count')

  return NextResponse.json({ data: tx }, { status: 201 })
}
