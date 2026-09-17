import { getDecisionData } from '@/lib/accounting/decision-data'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, AUTH_ERRORS } from '@/lib/permissions/guard'

export async function GET(request: NextRequest) {
  return respond(request, false)
}
export async function POST(request: NextRequest) {
  return respond(request, true)
}
async function respond(request: NextRequest, reason: boolean) {
  const ctx = await getAuthContext(request.nextUrl.searchParams.get('business_id'))
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('view_reports') || (reason && !ctx.can('use_ai_chat'))) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })
  if (reason && !ctx.withinLimit('ai')) return NextResponse.json(AUTH_ERRORS.plan_limit_ai, { status: 402 })
  try {
    return NextResponse.json(await getDecisionData(ctx.businessId, reason))
  } catch (error) {
    console.error('Financial insights unavailable', error instanceof Error ? error.message : 'query error')
    return NextResponse.json({ error: 'Ringkasan belum dapat dimuat. Coba lagi dan pastikan data bisnis tersedia.' }, { status: 503 })
  }
}
