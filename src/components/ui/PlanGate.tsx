'use client'

import { Zap, Crown } from 'lucide-react'
import Link from 'next/link'
import type { Plan } from '@/lib/permissions/plans'

// Use this component to gate premium features in the UI
// e.g. <PlanGate feature="export_pdf" plan={ctx.plan}>...</PlanGate>

interface PlanGateProps {
  plan: Plan
  requiredPlan: 'starter' | 'pro'
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function PlanGate({ plan, requiredPlan, children, fallback }: PlanGateProps) {
  const planOrder: Plan[] = ['free', 'starter', 'pro']
  const hasAccess = planOrder.indexOf(plan) >= planOrder.indexOf(requiredPlan)

  if (hasAccess) return <>{children}</>
  if (fallback) return <>{fallback}</>

  return (
    <UpgradeBanner requiredPlan={requiredPlan} />
  )
}

export function UpgradeBanner({ requiredPlan }: { requiredPlan: 'starter' | 'pro' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center
      bg-surface-800/40 rounded-2xl border border-dashed border-surface-700">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4
        ${requiredPlan === 'pro' ? 'bg-amber-500/15' : 'bg-brand-500/15'}`}>
        {requiredPlan === 'pro'
          ? <Crown size={22} className="text-amber-400" />
          : <Zap size={22} className="text-brand-400" />
        }
      </div>
      <p className="text-white font-semibold mb-1">
        Fitur {requiredPlan === 'pro' ? 'Pro' : 'Starter'}
      </p>
      <p className="text-sm text-surface-400 mb-4 max-w-xs">
        Fitur ini hanya tersedia di plan {requiredPlan === 'pro' ? 'Pro' : 'Starter atau lebih tinggi'}.
        Upgrade untuk akses.
      </p>
      <Link
        href="/billing"
        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white
          ${requiredPlan === 'pro' ? 'bg-amber-500 hover:bg-amber-400' : 'bg-brand-500 hover:bg-brand-400'}
          transition-colors`}
      >
        {requiredPlan === 'pro' ? <Crown size={15} /> : <Zap size={15} />}
        Upgrade ke {requiredPlan === 'pro' ? 'Pro' : 'Starter'}
      </Link>
    </div>
  )
}

// Inline badge version — shows a small "Pro" badge next to a feature label
export function PlanBadge({ plan }: { plan: 'starter' | 'pro' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold
      ${plan === 'pro' ? 'bg-amber-500/20 text-amber-400' : 'bg-brand-500/20 text-brand-400'}`}>
      {plan === 'pro' ? <Crown size={9} /> : <Zap size={9} />}
      {plan.toUpperCase()}
    </span>
  )
}

// Usage warning bar — show when >80% of limit used
export function UsageWarning({ used, limit, type }: { used: number; limit: number; type: string }) {
  const pct = (used / limit) * 100
  if (pct < 80 || limit >= 999_999) return null

  const isDanger = pct >= 95

  return (
    <div className={`flex items-center justify-between px-4 py-2.5 text-sm
      rounded-xl border mb-4
      ${isDanger
        ? 'bg-red-500/10 border-red-500/30 text-red-400'
        : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
      }`}>
      <span>
        {isDanger ? '🚨' : '⚠️'} {type} hampir habis: {used}/{limit} bulan ini
      </span>
      <Link href="/billing" className="underline text-xs hover:opacity-80">
        Upgrade
      </Link>
    </div>
  )
}
