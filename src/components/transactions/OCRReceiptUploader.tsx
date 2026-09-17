'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Upload, ScanLine, Loader2, FileText, ArrowRight } from 'lucide-react'
import DraftReview, { type DraftAccount } from './DraftReview'
import type { JournalLine } from '@/lib/accounting/journal'
type Extraction = { date: string; description: string; merchant?: string; total: number; items: { name: string; amount: number }[]; entries: JournalLine[]; confidence: string; notes: string; raw_text: string }
export default function OCRReceiptUploader({ businessId, onTransactionSaved }: { businessId: string; onTransactionSaved?: () => void; onClose?: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<Extraction | null>(null)
  const [accounts, setAccounts] = useState<DraftAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const lock = useRef(false)
  useEffect(() => {
    if (!file) { setUrl(''); return }
    const next = URL.createObjectURL(file); setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  async function scan(next: File) {
    if (lock.current) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size === 0 || next.size > 5 * 1024 * 1024) { setError('Pilih foto JPG, PNG, atau WEBP, maksimal 5 MB. Untuk PDF, ekspor halaman sebagai gambar.'); return }
    lock.current = true; setFile(next); setResult(null); setSaved(false); setError(''); setLoading(true)
    try {
      const accountResponse = await fetch(`/api/accounts?business_id=${businessId}`)
      const accountData = await accountResponse.json()
      if (!accountResponse.ok) throw new Error('Daftar akun tidak tersedia. Coba lagi.')
      setAccounts(accountData.accounts || accountData.data || [])
      const form = new FormData(); form.append('image', next); form.append('business_id', businessId)
      const response = await fetch('/api/ocr', { method: 'POST', body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Dokumen belum terbaca. Coba foto yang lebih jelas.')
      setResult(data.extracted)
    } catch (e) { setError(e instanceof Error ? e.message : 'Koneksi terputus. Coba lagi.') }
    finally { setLoading(false); lock.current = false }
  }
  return <div className="report-layout">
    <div className="min-w-0 space-y-5">
      <div className="premium-card p-5">
        <div className="flex items-center gap-4"><div className="rounded-xl bg-brand-500/10 p-3"><ScanLine size={24} className="text-brand-400" /></div><div className="min-w-0 flex-1"><h2 className="truncate font-medium">{file?.name || 'Dari dokumen ke draft transaksi'}</h2><p className="mt-1 text-xs text-surface-400">{loading ? 'Membaca teks dan mencocokkan akun…' : result ? 'Ekstraksi selesai · periksa hasil sebelum mencatat' : 'Struk belanja atau invoice dalam format gambar'}</p></div>{loading && <Loader2 className="animate-spin text-brand-400" size={20} />}</div>
        <input ref={input} aria-label="Pilih dokumen" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={loading} onChange={e => { const f = e.target.files?.[0]; if (f) void scan(f); e.target.value = '' }} />
        {!result && <button disabled={loading} onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void scan(f) }} className="mt-5 flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-[#38535e] bg-[#05131d] px-5 py-12 text-center hover:border-brand-400 disabled:opacity-50"><Upload size={28} className="text-brand-400" /><span className="font-medium">{loading ? 'Memproses dokumen…' : 'Pilih atau letakkan foto dokumen'}</span><span className="text-xs text-surface-400">JPG, PNG, WEBP · hingga 5 MB</span></button>}
        <p className="mt-4 text-xs leading-5 text-surface-400">Foto dikirim ke penyedia AI melalui OpenRouter untuk ekstraksi. Unggah hanya dokumen bisnis yang boleh diproses.</p>
        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      </div>
      {result && <>
        <section className="premium-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-4"><h2 className="font-semibold">Hasil ekstraksi</h2><span className="chip">Keyakinan model: {({ high: 'tinggi', medium: 'sedang', low: 'rendah' } as Record<string,string>)[result.confidence]}</span></div><div className="p-4"><p className="mb-4 text-sm text-surface-300">{result.merchant || 'Merchant belum teridentifikasi'}</p>{result.items.map((item, i) => <div key={i} className="flex justify-between gap-4 border-b border-white/5 py-3 text-sm"><span>{item.name}</span><span className="whitespace-nowrap tabular-nums">Rp{item.amount.toLocaleString('id-ID')}</span></div>)}<div className="flex justify-between py-4 font-semibold"><span>Total dokumen</span><span className="text-brand-300">Rp{result.total.toLocaleString('id-ID')}</span></div>{Math.abs(result.items.reduce((n, i) => n + i.amount, 0) - result.total) > .01 && <p className="text-xs leading-5 text-amber-300">Jumlah item berbeda dari total. Periksa diskon, pajak, biaya tambahan, atau kesalahan baca pada dokumen asli.</p>}</div></section>
        <DraftReview key={`${file?.name}-${file?.lastModified}`} accounts={accounts} initial={{ business_id: businessId, date: result.date, description: result.description, source: 'ai', entries: result.entries }} onSaved={() => { setSaved(true); onTransactionSaved?.() }} />
        <div className="flex flex-wrap gap-3"><button className="btn-secondary" onClick={() => input.current?.click()}>Scan dokumen lain</button>{saved && <Link className="btn-primary" href="/reports">Lihat laporan <ArrowRight size={15} /></Link>}</div>
      </>}
    </div>
    <aside className="space-y-5">
      <section className="premium-card p-5"><h2 className="mb-4 font-semibold">Dokumen asli</h2>{url ? <img src={url} alt="Dokumen yang diunggah untuk dibandingkan dengan draft" className="max-h-[620px] w-full rounded-lg bg-[#041019] object-contain" /> : <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-lg border border-white/5 bg-[#05131d] text-surface-400"><FileText size={42} strokeWidth={1} /><p className="text-xs">Preview dokumen muncul di sini</p></div>}</section>
      <section className="premium-card p-5"><h2 className="mb-3 font-semibold">Catatan pemeriksaan</h2><p className="text-sm leading-7 text-surface-300">{result?.notes || 'Pastikan tanggal, nominal, dan metode pembayaran sesuai bukti. Invoice yang belum dibayar harus menggunakan piutang atau utang, bukan kas.'}</p><p className="mt-4 text-xs leading-5 text-surface-400">Keyakinan model bukan ukuran akurasi terverifikasi. Draft belum memengaruhi laporan sampai Anda mengonfirmasi.</p></section>
      {result && <details className="premium-card p-4"><summary className="cursor-pointer text-sm">Teks hasil pembacaan</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-surface-400">{result.raw_text}</pre></details>}
    </aside>
  </div>
}
