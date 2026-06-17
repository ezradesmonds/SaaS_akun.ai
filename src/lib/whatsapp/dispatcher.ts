import { endOfMonth, format, startOfMonth } from 'date-fns'
import { executeTool, formatIDR } from '@/lib/accounting/tools'

type WhatsAppIntent =
  | 'ask_cash_summary'
  | 'ask_sales_summary'
  | 'create_invoice'
  | 'help'
  | 'unsupported'

type DispatchResult = {
  intent: WhatsAppIntent
  responseText: string
  toolCalls: Array<{
    tool: string
    input: unknown
    result: unknown
  }>
}

function currentMonthRange() {
  const now = new Date()
  return {
    start_date: format(startOfMonth(now), 'yyyy-MM-dd'),
    end_date: format(endOfMonth(now), 'yyyy-MM-dd'),
  }
}

export function classifyWhatsAppIntent(text: string): WhatsAppIntent {
  const normalized = text.toLowerCase()

  if (/\b(help|bantuan|menu)\b/.test(normalized)) return 'help'
  if (/(invoice|tagihan|faktur)/.test(normalized)) return 'create_invoice'
  if (/(penjualan|pendapatan|sales|omzet|revenue)/.test(normalized)) return 'ask_sales_summary'
  if (/(kas|cash|bank|saldo)/.test(normalized)) return 'ask_cash_summary'

  return 'unsupported'
}

export async function dispatchWhatsAppText(
  businessId: string,
  text: string,
): Promise<DispatchResult> {
  const intent = classifyWhatsAppIntent(text)

  if (intent === 'ask_cash_summary') {
    const input = { period: 'this_month' }
    const result = await executeTool('get_cash_summary', input, businessId)
    const cash = result as { cash_balance?: number; cash_in?: number; cash_out?: number; net_cash?: number; period?: string }

    return {
      intent,
      responseText: [
        `Saldo kas/bank: ${formatIDR(Number(cash.cash_balance || 0))}.`,
        `Kas masuk: ${formatIDR(Number(cash.cash_in || 0))}.`,
        `Kas keluar: ${formatIDR(Number(cash.cash_out || 0))}.`,
        cash.period ? `Periode: ${cash.period}.` : '',
      ].filter(Boolean).join(' '),
      toolCalls: [{ tool: 'get_cash_summary', input, result }],
    }
  }

  if (intent === 'ask_sales_summary') {
    const input = currentMonthRange()
    const result = await executeTool('get_profit_loss', input, businessId)
    const profitLoss = result as { total_revenue?: number; total_expenses?: number; net_profit?: number }

    return {
      intent,
      responseText: [
        `Pendapatan bulan ini: ${formatIDR(Number(profitLoss.total_revenue || 0))}.`,
        `Pengeluaran: ${formatIDR(Number(profitLoss.total_expenses || 0))}.`,
        `Laba bersih: ${formatIDR(Number(profitLoss.net_profit || 0))}.`,
      ].join(' '),
      toolCalls: [{ tool: 'get_profit_loss', input, result }],
    }
  }

  if (intent === 'create_invoice') {
    return {
      intent,
      responseText: 'Pembuatan invoice lewat WhatsApp belum diaktifkan. Untuk sekarang aku hanya bisa bantu cek kas dan ringkasan penjualan.',
      toolCalls: [{ tool: 'create_invoice_draft', input: { text }, result: { status: 'unsupported' } }],
    }
  }

  if (intent === 'help') {
    return {
      intent,
      responseText: 'Menu Akun.AI WhatsApp: ketik "saldo kas" untuk kas/bank, atau "penjualan bulan ini" untuk ringkasan pendapatan.',
      toolCalls: [{ tool: 'help', input: { text }, result: null }],
    }
  }

  return {
    intent,
    responseText: 'Aku belum bisa memproses pesan itu. Coba ketik "saldo kas" atau "penjualan bulan ini".',
    toolCalls: [{ tool: 'unsupported', input: { text }, result: null }],
  }
}

