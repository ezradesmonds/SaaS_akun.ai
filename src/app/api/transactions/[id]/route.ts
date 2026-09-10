import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AUTH_ERRORS, getAuthContext } from '@/lib/permissions/guard'
import { logAuditAction } from '@/lib/audit/log'

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
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  try {
    const owned = await getOwnedTransaction(supabase, params.id)
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ctx = await getAuthContext(owned.businessId)
    if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
    if (!ctx.can('create_transaction')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

    return NextResponse.json({
      error: 'Transaksi yang sudah diposting tidak dapat diubah. Balikkan transaksi ini lalu buat jurnal pengganti.',
      code: 'POSTED_TRANSACTION_IMMUTABLE',
    }, { status: 409 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to validate transaction' }, { status: 500 })
  }
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

    const { data: reversal, error } = await supabase.rpc('reverse_journal_transaction', {
      p_transaction_id: params.id,
      p_reason: 'Reversed from transaction list',
    })

    if (error || !reversal) {
      return NextResponse.json({
        error: error?.message || 'Transaction could not be reversed',
        hint: 'Pastikan migration 013_ledger_posting_and_idempotency.sql sudah dijalankan di Supabase.',
      }, { status: 500 })
    }

    await logAuditAction({
      actorId: ctx.userId,
      action: 'transaction_reversed',
      targetType: 'transaction',
      targetId: params.id,
      metadata: { business_id: owned.businessId, reversal_transaction_id: reversal.id },
    })

    return NextResponse.json({ success: true, reversal_id: reversal.id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete transaction' }, { status: 500 })
  }
}
