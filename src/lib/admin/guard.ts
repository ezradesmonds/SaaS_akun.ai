import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { logAuditAction } from '@/lib/audit/log'

export interface AdminContext {
  userId: string
  email: string
}

/**
 * Verify the requesting user is a super admin.
 * Uses service role to bypass RLS on super_admins table.
 */
export async function requireAdmin(): Promise<AdminContext | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Check super_admins table via RPC (bypasses RLS correctly)
  const { data: isAdmin } = await supabase
    .rpc('is_super_admin', { p_user_id: user.id })

  if (!isAdmin) return null

  return { userId: user.id, email: user.email || '' }
}

export const ADMIN_FORBIDDEN = NextResponse.json(
  { error: 'Forbidden — admin access required' },
  { status: 403 }
)

export const ADMIN_UNAUTHORIZED = NextResponse.json(
  { error: 'Unauthorized' },
  { status: 401 }
)

/**
 * Log an admin action to audit_logs table
 */
export async function logAdminAction(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Record<string, unknown>,
  ipAddress?: string
) {
  await logAuditAction({
    actorId,
    action,
    targetType: targetType as 'business' | 'subscription' | 'team' | 'user' | 'admin',
    targetId,
    metadata,
    ipAddress,
  })
}
