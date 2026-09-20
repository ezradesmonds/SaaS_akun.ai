'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Plus } from 'lucide-react'
type Action = {
  id: string
  title: string
  detail: string
  due_date: string
  status: 'open' | 'done'
}
export default function ActionPlan({ businessId }: { businessId: string }) {
  const [actions, setActions] = useState<Action[]>([])
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }),
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const key = useRef<string | null>(null)
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/actions?business_id=${businessId}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setActions(d.data)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [businessId])
  useEffect(() => {
    void load()
    const refresh = () => void load()
    window.addEventListener('akunai-action-saved', refresh)
    return () => window.removeEventListener('akunai-action-saved', refresh)
  }, [load])
  async function save(action?: Action) {
    if (lock.current) return
    lock.current = true
    if (!key.current) key.current = crypto.randomUUID()
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/actions', {
        method: action ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action
            ? {
                id: action.id,
                business_id: businessId,
                status: action.status === 'done' ? 'open' : 'done',
              }
            : {
                business_id: businessId,
                title,
                detail: 'Tindakan yang ditentukan pemilik bisnis.',
                due_date: due,
                source_key: key.current,
              },
        ),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      if (!action) {
        setTitle('')
        key.current = null
      }
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      lock.current = false
    }
  }
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta',
  })
  const week = new Date()
  week.setDate(week.getDate() + 7)
  const weekEnd = week.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  return (
    <section className="premium-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 p-5">
        <h2 className="font-semibold">Action plan</h2>
        <span className="chip">
          {actions.filter((a) => a.status === 'open').length} terbuka
        </span>
      </div>
      <div className="space-y-5 p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          className="flex flex-wrap gap-2"
        >
          <label className="min-w-40 flex-1 text-xs text-surface-300">
            Tindakan
            <input
              required
              maxLength={240}
              className="input mt-2"
              placeholder="Contoh: review pembelian stok minggu depan"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="text-xs text-surface-300">
            Target selesai
            <input
              required
              type="date"
              className="input mt-2"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !title.trim()}
            className="btn-primary self-end"
            aria-label="Tambahkan tindakan"
          >
            <Plus size={16} />
          </button>
        </form>
        {error && (
          <p role="alert" className="text-xs leading-6 text-amber-300">
            {error}
          </p>
        )}
        {[
          'Hari ini & terlambat',
          '7 hari ke depan',
          'Berikutnya',
          'Selesai',
        ].map((group, i) => {
          const list = actions.filter((a) =>
            i === 3
              ? a.status === 'done'
              : a.status === 'open' &&
                (i === 0
                  ? a.due_date <= today
                  : i === 1
                    ? a.due_date > today && a.due_date <= weekEnd
                    : a.due_date > weekEnd),
          )
          return (
            list.length > 0 && (
              <div key={group}>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-surface-400">
                  {group}
                </h3>
                {list.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-3 border-t border-white/5 py-3"
                  >
                    <button
                      className="btn-icon shrink-0"
                      disabled={busy}
                      aria-label={
                        a.status === 'done'
                          ? `Buka kembali: ${a.title}`
                          : `Selesaikan: ${a.title}`
                      }
                      onClick={() => save(a)}
                    >
                      {a.status === 'done' ? (
                        <Check size={16} className="text-brand-300" />
                      ) : (
                        <span className="h-3 w-3 rounded border border-surface-400" />
                      )}
                    </button>
                    <div>
                      <p
                        className={`text-sm ${a.status === 'done' ? 'text-surface-400 line-through' : ''}`}
                      >
                        {a.title}
                      </p>
                      <p className="mt-1 text-xs text-surface-400">
                        {a.due_date}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-surface-400">
                        {a.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )
        })}
        {!actions.length && !error && (
          <p className="text-sm text-surface-400">
            Simpan rekomendasi atau tambahkan tindakan pertama Anda.
          </p>
        )}
        <p className="text-xs leading-6 text-surface-400">
          Rencana ini membantu pelaksanaan manual. Tidak mengirim pesan
          pelanggan, mengubah harga, atau melakukan pembayaran otomatis. Hingga
          100 tindakan ditampilkan.
        </p>
      </div>
    </section>
  )
}
