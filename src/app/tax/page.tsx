'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Calendar, Landmark, Loader2, Plus, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

type TaxSummary = {
  period: { start: string; end: string }
  revenue: number
  expenses: number
  taxable_sales_base: number
  ppn_rate: number
  ppn_output_estimate: number
  net_before_tax: number
  compliance_note: string
}

type TaxReport = {
  id: string
  report_type: string
  period_start: string
  period_end: string
  status: string
  summary: TaxSummary
  generated_at?: string | null
  created_at?: string | null
}

function getMonthRange() {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(y, today.getMonth() + 1, 0).getDate()
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${lastDay}` }
}

function formatIDR(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TaxPage() {
  const initialRange = useMemo(getMonthRange, [])
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(initialRange.start)
  const [endDate, setEndDate] = useState(initialRange.end)
  const [reports, setReports] = useState<TaxReport[]>([])
  const [preview, setPreview] = useState<TaxSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchReports = useCallback(async (id: string) => {
    setError('')
    const response = await fetch(`/api/tax/reports?business_id=${id}`)
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Gagal memuat laporan pajak')
    setReports(body.data || [])
  }, [])

  useEffect(() => {
    fetch('/api/accounts?detect=true')
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Gagal memuat bisnis')
        if (!body.business_id) throw new Error('Belum ada bisnis untuk laporan pajak')
        setBusinessId(body.business_id)
        await fetchReports(body.business_id)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat laporan pajak'))
      .finally(() => setLoading(false))
  }, [fetchReports])

  const generateReport = async (save: boolean) => {
    if (!businessId) return
    const setter = save ? setSaving : setGenerating
    setter(true)
    setError('')

    try {
      const response = await fetch('/api/tax/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          start_date: startDate,
          end_date: endDate,
          save,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Gagal membuat laporan pajak')

      if (save) {
        toast.success('Laporan pajak disimpan')
        await fetchReports(businessId)
      }
      setPreview(body.data?.summary || null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat laporan pajak'
      setError(message)
      toast.error(message)
    } finally {
      setter(false)
    }
  }

  return (
    <div className="page-shell max-w-5xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Kepatuhan</p>
          <h1 className="page-title flex items-center gap-2">
            <Landmark size={24} className="text-brand-400" />
            Pajak
          </h1>
          <p className="page-subtitle">Ringkasan PPN sederhana dari transaksi bisnis</p>
        </div>
        <button
          onClick={() => businessId && fetchReports(businessId)}
          disabled={!businessId || loading}
          className="btn-secondary"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      <div className="premium-card p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <DateInput label="Dari" value={startDate} onChange={setStartDate} />
          <DateInput label="Sampai" value={endDate} onChange={setEndDate} />
          <button
            onClick={() => generateReport(false)}
            disabled={!businessId || generating || saving}
            className="btn-secondary"
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Calendar size={15} />}
            Preview
          </button>
          <button
            onClick={() => generateReport(true)}
            disabled={!businessId || generating || saving}
            className="btn-primary"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Simpan Laporan
          </button>
        </div>

        {preview && <SummaryPanel summary={preview} />}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : reports.length === 0 ? (
        <div className="empty-state premium-card">
          <Landmark size={36} className="mb-3 opacity-30" />
          <p className="text-sm">Belum ada laporan pajak tersimpan</p>
        </div>
      ) : (
        <div className="table-shell">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-head">
                  {['Periode', 'Pendapatan', 'PPN estimasi', 'Status', 'Dibuat'].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-xs font-medium text-surface-400">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="table-row">
                    <td className="px-4 py-3 text-sm text-surface-200">
                      {formatDate(report.period_start)} - {formatDate(report.period_end)}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-surface-200">{formatIDR(report.summary?.revenue || 0)}</td>
                    <td className="px-4 py-3 text-sm font-mono text-brand-300">{formatIDR(report.summary?.ppn_output_estimate || 0)}</td>
                    <td className="px-4 py-3 text-xs text-surface-400">{report.status}</td>
                    <td className="px-4 py-3 text-sm text-surface-400">{formatDate(report.generated_at || report.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-surface-700">
            {reports.map((report) => (
              <div key={report.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-white">{formatDate(report.period_start)} - {formatDate(report.period_end)}</p>
                  <span className="text-xs text-surface-400">{report.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Pendapatan" value={formatIDR(report.summary?.revenue || 0)} />
                  <Metric label="PPN estimasi" value={formatIDR(report.summary?.ppn_output_estimate || 0)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-surface-300 mb-1.5">{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="input [color-scheme:dark]" />
    </label>
  )
}

function SummaryPanel({ summary }: { summary: TaxSummary }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-surface-700 pt-4">
      <Metric label="Pendapatan kena pajak" value={formatIDR(summary.taxable_sales_base)} />
      <Metric label={`PPN ${(summary.ppn_rate * 100).toFixed(0)}%`} value={formatIDR(summary.ppn_output_estimate)} highlight />
      <Metric label="Laba sebelum pajak" value={formatIDR(summary.net_before_tax)} />
      <p className="sm:col-span-3 text-xs text-surface-500">{summary.compliance_note}</p>
    </div>
  )
}

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-brand-500/30 bg-brand-500/10' : 'border-white/10 bg-white/[0.035]'}`}>
      <p className="text-xs text-surface-500">{label}</p>
      <p className={`text-sm font-semibold font-mono mt-1 ${highlight ? 'text-brand-300' : 'text-white'}`}>{value}</p>
    </div>
  )
}
