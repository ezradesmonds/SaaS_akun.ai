import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMayarConfigStatus } from '@/lib/mayar/client'
import { logAuditAction } from '@/lib/audit/log'
import { z } from 'zod'

const PortalSchema = z.object({
  business_id: z.string().uuid(),
})

// Mayar does not expose a hosted customer billing portal for this flow.
// Send owners to the Mayar dashboard, while keeping the existing frontend call stable.
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = PortalSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { business_id } = parsed.data
  const { data: membership } = await supabase
    .from('business_members')
    .select('role')
    .eq('business_id', business_id)
    .eq('user_id', user.id)
    .single()

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owner can manage billing' }, { status: 403 })
  }

  await logAuditAction({
    actorId: user.id,
    action: 'open_mayar_dashboard',
    targetType: 'subscription',
    targetId: business_id,
    ipAddress: request.headers.get('x-forwarded-for'),
  })

  return NextResponse.json({ url: getMayarConfigStatus().dashboardUrl })
}
