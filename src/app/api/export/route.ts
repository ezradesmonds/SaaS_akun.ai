import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, AUTH_ERRORS } from '@/lib/permissions/guard'
import { executeTool } from '@/lib/accounting/tools'
import { PLANS } from '@/lib/permissions/plans'
import type { ProfitLossReport, BalanceSheetReport } from '@/types'
import type { Style } from 'exceljs'

// PDF generation via html-to-pdf approach using HTML string → Chromium
// Uses @sparticuz/chromium + puppeteer-core (lightweight for serverless)
// Fallback: return structured JSON if PDF libs unavailable

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const businessId = searchParams.get('business_id')
  const type = searchParams.get('type') // profit_loss | balance_sheet
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const asOfDate = searchParams.get('as_of_date')
  const format = searchParams.get('format') || 'pdf' // pdf | xlsx | csv

  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })

  // Check plan feature
  if (!PLANS[ctx.plan].features.export_pdf && format === 'pdf') {
    return NextResponse.json({
      error: 'Export PDF hanya tersedia di plan Starter ke atas',
      upgrade_required: true,
      plan: ctx.plan,
    }, { status: 402 })
  }

  if (!PLANS[ctx.plan].features.export_excel && format === 'xlsx') {
    return NextResponse.json({
      error: 'Export Excel hanya tersedia di plan Pro',
      upgrade_required: true,
      plan: ctx.plan,
    }, { status: 402 })
  }

  try {
    let reportData: ProfitLossReport | BalanceSheetReport
    let title: string
    let filename: string

    if (type === 'profit_loss') {
      if (!startDate || !endDate) {
        return NextResponse.json({ error: 'start_date dan end_date wajib diisi' }, { status: 400 })
      }
      reportData = await executeTool('get_profit_loss', {
        start_date: startDate,
        end_date: endDate,
      }, ctx.businessId) as unknown as ProfitLossReport

      title = `Laporan Laba Rugi`
      filename = `laba-rugi-${startDate}-${endDate}`
    } else if (type === 'balance_sheet') {
      reportData = await executeTool('get_balance_sheet', {
        as_of_date: asOfDate || new Date().toISOString().split('T')[0],
      }, ctx.businessId) as unknown as BalanceSheetReport

      title = `Neraca Saldo`
      filename = `neraca-${asOfDate || 'today'}`
    } else {
      return NextResponse.json({ error: 'type harus profit_loss atau balance_sheet' }, { status: 400 })
    }

    // Get business name
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()
    const { data: business } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', ctx.businessId)
      .single()

    if (format === 'csv') {
      const csv = generateCSV(reportData, type, title, business?.name || '')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      })
    }

    if (format === 'xlsx') {
      const xlsxBuffer = await generateExcel(reportData, type, title, business?.name || '')
      return new NextResponse(new Uint8Array(xlsxBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
        },
      })
    }

    // PDF: generate HTML then convert
    const html = generateReportHTML(reportData, type, title, business?.name || '', startDate, endDate, asOfDate)

    // Try puppeteer-core for PDF generation
    try {
      const pdfBuffer = await htmlToPdf(html)
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}.pdf"`,
        },
      })
    } catch (pdfError) {
      // Fallback: return HTML for client-side print
      console.warn('PDF generation failed, returning HTML:', pdfError)
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Export-Fallback': 'true',
        },
      })
    }
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Gagal generate laporan' }, { status: 500 })
  }
}

function csvCell(value: string | number) {
  const text = String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function generateCSV(
  data: ProfitLossReport | BalanceSheetReport,
  type: string,
  title: string,
  businessName: string,
) {
  const rows: (string | number)[][] = [
    [businessName],
    [title],
    [],
    ['Kode', 'Nama Akun', 'Kelompok', 'Saldo'],
  ]

  const pushAccounts = (group: string, accounts: { code: string; name: string; balance: number }[], total: number) => {
    accounts.forEach((account) => rows.push([account.code, account.name, group, account.balance]))
    rows.push(['', `Total ${group}`, group, total])
    rows.push([])
  }

  if (type === 'profit_loss') {
    const pl = data as ProfitLossReport
    pushAccounts('Pendapatan', pl.revenue, pl.total_revenue)
    pushAccounts('Pengeluaran', pl.expenses, pl.total_expenses)
    rows.push(['', pl.net_profit >= 0 ? 'Laba Bersih' : 'Rugi Bersih', 'Hasil', pl.net_profit])
  } else {
    const bs = data as BalanceSheetReport
    pushAccounts('Aset', bs.assets, bs.total_assets)
    pushAccounts('Kewajiban', bs.liabilities, bs.liabilities.reduce((sum, account) => sum + account.balance, 0))
    pushAccounts('Ekuitas', bs.equity, bs.equity.reduce((sum, account) => sum + account.balance, 0))
    rows.push(['', 'Total Kewajiban + Ekuitas', 'Hasil', bs.total_liabilities_equity])
  }

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`
}

// ── HTML Template ─────────────────────────────────────────────
function generateReportHTML(
  data: ProfitLossReport | BalanceSheetReport,
  type: string,
  title: string,
  businessName: string,
  startDate?: string | null,
  endDate?: string | null,
  asOfDate?: string | null,
): string {
  const formatIDR = (n: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  const now = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  let periodText = ''
  if (type === 'profit_loss' && startDate && endDate) {
    periodText = `Periode: ${formatDate(startDate)} — ${formatDate(endDate)}`
  } else if (type === 'balance_sheet' && asOfDate) {
    periodText = `Per tanggal: ${formatDate(asOfDate)}`
  }

  let bodyContent = ''

  if (type === 'profit_loss') {
    const pl = data as ProfitLossReport
    const isProfit = pl.net_profit >= 0

    bodyContent = `
      <section>
        <h2>Pendapatan</h2>
        <table>
          <thead><tr><th>Kode</th><th>Nama Akun</th><th class="num">Jumlah</th></tr></thead>
          <tbody>
            ${pl.revenue.map(a => `
              <tr>
                <td class="mono">${a.code}</td>
                <td>${a.name}</td>
                <td class="num">${formatIDR(a.balance)}</td>
              </tr>
            `).join('')}
            <tr class="subtotal">
              <td colspan="2">Total Pendapatan</td>
              <td class="num">${formatIDR(pl.total_revenue)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Beban / Pengeluaran</h2>
        <table>
          <thead><tr><th>Kode</th><th>Nama Akun</th><th class="num">Jumlah</th></tr></thead>
          <tbody>
            ${pl.expenses.map(a => `
              <tr>
                <td class="mono">${a.code}</td>
                <td>${a.name}</td>
                <td class="num">${formatIDR(a.balance)}</td>
              </tr>
            `).join('')}
            <tr class="subtotal">
              <td colspan="2">Total Pengeluaran</td>
              <td class="num">${formatIDR(pl.total_expenses)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <div class="net-result ${isProfit ? 'profit' : 'loss'}">
        <span>${isProfit ? 'Laba Bersih' : 'Rugi Bersih'}</span>
        <span>${formatIDR(Math.abs(pl.net_profit))}</span>
      </div>
    `
  } else {
    const bs = data as BalanceSheetReport
    const renderGroup = (title: string, items: typeof bs.assets, total: number) => `
      <section>
        <h2>${title}</h2>
        <table>
          <thead><tr><th>Kode</th><th>Nama Akun</th><th class="num">Saldo</th></tr></thead>
          <tbody>
            ${items.map(a => `
              <tr>
                <td class="mono">${a.code}</td>
                <td>${a.name}</td>
                <td class="num">${formatIDR(a.balance)}</td>
              </tr>
            `).join('')}
            <tr class="subtotal">
              <td colspan="2">Total ${title}</td>
              <td class="num">${formatIDR(total)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    `

    const liabTotal = bs.liabilities.reduce((s, a) => s + a.balance, 0)
    const eqTotal = bs.equity.reduce((s, a) => s + a.balance, 0)

    bodyContent = `
      ${renderGroup('Aset', bs.assets, bs.total_assets)}
      ${renderGroup('Kewajiban', bs.liabilities, liabTotal)}
      ${renderGroup('Ekuitas', bs.equity, eqTotal)}
      <div class="net-result ${Math.abs(bs.total_assets - bs.total_liabilities_equity) < 1 ? 'profit' : 'loss'}">
        <span>Total Aset</span>
        <span>${formatIDR(bs.total_assets)}</span>
      </div>
      <div class="net-result">
        <span>Total Kewajiban + Ekuitas</span>
        <span>${formatIDR(bs.total_liabilities_equity)}</span>
      </div>
    `
  }

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 32px; }
  
  .header { border-bottom: 2px solid #16a34a; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 22px; color: #16a34a; font-weight: bold; }
  .header .business { font-size: 15px; color: #374151; margin-top: 4px; font-weight: 600; }
  .header .period { font-size: 11px; color: #6b7280; margin-top: 4px; }
  .header .generated { font-size: 10px; color: #9ca3af; margin-top: 2px; }

  section { margin-bottom: 24px; }
  h2 { font-size: 13px; font-weight: bold; color: #374151; margin-bottom: 8px;
       padding: 6px 10px; background: #f3f4f6; border-left: 3px solid #16a34a; }

  table { width: 100%; border-collapse: collapse; }
  th { background: #f9fafb; text-align: left; padding: 6px 8px;
       font-weight: 600; font-size: 10px; color: #6b7280;
       border-bottom: 1px solid #e5e7eb; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
  .num { text-align: right; font-family: 'Courier New', monospace; }
  .mono { color: #6b7280; font-family: 'Courier New', monospace; font-size: 10px; }

  tr.subtotal td { font-weight: bold; background: #f9fafb;
                   border-top: 1px solid #d1d5db; border-bottom: 2px solid #d1d5db; }

  .net-result { display: flex; justify-content: space-between; align-items: center;
    padding: 12px 16px; margin-top: 8px; border-radius: 6px; font-weight: bold; font-size: 14px; }
  .net-result.profit { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
  .net-result.loss { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .net-result:not(.profit):not(.loss) { background: #f9fafb; color: #374151; border: 1px solid #e5e7eb; }

  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb;
            font-size: 10px; color: #9ca3af; text-align: center; }

  @media print {
    body { padding: 16px; }
    @page { margin: 1cm; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="business">${businessName}</div>
    <h1>${title}</h1>
    <div class="period">${periodText}</div>
    <div class="generated">Digenerate: ${now} · Akun.AI</div>
  </div>

  ${bodyContent}

  <div class="footer">
    Laporan ini digenerate otomatis oleh Akun.AI · akun.ai · ${now}
  </div>
</body>
</html>`
}

// ── PDF conversion via puppeteer-core ────────────────────────
async function htmlToPdf(html: string): Promise<Buffer> {
  // Dynamic import so it doesn't break if not installed
  const puppeteer = await import('puppeteer-core').catch(() => null)
  if (!puppeteer) throw new Error('puppeteer-core not available')

  let chromiumPath: string
  try {
    // Try @sparticuz/chromium for serverless (Vercel)
    const chromium = await import('@sparticuz/chromium').catch(() => null)
    chromiumPath = chromium ? await chromium.default.executablePath() : '/usr/bin/chromium-browser'
  } catch {
    chromiumPath = '/usr/bin/chromium-browser'
  }

  const browser = await puppeteer.default.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath: chromiumPath,
    headless: true,
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

// ── Excel generation via exceljs ──────────────────────────────
async function generateExcel(
  data: ProfitLossReport | BalanceSheetReport,
  type: string,
  title: string,
  businessName: string,
): Promise<Buffer> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.default.Workbook()
  workbook.creator = 'Akun.AI'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(title, {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true }
  })

  // Column widths
  sheet.columns = [
    { width: 12 }, // Code
    { width: 36 }, // Name
    { width: 20 }, // Amount
  ]

  // Styles
  const headerStyle = {
    font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF16a34a' } },
    alignment: { horizontal: 'left' as const, vertical: 'middle' as const },
  }
  const sectionStyle = {
    font: { bold: true, size: 10, color: { argb: 'FF374151' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } },
  }
  const subtotalStyle = {
    font: { bold: true, size: 10 },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE5E7EB' } },
    border: {
      top: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'medium' as const, color: { argb: 'FFD1D5DB' } },
    }
  }
  const idrFormat = 'Rp#,##0;(Rp#,##0);"-"'

  const addRow = (data: (string | number)[], style?: Partial<Style>) => {
    const row = sheet.addRow(data)
    if (style) {
      row.eachCell(cell => Object.assign(cell, style))
    }
    return row
  }

  // Title rows
  addRow([businessName], { font: { bold: true, size: 14, color: { argb: 'FF16a34a' } } })
  addRow([title], { font: { bold: true, size: 12 } })
  addRow([`Digenerate: ${new Date().toLocaleDateString('id-ID')}`], { font: { size: 9, color: { argb: 'FF9CA3AF' } } })
  sheet.addRow([])

  // Table header
  const thRow = addRow(['Kode', 'Nama Akun', 'Jumlah'], headerStyle as Partial<typeof headerStyle>)
  thRow.getCell(3).alignment = { horizontal: 'right' }

  const writeAccountGroup = (groupTitle: string, accounts: { code: string; name: string; balance: number }[], total: number) => {
    addRow([groupTitle], sectionStyle as Partial<typeof sectionStyle>)
    accounts.forEach(a => {
      const row = sheet.addRow([a.code, a.name, a.balance])
      row.getCell(3).numFmt = idrFormat
      row.getCell(3).alignment = { horizontal: 'right' }
      row.getCell(1).font = { color: { argb: 'FF6B7280' }, size: 9 }
    })
    const subRow = addRow(['', `Total ${groupTitle}`, total], subtotalStyle as Partial<typeof subtotalStyle>)
    subRow.getCell(3).numFmt = idrFormat
    subRow.getCell(3).alignment = { horizontal: 'right' }
    sheet.addRow([])
  }

  if (type === 'profit_loss') {
    const pl = data as ProfitLossReport
    writeAccountGroup('Pendapatan', pl.revenue, pl.total_revenue)
    writeAccountGroup('Beban / Pengeluaran', pl.expenses, pl.total_expenses)

    const netRow = sheet.addRow(['', pl.net_profit >= 0 ? 'LABA BERSIH' : 'RUGI BERSIH', pl.net_profit])
    netRow.getCell(2).font = { bold: true, size: 12, color: { argb: pl.net_profit >= 0 ? 'FF16a34a' : 'FFDC2626' } }
    netRow.getCell(3).numFmt = idrFormat
    netRow.getCell(3).font = { bold: true, size: 12, color: { argb: pl.net_profit >= 0 ? 'FF16a34a' : 'FFDC2626' } }
    netRow.getCell(3).alignment = { horizontal: 'right' }
  } else {
    const bs = data as BalanceSheetReport
    writeAccountGroup('Aset', bs.assets, bs.total_assets)
    writeAccountGroup('Kewajiban', bs.liabilities, bs.liabilities.reduce((s, a) => s + a.balance, 0))
    writeAccountGroup('Ekuitas', bs.equity, bs.equity.reduce((s, a) => s + a.balance, 0))

    const totalRow = sheet.addRow(['', 'TOTAL KEWAJIBAN + EKUITAS', bs.total_liabilities_equity])
    totalRow.getCell(2).font = { bold: true, size: 11 }
    totalRow.getCell(3).numFmt = idrFormat
    totalRow.getCell(3).alignment = { horizontal: 'right' }
    totalRow.getCell(3).font = { bold: true }
  }

  // Footer
  sheet.addRow([])
  sheet.addRow(['Akun.AI — akun.ai'])

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
