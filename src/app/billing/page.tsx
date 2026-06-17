'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle, Check, CreditCard, Crown, ExternalLink,
  Loader2, Sparkles, X, Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'next/navigation'
import { PLANS, type Plan } from '@/lib/permissions/plans'

interface BillingInfo {
  plan: Plan
  status: string
  current_period_end?: string
  cancel_at_period_end?: boolean
  provider_customer_id?: string
  provider_checkout_url?: string
  payment_provider?: string
  mayar?: {
    configured: boolean
    checkoutConfigured: boolean
    webhookConfigured: boolean
    webhookSecretConfigured: boolean
    missing: string[]
    setup_message: string
    dashboardUrl: string
  }
  usage: {
    tx_count: number
    ai_calls: number
    tx_limit: number
    ai_calls_limit: number
  }
}

export default function BillingPage() {
  const [info, setInfo] = useState<BillingInfo | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<Plan | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [mobile, setMobile] = useState('')
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('payment') === 'pending') {
      toast('Pembayaran sedang diproses. Plan aktif setelah webhook Mayar diterima.', { icon: 'i' })
    }
    if (searchParams.get('canceled') === 'true') {
      toast('Upgrade dibatalkan.', { icon: 'i' })
    }
  }, [searchParams])

  useEffect(() => {
    fetch('/api/accounts?detect=true')
      .then(r => r.json())
      .then(async d => {
        if (!d.business_id) return
        setBusinessId(d.business_id)

        const res = await fetch(`/api/billing?business_id=${d.business_id}`)
        const billingData = await res.json()
        setInfo(billingData)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleUpgrade = async (plan: Plan) => {
    if (!businessId || plan === 'free') return
    setUpgrading(plan)
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, business_id: businessId, mobile: mobile || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      window.location.href = data.url
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuat invoice Mayar')
      setUpgrading(null)
    }
  }

  const handlePortal = async () => {
    if (!businessId) return
    setOpeningPortal(true)
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      window.location.href = data.url
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuka dashboard Mayar')
      setOpeningPortal(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    )
  }

  const currentPlan = info?.plan || 'free'
  const usagePct = info ? (info.usage.tx_count / info.usage.tx_limit) * 100 : 0
  const aiPct = info ? (info.usage.ai_calls / info.usage.ai_calls_limit) * 100 : 0

  return (
    <div className="page-shell max-w-5xl">
      <div>
        <p className="eyebrow">Langganan</p>
        <h1 className="page-title flex items-center gap-2">
          <CreditCard size={24} className="text-brand-400" />
          Billing & Langganan
        </h1>
        <p className="page-subtitle">Kelola plan, kuota, dan pembayaran lokal via Mayar</p>
      </div>

      {info?.mayar && !info.mayar.checkoutConfigured && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 shadow-premium">
          <AlertTriangle size={18} className="text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-200">Mayar belum siap</p>
            <p className="text-sm text-amber-100/80 mt-1">{info.mayar.setup_message}</p>
          </div>
        </div>
      )}

      {info && (
        <div className="premium-card p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {currentPlan === 'pro' && <Crown size={16} className="text-amber-400" />}
                {currentPlan === 'starter' && <Zap size={16} className="text-brand-400" />}
                <p className="text-xs text-surface-400 uppercase tracking-wide font-medium">Plan saat ini</p>
              </div>
              <p className="text-2xl font-bold text-white">{PLANS[currentPlan].name}</p>
              {info.current_period_end && (
                <p className="text-sm text-surface-400 mt-1">
                  {info.cancel_at_period_end
                    ? `Akan berakhir: ${new Date(info.current_period_end).toLocaleDateString('id-ID')}`
                    : `Aktif sampai: ${new Date(info.current_period_end).toLocaleDateString('id-ID')}`}
                </p>
              )}
              {info.status === 'past_due' && (
                <div className="flex items-center gap-1.5 mt-2 text-red-400 text-sm">
                  <AlertTriangle size={14} />
                  Pembayaran gagal atau belum lunas
                </div>
              )}
              {info.status === 'trialing' && (
                <div className="flex items-center gap-1.5 mt-2 text-brand-400 text-sm">
                  <Sparkles size={14} />
                  Trial aktif
                </div>
              )}
            </div>

            {info.provider_customer_id && (
              <button
                onClick={handlePortal}
                disabled={openingPortal}
                className="btn-secondary"
              >
                {openingPortal ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                Mayar Dashboard
              </button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <UsageMeter label="Transaksi bulan ini" used={info.usage.tx_count} limit={info.usage.tx_limit} pct={usagePct} />
            <UsageMeter label="Chat AI bulan ini" used={info.usage.ai_calls} limit={info.usage.ai_calls_limit} pct={aiPct} />
          </div>
        </div>
      )}

      {info?.mayar?.checkoutConfigured && (
        <div className="premium-card p-5">
          <label className="text-sm font-medium text-white" htmlFor="mobile">Nomor WhatsApp untuk invoice Mayar</label>
          <input
            id="mobile"
            value={mobile}
            onChange={(event) => setMobile(event.target.value)}
            placeholder="08xxxxxxxxxx"
            className="input mt-2"
          />
          <p className="text-xs text-surface-500 mt-2">
            Mayar membutuhkan nomor HP untuk invoice. Kalau kosong, app memakai MAYAR_DEFAULT_MOBILE.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['free', 'starter', 'pro'] as Plan[]).map(plan => (
          <PlanCard
            key={plan}
            plan={plan}
            isCurrent={currentPlan === plan}
            isDowngrade={(currentPlan === 'pro' && plan !== 'pro') || (currentPlan === 'starter' && plan === 'free')}
            onUpgrade={() => handleUpgrade(plan)}
            loading={upgrading === plan}
          />
        ))}
      </div>

      <div className="premium-card p-5 space-y-4">
        <h2 className="font-semibold text-white text-sm">Pertanyaan Umum</h2>
        {[
          {
            q: 'Bisa cancel kapan saja?',
            a: 'Ya, untuk sekarang pembatalan atau downgrade dikelola dari dashboard Mayar atau admin Akun.AI.',
          },
          {
            q: 'Metode pembayaran apa yang diterima?',
            a: 'QRIS, transfer bank/virtual account, dan metode lokal lain yang aktif di akun Mayar kamu.',
          },
          {
            q: 'Apa yang terjadi kalau limit transaksi habis?',
            a: 'Kamu tidak bisa input transaksi baru sampai bulan depan atau upgrade plan.',
          },
          {
            q: 'Kapan plan aktif setelah bayar?',
            a: 'Plan aktif setelah Mayar mengirim webhook payment.received ke aplikasi.',
          },
        ].map(({ q, a }) => (
          <div key={q} className="border-b border-surface-700 last:border-0 pb-4 last:pb-0">
            <p className="text-sm font-medium text-white mb-1">{q}</p>
            <p className="text-sm text-surface-400">{a}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function UsageMeter({
  label, used, limit, pct,
}: {
  label: string
  used: number
  limit: number
  pct: number
}) {
  const isWarning = pct >= 80
  const isDanger = pct >= 95

  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <p className="text-xs text-surface-400">{label}</p>
        <p className={`text-xs font-medium ${isDanger ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-surface-300'}`}>
          {used.toLocaleString()} / {limit >= 999_999 ? 'unlimited' : limit.toLocaleString()}
        </p>
      </div>
      <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isDanger ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-brand-500'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}

function PlanCard({
  plan, isCurrent, isDowngrade, onUpgrade, loading,
}: {
  plan: Plan
  isCurrent: boolean
  isDowngrade: boolean
  onUpgrade: () => void
  loading: boolean
}) {
  const config = PLANS[plan]
  const isPopular = plan === 'starter'
  const isPro = plan === 'pro'

  const featureList = [
    { label: `${config.limits.tx_per_month >= 999_999 ? 'Unlimited' : config.limits.tx_per_month} transaksi/bulan`, ok: true },
    { label: `${config.limits.ai_calls_per_month >= 999_999 ? 'Unlimited' : config.limits.ai_calls_per_month} chat AI/bulan`, ok: true },
    { label: `${config.limits.max_members} member`, ok: config.limits.max_members > 1 },
    { label: 'Export PDF laporan', ok: config.features.export_pdf },
    { label: 'Export Excel', ok: config.features.export_excel },
    { label: 'Multi-user tim', ok: config.features.multi_user },
    { label: 'WhatsApp bot', ok: config.features.whatsapp_bot },
    { label: 'Prioritas support', ok: config.features.priority_support },
  ]

  return (
    <div className={`relative premium-card premium-card-hover p-5 flex flex-col
      ${isCurrent
        ? 'border-brand-500/50 bg-brand-500/5'
        : isPro
          ? 'border-amber-500/30 bg-amber-500/5'
          : ''}`}>
      {isPopular && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-brand-500 text-white text-xs font-bold rounded-full">
          POPULER
        </div>
      )}
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-surface-600 text-white text-xs font-bold rounded-full">
          PLAN KAMU
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          {isPro && <Crown size={16} className="text-amber-400" />}
          {plan === 'starter' && <Zap size={16} className="text-brand-400" />}
          <h3 className="font-bold text-white">{config.name}</h3>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-white">
            {config.price_idr === 0 ? 'Gratis' : `Rp${(config.price_idr / 1000).toFixed(0)}rb`}
          </span>
          {config.price_idr > 0 && <span className="text-sm text-surface-400">/bulan</span>}
        </div>
      </div>

      <ul className="space-y-2 flex-1 mb-5">
        {featureList.map(({ label, ok }) => (
          <li key={label} className={`flex items-start gap-2 text-sm ${ok ? 'text-surface-200' : 'text-surface-600 line-through'}`}>
            {ok
              ? <Check size={14} className="text-brand-400 flex-shrink-0 mt-0.5" />
              : <X size={14} className="text-surface-700 flex-shrink-0 mt-0.5" />}
            {label}
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <div className="py-2.5 rounded-xl text-center text-sm text-surface-400 border border-surface-700">
          Plan aktif
        </div>
      ) : isDowngrade ? (
        <div className="py-2.5 rounded-xl text-center text-xs text-surface-600 border border-surface-800">
          Downgrade via admin
        </div>
      ) : (
        <button
          onClick={onUpgrade}
          disabled={loading || plan === 'free'}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.99]
            disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2
            ${isPro ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-lg shadow-amber-950/25' : 'bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-950/25'}`}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? 'Memproses...' : plan === 'free' ? 'Plan Saat Ini' : `Bayar via Mayar`}
        </button>
      )}
    </div>
  )
}
