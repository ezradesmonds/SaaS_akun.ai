import { NextRequest, NextResponse } from 'next/server'
import { executeTool } from '@/lib/accounting/tools'
import { AUTH_ERRORS, getAuthContext } from '@/lib/permissions/guard'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const businessId = searchParams.get('business_id')
  const reportType = searchParams.get('type') // dashboard | profit_loss | balance_sheet | cash_summary

  if (!businessId || !reportType) {
    return NextResponse.json({ error: 'business_id and type required' }, { status: 400 })
  }

  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('view_reports')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

  try {
    let data: unknown

    switch (reportType) {
      case 'dashboard':
        data = await executeTool('get_dashboard_stats', {}, ctx.businessId)
        break

      case 'profit_loss':
        const startDate = searchParams.get('start_date')
        const endDate = searchParams.get('end_date')
        if (!startDate || !endDate) {
          return NextResponse.json({ error: 'start_date and end_date required' }, { status: 400 })
        }
        data = await executeTool('get_profit_loss', { start_date: startDate, end_date: endDate }, ctx.businessId)
        break

      case 'balance_sheet':
        const asOf = searchParams.get('as_of_date')
        data = await executeTool('get_balance_sheet', { as_of_date: asOf }, ctx.businessId)
        break

      case 'cash_summary':
        const period = searchParams.get('period') || 'this_month'
        data = await executeTool('get_cash_summary', { period }, ctx.businessId)
        break

      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Report error:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
