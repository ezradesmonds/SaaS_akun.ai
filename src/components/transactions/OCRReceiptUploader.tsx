'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Camera, Upload, X, Check, Loader2, AlertCircle,
  Receipt, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react'
import toast from 'react-hot-toast'

interface OCREntry {
  account_id: string
  account_name: string
  debit: number
  credit: number
  note: string
}

interface OCRResult {
  date: string
  description: string
  merchant?: string
  items: { name: string; amount: number }[]
  total: number
  entries: OCREntry[]
  confidence: 'high' | 'medium' | 'low'
  raw_text: string
  notes: string
}

interface Props {
  businessId: string
  onTransactionSaved?: () => void
  onClose?: () => void
}

type Step = 'upload' | 'processing' | 'preview' | 'saving' | 'done'

export default function OCRReceiptUploader({ businessId, onTransactionSaved, onClose }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [result, setResult] = useState<OCRResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRawText, setShowRawText] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran gambar maksimal 5MB')
      return
    }

    setImageFile(file)
    setImageUrl(URL.createObjectURL(file))
    setError(null)
    setStep('processing')

    // Send to OCR API
    const formData = new FormData()
    formData.append('image', file)
    formData.append('business_id', businessId)

    try {
      const res = await fetch('/api/ocr', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'OCR gagal')

      setResult(data.extracted)
      setStep('preview')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal membaca struk')
      setStep('upload')
    }
  }, [businessId])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleSaveTransaction = async () => {
    if (!result) return
    setStep('saving')

    const validEntries = result.entries.filter(e => e.account_id && (e.debit > 0 || e.credit > 0))
    if (validEntries.length < 2) {
      toast.error('Data transaksi tidak lengkap')
      setStep('preview')
      return
    }

    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        date: result.date,
        description: result.description,
        source: 'ai',
        entries: validEntries.map(e => ({
          account_id: e.account_id,
          debit: e.debit,
          credit: e.credit,
          note: e.note || undefined,
        }))
      })
    })

    if (res.ok) {
      setStep('done')
      toast.success('Transaksi dari struk berhasil disimpan')
      onTransactionSaved?.()
    } else {
      const err = await res.json()
      toast.error(err.error || 'Gagal menyimpan')
      setStep('preview')
    }
  }

  const reset = () => {
    setStep('upload')
    setImageUrl(null)
    setImageFile(null)
    setResult(null)
    setError(null)
    setShowRawText(false)
  }

  const formatIDR = (n: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)

  const confidenceColor = {
    high: 'text-brand-400 bg-brand-500/15',
    medium: 'text-amber-400 bg-amber-500/15',
    low: 'text-red-400 bg-red-500/15',
  }

  const confidenceLabel = {
    high: 'Tinggi - data akurat',
    medium: 'Sedang - cek kembali',
    low: 'Rendah - perlu koreksi manual',
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">

      {/* ── UPLOAD STEP ── */}
      {step === 'upload' && (
        <div>
          {error && (
            <div className="flex items-start gap-2 mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-surface-600 rounded-2xl p-8
              text-center hover:border-brand-500/50 hover:bg-brand-500/5
              transition-all duration-200 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-14 h-14 rounded-2xl bg-surface-700 flex items-center justify-center mx-auto mb-4">
              <Upload size={24} className="text-surface-400" />
            </div>
            <p className="text-white font-medium mb-1">Upload Foto Struk</p>
            <p className="text-sm text-surface-400">Drag & drop atau klik untuk pilih file</p>
            <p className="text-xs text-surface-600 mt-2">JPG, PNG, WEBP - Maks 5MB</p>
          </div>

          {/* Camera button (mobile) */}
          <div className="flex gap-3 mt-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                border border-surface-700 bg-surface-800 hover:bg-surface-700
                text-surface-300 hover:text-white text-sm transition-colors"
            >
              <Camera size={16} />
              Foto Langsung
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                border border-surface-700 bg-surface-800 hover:bg-surface-700
                text-surface-300 hover:text-white text-sm transition-colors"
            >
              <Upload size={16} />
              Pilih File
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

          <div className="mt-4 p-3 bg-surface-800/60 rounded-xl border border-surface-700">
            <p className="text-xs text-surface-400 font-medium mb-1">💡 Tips foto yang baik:</p>
            <ul className="text-xs text-surface-500 space-y-0.5 list-disc list-inside">
              <li>Pastikan struk rata dan tidak terlipat</li>
              <li>Cahaya cukup, hindari bayangan</li>
              <li>Semua teks terlihat jelas dan tidak blur</li>
              <li>Foto dari atas (bird eye view)</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── PROCESSING STEP ── */}
      {step === 'processing' && (
        <div className="text-center py-12">
          {imageUrl && (
            <div className="w-32 h-40 mx-auto mb-6 rounded-xl overflow-hidden border border-surface-700">
              <img src={imageUrl} alt="Struk" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex items-center justify-center gap-3 mb-3">
            <Loader2 size={22} className="animate-spin text-brand-400" />
            <p className="text-white font-medium">Membaca struk...</p>
          </div>
          <p className="text-sm text-surface-400">AI sedang menganalisis dan mengekstrak data transaksi</p>
          <div className="flex justify-center gap-1 mt-4">
            {['Deteksi teks', 'Parse jumlah', 'Mapping akun'].map((s, i) => (
              <span key={s} className="text-xs text-surface-600 px-2 py-1 bg-surface-800 rounded-full">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── PREVIEW STEP ── */}
      {step === 'preview' && result && (
        <div className="space-y-4">
          {/* Image + confidence */}
          <div className="flex gap-3">
            {imageUrl && (
              <div className="w-20 h-24 rounded-xl overflow-hidden border border-surface-700 flex-shrink-0">
                <img src={imageUrl} alt="Struk" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1">
              <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full mb-2 ${confidenceColor[result.confidence]}`}>
                Akurasi: {confidenceLabel[result.confidence]}
              </div>
              {result.merchant && (
                <p className="text-sm font-semibold text-white">{result.merchant}</p>
              )}
              <p className="text-xs text-surface-400 mt-0.5">
                {new Date(result.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Extracted data */}
          <div className="bg-surface-800/60 rounded-xl border border-surface-700 divide-y divide-surface-700">
            <div className="px-4 py-3">
              <p className="text-xs text-surface-400 mb-0.5">Deskripsi</p>
              <p className="text-sm text-white">{result.description}</p>
            </div>

            {result.items.length > 0 && (
              <div className="px-4 py-3">
                <p className="text-xs text-surface-400 mb-2">Item</p>
                <div className="space-y-1">
                  {result.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-surface-300">{item.name}</span>
                      <span className="text-white font-mono">{formatIDR(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-4 py-3 flex justify-between items-center">
              <p className="text-sm font-semibold text-white">Total</p>
              <p className="text-base font-bold text-brand-400">{formatIDR(result.total)}</p>
            </div>
          </div>

          {/* Journal entries */}
          <div>
            <p className="text-xs text-surface-400 font-medium mb-2">Jurnal Akuntansi (double-entry)</p>
            <div className="bg-surface-800/60 rounded-xl border border-surface-700 overflow-hidden">
              <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-surface-900/50 text-xs text-surface-500 font-medium">
                <span className="col-span-5">Akun</span>
                <span className="col-span-3 text-right">Debit</span>
                <span className="col-span-3 text-right">Kredit</span>
              </div>
              {result.entries.map((entry, i) => (
                <div key={i} className="grid grid-cols-12 gap-1 px-3 py-2 border-t border-surface-700 text-sm">
                  <span className="col-span-5 text-surface-200 truncate">{entry.account_name}</span>
                  <span className="col-span-3 text-right font-mono text-surface-300">
                    {entry.debit > 0 ? formatIDR(entry.debit) : '-'}
                  </span>
                  <span className="col-span-3 text-right font-mono text-surface-300">
                    {entry.credit > 0 ? formatIDR(entry.credit) : '-'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes from LLM */}
          {result.notes && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">{result.notes}</p>
            </div>
          )}

          {/* Raw text toggle */}
          <button
            onClick={() => setShowRawText(!showRawText)}
            className="flex items-center gap-1.5 text-xs text-surface-500 hover:text-surface-300"
          >
            {showRawText ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showRawText ? 'Sembunyikan' : 'Lihat'} teks mentah dari struk
          </button>
          {showRawText && (
            <div className="p-3 bg-surface-900 rounded-xl border border-surface-700">
              <pre className="text-xs text-surface-400 whitespace-pre-wrap font-mono">{result.raw_text}</pre>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={reset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-surface-700
                text-surface-400 hover:text-white hover:border-surface-600 text-sm transition-colors">
              <RefreshCw size={14} />
              Ulang
            </button>
            <button onClick={handleSaveTransaction}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold
                transition-all active:scale-[0.99]">
              <Check size={15} />
              Simpan Transaksi
            </button>
          </div>
        </div>
      )}

      {/* ── SAVING STEP ── */}
      {step === 'saving' && (
        <div className="text-center py-12">
          <Loader2 size={24} className="animate-spin text-brand-400 mx-auto mb-3" />
          <p className="text-white font-medium">Menyimpan transaksi...</p>
        </div>
      )}

      {/* ── DONE STEP ── */}
      {step === 'done' && (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-full bg-brand-500/15 flex items-center justify-center mx-auto mb-4">
            <Check size={26} className="text-brand-400" />
          </div>
          <p className="text-white font-semibold mb-1">Transaksi Tersimpan!</p>
          <p className="text-sm text-surface-400 mb-6">Data dari struk berhasil dicatat ke jurnal.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={reset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-surface-700
                text-surface-300 hover:text-white text-sm">
              <Camera size={14} />
              Scan lagi
            </button>
            {onClose && (
              <button onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600
                  text-white text-sm transition-colors">
                Tutup
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
