'use client'

import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import type { DashboardStats } from '@/types'

function formatIDR(amount: number) {
  if (Math.abs(amount) >= 1_000_000_000) {
    return `Rp${(amount / 1_000_000_000).toFixed(1)}M`
  }
  if (Math.abs(amount) >= 1_000_000) {
    return `Rp${(amount / 1_000_000).toFixed(1)}jt`
  }
  if (Math.abs(amount) >= 1_000) {
    return `Rp${(amount / 1_000).toFixed(0)}rb`
  }
  return `Rp${amount.toFixed(0)}`
}

function ChangeIndicator({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.5) return (
    <span className="flex items-center gap-0.5 text-surface-400 text-xs">
      <Minus size={10} /> Sama
    </span>
  )

  const up = pct > 0
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? 'text-brand-400' : 'text-red-400'}`}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

interface StatCardProps {
  label: string
  value: number
  changePct?: number
  positive?: boolean // false = lower is better (expenses)
  highlight?: boolean
  icon: React.ReactNode
}

function StatCard({ label, value, changePct, positive = true, highlight, icon }: StatCardProps) {
  const isPositive = value >= 0

  return (
    <div className={`
      premium-card premium-card-hover p-5
      ${highlight
        ? 'border-brand-400/35 bg-brand-500/10'
        : ''
      }
    `}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border
          ${highlight ? 'border-brand-400/25 bg-brand-500/15' : 'border-white/10 bg-white/[0.04]'}`}>
          {icon}
        </div>
        {changePct !== undefined && <ChangeIndicator pct={changePct} />}
      </div>

      <p className={`text-2xl font-bold tracking-normal mb-1
        ${highlight ? 'gradient-text' : isPositive ? 'text-white' : 'text-red-400'}`}>
        {formatIDR(value)}
      </p>
      <p className="text-xs text-surface-400">{label}</p>
    </div>
  )
}

export default function DashboardStatsCards({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Saldo Kas & Bank"
        value={stats.cash_balance}
        icon={<Wallet size={16} className="text-brand-400" />}
        highlight
      />
      <StatCard
        label="Pendapatan Bulan Ini"
        value={stats.monthly_revenue}
        changePct={stats.revenue_change_pct}
        icon={<TrendingUp size={16} className="text-emerald-400" />}
      />
      <StatCard
        label="Pengeluaran Bulan Ini"
        value={stats.monthly_expenses}
        changePct={stats.expense_change_pct}
        positive={false}
        icon={<TrendingDown size={16} className="text-amber-400" />}
      />
      <StatCard
        label="Laba Bersih Bulan Ini"
        value={stats.monthly_profit}
        icon={<TrendingUp size={16} className={stats.monthly_profit >= 0 ? 'text-brand-400' : 'text-red-400'} />}
      />
    </div>
  )
}
