// ============================================================
// AKUN.AI - Global Types
// ============================================================

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
export type TransactionSource = 'manual' | 'ai' | 'import'
export type BusinessType = 'umkm' | 'freelancer' | 'toko' | 'jasa'
export type MessageRole = 'user' | 'assistant'

// ============================================================
// Database Types (matches Supabase schema)
// ============================================================

export interface Business {
  id: string
  user_id: string
  name: string
  type: BusinessType
  currency: string
  description?: string
  created_at: string
  updated_at: string
}

export interface Account {
  id: string
  business_id: string
  code: string
  name: string
  type: AccountType
  description?: string
  is_active: boolean
  created_at: string
}

export interface Transaction {
  id: string
  business_id: string
  date: string
  description: string
  reference?: string
  source: TransactionSource
  created_at: string
  updated_at: string
  // Joined
  lines?: TransactionLine[]
}

export interface TransactionLine {
  id: string
  transaction_id: string
  account_id: string
  debit: number
  credit: number
  note?: string
  created_at: string
  // Joined
  account?: Account
}

export interface ChatSession {
  id: string
  business_id: string
  user_id: string
  title: string
  created_at: string
  // Joined
  messages?: ChatMessage[]
}

export interface ChatMessage {
  id: string
  session_id: string
  role: MessageRole
  content: string
  tool_calls?: ToolCallData[]
  transaction_id?: string
  created_at: string
}

// ============================================================
// LLM / Tool Call Types
// ============================================================

export interface ToolCallData {
  tool: string
  input: Record<string, unknown>
  result?: unknown
}

export interface CreateTransactionInput {
  date: string
  description: string
  reference?: string
  entries: {
    account_id: string
    debit: number
    credit: number
    note?: string
  }[]
}

export interface LLMTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

// ============================================================
// Report Types
// ============================================================

export interface AccountBalance {
  id: string
  business_id: string
  code: string
  name: string
  type: AccountType
  total_debit: number
  total_credit: number
  balance: number
}

export interface ProfitLossReport {
  period: { start: string; end: string }
  revenue: AccountBalance[]
  expenses: AccountBalance[]
  total_revenue: number
  total_expenses: number
  net_profit: number
}

export interface BalanceSheetReport {
  as_of: string
  assets: AccountBalance[]
  liabilities: AccountBalance[]
  equity: AccountBalance[]
  total_assets: number
  total_liabilities_equity: number
}

export interface CashFlowSummary {
  period: string
  cash_in: number
  cash_out: number
  net_cash: number
  opening_balance: number
  closing_balance: number
}

export interface DashboardStats {
  cash_balance: number
  monthly_revenue: number
  monthly_expenses: number
  monthly_profit: number
  revenue_change_pct: number
  expense_change_pct: number
}

// ============================================================
// API Response Types
// ============================================================

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
}
