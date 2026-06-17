'use client'

import { useEffect, useState } from 'react'
import {
  Users, Building2, DollarSign, TrendingUp,
  MessageSquare, Receipt, AlertTriangle, Loader2,
  ArrowUpRight, Crown, Zap
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'

interface AdminStats {
  total_users: number
  total_businesses: number
  starter_count: number
  pro_count: number
  free_count: number
  past_due_count: number
  new_businesses_30d: number
  new_users_30d: number
  transactions_30d: number
  ai_calls_30d: number
  mrr: number
}

interface GrowthPoint {
  date: string
  label: string
  count: number
}

function formatIDR(n: number) {
  if (n >= 1_000_000) return `Rp${(n / 1_000_000).toFixed(1)}jt`
  if (n >= 1_000) return `Rp${(n / 1_000).toFixed(0)}rb`
  return `Rp${n}`
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [growth, setGrowth] = useState<GrowthPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => r.json())
      .then(d => {
        setStats(d.stats)
        setGrowth(d.growth_chart || [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 size={24} className="animate-spin text-red-400" />
    </div>
  )

  if (!stats) return null

  const paid = stats.starter_count + stats.pro_count
  const convRate = stats.total_businesses > 0 ? ((paid / stats.total_businesses) * 100).toFixed(1) : '0'

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Platform Overview</h1>
        <p className="text-sm text-slate-400 mt-0.5">Real-time Akun.AI metrics</p>
      </div>

      {/* Alert: past due */}
      {stats.past_due_count > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-300">
            <strong>{stats.past_due_count}</strong> bisnis dengan pembayaran gagal (past_due)
          </p>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="MRR"
          value={formatIDR(stats.mrr)}
          sub={`${paid} paid users`}
          icon={<DollarSign size={16} />}
          color="green"
          highlight
        />
        <KPICard
          label="Total Bisnis"
          value={stats.total_businesses.toLocaleString()}
          sub={`+${stats.new_businesses_30d} bulan ini`}
          icon={<Building2 size={16} />}
          color="blue"
        />
        <KPICard
          label="Total User"
          value={stats.total_users.toLocaleString()}
          sub={`+${stats.new_users_30d} bulan ini`}
          icon={<Users size={16} />}
          color="purple"
        />
        <KPICard
          label="Conversion Rate"
          value={`${convRate}%`}
          sub={`${paid} dari ${stats.total_businesses} bisnis`}
          icon={<TrendingUp size={16} />}
          color="amber"
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile label="Transaksi (30d)" value={stats.transactions_30d.toLocaleString()} icon={<Receipt size={14} />} />
        <MetricTile label="AI Calls (30d)" value={stats.ai_calls_30d.toLocaleString()} icon={<MessageSquare size={14} />} />
        <MetricTile label="Starter" value={stats.starter_count.toLocaleString()} icon={<Zap size={14} className="text-brand-400" />} />
        <MetricTile label="Pro" value={stats.pro_count.toLocaleString()} icon={<Crown size={14} className="text-amber-400" />} />
      </div>

      {/* Growth chart */}
      <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Bisnis Baru per Hari (14 hari terakhir)</h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={growth}>
            <defs>
              <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(v: number) => [v, 'Bisnis baru']}
            />
            <Area type="monotone" dataKey="count" stroke="#ef4444" fill="url(#growthGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Plan distribution */}
      <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Distribusi Plan</h2>
        <div className="space-y-3">
          {[
            { label: 'Free', count: stats.free_count, total: stats.total_businesses, color: 'bg-slate-600' },
            { label: 'Starter', count: stats.starter_count, total: stats.total_businesses, color: 'bg-brand-500' },
            { label: 'Pro', count: stats.pro_count, total: stats.total_businesses, color: 'bg-amber-500' },
          ].map(({ label, count, total, color }) => {
            const pct = total > 0 ? (count / total) * 100 : 0
            return (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-slate-300">{label}</span>
                  <span className="text-white font-medium">{count} <span className="text-slate-500 font-normal">({pct.toFixed(1)}%)</span></span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function KPICard({ label, value, sub, icon, color, highlight }: {
  label: string; value: string; sub: string
  icon: React.ReactNode; color: string; highlight?: boolean
}) {
  const colors: Record<string, string> = {
    green: 'text-emerald-400', blue: 'text-blue-400',
    purple: 'text-purple-400', amber: 'text-amber-400'
  }
  return (
    <div className={`rounded-2xl p-5 border ${highlight
      ? 'bg-emerald-500/10 border-emerald-500/30'
      : 'bg-slate-800/60 border-slate-700'}`}>
      <div className={`mb-3 ${colors[color]}`}>{icon}</div>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
      <p className="text-xs text-slate-600 mt-0.5">{sub}</p>
    </div>
  )
}

function MetricTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 px-4 py-3 flex items-center justify-between">
      <div>
        <p className="text-lg font-bold text-white">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
      <div className="text-slate-600">{icon}</div>
    </div>
  )
}
