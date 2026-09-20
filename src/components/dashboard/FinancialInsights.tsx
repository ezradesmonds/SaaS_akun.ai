'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Sparkles,
  ArrowUpRight,
  CalendarPlus,
  Loader2,
  RefreshCw,
} from 'lucide-react'
type Insight = {
  evidence?: { title: string; amount: number; change: number; note: string }[]
  period: { start_date: string; end_date: string }
  generated_at: string
  analysis: string | null
  cash: {
    cash_in: number
    cash_out: number
    net_cash: number
    cash_balance: number
    opening_balance: number
  }
  actions: {
    id: string
    title: string
    detail: string
    href: string
    due_date?: string
  }[]
}
function money(n: number) {
  return `Rp${n.toLocaleString('id-ID')}`
}
function calendar(action: Insight['actions'][number]) {
  const escape = (s: string) =>
    s
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\r/g, '')
  const date = (
    action.due_date || new Date().toISOString().slice(0, 10)
  ).replace(/-/g, '')
  const text = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AkunAI//Reminders//ID',
    'BEGIN:VEVENT',
    `UID:${action.id}@akunai.local`,
    `DTSTAMP:${new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${date}`,
    `SUMMARY:${escape(action.title)}`,
    `DESCRIPTION:${escape(action.detail)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/calendar;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'pengingat-akunai.ics'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export default function FinancialInsights({
  businessId,
  showCash = false,
}: {
  businessId: string
  showCash?: boolean
}) {
  const [data, setData] = useState<Insight | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [savedKeys, setSavedKeys] = useState<string[]>([])
  async function saveAction(action: Insight['actions'][number]) {
    if (saving) return
    setSaving(action.id)
    setError('')
    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          title: action.title,
          detail: action.detail,
          due_date:
            action.due_date ||
            new Date().toLocaleDateString('en-CA', {
              timeZone: 'Asia/Jakarta',
            }),
          source_key: `${action.id}:${data?.period.start_date}`,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setSavedKeys((keys) => [...keys, action.id])
      window.dispatchEvent(new Event('akunai-action-saved'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(null)
    }
  }
  const [reasoning, setReasoning] = useState(false)
  const load = useCallback(
    async (reason = false) => {
      setError('')
      reason ? setReasoning(true) : setLoading(true)
      try {
        const response = await fetch(
          `/api/insights?business_id=${businessId}`,
          { method: reason ? 'POST' : 'GET' },
        )
        const body = await response.json()
        if (!response.ok) throw new Error(body.error)
        setData(body)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat ringkasan')
      } finally {
        setLoading(false)
        setReasoning(false)
      }
    },
    [businessId],
  )
  useEffect(() => {
    void load()
  }, [load])
  return (
    <div className="space-y-5">
      {showCash && data && (
        <section className="premium-card p-5">
          <div className="mb-5 flex justify-between">
            <h2 className="font-semibold">Arus kas bulan ini</h2>
            <Link
              href="/reports?type=cash_summary"
              aria-label="Lihat rincian arus kas"
              className="text-brand-300"
            >
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['Kas masuk', data.cash.cash_in],
              ['Kas keluar', data.cash.cash_out],
              ['Perubahan kas', data.cash.net_cash],
              ['Saldo akhir', data.cash.cash_balance],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-surface-400">{label}</p>
                <p className="mt-2 text-base font-semibold tabular-nums">
                  {money(Number(value))}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-surface-400">
            Kas & bank · transfer internal dinetokan.
          </p>
        </section>
      )}
      {data?.evidence && (
        <section className="premium-card p-5">
          <h2 className="mb-4 font-semibold">Di mana uang tertahan?</h2>
          {data.evidence.map((e) => (
            <div key={e.title} className="border-t border-white/10 py-3">
              <div className="flex justify-between gap-3 text-sm">
                <span>{e.title}</span>
                <strong className="tabular-nums">{money(e.amount)}</strong>
              </div>
              <p className="mt-1 text-xs text-surface-400">
                Perubahan sejak awal bulan: {e.change > 0 ? '+' : ''}
                {money(e.change)}
              </p>
              <p className="mt-2 text-[11px] leading-5 text-surface-400">
                {e.note}
              </p>
            </div>
          ))}
          <p className="text-[11px] leading-5 text-amber-200/80">
            Menggunakan kode akun bawaan. Akun custom belum dipetakan; saldo nol
            perlu diperiksa. Ini petunjuk diagnosis, bukan bukti penyebab.
          </p>
        </section>
      )}
      <section className="premium-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <Sparkles size={18} className="text-amber-300" />
            Analisis keuangan
          </h2>
          <span className="chip">AI</span>
        </div>
        {data?.analysis ? (
          <p className="whitespace-pre-wrap text-sm leading-7 text-surface-200">
            {data.analysis}
          </p>
        ) : (
          <p className="text-sm leading-6 text-surface-300">
            Pahami hubungan pendapatan, beban, dan kas dari pembukuan bisnis
            Anda.
          </p>
        )}
        <button
          disabled={reasoning || loading}
          className="btn-secondary mt-4 w-full"
          onClick={() => load(true)}
        >
          {reasoning ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Sparkles size={15} />
          )}
          {reasoning
            ? 'Menganalisis…'
            : data?.analysis
              ? 'Perbarui analisis'
              : 'Analisis data saya'}
        </button>
        <p className="mt-3 text-[11px] leading-5 text-surface-400">
          Menggunakan kuota AI. Ringkasan angka dikirim melalui OpenRouter.
          Verifikasi interpretasi AI sebelum mengambil keputusan.
        </p>
      </section>
      <section className="premium-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Perlu ditindaklanjuti</h2>
          <button
            className="btn-icon"
            aria-label="Perbarui tindak lanjut"
            disabled={loading || reasoning}
            onClick={() => load()}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {loading && !data && (
          <p role="status" className="text-sm text-surface-400">
            Memeriksa pembukuan…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        {data && (
          <>
            <div className="space-y-4">
              {data.actions.length ? (
                data.actions.map((action) => (
                  <div
                    key={action.id}
                    className="border-t border-white/10 pt-4"
                  >
                    <Link
                      className="flex items-start justify-between gap-3 text-sm font-medium hover:text-brand-300"
                      href={action.href}
                    >
                      {action.title}
                      <ArrowUpRight size={16} className="shrink-0" />
                    </Link>
                    <p className="mt-2 text-xs leading-6 text-surface-400">
                      {action.detail}
                    </p>
                    <button
                      disabled={!!saving || savedKeys.includes(action.id)}
                      onClick={() => saveAction(action)}
                      className="btn-secondary mt-3 !py-1.5 !text-xs"
                    >
                      {savedKeys.includes(action.id)
                        ? 'Tersimpan di action plan'
                        : saving === action.id
                          ? 'Menyimpan…'
                          : 'Jadikan tindakan'}
                    </button>
                    {action.due_date && (
                      <button
                        onClick={() => calendar(action)}
                        className="mt-2 flex items-center gap-2 text-xs text-brand-300"
                      >
                        <CalendarPlus size={14} />
                        Unduh pengingat kalender
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-surface-400">
                  Tidak ada peringatan dari data yang tersedia. Tetap periksa
                  kelengkapan pembukuan.
                </p>
              )}
            </div>
            <p className="mt-5 border-t border-white/10 pt-3 text-[11px] leading-5 text-surface-400">
              Aturan dari data tercatat · {data.period.start_date} –{' '}
              {data.period.end_date}. Menampilkan hingga 20 invoice jatuh tempo.
              Pengingat aktif setelah file diimpor ke kalender Anda.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
