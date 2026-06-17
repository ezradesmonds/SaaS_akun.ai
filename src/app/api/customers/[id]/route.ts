import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { AUTH_ERRORS, getAuthContext } from '@/lib/permissions/guard'

const UpdateCustomerSchema = z.object({
  business_id: z.string().uuid(),
  code: z.string().trim().max(40).optional().nullable(),
  name: z.string().trim().min(1).max(160).optional(),
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

async function getCustomerBusiness(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('customers')
    .select('business_id')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.business_id as string | undefined
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const businessId = await getCustomerBusiness(params.id).catch(() => null)
  if (!businessId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })

  const supabase = createClient()
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', params.id)
    .eq('business_id', ctx.businessId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await request.json().catch(() => null)
  const parsed = UpdateCustomerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const businessId = await getCustomerBusiness(params.id).catch(() => null)
  if (!businessId || businessId !== parsed.data.business_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('create_transaction')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

  const { business_id: _businessId, ...rest } = parsed.data
  const supabase = createClient()
  const { data, error } = await supabase
    .from('customers')
    .update({
      ...rest,
      code: rest.code || null,
      email: rest.email || null,
      phone: rest.phone || null,
      address: rest.address || null,
      city: rest.city || null,
      province: rest.province || null,
      postal_code: rest.postal_code || null,
      npwp: rest.npwp || null,
      notes: rest.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('business_id', ctx.businessId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const businessId = request.nextUrl.searchParams.get('business_id') || await getCustomerBusiness(params.id).catch(() => null)
  if (!businessId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('delete_transaction')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

  const supabase = createClient()
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', params.id)
    .eq('business_id', ctx.businessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
