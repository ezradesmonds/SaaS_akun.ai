import { businessPeriods } from './dates'
import { z } from 'zod'
import { trackUsage } from '@/lib/permissions/guard'
import { executeTool } from '@/lib/accounting/tools'
import { createClient } from '@/lib/supabase/server'
import type { ProfitLossReport, BalanceSheetReport } from '@/types'

export async function getDecisionData(businessId: string, reason = false) {
  const now = new Date()
  const dates = businessPeriods(now)
  const today = dates.today
  const range = { start_date: dates.start, end_date: today }
  const supabase = createClient()
  const [
    profit,
    cash,
    invoices,
    currentBalance,
    openingBalance,
    previousProfit,
  ] = await Promise.all([
    executeTool('get_profit_loss', range, businessId),
    executeTool('get_cash_summary', { period: 'this_month' }, businessId),
    supabase
      .from('invoices')
      .select('id, invoice_number, due_date, balance_due')
      .eq('business_id', businessId)
      .eq('status', 'issued')
      .gt('balance_due', 0)
      .lte('due_date', today)
      .order('due_date')
      .limit(20),
    executeTool('get_balance_sheet', { as_of_date: today }, businessId),
    executeTool('get_balance_sheet', { as_of_date: dates.lastEnd }, businessId),
    executeTool(
      'get_profit_loss',
      { start_date: dates.lastStart, end_date: dates.comparableEnd },
      businessId,
    ),
  ])
  if (invoices.error) throw invoices.error
  const pl = profit as ProfitLossReport
  const cashData = cash as {
    cash_balance: number
    cash_in: number
    cash_out: number
    net_cash: number
    opening_balance: number
    period: string
  }
  const bs = currentBalance as BalanceSheetReport
  const opening = openingBalance as BalanceSheetReport
  const previous = previousProfit as ProfitLossReport
  const balance = (report: BalanceSheetReport, code: string) =>
    [...report.assets, ...report.liabilities].find((a) => a.code === code)
      ?.balance || 0
  const workingCapital = {
    receivables: balance(bs, '1-003'),
    receivables_change: balance(bs, '1-003') - balance(opening, '1-003'),
    inventory: balance(bs, '1-004'),
    inventory_change: balance(bs, '1-004') - balance(opening, '1-004'),
    payables: balance(bs, '2-001'),
    payables_change: balance(bs, '2-001') - balance(opening, '2-001'),
  }
  const evidence = [
    {
      title: 'Piutang usaha',
      amount: workingCapital.receivables,
      change: workingCapital.receivables_change,
      note: 'Saldo akun piutang standar; kenaikan dapat menahan konversi penjualan menjadi kas.',
    },
    {
      title: 'Persediaan barang',
      amount: workingCapital.inventory,
      change: workingCapital.inventory_change,
      note: 'Saldo akun persediaan standar; belum mengukur umur stok atau inventory days.',
    },
    {
      title: 'Utang usaha',
      amount: workingCapital.payables,
      change: workingCapital.payables_change,
      note: 'Saldo akun utang standar; belum memuat jadwal jatuh tempo pemasok.',
    },
  ]
  const actions = [
    ...(invoices.data || []).map((i) => ({
      id: i.id,
      title: `Tinjau invoice ${i.invoice_number}`,
      detail: `Jatuh tempo ${i.due_date} · sisa Rp${Number(i.balance_due).toLocaleString('id-ID')}`,
      href: '/invoices',
      due_date: i.due_date,
      priority: 'attention',
    })),
    ...(pl.net_profit < 0
      ? [
          {
            id: 'expenses',
            title: 'Periksa beban terbesar',
            detail:
              'Beban melebihi pendapatan pada periode ini. Tinjau rincian sebelum memotong biaya.',
            href: '/reports?type=profit_loss',
            priority: 'attention',
          },
        ]
      : []),
    ...(cashData.net_cash < 0
      ? [
          {
            id: 'cash',
            title: 'Tinjau pengeluaran kas',
            detail:
              'Kas keluar melebihi kas masuk bulan ini. Periksa pembayaran dan transfer terkait.',
            href: '/reports?type=cash_summary',
            priority: 'attention',
          },
        ]
      : []),
    ...(workingCapital.inventory_change > 0
      ? [
          {
            id: 'inventory',
            title: 'Review pembelian persediaan',
            detail: `Saldo persediaan naik Rp${workingCapital.inventory_change.toLocaleString('id-ID')} sejak awal bulan. Periksa kebutuhan stok sebelum memesan lagi.`,
            href: '/inventory',
            priority: 'normal',
          },
        ]
      : []),
    ...(!pl.total_revenue && !pl.total_expenses
      ? [
          {
            id: 'capture',
            title: 'Lengkapi bukti transaksi',
            detail:
              'Belum ada pendapatan atau beban tercatat periode ini. Data kosong belum berarti usaha tidak beraktivitas.',
            href: '/capture',
            priority: 'normal',
          },
        ]
      : []),
  ]
  let analysis: string | null = null
  if (reason) {
    const model = process.env.OPENROUTER_MODEL
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!model || !apiKey)
      throw new Error('Analisis AI belum dikonfigurasi pada server.')
    // Only numeric aggregates leave the server. No receipt, customer identity or invoice number.
    const facts = {
      period: range,
      revenue: pl.total_revenue,
      expenses: pl.total_expenses,
      profit: pl.net_profit,
      cash: cashData,
      working_capital_standard_accounts: workingCapital,
      previous_comparable_period: previous.period,
      previous_revenue: previous.total_revenue,
      previous_expenses: previous.total_expenses,
      limitations: [
        'AR/AP/inventory hanya kode akun default 1-003, 1-004, 2-001; akun custom belum dipetakan',
        'Tidak ada inventory days, atribusi iklan, atau bukti kausal',
        'Jumlah invoice dibatasi sampel 20',
      ],
      due_invoice_count_in_sample: invoices.data?.length || 0,
    }
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        signal: AbortSignal.timeout(45000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 1000,
          messages: [
            {
              role: 'system',
              content:
                'Anda analis pembukuan UMKM. Jawab dalam bahasa Indonesia, maksimal 3 paragraf pendek. Gunakan HANYA fakta JSON. Bedakan laba dan kas. Jangan mengarang tren, penyebab, proyeksi, rasio industri, atau kondisi sehat. Sebutkan periode dan keterbatasan data. Pisahkan observasi dari hipotesis. Sarankan pemeriksaan konkret, bukan transaksi otomatis. Nilai nol dapat berarti data belum lengkap. Jangan memberikan kepastian pajak/investasi.',
            },
            { role: 'user', content: JSON.stringify(facts) },
          ],
        }),
      },
    )
    if (!response.ok) throw new Error('Penyedia AI tidak merespons')
    const data = await response.json()
    analysis = z
      .string()
      .trim()
      .min(1)
      .max(6000)
      .parse(data.choices?.[0]?.message?.content)
    await trackUsage(businessId, 'ai_calls')
  }
  return {
    period: range,
    generated_at: now.toISOString(),
    profit: {
      revenue: pl.total_revenue,
      expenses: pl.total_expenses,
      net: pl.net_profit,
    },
    cash: cashData,
    evidence,
    comparison: {
      period: previous.period,
      revenue: previous.total_revenue,
      expenses: previous.total_expenses,
    },
    actions,
    analysis,
    invoice_limit: 20,
  }
}
