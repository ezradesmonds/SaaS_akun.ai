import { z } from 'zod'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

const SupportedIntentSchema = z.enum([
  'create_transaction',
  'ask_profit_loss',
  'ask_balance_sheet',
  'ask_cash_balance',
  'search_transactions',
  'ask_expense_breakdown',
  'general_accounting_help',
  'unclear',
])

const TransactionLineDraftSchema = z.object({
  account_code: z.string().min(1).optional(),
  account_name: z.string().min(1).optional(),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  note: z.string().optional(),
})

export const AccountingIntentSchema = z.object({
  intent: SupportedIntentSchema,
  confidence: z.number().min(0).max(1),
  response: z.string().min(1),
  follow_up_question: z.string().optional(),
  date_range: z.object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).optional(),
  search: z.object({
    query: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }).optional(),
  transaction: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    description: z.string().min(1).optional(),
    reference: z.string().optional(),
    lines: z.array(TransactionLineDraftSchema).optional(),
    is_ambiguous: z.boolean().default(true),
    ambiguity_reason: z.string().optional(),
  }).optional(),
})

export type AccountingIntent = z.infer<typeof AccountingIntentSchema>

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export class OpenRouterConfigError extends Error {}
export class OpenRouterUnavailableError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
  }
}

function getOpenRouterConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL

  if (!apiKey) throw new OpenRouterConfigError('OPENROUTER_API_KEY belum dikonfigurasi.')
  if (!model) throw new OpenRouterConfigError('OPENROUTER_MODEL belum dikonfigurasi.')

  return { apiKey, model }
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function buildSystemPrompt(accountCatalog: string) {
  return `
Kamu adalah intent parser akuntansi untuk Akun.AI.

Tanggal hari ini: ${todayISO()}.

Kamu hanya boleh mengembalikan JSON valid. Jangan gunakan markdown. Jangan menulis SQL. Jangan menyarankan SQL.
Backend akan menjalankan fungsi internal yang aman berdasarkan JSON ini.

Supported intents:
create_transaction, ask_profit_loss, ask_balance_sheet, ask_cash_balance, search_transactions, ask_expense_breakdown, general_accounting_help, unclear.

Aturan:
- Jika permintaan tidak jelas, gunakan intent "unclear" dan isi follow_up_question.
- Jika user ingin mencatat transaksi tapi detail akun, nominal, tanggal, arah debit/kredit, atau konteksnya ambigu, gunakan intent "create_transaction" dengan transaction.is_ambiguous=true. Backend akan membuat draft, bukan menyimpan transaksi.
- Hanya gunakan account_code/account_name dari katalog akun berikut. Jangan membuat account_id.
- Untuk transaksi double-entry, lines harus balance: total debit = total credit.
- Untuk pertanyaan laporan, gunakan date_range jika user menyebut periode. Jika tidak, pilih periode masuk akal dan jelaskan di response.
- Untuk bantuan umum akuntansi, jawab ringkas di response dan jangan minta tool.

Katalog akun aktif:
${accountCatalog || 'Tidak ada akun aktif.'}

JSON schema yang harus dipatuhi:
{
  "intent": "create_transaction | ask_profit_loss | ask_balance_sheet | ask_cash_balance | search_transactions | ask_expense_breakdown | general_accounting_help | unclear",
  "confidence": 0.0,
  "response": "jawaban singkat untuk user",
  "follow_up_question": "opsional jika perlu klarifikasi",
  "date_range": { "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "as_of_date": "YYYY-MM-DD" },
  "search": { "query": "kata kunci", "limit": 10 },
  "transaction": {
    "date": "YYYY-MM-DD",
    "description": "deskripsi",
    "reference": "opsional",
    "is_ambiguous": true,
    "ambiguity_reason": "alasan",
    "lines": [
      { "account_code": "1-001", "account_name": "Kas", "debit": 0, "credit": 0, "note": "opsional" }
    ]
  }
}
`.trim()
}

function extractJson(content: string) {
  const trimmed = content.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed

  const match = trimmed.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('OpenRouter tidak mengembalikan JSON.')
  return match[0]
}

export async function classifyAccountingIntent({
  messages,
  accountCatalog,
}: {
  messages: LLMMessage[]
  accountCatalog: string
}): Promise<AccountingIntent> {
  const { apiKey, model } = getOpenRouterConfig()

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Akun.AI',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(accountCatalog) },
        ...messages,
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1200,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const message =
      response.status === 401 ? 'OpenRouter API key tidak valid.' :
      response.status === 402 ? 'Kuota OpenRouter habis atau billing belum aktif.' :
      response.status === 404 ? 'OPENROUTER_MODEL tidak ditemukan atau tidak tersedia.' :
      response.status === 429 ? 'Rate limit OpenRouter tercapai. Coba lagi sebentar.' :
      `OpenRouter error ${response.status}: ${text || response.statusText}`

    throw new OpenRouterUnavailableError(message, response.status)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new OpenRouterUnavailableError('OpenRouter tidak mengembalikan respons yang valid.')
  }

  const parsedJson = JSON.parse(extractJson(content))
  return AccountingIntentSchema.parse(parsedJson)
}
