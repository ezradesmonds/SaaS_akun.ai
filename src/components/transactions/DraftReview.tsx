'use client'
import { useRef, useState } from 'react'
import { Check, Plus, X, Loader2 } from 'lucide-react'
import type { JournalEntry } from '@/lib/accounting/journal'
import {
  JournalEntrySchema,
  validateJournalLines,
} from '@/lib/accounting/journal'
import toast from 'react-hot-toast'
export type DraftAccount = { id: string; code: string; name: string }
export default function DraftReview({
  initial,
  accounts,
  idempotencyKey,
  onSaved,
}: {
  initial: JournalEntry
  accounts: DraftAccount[]
  idempotencyKey?: string
  onSaved?: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [attempted, setAttempted] = useState(false)
  const key = useRef(idempotencyKey || crypto.randomUUID())
  const lock = useRef(false)
  const validation = validateJournalLines(draft.entries)
  const valid = JournalEntrySchema.safeParse(draft).success && !validation.error
  function update(next: JournalEntry) {
    setDraft(next)
    setError('')
  }
  async function save() {
    if (!valid || lock.current || saved) return
    lock.current = true
    setAttempted(true)
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': key.current,
        },
        body: JSON.stringify(draft),
      })
      const body = await res.json()
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) setAttempted(false)
        throw new Error(
          typeof body.error === 'string'
            ? body.error
            : 'Periksa tanggal, akun, dan nominal jurnal.',
        )
      }
      setSaved(true)
      toast.success('Transaksi berhasil dicatat')
      onSaved?.()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Gagal menyimpan. Coba lagi dengan draft yang sama.',
      )
    } finally {
      setSaving(false)
      lock.current = false
    }
  }
  if (saved)
    return (
      <div
        role="status"
        className="rounded-lg border border-brand-400/30 bg-brand-500/10 p-5 text-brand-300"
      >
        <Check className="mb-2" size={22} />
        Transaksi sudah dicatat. Laporan menggunakan data terbaru.
      </div>
    )
  return (
    <section className="premium-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-4">
        <h2 className="font-semibold">Draft transaksi</h2>
        <span className="chip !text-amber-300">Perlu konfirmasi</span>
      </div>
      <fieldset disabled={saving || attempted} className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <label className="text-xs text-surface-300">
            Tanggal
            <input
              type="date"
              className="input mt-2"
              value={draft.date}
              onChange={(e) => update({ ...draft, date: e.target.value })}
            />
          </label>
          <label className="text-xs text-surface-300">
            Deskripsi
            <input
              className="input mt-2"
              maxLength={500}
              value={draft.description}
              onChange={(e) =>
                update({ ...draft, description: e.target.value })
              }
            />
          </label>
        </div>
        <div className="space-y-3">
          {draft.entries.map((line, i) => (
            <div
              key={i}
              className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.5fr)_1fr_1fr_32px]"
            >
              <label className="col-span-2 text-xs text-surface-400 sm:col-span-1">
                Akun {i + 1}
                <select
                  className="input mt-1"
                  value={line.account_id}
                  onChange={(e) =>
                    update({
                      ...draft,
                      entries: draft.entries.map((l, j) =>
                        j === i ? { ...l, account_id: e.target.value } : l,
                      ),
                    })
                  }
                >
                  <option value="">Pilih akun</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </label>
              {(['debit', 'credit'] as const).map((side) => (
                <label
                  key={side}
                  className="text-xs capitalize text-surface-400"
                >
                  {side} (Rp)
                  <input
                    className="input mt-1 !px-2 tabular-nums"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line[side]}
                    onChange={(e) =>
                      update({
                        ...draft,
                        entries: draft.entries.map((l, j) =>
                          j === i
                            ? { ...l, [side]: Number(e.target.value) }
                            : l,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <button
                className="btn-icon self-end"
                aria-label={`Hapus baris ${i + 1}`}
                disabled={draft.entries.length <= 2}
                onClick={() =>
                  update({
                    ...draft,
                    entries: draft.entries.filter((_, j) => j !== i),
                  })
                }
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="flex items-center gap-2 text-xs text-brand-300"
          onClick={() =>
            update({
              ...draft,
              entries: [
                ...draft.entries,
                { account_id: '', debit: 0, credit: 0 },
              ],
            })
          }
        >
          <Plus size={14} />
          Tambah baris
        </button>
        <p
          className={`border-t border-white/10 pt-3 text-xs ${validation.error ? 'text-amber-300' : 'text-brand-300'}`}
        >
          {validation.error ||
            `Seimbang · Debit dan kredit Rp${validation.totalDebit?.toLocaleString('id-ID')}`}
        </p>
        <p className="text-xs leading-5 text-surface-400">
          Periksa dengan dokumen asli. Setelah dicatat, koreksi dilakukan
          melalui jurnal pembalik.
        </p>
      </fieldset>
      {attempted && !saving && (
        <p className="px-4 text-xs leading-5 text-amber-300">
          Draft dikunci setelah percobaan penyimpanan agar retry memakai data
          yang sama. Periksa jurnal jika status koneksi tidak pasti.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <button
        className="btn-primary m-4 !w-[calc(100%-2rem)]"
        onClick={save}
        disabled={!valid || saving}
      >
        {saving ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Check size={16} />
        )}
        {saving ? 'Mencatat…' : 'Konfirmasi & catat transaksi'}
      </button>
    </section>
  )
}
