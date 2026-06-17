import { createClient } from '@/lib/supabase/server'
import { executeTool } from '@/lib/accounting/tools'
import type { AccountingIntent } from '@/lib/openrouter/client'
import type { Account, Transaction } from '@/types'
import { format, endOfMonth, startOfMonth } from 'date-fns'

type ChatExecutionResult = {
  message: string
  toolCalls: {
    tool: string
    input: unknown
    result: unknown
  }[]
}

type AccountOption = Pick<Account, 'id' | 'code' | 'name' | 'type'>

function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}

function currentMonthRange() {
  const now = new Date()
  return {
    start_date: format(startOfMonth(now), 'yyyy-MM-dd'),
    end_date: format(endOfMonth(now), 'yyyy-MM-dd'),
  }
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

export async function getAccountCatalog(businessId: string) {
  const accounts = await getActiveAccounts(businessId)
  return accounts
    .map((account) => `${account.code} | ${account.name} | ${account.type}`)
    .join('\n')
}

async function getActiveAccounts(businessId: string): Promise<AccountOption[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('code')

  if (error) throw error
  return data || []
}

function resolveAccount(accounts: AccountOption[], code?: string, name?: string) {
  if (code) {
    const byCode = accounts.find((account) => account.code === code)
    if (byCode) return byCode
  }

  if (name) {
    const normalized = name.toLowerCase()
    return accounts.find((account) => account.name.toLowerCase() === normalized)
      || accounts.find((account) => account.name.toLowerCase().includes(normalized))
  }

  return null
}

function buildDraft(intent: AccountingIntent, reason?: string) {
  return {
    intent: 'create_transaction',
    status: 'draft',
    reason: reason || intent.transaction?.ambiguity_reason || 'Transaksi perlu dikonfirmasi dulu.',
    transaction: intent.transaction || null,
  }
}

async function createTransactionFromIntent(businessId: string, intent: AccountingIntent): Promise<ChatExecutionResult> {
  const tx = intent.transaction

  if (!tx || tx.is_ambiguous || intent.confidence < 0.75) {
    const draft = buildDraft(intent)
    return {
      message: `${intent.follow_up_question || tx?.ambiguity_reason || 'Aku buat draft dulu karena detail transaksi belum cukup jelas.'}\n\nDraft belum disimpan.`,
      toolCalls: [{ tool: 'create_transaction_draft', input: intent, result: draft }],
    }
  }

  if (!tx.description || !tx.lines || tx.lines.length < 2) {
    const draft = buildDraft(intent, 'Deskripsi atau baris jurnal belum lengkap.')
    return {
      message: `${intent.follow_up_question || 'Detail transaksi belum lengkap. Bisa lengkapi akun debit/kredit dan nominalnya?'}\n\nDraft belum disimpan.`,
      toolCalls: [{ tool: 'create_transaction_draft', input: intent, result: draft }],
    }
  }

  const accounts = await getActiveAccounts(businessId)
  const entries = tx.lines.map((line) => {
    const account = resolveAccount(accounts, line.account_code, line.account_name)
    return account ? {
      account_id: account.id,
      debit: line.debit || 0,
      credit: line.credit || 0,
      note: line.note,
    } : null
  })

  if (entries.some((entry) => !entry)) {
    const draft = buildDraft(intent, 'Ada akun yang belum cocok dengan chart of accounts.')
    return {
      message: 'Aku belum yakin akun yang dipakai sudah tepat. Pilih akun yang sesuai dulu ya.\n\nDraft belum disimpan.',
      toolCalls: [{ tool: 'create_transaction_draft', input: intent, result: draft }],
    }
  }

  const validEntries = entries as NonNullable<typeof entries[number]>[]
  const totalDebit = validEntries.reduce((sum, entry) => sum + entry.debit, 0)
  const totalCredit = validEntries.reduce((sum, entry) => sum + entry.credit, 0)
  const hasInvalidLine = validEntries.some((entry) =>
    (entry.debit > 0 && entry.credit > 0) || (entry.debit === 0 && entry.credit === 0)
  )

  if (hasInvalidLine || Math.abs(totalDebit - totalCredit) > 0.01) {
    const draft = buildDraft(intent, 'Jurnal belum balance atau ada baris debit/kredit yang tidak valid.')
    return {
      message: 'Jurnalnya belum balance, jadi aku buat draft dan belum menyimpan transaksi.',
      toolCalls: [{ tool: 'create_transaction_draft', input: intent, result: draft }],
    }
  }

  const supabase = createClient()
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      business_id: businessId,
      date: tx.date || todayISO(),
      description: tx.description,
      reference: tx.reference || null,
      source: 'ai',
    })
    .select()
    .single()

  if (txError) throw txError

  const { error: linesError } = await supabase
    .from('transaction_lines')
    .insert(validEntries.map((entry) => ({
      transaction_id: transaction.id,
      ...entry,
    })))

  if (linesError) {
    await supabase.from('transactions').delete().eq('id', transaction.id)
    throw linesError
  }

  return {
    message: `Transaksi berhasil disimpan: ${tx.description} senilai ${formatIDR(totalDebit)}.`,
    toolCalls: [{
      tool: 'create_transaction',
      input: { ...tx, entries: validEntries },
      result: { transaction_id: transaction.id, total_debit: totalDebit, total_credit: totalCredit },
    }],
  }
}

async function searchTransactions(businessId: string, intent: AccountingIntent): Promise<ChatExecutionResult> {
  const range = intent.date_range || {}
  const result = await executeTool('get_transactions', {
    search: intent.search?.query,
    date_from: range.start_date,
    date_to: range.end_date,
    limit: intent.search?.limit || 10,
  }, businessId) as { transactions: Transaction[] }

  const transactions = result.transactions || []
  const summary = transactions.length === 0
    ? 'Tidak ada transaksi yang cocok.'
    : transactions.map((tx) => `- ${tx.date}: ${tx.description}`).join('\n')

  return {
    message: `${intent.response}\n\n${summary}`,
    toolCalls: [{ tool: 'search_transactions', input: intent, result }],
  }
}

async function expenseBreakdown(businessId: string, intent: AccountingIntent): Promise<ChatExecutionResult> {
  const range = intent.date_range?.start_date && intent.date_range?.end_date
    ? intent.date_range
    : currentMonthRange()

  const result = await executeTool('get_profit_loss', range, businessId) as Awaited<ReturnType<typeof executeTool>>
  const pl = result as {
    expenses: { name: string; balance: number }[]
    total_expenses: number
  }
  const lines = pl.expenses.length === 0
    ? 'Belum ada pengeluaran di periode ini.'
    : pl.expenses.map((expense) => `- ${expense.name}: ${formatIDR(expense.balance)}`).join('\n')

  return {
    message: `Total pengeluaran: ${formatIDR(pl.total_expenses)}\n${lines}`,
    toolCalls: [{ tool: 'ask_expense_breakdown', input: range, result: pl }],
  }
}

export async function executeAccountingIntent(
  businessId: string,
  intent: AccountingIntent,
): Promise<ChatExecutionResult> {
  if (intent.intent === 'unclear') {
    return {
      message: intent.follow_up_question || intent.response || 'Bisa jelaskan sedikit lagi?',
      toolCalls: [{ tool: 'unclear', input: intent, result: null }],
    }
  }

  if (intent.intent === 'general_accounting_help') {
    return {
      message: intent.response,
      toolCalls: [{ tool: 'general_accounting_help', input: intent, result: null }],
    }
  }

  if (intent.intent === 'create_transaction') {
    return createTransactionFromIntent(businessId, intent)
  }

  if (intent.intent === 'ask_profit_loss') {
    const range = intent.date_range?.start_date && intent.date_range?.end_date
      ? intent.date_range
      : currentMonthRange()
    const result = await executeTool('get_profit_loss', range, businessId)
    const pl = result as { total_revenue: number; total_expenses: number; net_profit: number }
    return {
      message: `Pendapatan ${formatIDR(pl.total_revenue)}, pengeluaran ${formatIDR(pl.total_expenses)}, laba bersih ${formatIDR(pl.net_profit)}.`,
      toolCalls: [{ tool: 'ask_profit_loss', input: range, result }],
    }
  }

  if (intent.intent === 'ask_balance_sheet') {
    const input = { as_of_date: intent.date_range?.as_of_date || todayISO() }
    const result = await executeTool('get_balance_sheet', input, businessId)
    const bs = result as { total_assets: number; total_liabilities_equity: number }
    return {
      message: `Total aset ${formatIDR(bs.total_assets)}. Total kewajiban + ekuitas ${formatIDR(bs.total_liabilities_equity)}.`,
      toolCalls: [{ tool: 'ask_balance_sheet', input, result }],
    }
  }

  if (intent.intent === 'ask_cash_balance') {
    const result = await executeTool('get_cash_summary', { period: 'this_month' }, businessId)
    const cash = result as { cash_balance?: number }
    return {
      message: `Saldo kas dan bank saat ini ${formatIDR(cash.cash_balance || 0)}.`,
      toolCalls: [{ tool: 'ask_cash_balance', input: intent, result }],
    }
  }

  if (intent.intent === 'search_transactions') {
    return searchTransactions(businessId, intent)
  }

  if (intent.intent === 'ask_expense_breakdown') {
    return expenseBreakdown(businessId, intent)
  }

  return {
    message: intent.follow_up_question || 'Aku belum yakin maksudnya. Bisa diperjelas?',
    toolCalls: [{ tool: 'unclear', input: intent, result: null }],
  }
}
