import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedInventoryContext, requireInventoryPermission } from '../_lib'

const MovementTypeSchema = z.enum(['initial', 'purchase', 'sale', 'adjustment', 'transfer'])

const CreateMovementSchema = z.object({
  business_id: z.string().uuid(),
  product_id: z.string().uuid(),
  location_id: z.string().uuid().optional(),
  movement_type: MovementTypeSchema,
  quantity_delta: z.number().refine((value) => value !== 0, 'quantity_delta must not be zero'),
  unit_cost: z.number().min(0).optional(),
  occurred_at: z.string().datetime().optional(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
})

async function validateMovementRefs(
  supabase: ReturnType<typeof import('@/lib/supabase/server').createClient>,
  businessId: string,
  productId: string,
  locationId?: string,
) {
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (productError) throw new Error(productError.message)
  if (!product) return 'Produk tidak valid untuk bisnis ini'

  if (locationId) {
    const { data: location, error: locationError } = await supabase
      .from('inventory_locations')
      .select('id')
      .eq('id', locationId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (locationError) throw new Error(locationError.message)
    if (!location) return 'Lokasi tidak valid untuk bisnis ini'
  }

  return null
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get('business_id')
  const productId = request.nextUrl.searchParams.get('product_id')
  const locationId = request.nextUrl.searchParams.get('location_id')
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit') || '50')))

  try {
    const { supabase, user, business } = await getAuthenticatedInventoryContext(businessId)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let query = supabase
      .from('stock_movements')
      .select(`
        id, business_id, product_id, location_id, movement_type, quantity_delta,
        unit_cost, occurred_at, reference, note, created_at, updated_at,
        product:products(id, sku, name, unit),
        location:inventory_locations(id, name, code)
      `)
      .eq('business_id', business.id)
      .order('occurred_at', { ascending: false })
      .limit(limit)

    if (productId) query = query.eq('product_id', productId)
    if (locationId) query = query.eq('location_id', locationId)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load movements' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const parsed = CreateMovementSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const { supabase, user, business, ctx } = await getAuthenticatedInventoryContext(parsed.data.business_id)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const permission = requireInventoryPermission(ctx, 'create_transaction')
    if (!permission.allowed) return NextResponse.json(permission.response, { status: permission.status })

    const refError = await validateMovementRefs(supabase, business.id, parsed.data.product_id, parsed.data.location_id)
    if (refError) return NextResponse.json({ error: refError }, { status: 400 })

    const { data, error } = await supabase
      .from('stock_movements')
      .insert({
        business_id: business.id,
        product_id: parsed.data.product_id,
        location_id: parsed.data.location_id || null,
        movement_type: parsed.data.movement_type,
        quantity_delta: parsed.data.quantity_delta,
        unit_cost: parsed.data.unit_cost ?? null,
        occurred_at: parsed.data.occurred_at || new Date().toISOString(),
        reference: parsed.data.reference || null,
        note: parsed.data.note || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create movement' }, { status: 500 })
  }
}
