import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedInventoryContext, requireInventoryPermission } from '../_lib'

const CreateLocationSchema = z.object({
  business_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).optional(),
})

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get('business_id')
  const includeInactive = request.nextUrl.searchParams.get('include_inactive') === 'true'

  try {
    const { supabase, user, business } = await getAuthenticatedInventoryContext(businessId)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let query = supabase
      .from('inventory_locations')
      .select('id, business_id, name, code, is_active, created_at, updated_at')
      .eq('business_id', business.id)
      .order('name', { ascending: true })

    if (!includeInactive) query = query.eq('is_active', true)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load locations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const parsed = CreateLocationSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const { supabase, user, business, ctx } = await getAuthenticatedInventoryContext(parsed.data.business_id)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const permission = requireInventoryPermission(ctx, 'manage_accounts')
    if (!permission.allowed) return NextResponse.json(permission.response, { status: permission.status })

    const { data, error } = await supabase
      .from('inventory_locations')
      .insert({
        business_id: business.id,
        name: parsed.data.name,
        code: parsed.data.code || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create location' }, { status: 500 })
  }
}
