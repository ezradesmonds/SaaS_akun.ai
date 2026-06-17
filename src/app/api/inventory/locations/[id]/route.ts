import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedInventoryContext, requireInventoryPermission } from '../../_lib'

const UpdateLocationSchema = z.object({
  business_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().max(40).nullable().optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const parsed = UpdateLocationSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const { supabase, user, business, ctx } = await getAuthenticatedInventoryContext(parsed.data.business_id)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const permission = requireInventoryPermission(ctx, 'manage_accounts')
    if (!permission.allowed) return NextResponse.json(permission.response, { status: permission.status })

    const { business_id: _businessId, ...updates } = parsed.data
    const { data, error } = await supabase
      .from('inventory_locations')
      .update({
        ...updates,
        code: updates.code === undefined ? undefined : updates.code || null,
      })
      .eq('id', params.id)
      .eq('business_id', business.id)
      .select()
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update location' }, { status: 500 })
  }
}
