import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedInventoryContext, requireInventoryPermission, toNumber } from '../_lib'

const CreateProductSchema = z.object({
  business_id: z.string().uuid(),
  sku: z.string().trim().max(80).optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional(),
  unit: z.string().trim().min(1).max(24).default('pcs'),
  low_stock_threshold: z.number().min(0).default(0),
  initial_stock: z.number().optional(),
  location_id: z.string().uuid().optional(),
})

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get('business_id')
  const locationId = request.nextUrl.searchParams.get('location_id')
  const search = request.nextUrl.searchParams.get('search')?.trim() || ''
  const showInactive = request.nextUrl.searchParams.get('include_inactive') === 'true'

  try {
    const { supabase, user, business } = await getAuthenticatedInventoryContext(businessId)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let productQuery = supabase
      .from('products')
      .select('id, business_id, sku, name, description, unit, low_stock_threshold, is_active, created_at, updated_at')
      .eq('business_id', business.id)
      .order('name', { ascending: true })

    if (!showInactive) productQuery = productQuery.eq('is_active', true)
    if (search) productQuery = productQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)

    const [{ data: products, error: productError }, { data: movements, error: movementError }] = await Promise.all([
      productQuery,
      supabase
        .from('stock_movements')
        .select('product_id, quantity_delta, occurred_at')
        .eq('business_id', business.id)
        .order('occurred_at', { ascending: false }),
    ])

    if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
    if (movementError) return NextResponse.json({ error: movementError.message }, { status: 500 })

    let scopedMovements = movements || []
    if (locationId) {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('product_id, quantity_delta, occurred_at')
        .eq('business_id', business.id)
        .eq('location_id', locationId)
        .order('occurred_at', { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      scopedMovements = data || []
    }

    const stockByProduct = scopedMovements.reduce((acc, movement) => {
      const productId = movement.product_id as string
      const current = acc.get(productId) || { current_stock: 0, last_movement_at: null as string | null }
      current.current_stock += toNumber(movement.quantity_delta)
      if (!current.last_movement_at) current.last_movement_at = movement.occurred_at as string
      acc.set(productId, current)
      return acc
    }, new Map<string, { current_stock: number; last_movement_at: string | null }>())

    const data = (products || []).map((product) => {
      const stock = stockByProduct.get(product.id as string) || { current_stock: 0, last_movement_at: null }
      return {
        ...product,
        ...stock,
        is_low_stock: stock.current_stock <= toNumber(product.low_stock_threshold),
      }
    })

    return NextResponse.json({
      data,
      low_stock_count: data.filter((product) => product.is_low_stock).length,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load products' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const parsed = CreateProductSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const { supabase, user, business, ctx } = await getAuthenticatedInventoryContext(parsed.data.business_id)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const permission = requireInventoryPermission(ctx, 'manage_accounts')
    if (!permission.allowed) return NextResponse.json(permission.response, { status: permission.status })

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

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        business_id: business.id,
        sku: parsed.data.sku || null,
        name: parsed.data.name,
        description: parsed.data.description || null,
        unit: parsed.data.unit,
        low_stock_threshold: parsed.data.low_stock_threshold,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (parsed.data.initial_stock && parsed.data.initial_stock !== 0) {
      const { error: movementError } = await supabase
        .from('stock_movements')
        .insert({
          business_id: business.id,
          product_id: product.id,
          location_id: parsed.data.location_id || null,
          movement_type: 'initial',
          quantity_delta: parsed.data.initial_stock,
          note: 'Initial stock',
          created_by: user.id,
        })

      if (movementError) {
        await supabase.from('products').delete().eq('id', product.id).eq('business_id', business.id)
        return NextResponse.json({ error: movementError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ data: product }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create product' }, { status: 500 })
  }
}
