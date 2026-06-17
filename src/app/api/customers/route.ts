import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { AUTH_ERRORS, getAuthContext } from '@/lib/permissions/guard'

const CustomerSchema = z.object({
  business_id: z.string().uuid(),
  code: z.string().trim().max(40).optional().nullable(),
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(160).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  province: z.string().trim().max(80).optional().nullable(),
  postal_code: z.string().trim().max(20).optional().nullable(),
  npwp: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  is_active: z.boolean().optional(),
})

function cleanCustomer(input: z.infer<typeof CustomerSchema>) {
  return {
    business_id: input.business_id,
    code: input.code || null,
    name: input.name,
    email: input.email || null,
    phone: input.phone || null,
    address: input.address || null,
    city: input.city || null,
    province: input.province || null,
    postal_code: input.postal_code || null,
    npwp: input.npwp || null,
    notes: input.notes || null,
    is_active: input.is_active ?? true,
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const businessId = searchParams.get('business_id')
  const search = searchParams.get('search')?.trim() || ''
  const includeInactive = searchParams.get('include_inactive') === 'true'
  const page = Math.max(1, Number(searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '50')))

  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })

  const supabase = createClient()
  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('business_id', ctx.businessId)
    .order('name')
    .range((page - 1) * limit, page * limit - 1)

  if (!includeInactive) query = query.eq('is_active', true)
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,npwp.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    per_page: limit,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = CustomerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const ctx = await getAuthContext(parsed.data.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('create_transaction')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

  const supabase = createClient()
  const { data, error } = await supabase
    .from('customers')
    .insert(cleanCustomer(parsed.data))
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
