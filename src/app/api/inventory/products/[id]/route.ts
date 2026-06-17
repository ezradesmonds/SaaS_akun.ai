import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedInventoryContext, requireInventoryPermission } from '../../_lib'

const UpdateProductSchema = z.object({
  business_id: z.string().uuid(),
  sku: z.string().trim().max(80).nullable().optional(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  unit: z.string().trim().min(1).max(24).optional(),
  low_stock_threshold: z.number().min(0).optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const parsed = UpdateProductSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const { supabase, user, business, ctx } = await getAuthenticatedInventoryContext(parsed.data.business_id)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const permission = requireInventoryPermission(ctx, 'manage_accounts')
    if (!permission.allowed) return NextResponse.json(permission.response, { status: permission.status })

    const { business_id: _businessId, ...updates } = parsed.data
    const { data, error } = await supabase
      .from('products')
      .update({
        ...updates,
        sku: updates.sku === undefined ? undefined : updates.sku || null,
        description: updates.description === undefined ? undefined : updates.description || null,
      })
      .eq('id', params.id)
      .eq('business_id', business.id)
      .select()
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update product' }, { status: 500 })
  }
}
