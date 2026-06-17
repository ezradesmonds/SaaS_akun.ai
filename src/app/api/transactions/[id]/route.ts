import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AUTH_ERRORS, getAuthContext } from '@/lib/permissions/guard'
import { z } from 'zod'

const EntrySchema = z.object({
  account_id: z.string().uuid(),
  debit: z.number().min(0),
  credit: z.number().min(0),
  note: z.string().trim().max(250).optional(),
})

const UpdateSchema = z.object({
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

async function getOwnedTransaction(supabase: ReturnType<typeof createClient>, id: string) {
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      lines:transaction_lines(
        id, account_id, debit, credit, note,
        account:accounts(id, code, name, type)
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return { transaction: data, businessId: data.business_id as string }
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

async function replaceTransactionLines(
  supabase: ReturnType<typeof createClient>,
  transactionId: string,
  entries: Entry[],
  previousLines: { account_id: string; debit: number; credit: number; note?: string | null }[],
) {
  const nextLines = entries.map((entry) => ({
    account_id: entry.account_id,
    debit: entry.debit,
    credit: entry.credit,
    note: entry.note || null,
  }))

  const { error: rpcError } = await supabase.rpc('replace_transaction_lines', {
    p_transaction_id: transactionId,
    p_lines: nextLines,
  })

  if (!rpcError) return null

  const code = (rpcError as { code?: string }).code
  const message = rpcError.message || ''
  const rpcUnavailable = code === 'PGRST202' || (
    message.includes('replace_transaction_lines') && message.toLowerCase().includes('schema cache')
  )
  if (!rpcUnavailable) return rpcError

  const { error: deleteError } = await supabase
    .from('transaction_lines')
    .delete()
    .eq('transaction_id', transactionId)

  if (deleteError) return deleteError

  const { error: insertError } = await supabase
    .from('transaction_lines')
    .insert(nextLines.map((line) => ({ ...line, transaction_id: transactionId })))

  if (!insertError) return null

  if (previousLines.length > 0) {
    await supabase
      .from('transaction_lines')
      .insert(previousLines.map((line) => ({
        transaction_id: transactionId,
        account_id: line.account_id,
        debit: line.debit,
        credit: line.credit,
        note: line.note || null,
      })))
  }

  return insertError
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()

  try {
    const owned = await getOwnedTransaction(supabase, params.id)
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ctx = await getAuthContext(owned.businessId)
    if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })

    return NextResponse.json({ data: owned.transaction })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load transaction' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()

  const body = await request.json()
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const validation = validateEntries(parsed.data.entries)
  if (validation.error) return NextResponse.json({ error: validation.error }, { status: 400 })

  let owned
  try {
    owned = await getOwnedTransaction(supabase, params.id)
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ctx = await getAuthContext(owned.businessId)
    if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
    if (!ctx.can('create_transaction')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

    const accountsAreOwned = await validateAccountOwnership(supabase, owned.businessId, validation.entries!)
    if (!accountsAreOwned) {
      return NextResponse.json({ error: 'Ada akun yang tidak valid untuk bisnis ini' }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to validate transaction' }, { status: 500 })
  }

  const previousTx = owned.transaction as {
    date: string
    description: string
    reference?: string | null
    lines?: { account_id: string; debit: number; credit: number; note?: string | null }[]
  }
  const restoreTransaction = async () => {
    await supabase
      .from('transactions')
      .update({
        date: previousTx.date,
        description: previousTx.description,
        reference: previousTx.reference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('business_id', owned.businessId)
  }

  const { error: txError } = await supabase
    .from('transactions')
    .update({
      date: parsed.data.date,
      description: parsed.data.description,
      reference: parsed.data.reference || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('business_id', owned.businessId)

  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 })

  const replaceLinesError = await replaceTransactionLines(
    supabase,
    params.id,
    validation.entries!,
    previousTx.lines || [],
  )
  if (replaceLinesError) {
    await restoreTransaction()
    return NextResponse.json({ error: replaceLinesError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()

  try {
    const owned = await getOwnedTransaction(supabase, params.id)
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ctx = await getAuthContext(owned.businessId)
    if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
    if (!ctx.can('delete_transaction')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', params.id)
      .eq('business_id', owned.businessId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete transaction' }, { status: 500 })
  }
}
