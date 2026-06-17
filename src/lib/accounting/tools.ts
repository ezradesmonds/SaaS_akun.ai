import { createAdminClient } from '@/lib/supabase/server'
import type {
  Account, Transaction, AccountBalance,
  ProfitLossReport, BalanceSheetReport, DashboardStats
} from '@/types'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

type ToolResult =
  | Record<string, unknown>
  | { accounts: Account[] }
  | { transaction: Transaction; success: boolean }
  | ProfitLossReport
  | BalanceSheetReport
  | DashboardStats

type JoinedValue<T> = T | T[] | null

function firstJoin<T>(value: JoinedValue<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

type AccountJoin = {
  id: string
  business_id?: string
  code: string
  name: string
  type: string
}

type TransactionLineJoin = {
  debit: number | string
  credit: number | string
  account: JoinedValue<AccountJoin>
}

function balanceForType(type: string, totalDebit: number, totalCredit: number) {
  return ['ASSET', 'EXPENSE'].includes(type)
    ? totalDebit - totalCredit
    : totalCredit - totalDebit
}

function aggregateLinesByAccount(businessId: string, lines: TransactionLineJoin[]) {
  const accountMap = new Map<string, AccountBalance>()

  lines.forEach((line) => {
    const account = firstJoin(line.account)
    if (!account) return

    const existing = accountMap.get(account.id) || {
      id: account.id,
      business_id: account.business_id || businessId,
      code: account.code,
      name: account.name,
      type: account.type as AccountBalance['type'],
      total_debit: 0,
      total_credit: 0,
      balance: 0,
    }

    existing.total_debit += Number(line.debit)
    existing.total_credit += Number(line.credit)
    existing.balance = balanceForType(account.type, existing.total_debit, existing.total_credit)
    accountMap.set(account.id, existing)
  })

  return Array.from(accountMap.values()).sort((a, b) => a.code.localeCompare(b.code))
}

// ============================================================
// Tool Executor — called when LLM requests a tool
// Maps tool_name → actual database query
// ============================================================

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  businessId: string
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_accounts':
      return getAccounts(businessId, input)

    case 'create_transaction':
      return createTransaction(businessId, input)

    case 'get_profit_loss':
      return getProfitLoss(businessId, input)

    case 'get_balance_sheet':
      return getBalanceSheet(businessId, input)

    case 'get_cash_summary':
      return getCashSummary(businessId, input)

    case 'get_transactions':
      return getTransactions(businessId, input)

    case 'get_dashboard_stats':
      return getDashboardStats(businessId)

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

// ============================================================
// Tool Implementations
// ============================================================

async function getAccounts(
  businessId: string,
  input: Record<string, unknown>
): Promise<{ accounts: Account[] }> {
  const supabase = createAdminClient()

  let query = supabase
    .from('accounts')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('code')

  if (input.type) {
    query = query.eq('type', input.type as string)
  }

  if (input.search) {
    query = query.ilike('name', `%${input.search}%`)
  }

  const { data, error } = await query
  if (error) throw error

  return { accounts: data || [] }
}

async function createTransaction(
  businessId: string,
  input: Record<string, unknown>
): Promise<{ transaction: Transaction; success: boolean }> {
  const supabase = createAdminClient()

  const entries = input.entries as Array<{
    account_id: string
    debit: number
    credit: number
    note?: string
  }>

  // Validate double-entry balance
  const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0), 0)
  const totalCredit = entries.reduce((sum, e) => sum + (e.credit || 0), 0)

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      transaction: null as unknown as Transaction,
      success: false,
    }
  }

  // Insert transaction
  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .insert({
      business_id: businessId,
      date: input.date as string || format(new Date(), 'yyyy-MM-dd'),
      description: input.description as string,
      reference: input.reference as string | undefined,
      source: 'ai',
    })
    .select()
    .single()

  if (txError) throw txError

  // Insert lines
  const lines = entries.map(entry => ({
    transaction_id: tx.id,
    account_id: entry.account_id,
    debit: entry.debit || 0,
    credit: entry.credit || 0,
    note: entry.note,
  }))

  const { error: linesError } = await supabase
    .from('transaction_lines')
    .insert(lines)

  if (linesError) throw linesError

  return { transaction: tx, success: true }
}

async function getProfitLoss(
  businessId: string,
  input: Record<string, unknown>
): Promise<ProfitLossReport> {
  const supabase = createAdminClient()

  const startDate = input.start_date as string
  const endDate = input.end_date as string

  const { data: lines, error } = await supabase
    .from('transaction_lines')
    .select(`
      debit, credit,
      account:accounts(id, business_id, code, name, type),
      transaction:transactions!inner(date, business_id)
    `)
    .eq('transaction.business_id', businessId)
    .gte('transaction.date', startDate)
    .lte('transaction.date', endDate)

  if (error) throw error

  const allBalances = aggregateLinesByAccount(businessId, (lines || []) as unknown as TransactionLineJoin[])
  const revenue = allBalances.filter(a => a.type === 'REVENUE')
  const expenses = allBalances.filter(a => a.type === 'EXPENSE')
  const totalRevenue = revenue.reduce((s, a) => s + a.balance, 0)
  const totalExpenses = expenses.reduce((s, a) => s + a.balance, 0)

  return {
    period: { start: startDate, end: endDate },
    revenue,
    expenses,
    total_revenue: totalRevenue,
    total_expenses: totalExpenses,
    net_profit: totalRevenue - totalExpenses
  }
}

async function getBalanceSheet(
  businessId: string,
  input: Record<string, unknown>
): Promise<BalanceSheetReport> {
  const supabase = createAdminClient()
  const asOf = input.as_of_date as string || format(new Date(), 'yyyy-MM-dd')

  const { data: lines, error } = await supabase
    .from('transaction_lines')
    .select(`
      debit, credit,
      account:accounts(id, business_id, code, name, type),
      transaction:transactions!inner(date, business_id)
    `)
    .eq('transaction.business_id', businessId)
    .lte('transaction.date', asOf)

  if (error) throw error

  const all = aggregateLinesByAccount(businessId, (lines || []) as unknown as TransactionLineJoin[])
  const assets = all.filter(a => a.type === 'ASSET')
  const liabilities = all.filter(a => a.type === 'LIABILITY')
  const equity = all.filter(a => a.type === 'EQUITY')

  return {
    as_of: asOf,
    assets,
    liabilities,
    equity,
    total_assets: assets.reduce((s, a) => s + a.balance, 0),
    total_liabilities_equity:
      liabilities.reduce((s, a) => s + a.balance, 0) +
      equity.reduce((s, a) => s + a.balance, 0)
  }
}

async function getCashSummary(
  businessId: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const supabase = createAdminClient()

  const period = input.period as string || 'this_month'
  let startDate: string, endDate: string

  const now = new Date()
  if (period === 'today') {
    startDate = endDate = format(now, 'yyyy-MM-dd')
  } else if (period === 'last_month') {
    const last = subMonths(now, 1)
    startDate = format(startOfMonth(last), 'yyyy-MM-dd')
    endDate = format(endOfMonth(last), 'yyyy-MM-dd')
  } else {
    startDate = format(startOfMonth(now), 'yyyy-MM-dd')
    endDate = format(endOfMonth(now), 'yyyy-MM-dd')
  }

  const balanceSheet = await getBalanceSheet(businessId, { as_of_date: endDate })
  const totalCash = balanceSheet.assets
    .filter(a => ['Kas', 'Bank'].some(k => a.name.includes(k)))
    .reduce((s, a) => s + a.balance, 0)

  // Get cash in/out for period
  const { data: lines } = await supabase
    .from('transaction_lines')
    .select(`
      debit, credit,
      account:accounts(name, type),
      transaction:transactions!inner(date, business_id)
    `)
    .eq('transaction.business_id', businessId)
    .gte('transaction.date', startDate)
    .lte('transaction.date', endDate)

  let cashIn = 0, cashOut = 0

  const cashLines = (lines || []) as unknown as {
    debit: number
    credit: number
    account: JoinedValue<{ name: string; type: string }>
  }[]

  cashLines.forEach((line) => {
    const acc = firstJoin(line.account)
    if (acc?.type === 'REVENUE') {
      cashIn += Number(line.credit)
    } else if (acc?.type === 'EXPENSE') {
      cashOut += Number(line.debit)
    }
  })

  return {
    period: `${startDate} s/d ${endDate}`,
    cash_balance: totalCash,
    cash_in: cashIn,
    cash_out: cashOut,
    net_cash: cashIn - cashOut
  }
}

async function getTransactions(
  businessId: string,
  input: Record<string, unknown>
): Promise<{ transactions: Transaction[] }> {
  const supabase = createAdminClient()

  let query = supabase
    .from('transactions')
    .select(`
      *,
      lines:transaction_lines(
        *,
        account:accounts(code, name, type)
      )
    `)
    .eq('business_id', businessId)
    .order('date', { ascending: false })
    .limit(Number(input.limit) || 10)

  if (input.search) {
    query = query.ilike('description', `%${input.search}%`)
  }

  if (input.date_from) {
    query = query.gte('date', input.date_from as string)
  }

  if (input.date_to) {
    query = query.lte('date', input.date_to as string)
  }

  const { data, error } = await query
  if (error) throw error

  return { transactions: data || [] }
}

async function getDashboardStats(businessId: string): Promise<DashboardStats> {
  const supabase = createAdminClient()

  const now = new Date()
  const thisMonthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const thisMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd')
  const lastMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')
  const lastMonthEnd = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')

  const balanceSheet = await getBalanceSheet(businessId, { as_of_date: thisMonthEnd })
  const cashBalance = balanceSheet.assets
    .filter(a => ['Kas', 'Bank'].some(k => a.name.includes(k)))
    .reduce((s, a) => s + a.balance, 0)

  // This month P&L
  const thisMonth = await getProfitLoss(businessId, {
    start_date: thisMonthStart,
    end_date: thisMonthEnd
  })

  // Last month P&L for comparison
  const lastMonth = await getProfitLoss(businessId, {
    start_date: lastMonthStart,
    end_date: lastMonthEnd
  })

  const revChange = lastMonth.total_revenue > 0
    ? ((thisMonth.total_revenue - lastMonth.total_revenue) / lastMonth.total_revenue) * 100
    : 0

  const expChange = lastMonth.total_expenses > 0
    ? ((thisMonth.total_expenses - lastMonth.total_expenses) / lastMonth.total_expenses) * 100
    : 0

  return {
    cash_balance: cashBalance,
    monthly_revenue: thisMonth.total_revenue,
    monthly_expenses: thisMonth.total_expenses,
    monthly_profit: thisMonth.net_profit,
    revenue_change_pct: revChange,
    expense_change_pct: expChange
  }
}

// ============================================================
// Helper: Format currency IDR
// ============================================================
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
