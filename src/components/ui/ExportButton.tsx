'use client'

import { useState } from 'react'
import { FileDown, FileText, Table2, Loader2, ChevronDown, Lock, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import type { Plan } from '@/lib/permissions/plans'
import { PLANS } from '@/lib/permissions/plans'

interface ExportButtonProps {
  businessId: string
  plan: Plan
  reportType: 'profit_loss' | 'balance_sheet'
  params: {
    start_date?: string
    end_date?: string
    as_of_date?: string
  }
  label?: string
}

export default function ExportButton({ businessId, plan, reportType, params, label = 'Export' }: ExportButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<'pdf' | 'xlsx' | 'csv' | null>(null)

  const canPDF = PLANS[plan].features.export_pdf
  const canExcel = PLANS[plan].features.export_excel

  const buildUrl = (format: 'pdf' | 'xlsx' | 'csv') => {
    const p = new URLSearchParams({
      business_id: businessId,
      type: reportType,
      format,
      ...params,
    })
    return `/api/export?${p}`
  }

  const handleExport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    setLoading(format)
    setOpen(false)

    try {
      const res = await fetch(buildUrl(format))

      if (!res.ok) {
        const err = await res.json()
        if (err.upgrade_required) {
          toast.error('Upgrade plan untuk fitur ini')
          setLoading(null)
          return
        }
        throw new Error(err.error || 'Export gagal')
      }

      // Check if fallback HTML (puppeteer unavailable)
      const isFallback = res.headers.get('X-Export-Fallback') === 'true'

      if (isFallback && format === 'pdf') {
        // Open HTML in new tab so user can print as PDF.
        const html = await res.text()
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const win = window.open(url, '_blank')
        if (win) {
          win.onload = () => {
            setTimeout(() => win.print(), 500)
          }
        }
        toast.success('Halaman dibuka untuk dicetak sebagai PDF')
      } else {
        // Download file directly
        const blob = await res.blob()
        const contentDisposition = res.headers.get('Content-Disposition') || ''
        const filenameMatch = contentDisposition.match(/filename="([^"]+)"/)
        const filename = filenameMatch?.[1] ||
          `laporan-${reportType}-${new Date().toISOString().split('T')[0]}.${format}`

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
        toast.success(`${format.toUpperCase()} berhasil diunduh!`)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Export gagal')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 px-4 py-2 rounded-xl
          border border-surface-700 bg-surface-800 hover:bg-surface-700
          text-surface-200 hover:text-white text-sm transition-colors
          disabled:opacity-60"
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <FileDown size={14} />
        )}
        {loading ? `Export ${loading.toUpperCase()}...` : label}
        {!loading && <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20
            bg-surface-800 border border-surface-700 rounded-xl shadow-xl overflow-hidden min-w-44">

            {/* PDF option */}
            <button
              onClick={() => canPDF ? handleExport('pdf') : null}
              disabled={!canPDF}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left
                ${canPDF
                  ? 'text-surface-200 hover:bg-surface-700 hover:text-white'
                  : 'text-surface-600 cursor-not-allowed'
                }`}
            >
              <FileText size={15} className={canPDF ? 'text-red-400' : 'text-surface-700'} />
              <div>
                <p className="font-medium">Export PDF</p>
                {!canPDF && (
                  <p className="text-xs text-surface-600 flex items-center gap-1">
                    <Lock size={9} /> Starter+
                  </p>
                )}
              </div>
            </button>

            {/* Excel option */}
            <button
              onClick={() => canExcel ? handleExport('xlsx') : null}
              disabled={!canExcel}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left
                border-t border-surface-700
                ${canExcel
                  ? 'text-surface-200 hover:bg-surface-700 hover:text-white'
                  : 'text-surface-600 cursor-not-allowed'
                }`}
            >
              <Table2 size={15} className={canExcel ? 'text-brand-400' : 'text-surface-700'} />
              <div>
                <p className="font-medium">Export Excel</p>
                {!canExcel && (
                  <p className="text-xs text-surface-600 flex items-center gap-1">
                    <Lock size={9} /> Pro only
                  </p>
                )}
              </div>
            </button>

            <button
              onClick={() => handleExport('csv')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left
                border-t border-surface-700 text-surface-200 hover:bg-surface-700 hover:text-white"
            >
              <FileSpreadsheet size={15} className="text-blue-400" />
              <div>
                <p className="font-medium">Export CSV</p>
                <p className="text-xs text-surface-500">Data tabel</p>
              </div>
            </button>

            {(!canPDF || !canExcel) && (
              <div className="px-4 py-2 border-t border-surface-700">
                <Link href="/billing"
                  className="text-xs text-brand-400 hover:text-brand-300">
                  Upgrade untuk unlock -&gt;
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
