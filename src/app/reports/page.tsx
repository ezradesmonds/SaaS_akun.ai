'use client'
import {
  AccountTable,
  FinancialChart,
} from '@/components/reports/ReportVisuals'
import { useEffect, useState } from 'react'
import {
  BarChart3,
  Calendar,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  Printer,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts'
import type {
  AccountBalance,
  ProfitLossReport,
  BalanceSheetReport,
} from '@/types'
import type { Plan } from '@/lib/permissions/plans'
import ExportButton from '@/components/ui/ExportButton'
type ReportType = 'profit_loss' | 'balance_sheet' | 'cash_summary'
type Cash = {
  period: string
  opening_balance: number
  cash_in: number
  cash_out: number
  cash_balance: number
  net_cash: number
  basis: string
}
const money = (n: number) =>
  `Rp${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`
const today = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
export default function ReportsPage() {
  const [tab, setTab] = useState<ReportType>('profit_loss')
  const [businessId, setBusinessId] = useState('')
  const [plan, setPlan] = useState<Plan>('free')
  const [error, setError] = useState('')
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('type')
    if (
      ['profit_loss', 'balance_sheet', 'cash_summary'].includes(requested || '')
    )
      setTab(requested as ReportType)
    fetch('/api/accounts?detect=true')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setBusinessId(d.business_id)
        const billing = await fetch(`/api/billing?business_id=${d.business_id}`)
        const b = await billing.json()
        if (billing.ok && ['free', 'starter', 'pro'].includes(b.plan))
          setPlan(b.plan)
      })
      .catch((e) => setError(e.message || 'Bisnis belum dapat dimuat.'))
  }, [])
  function select(value: ReportType) {
    setTab(value)
    window.history.replaceState(null, '', `/reports?type=${value}`)
  }
  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Analyze / Laporan bisnis</p>
          <h1 className="page-title">
            {tab === 'profit_loss'
              ? 'Laporan laba rugi'
              : tab === 'balance_sheet'
                ? 'Neraca'
                : 'Ringkasan arus kas'}
          </h1>
          <p className="page-subtitle">
            Ringkasan keuangan dari transaksi yang sudah dicatat.
          </p>
        </div>
        <button
          className="btn-secondary print:hidden"
          onClick={() => window.print()}
        >
          <Printer size={16} />
          Cetak
        </button>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Jenis laporan">
        {(
          [
            ['profit_loss', 'Laba rugi'],
            ['balance_sheet', 'Neraca'],
            ['cash_summary', 'Arus kas'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => select(key)}
            className={tab === key ? 'btn-primary' : 'btn-secondary'}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      ) : businessId ? (
        <Report key={tab} type={tab} businessId={businessId} plan={plan} />
      ) : (
        <Loading />
      )}
    </div>
  )
}
function Report({
  type,
  businessId,
  plan,
}: {
  type: ReportType
  businessId: string
  plan: Plan
}) {
  const [start, setStart] = useState(today().slice(0, 7) + '-01')
  const [end, setEnd] = useState(today())
  const [period, setPeriod] = useState('this_month')
  const [data, setData] = useState<
    ProfitLossReport | BalanceSheetReport | Cash | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const abort = new AbortController()
    if (!end || (type === 'profit_loss' && (!start || start > end))) {
      setError('Pilih rentang tanggal yang valid.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const params = new URLSearchParams({
      business_id: businessId,
      type,
      start_date: start,
      end_date: end,
      as_of_date: end,
      period,
    })
    fetch(`/api/reports?${params}`, { signal: abort.signal })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setData(d.data)
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(e.message || 'Laporan belum dapat dimuat.')
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })
    return () => abort.abort()
  }, [type, businessId, start, end, period])
  const pl = type === 'profit_loss' ? (data as ProfitLossReport | null) : null
  const bs =
    type === 'balance_sheet' ? (data as BalanceSheetReport | null) : null
  const cash = type === 'cash_summary' ? (data as Cash | null) : null
  return (
    <>
      <div className="panel-soft flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap gap-3">
          {type === 'cash_summary' ? (
            <label className="text-xs text-surface-300">
              Periode
              <select
                className="input mt-1"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="this_month">Bulan ini hingga hari ini</option>
                <option value="last_month">Bulan lalu</option>
                <option value="today">Hari ini</option>
              </select>
            </label>
          ) : (
            <>
              {type === 'profit_loss' && (
                <DateField label="Dari" value={start} onChange={setStart} />
              )}
              <DateField
                label={type === 'balance_sheet' ? 'Per tanggal' : 'Sampai'}
                value={end}
                onChange={setEnd}
              />
            </>
          )}
        </div>
        {type !== 'cash_summary' && (
          <ExportButton
            businessId={businessId}
            plan={plan}
            reportType={type}
            params={{ start_date: start, end_date: end, as_of_date: end }}
            label="Ekspor laporan"
          />
        )}
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <p role="alert" className="premium-card p-5 text-red-300">
          {error}
        </p>
      ) : (
        data && (
          <div className="report-layout">
            <div className="space-y-5">
              {pl && (
                <section className="premium-card overflow-hidden">
                  <h2 className="border-b border-white/10 p-5 font-semibold">
                    Ringkasan laba rugi
                  </h2>
                  <AccountTable
                    title="Pendapatan"
                    accounts={pl.revenue}
                    total={pl.total_revenue}
                  />
                  <AccountTable
                    title="Beban"
                    accounts={pl.expenses}
                    total={pl.total_expenses}
                    negative
                  />
                  <div className="flex justify-between gap-3 bg-brand-500/10 p-5 font-semibold">
                    <span>
                      {pl.net_profit >= 0 ? 'Laba bersih' : 'Rugi bersih'}
                    </span>
                    <span
                      className={
                        pl.net_profit >= 0 ? 'text-brand-300' : 'text-red-300'
                      }
                    >
                      {money(pl.net_profit)}
                    </span>
                  </div>
                  <p className="p-5 text-xs leading-6 text-surface-400">
                    Periode {start} – {end}. Beban mencakup seluruh akun beban
                    yang tercatat; pemisahan HPP mengikuti akun bisnis Anda.
                  </p>
                </section>
              )}
              {bs && (
                <>
                  <section className="premium-card overflow-hidden">
                    <AccountTable
                      title="Aset"
                      accounts={bs.assets}
                      total={bs.total_assets}
                    />
                  </section>
                  <div className="grid gap-5 xl:grid-cols-2">
                    <section className="premium-card overflow-hidden">
                      <AccountTable
                        title="Liabilitas"
                        accounts={bs.liabilities}
                        total={bs.liabilities.reduce(
                          (s, a) => s + a.balance,
                          0,
                        )}
                      />
                    </section>
                    <section className="premium-card overflow-hidden">
                      <AccountTable
                        title="Ekuitas"
                        accounts={bs.equity}
                        total={bs.equity.reduce((s, a) => s + a.balance, 0)}
                      />
                    </section>
                  </div>
                  <div className="premium-card flex flex-wrap items-center justify-between gap-4 p-5">
                    <span className="text-sm text-surface-300">
                      Aset = Liabilitas + Ekuitas
                    </span>
                    <span
                      className={
                        Math.abs(
                          bs.total_assets - bs.total_liabilities_equity,
                        ) < 0.01
                          ? 'text-brand-300'
                          : 'text-amber-300'
                      }
                    >
                      {Math.abs(bs.total_assets - bs.total_liabilities_equity) <
                      0.01
                        ? 'Seimbang'
                        : `Selisih ${money(bs.total_assets - bs.total_liabilities_equity)}`}
                    </span>
                  </div>
                </>
              )}
              {cash && (
                <section className="premium-card overflow-hidden">
                  <h2 className="border-b border-white/10 p-5 font-semibold">
                    Mutasi kas & bank
                  </h2>
                  {[
                    ['Saldo awal', cash.opening_balance],
                    ['Kas masuk', cash.cash_in],
                    ['Kas keluar', cash.cash_out],
                    ['Perubahan kas bersih', cash.net_cash],
                    ['Saldo akhir', cash.cash_balance],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex justify-between gap-3 border-b border-white/5 p-5 text-sm"
                    >
                      <span className="text-surface-300">{label}</span>
                      <span className="font-medium tabular-nums">
                        {money(Number(value))}
                      </span>
                    </div>
                  ))}
                  <p className="p-5 text-xs leading-6 text-surface-400">
                    {cash.period}. {cash.basis}
                  </p>
                </section>
              )}
            </div>
            <aside className="space-y-5">
              <section className="premium-card p-5">
                <h2 className="mb-5 font-semibold">
                  {pl
                    ? 'Pendapatan vs beban'
                    : bs
                      ? 'Komposisi aset'
                      : 'Kas masuk vs keluar'}
                </h2>
                {bs ? (
                  <>
                    <ResponsiveContainer width="100%" height={230}>
                      <PieChart>
                        <Pie
                          data={bs.assets.filter((a) => a.balance > 0)}
                          dataKey="balance"
                          nameKey="name"
                          innerRadius={68}
                          outerRadius={94}
                          paddingAngle={2}
                        >
                          {bs.assets
                            .filter((a) => a.balance > 0)
                            .map((a, i) => (
                              <Cell
                                key={a.id}
                                fill={
                                  ['#51c99c', '#26a3c5', '#e6bc67', '#7e93c8'][
                                    i % 4
                                  ]
                                }
                              />
                            ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => money(v)}
                          contentStyle={{
                            background: '#081924',
                            border: '1px solid #30424e',
                            borderRadius: 8,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <p className="text-center text-xs text-surface-400">
                      Aset bersaldo positif · {money(bs.total_assets)} total
                      neto
                    </p>
                  </>
                ) : (
                  <FinancialChart
                    values={
                      pl
                        ? [
                            { name: 'Pendapatan', value: pl.total_revenue },
                            { name: 'Beban', value: pl.total_expenses },
                          ]
                        : [
                            { name: 'Kas masuk', value: cash!.cash_in },
                            { name: 'Kas keluar', value: cash!.cash_out },
                          ]
                    }
                  />
                )}
              </section>
              <section className="premium-card p-5">
                <h2 className="mb-3 font-semibold">
                  Baca angka dengan konteks
                </h2>
                <p className="text-sm leading-7 text-surface-300">
                  {pl
                    ? pl.total_revenue > 0
                      ? `Margin laba bersih ${((pl.net_profit / pl.total_revenue) * 100).toFixed(1)}% dari pendapatan tercatat. Laba tidak sama dengan saldo kas.`
                      : 'Belum ada pendapatan positif pada periode ini. Margin belum dapat dihitung.'
                    : bs
                      ? 'Ekuitas mencakup laba/rugi yang belum ditutup. Neraca seimbang tidak menjamin seluruh bukti transaksi sudah lengkap.'
                      : 'Penjualan kredit belum menjadi kas masuk. Pembayaran piutang baru menambah kas ketika dicatat. Transfer antar akun kas tidak menambah arus kas bisnis.'}
                </p>
                <div className="mt-5 border-t border-white/10 pt-4">
                  <a
                    href="/chat"
                    className="flex items-center justify-between text-sm text-brand-300"
                  >
                    Bahas dengan AI Assistant <ArrowUpRight size={16} />
                  </a>
                </div>
              </section>
            </aside>
          </div>
        )
      )}
    </>
  )
}
function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-surface-300">
      <Calendar size={14} />
      {label}
      <input
        type="date"
        className="min-w-0 bg-transparent p-1 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
function Loading() {
  return (
    <div
      role="status"
      className="flex justify-center gap-3 py-20 text-sm text-surface-400"
    >
      <Loader2 className="animate-spin" size={20} />
      Memuat laporan…
    </div>
  )
}
