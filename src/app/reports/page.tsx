'use client'

import { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, TrendingDown, Scale, Calendar, Loader2, ChevronDown, AlertCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { AccountBalance, ProfitLossReport, BalanceSheetReport } from '@/types'
import type { Plan } from '@/lib/permissions/plans'
import ExportButton from '@/components/ui/ExportButton'

function formatIDR(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000_000) return `Rp${(n / 1_000_000).toFixed(1)}jt`
  if (Math.abs(n) >= 1_000) return `Rp${(n / 1_000).toFixed(0)}rb`
  return `Rp${n}`
}

function getMonthRange() {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(y, today.getMonth() + 1, 0).getDate()
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${lastDay}` }
}

export default function ReportsPage() {
  const [tab, setTab] = useState<'pl' | 'bs'>('pl')
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [plan, setPlan] = useState<Plan>('free')
  const [loadingBusiness, setLoadingBusiness] = useState(true)
  const [businessError, setBusinessError] = useState('')

  useEffect(() => {
    fetch('/api/accounts?detect=true')
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Gagal memuat bisnis')
        if (body.business_id) {
          setBusinessId(body.business_id)
          const billingRes = await fetch(`/api/billing?business_id=${body.business_id}`)
          const billingBody = await billingRes.json().catch(() => null)
          if (billingRes.ok && ['free', 'starter', 'pro'].includes(billingBody?.plan)) {
            setPlan(billingBody.plan)
          }
        }
      })
      .catch((error) => setBusinessError(error instanceof Error ? error.message : 'Gagal memuat bisnis'))
      .finally(() => setLoadingBusiness(false))
  }, [])

  return (
    <div className="page-shell max-w-5xl">
      <div>
        <p className="eyebrow">Analisis Keuangan</p>
        <h1 className="page-title flex items-center gap-2"><BarChart3 size={24} className="text-brand-400" />Laporan Keuangan</h1>
        <p className="page-subtitle">Analisis dari transaction_lines asli</p>
      </div>
      <div className="panel-soft flex gap-1 p-1 w-fit">
        {[{ key: 'pl', label: 'Laba Rugi', icon: TrendingUp }, { key: 'bs', label: 'Neraca', icon: Scale }].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key as 'pl' | 'bs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? 'bg-brand-500 text-white shadow-lg shadow-brand-950/30' : 'text-surface-400 hover:text-white hover:bg-white/[0.04]'}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>
      {loadingBusiness ? <LoadingState /> : businessError ? <ErrorState message={businessError} /> : businessId ? (
        tab === 'pl' ? <PLReport businessId={businessId} plan={plan} /> : <BSReport businessId={businessId} plan={plan} />
      ) : <EmptyReport message="Belum ada bisnis untuk laporan" />}
    </div>
  )
}

function PLReport({ businessId, plan }: { businessId: string; plan: Plan }) {
  const initial = getMonthRange()
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [data, setData] = useState<ProfitLossReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/reports?business_id=${businessId}&type=profit_loss&start_date=${startDate}&end_date=${endDate}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Gagal memuat laba rugi')
        setData(body.data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat laba rugi'))
      .finally(() => setLoading(false))
  }, [businessId, startDate, endDate])

  const chartData = data ? [
    { name: 'Pendapatan', value: data.total_revenue, color: '#22c55e' },
    { name: 'Pengeluaran', value: data.total_expenses, color: '#f59e0b' },
    { name: data.net_profit >= 0 ? 'Laba Bersih' : 'Rugi Bersih', value: Math.abs(data.net_profit), color: data.net_profit >= 0 ? '#3b82f6' : '#ef4444' },
  ] : []

  return (
    <div className="space-y-5">
      <div className="panel-soft flex items-center justify-between flex-wrap gap-3 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <DateInput label="Dari" value={startDate} onChange={setStartDate} />
          <DateInput label="Sampai" value={endDate} onChange={setEndDate} />
        </div>
        <ExportButton businessId={businessId} plan={plan} reportType="profit_loss" params={{ start_date: startDate, end_date: endDate }} label="Export Laporan" />
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SCard label="Total Pendapatan" value={data.total_revenue} color="green" icon={<TrendingUp size={16} />} />
            <SCard label="Total Pengeluaran" value={data.total_expenses} color="amber" icon={<TrendingDown size={16} />} />
            <SCard label="Laba Bersih" value={data.net_profit} color={data.net_profit >= 0 ? 'blue' : 'red'} icon={<BarChart3 size={16} />} highlight />
          </div>
          {(data.total_revenue !== 0 || data.total_expenses !== 0) && (
            <div className="premium-card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Ringkasan Visual</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barSize={44}>
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v: number) => [formatIDR(v), '']} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#94a3b8' }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>{chartData.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AccGroup title="Pendapatan" accounts={data.revenue} total={data.total_revenue} />
            <AccGroup title="Pengeluaran" accounts={data.expenses} total={data.total_expenses} />
          </div>
          {data.total_revenue === 0 && data.total_expenses === 0 && <EmptyReport message="Belum ada transaksi di periode ini" />}
        </>
      ) : null}
    </div>
  )
}

function BSReport({ businessId, plan }: { businessId: string; plan: Plan }) {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState<BalanceSheetReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/reports?business_id=${businessId}&type=balance_sheet&as_of_date=${asOfDate}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Gagal memuat neraca')
        setData(body.data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat neraca'))
      .finally(() => setLoading(false))
  }, [businessId, asOfDate])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />
  if (!data) return null

  const isBalanced = Math.abs(data.total_assets - data.total_liabilities_equity) < 1
  const liabTotal = data.liabilities.reduce((s, a) => s + a.balance, 0)
  const eqTotal = data.equity.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="space-y-5">
      <div className="panel-soft flex items-center justify-between flex-wrap gap-3 p-3">
        <DateInput label="Per" value={asOfDate} onChange={setAsOfDate} />
        <ExportButton businessId={businessId} plan={plan} reportType="balance_sheet" params={{ as_of_date: asOfDate }} label="Export Neraca" />
      </div>
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${isBalanced ? 'bg-brand-500/10 border border-brand-500/20 text-brand-400' : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'}`}>
        <Scale size={16} />{isBalanced ? `Balance: Total Aset = ${formatIDR(data.total_assets)}` : `Tidak balance: selisih ${formatIDR(Math.abs(data.total_assets - data.total_liabilities_equity))}`}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AccGroup title="Aset" accounts={data.assets} total={data.total_assets} />
        <div className="space-y-4">
          <AccGroup title="Kewajiban" accounts={data.liabilities} total={liabTotal} />
          <AccGroup title="Ekuitas" accounts={data.equity} total={eqTotal} />
        </div>
      </div>
      {data.total_assets === 0 && data.total_liabilities_equity === 0 && <EmptyReport message="Belum ada saldo sampai tanggal ini" />}
    </div>
  )
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface-950/55 px-3 py-2">
      <Calendar size={14} className="text-brand-400" />
      <span className="text-xs text-surface-400">{label}</span>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} className="bg-transparent text-sm text-white focus:outline-none [color-scheme:dark]" />
    </label>
  )
}

function SCard({ label, value, color, icon, highlight }: { label: string; value: number; color: string; icon: React.ReactNode; highlight?: boolean }) {
  const colors: Record<string, string> = { green: 'text-brand-400', amber: 'text-amber-400', blue: 'text-blue-400', red: 'text-red-400' }
  return (
    <div className={`premium-card premium-card-hover p-4 ${highlight ? 'border-brand-400/35 bg-brand-500/10' : ''}`}>
      <div className={`mb-2 ${colors[color]}`}>{icon}</div>
      <p className={`text-lg font-bold ${colors[color]}`}>{formatIDR(value)}</p>
      <p className="text-xs text-surface-400 mt-0.5">{label}</p>
    </div>
  )
}

function AccGroup({ title, accounts, total }: { title: string; accounts: Pick<AccountBalance, 'id' | 'code' | 'name' | 'balance'>[]; total: number }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div className="premium-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-700/30"
      >
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white font-mono">{formatIDR(total)}</span>
          <ChevronDown size={14} className={`text-surface-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className="border-t border-surface-700 divide-y divide-surface-700/50">
          {accounts.length === 0 ? <p className="px-4 py-3 text-xs text-surface-500">Tidak ada data</p>
            : accounts.map(a => (
              <div key={a.id} className="flex items-center justify-between px-4 py-2.5">
                <div><span className="text-xs text-surface-500 font-mono mr-2">{a.code}</span><span className="text-sm text-surface-200">{a.name}</span></div>
                <span className="text-sm font-mono text-white">{formatIDR(a.balance)}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

function LoadingState() {
  return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-brand-400" /></div>
}

function ErrorState({ message }: { message: string }) {
  return <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"><AlertCircle size={16} />{message}</div>
}

function EmptyReport({ message }: { message: string }) {
  return (
    <div className="empty-state py-10">
      <BarChart3 size={36} className="mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
