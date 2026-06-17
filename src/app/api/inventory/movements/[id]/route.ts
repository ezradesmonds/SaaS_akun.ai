import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedInventoryContext, requireInventoryPermission } from '../../_lib'

const MovementTypeSchema = z.enum(['initial', 'purchase', 'sale', 'adjustment', 'transfer'])

const UpdateMovementSchema = z.object({
  business_id: z.string().uuid(),
  product_id: z.string().uuid().optional(),
  location_id: z.string().uuid().nullable().optional(),
  movement_type: MovementTypeSchema.optional(),
  quantity_delta: z.number().refine((value) => value !== 0, 'quantity_delta must not be zero').optional(),
  unit_cost: z.number().min(0).nullable().optional(),
  occurred_at: z.string().datetime().optional(),
  reference: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const parsed = UpdateMovementSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const { supabase, user, business, ctx } = await getAuthenticatedInventoryContext(parsed.data.business_id)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const permission = requireInventoryPermission(ctx, 'create_transaction')
    if (!permission.allowed) return NextResponse.json(permission.response, { status: permission.status })

    if (parsed.data.product_id) {
      const { data: product, error } = await supabase
        .from('products')
        .select('id')
        .eq('id', parsed.data.product_id)
        .eq('business_id', business.id)
        .maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!product) return NextResponse.json({ error: 'Produk tidak valid untuk bisnis ini' }, { status: 400 })
    }

    if (parsed.data.location_id) {
      const { data: location, error } = await supabase
        .from('inventory_locations')
        .select('id')
        .eq('id', parsed.data.location_id)
        .eq('business_id', business.id)
        .maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!location) return NextResponse.json({ error: 'Lokasi tidak valid untuk bisnis ini' }, { status: 400 })
    }

    const { business_id: _businessId, ...updates } = parsed.data
    const { data, error } = await supabase
      .from('stock_movements')
      .update({
        ...updates,
        location_id: updates.location_id === undefined ? undefined : updates.location_id,
        reference: updates.reference === undefined ? undefined : updates.reference || null,
        note: updates.note === undefined ? undefined : updates.note || null,
      })
      .eq('id', params.id)
      .eq('business_id', business.id)
      .select()
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update movement' }, { status: 500 })
  }
}
