import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedInventoryContext } from '../_lib'

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get('business_id')

  try {
    const { supabase, user, business } = await getAuthenticatedInventoryContext(businessId)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data, error } = await supabase
      .from('low_stock_alerts')
      .select('product_id, business_id, sku, name, unit, current_stock, low_stock_threshold, last_movement_at, is_low_stock')
      .eq('business_id', business.id)
      .order('name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load alerts' }, { status: 500 })
  }
}
