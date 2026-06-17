import { createClient } from '@/lib/supabase/server'
import { AUTH_ERRORS, getAuthContext, type AuthContext } from '@/lib/permissions/guard'
import type { PermissionSet } from '@/lib/permissions/plans'

export type SupabaseServerClient = ReturnType<typeof createClient>

export async function getAuthenticatedInventoryContext(businessId?: string | null) {
  const supabase = createClient()
  const ctx = await getAuthContext(businessId)
  if (!ctx) return { supabase, user: null, business: null, ctx: null }

  return {
    supabase,
    user: { id: ctx.userId },
    business: { id: ctx.businessId },
    ctx,
  }
}

export function requireInventoryPermission(ctx: AuthContext | null, permission: keyof PermissionSet) {
  if (!ctx) return { allowed: false, response: AUTH_ERRORS.unauthorized, status: 401 }
  if (!ctx.can(permission)) return { allowed: false, response: AUTH_ERRORS.forbidden, status: 403 }
  return { allowed: true, response: null, status: 200 }
}

export function toNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
