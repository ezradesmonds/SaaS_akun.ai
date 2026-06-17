'use client'

import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, Users, Crown, Zap, Loader2, ExternalLink } from 'lucide-react'

const PLAN_PRICES = { starter: 29000, pro: 79000 }

export default function AdminRevenuePage() {
  const [data, setData] = useState<{
    stats: {
      starter_count: number
      pro_count: number
      past_due_count: number
      mrr: number
    }
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 size={22} className="animate-spin text-red-400" /></div>
  if (!data?.stats) return null

  const { stats } = data
  const starterRevenue = stats.starter_count * PLAN_PRICES.starter
  const proRevenue = stats.pro_count * PLAN_PRICES.pro
  const mrr = starterRevenue + proRevenue
  const arr = mrr * 12

  function formatIDR(n: number) {
    if (n >= 1_000_000) return `Rp${(n / 1_000_000).toFixed(2)}jt`
    if (n >= 1_000) return `Rp${(n / 1_000).toFixed(0)}rb`
    return `Rp${n}`
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Revenue</h1>
          <p className="text-sm text-slate-400 mt-0.5">Proyeksi berdasarkan subscription aktif</p>
        </div>
        <a href="https://web.mayar.id" target="_blank"
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm transition-colors">
          <ExternalLink size={14} />
          Mayar Dashboard
        </a>
      </div>

      {/* MRR cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'MRR', value: formatIDR(mrr), sub: 'Monthly Recurring Revenue', icon: <DollarSign size={16} />, color: 'emerald', highlight: true },
          { label: 'ARR', value: formatIDR(arr), sub: 'Annualized Revenue', icon: <TrendingUp size={16} />, color: 'blue' },
          { label: 'Paid Users', value: (stats.starter_count + stats.pro_count).toString(), sub: 'Active subscriptions', icon: <Users size={16} />, color: 'purple' },
          { label: 'At Risk', value: stats.past_due_count.toString(), sub: 'Payment failed', icon: <Users size={16} />, color: stats.past_due_count > 0 ? 'red' : 'slate' },
        ].map(({ label, value, sub, icon, color, highlight }) => {
          const c: Record<string, string> = { emerald: 'text-emerald-400', blue: 'text-blue-400', purple: 'text-purple-400', red: 'text-red-400', slate: 'text-slate-500' }
          return (
            <div key={label} className={`rounded-2xl p-5 border ${highlight ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/60 border-slate-700'}`}>
              <div className={`mb-3 ${c[color]}`}>{icon}</div>
              <p className={`text-2xl font-bold ${c[color]}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
              <p className="text-xs text-slate-600 mt-0.5">{sub}</p>
            </div>
          )
        })}
      </div>

      {/* Revenue breakdown */}
      <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Revenue Breakdown per Plan</h2>

        {[
          {
            label: 'Starter',
            count: stats.starter_count,
            price: PLAN_PRICES.starter,
            revenue: starterRevenue,
            icon: <Zap size={14} className="text-brand-400" />,
            color: 'bg-brand-500',
          },
          {
            label: 'Pro',
            count: stats.pro_count,
            price: PLAN_PRICES.pro,
            revenue: proRevenue,
            icon: <Crown size={14} className="text-amber-400" />,
            color: 'bg-amber-500',
          },
        ].map(({ label, count, price, revenue, icon, color }) => {
          const pct = mrr > 0 ? (revenue / mrr) * 100 : 0
          return (
            <div key={label}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {icon}
                  <span className="text-sm text-slate-200">{label}</span>
                  <span className="text-xs text-slate-500">× {count} users @ Rp{(price / 1000).toFixed(0)}rb/bln</span>
                </div>
                <span className="text-sm font-semibold text-white">{formatIDR(revenue)}/bln</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Growth targets */}
      <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Target Milestones</h2>
        <div className="space-y-3">
          {[
            { target: 'Rp1jt MRR', amount: 1_000_000, users: '~35 Starter atau ~13 Pro' },
            { target: 'Rp5jt MRR', amount: 5_000_000, users: '~173 Starter atau ~63 Pro' },
            { target: 'Rp10jt MRR', amount: 10_000_000, users: '~345 Starter atau ~127 Pro' },
            { target: 'Rp50jt MRR', amount: 50_000_000, users: '~1.724 Starter atau ~633 Pro' },
          ].map(({ target, amount, users }) => {
            const pct = Math.min(100, (mrr / amount) * 100)
            const reached = mrr >= amount
            return (
              <div key={target}>
                <div className="flex justify-between mb-1">
                  <span className={`text-sm ${reached ? 'text-emerald-400 font-medium' : 'text-slate-300'}`}>
                    {reached ? '✅ ' : ''}{target}
                  </span>
                  <span className="text-xs text-slate-500">{users}</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${reached ? 'bg-emerald-500' : 'bg-slate-500'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-slate-600 mt-4">
          Current MRR: {formatIDR(mrr)} — {mrr > 0 ? `${((mrr / 1_000_000) * 100).toFixed(1)}% menuju Rp1jt` : 'belum ada revenue'}
        </p>
      </div>
    </div>
  )
}
