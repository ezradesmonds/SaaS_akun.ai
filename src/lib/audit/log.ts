import { createAdminClient } from '@/lib/supabase/server'

export async function logAuditAction({
  actorId,
  action,
  targetType,
  targetId,
  metadata,
  ipAddress,
}: {
  actorId: string
  action: string
  targetType: 'business' | 'subscription' | 'team' | 'user' | 'admin'
  targetId?: string | null
  metadata?: Record<string, unknown>
  ipAddress?: string | null
}) {
  try {
    const supabase = createAdminClient()
    await supabase.from('audit_logs').insert({
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId || null,
      metadata: metadata || {},
      ip_address: ipAddress || null,
    })
  } catch (error) {
    console.error('Failed to write audit log:', error)
  }
}
