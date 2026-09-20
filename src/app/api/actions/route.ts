import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext, AUTH_ERRORS } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
const schema = z.object({
  business_id: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  detail: z.string().max(2000),
  due_date: z.string().date(),
  source_key: z.string().min(1).max(200),
})
const unavailable = () =>
  NextResponse.json(
    {
      error:
        'Action plan belum dapat disimpan atau dimuat. Coba lagi; hubungi pengelola jika masalah berlanjut.',
    },
    { status: 503 },
  )
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext(
    request.nextUrl.searchParams.get('business_id'),
  )
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('view_reports'))
    return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })
  const { data, error } = await createClient()
    .from('financial_actions')
    .select('*')
    .eq('business_id', ctx.businessId)
    .order('due_date')
    .limit(100)
  if (error) return unavailable()
  return NextResponse.json({ data })
}
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Isi judul dan tanggal tindakan dengan valid.' },
      { status: 400 },
    )
  const ctx = await getAuthContext(parsed.data.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('create_transaction'))
    return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })
  const { data, error } = await createClient()
    .from('financial_actions')
    .upsert(
      { ...parsed.data, created_by: ctx.userId },
      { onConflict: 'business_id,source_key', ignoreDuplicates: true },
    )
    .select()
  if (error) return unavailable()
  return NextResponse.json({ data }, { status: 201 })
}
export async function PATCH(request: NextRequest) {
  const parsed = z
    .object({
      id: z.string().uuid(),
      business_id: z.string().uuid(),
      status: z.enum(['open', 'done']),
    })
    .safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: 'Tindakan tidak valid' }, { status: 400 })
  const ctx = await getAuthContext(parsed.data.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('create_transaction'))
    return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })
  const { data, error } = await createClient()
    .from('financial_actions')
    .update({
      status: parsed.data.status,
      completed_at:
        parsed.data.status === 'done' ? new Date().toISOString() : null,
    })
    .eq('business_id', ctx.businessId)
    .eq('id', parsed.data.id)
    .select('id')
    .maybeSingle()
  if (error) return unavailable()
  if (!data)
    return NextResponse.json(
      { error: 'Tindakan tidak ditemukan' },
      { status: 404 },
    )
  return NextResponse.json({ data })
}
