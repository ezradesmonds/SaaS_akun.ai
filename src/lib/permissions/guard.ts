import { createClient } from '@/lib/supabase/server'
import { ROLE_PERMISSIONS, PLANS, type MemberRole, type PermissionSet, type Plan } from './plans'

// ============================================================
// Context returned for every authenticated request
// ============================================================
export interface AuthContext {
  userId: string
  businessId: string
  role: MemberRole
  plan: Plan
  usage: {
    tx_count: number
    ai_calls: number
    tx_limit: number
    ai_calls_limit: number
  }
  // Helpers
  can: (permission: keyof PermissionSet) => boolean
  withinLimit: (type: 'tx' | 'ai') => boolean
  planConfig: typeof PLANS[Plan]
}

// ============================================================
// Main guard — use this at the top of every API route
// ============================================================
export async function getAuthContext(businessId?: string | null): Promise<AuthContext | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // If no businessId given, use user's first business
  let resolvedBusinessId = businessId
  if (!resolvedBusinessId) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (biz) {
      resolvedBusinessId = biz.id
    } else {
      const { data: membership } = await supabase
        .from('business_members')
        .select('business_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      resolvedBusinessId = membership?.business_id || null
    }
  }
  if (!resolvedBusinessId) return null

  // Get membership + plan info in one query via view
  const [memberResult, planResult] = await Promise.all([
    supabase
      .from('business_members')
      .select('role')
      .eq('business_id', resolvedBusinessId)
      .eq('user_id', user.id)
      .single(),

    supabase
      .from('business_plan_info')
      .select('*')
      .eq('business_id', resolvedBusinessId)
      .single()
  ])

  // User must be a member of this business
  if (memberResult.error || !memberResult.data) return null

  const role = memberResult.data.role as MemberRole
  const planInfo = planResult.data

  const plan = (planInfo?.plan || 'free') as Plan
  const planConfig = PLANS[plan]

  const ctx: AuthContext = {
    userId: user.id,
    businessId: resolvedBusinessId,
    role,
    plan,
    usage: {
      tx_count: planInfo?.tx_count_this_month || 0,
      ai_calls: planInfo?.ai_calls_this_month || 0,
      tx_limit: planInfo?.tx_limit || planConfig.limits.tx_per_month,
      ai_calls_limit: planInfo?.ai_calls_limit || planConfig.limits.ai_calls_per_month,
    },
    can: (permission) => ROLE_PERMISSIONS[role][permission],
    withinLimit: (type) => {
      if (type === 'tx') {
        return (planInfo?.tx_count_this_month || 0) < (planInfo?.tx_limit || planConfig.limits.tx_per_month)
      }
      return (planInfo?.ai_calls_this_month || 0) < (planInfo?.ai_calls_limit || planConfig.limits.ai_calls_per_month)
    },
    planConfig,
  }

  return ctx
}

// ============================================================
// Increment usage in background (non-blocking)
// ============================================================
export async function trackUsage(businessId: string, type: 'tx_count' | 'ai_calls' | 'ocr_scans') {
  const supabase = createClient()
  try {
    await supabase.rpc('increment_usage', {
      p_business_id: businessId,
      p_field: type,
      p_amount: 1
    })
  } catch {}
}

// ============================================================
// Standard error responses
// ============================================================
export const AUTH_ERRORS = {
  unauthorized: { error: 'Unauthorized', status: 401 },
  forbidden: { error: 'Forbidden — role tidak punya akses ini', status: 403 },
  plan_limit_tx: { error: 'Batas transaksi bulan ini sudah tercapai. Upgrade plan untuk lanjut.', status: 402 },
  plan_limit_ai: { error: 'Batas chat AI bulan ini sudah tercapai. Upgrade plan untuk lanjut.', status: 402 },
  plan_feature: { error: 'Fitur ini tidak tersedia di plan kamu. Upgrade untuk akses.', status: 402 },
} as const
