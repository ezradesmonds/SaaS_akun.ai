import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAuthContext, AUTH_ERRORS } from '@/lib/permissions/guard'

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const GenerateSchema = z.object({
  business_id: z.string().uuid(),
  start_date: DateSchema,
  end_date: DateSchema,
  save: z.boolean().optional().default(true),
})

type TaxSummary = {
  period: { start: string; end: string }
  revenue: number
  expenses: number
  taxable_sales_base: number
  ppn_rate: number
  ppn_output_estimate: number
  net_before_tax: number
  compliance_note: string
}

function toNumber(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value || 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

type TaxProfile = {
  id: string | null
  ppn_rate: number
  pkp_enabled: boolean
  npwp: string | null
  metadata: Record<string, unknown>
}

async function getTaxProfile(
  supabase: ReturnType<typeof createClient>,
  businessId: string,
): Promise<TaxProfile> {
  const { data: existing, error } = await supabase
    .from('tax_profiles')
    .select('id, ppn_rate, pkp_enabled, npwp, metadata')
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (existing) {
    return {
      id: existing.id,
      ppn_rate: toNumber(existing.ppn_rate),
      pkp_enabled: Boolean(existing.pkp_enabled),
      npwp: existing.npwp || null,
      metadata: existing.metadata || {},
    }
  }

  return {
    id: null,
    ppn_rate: 0.11,
    pkp_enabled: false,
    npwp: null,
    metadata: {
      note: 'Default PPN rate used because no tax_profile exists for this business yet.',
    },
  }
}

async function buildSummary(
  supabase: ReturnType<typeof createClient>,
  businessId: string,
  startDate: string,
  endDate: string,
): Promise<{ taxProfile: TaxProfile; summary: TaxSummary }> {
  if (startDate > endDate) {
    throw new Error('start_date tidak boleh setelah end_date')
  }

  const taxProfile = await getTaxProfile(supabase, businessId)

  const { data: lines, error } = await supabase
    .from('transaction_lines')
    .select(`
      debit,
      credit,
      account:accounts!inner(type),
      transaction:transactions!inner(business_id, date)
    `)
    .eq('transaction.business_id', businessId)
    .gte('transaction.date', startDate)
    .lte('transaction.date', endDate)

  if (error) throw new Error(error.message)

  let revenue = 0
  let expenses = 0

  for (const line of lines || []) {
    const account = Array.isArray(line.account) ? line.account[0] : line.account
    const accountType = account?.type
    const debit = toNumber(line.debit)
    const credit = toNumber(line.credit)

    if (accountType === 'REVENUE') revenue += credit - debit
    if (accountType === 'EXPENSE') expenses += debit - credit
  }

  revenue = roundCurrency(Math.max(0, revenue))
  expenses = roundCurrency(Math.max(0, expenses))

  const ppnRate = taxProfile.ppn_rate
  const taxableSalesBase = revenue
  const ppnOutputEstimate = roundCurrency(taxableSalesBase * ppnRate)

  return {
    taxProfile,
    summary: {
      period: { start: startDate, end: endDate },
      revenue,
      expenses,
      taxable_sales_base: taxableSalesBase,
      ppn_rate: ppnRate,
      ppn_output_estimate: ppnOutputEstimate,
      net_before_tax: roundCurrency(revenue - expenses),
      compliance_note:
        'Ringkasan pajak sederhana berbasis akun pendapatan/beban. Ini bukan kalkulasi kepatuhan penuh dan belum membuat file e-Faktur.',
    },
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const businessId = searchParams.get('business_id')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const generate = searchParams.get('generate') === 'true'

  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })

  const supabase = createClient()

  try {
    if (generate) {
      const parsed = GenerateSchema.safeParse({
        business_id: ctx.businessId,
        start_date: startDate,
        end_date: endDate,
        save: false,
      })
      if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

      const { taxProfile, summary } = await buildSummary(
        supabase,
        ctx.businessId,
        parsed.data.start_date,
        parsed.data.end_date,
      )

      return NextResponse.json({
        data: {
          tax_profile: taxProfile,
          summary,
          export_metadata: {
            e_faktur: 'TODO: metadata placeholder only; official e-Faktur export is not implemented.',
            excel_placeholder: true,
          },
        },
      })
    }

    const { data, error } = await supabase
      .from('tax_reports')
      .select('id, report_type, period_start, period_end, status, summary, export_metadata, generated_at, created_at')
      .eq('business_id', ctx.businessId)
      .order('generated_at', { ascending: false })
      .limit(50)

    if (error) throw new Error(error.message)
    return NextResponse.json({ data: data || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memuat laporan pajak' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = GenerateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const ctx = await getAuthContext(parsed.data.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })

  const supabase = createClient()

  try {
    const { taxProfile, summary } = await buildSummary(
      supabase,
      ctx.businessId,
      parsed.data.start_date,
      parsed.data.end_date,
    )

    if (!parsed.data.save) {
      return NextResponse.json({ data: { tax_profile: taxProfile, summary } })
    }

    const exportMetadata = {
      e_faktur: 'TODO: metadata placeholder only; official e-Faktur export is not implemented.',
      excel_placeholder: true,
      secrets_required: false,
    }

    const { data: report, error } = await supabase
      .from('tax_reports')
      .insert({
        business_id: ctx.businessId,
        tax_profile_id: taxProfile.id,
        report_type: 'ppn_summary',
        period_start: parsed.data.start_date,
        period_end: parsed.data.end_date,
        status: 'generated',
        summary,
        export_metadata: exportMetadata,
        generated_by: ctx.userId,
      })
      .select('id, report_type, period_start, period_end, status, summary, export_metadata, generated_at, created_at')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ data: report }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal membuat laporan pajak' },
      { status: 500 },
    )
  }
}
