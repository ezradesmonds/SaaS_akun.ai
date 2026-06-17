'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, Plug, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

const PROVIDERS = ['tokopedia', 'shopee', 'lazada', 'mayar', 'manual_csv'] as const

type Provider = typeof PROVIDERS[number]

type Connection = {
  id: string
  provider: Provider
  display_name: string
  status: 'disconnected' | 'pending' | 'connected' | 'disabled'
  non_secret_config: Record<string, unknown>
  secret_handling_note: string
  created_at: string
}

const PROVIDER_LABELS: Record<Provider, string> = {
  tokopedia: 'Tokopedia',
  shopee: 'Shopee',
  lazada: 'Lazada',
  mayar: 'Mayar',
  manual_csv: 'Manual CSV',
}

export default function IntegrationsPage() {
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [provider, setProvider] = useState<Provider>('manual_csv')
  const [displayName, setDisplayName] = useState('')
  const [storeLabel, setStoreLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadConnections = async (resolvedBusinessId: string) => {
    const response = await fetch(`/api/integrations?business_id=${resolvedBusinessId}`)
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Gagal memuat integrasi')
    setConnections(body.data || [])
  }

  useEffect(() => {
    const load = async () => {
      try {
        const accountResponse = await fetch('/api/accounts?detect=true')
        const accountBody = await accountResponse.json()
        if (!accountResponse.ok) throw new Error(accountBody.error || 'Gagal memuat bisnis')

        setBusinessId(accountBody.business_id)
        await loadConnections(accountBody.business_id)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Gagal memuat integrasi')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const createConnection = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!businessId) return

    setSaving(true)
    try {
      const response = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          provider,
          display_name: displayName || PROVIDER_LABELS[provider],
          status: 'pending',
          non_secret_config: {
            label: storeLabel || displayName || PROVIDER_LABELS[provider],
          },
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Gagal menyimpan integrasi')

      toast.success('Integrasi disimpan sebagai stub metadata')
      setDisplayName('')
      setStoreLabel('')
      await loadConnections(businessId)
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Gagal menyimpan integrasi')
    } finally {
      setSaving(false)
    }
  }

  const disableConnection = async (connection: Connection) => {
    if (!businessId) return

    const response = await fetch('/api/integrations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: connection.id,
        business_id: businessId,
        status: connection.status === 'disabled' ? 'pending' : 'disabled',
        non_secret_config: connection.non_secret_config || {},
      }),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      toast.error(body?.error || 'Gagal memperbarui integrasi')
      return
    }

    toast.success('Status integrasi diperbarui')
    await loadConnections(businessId)
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    )
  }

  return (
    <div className="page-shell max-w-5xl">
      <div>
        <p className="eyebrow">Koneksi Data</p>
        <h1 className="page-title flex items-center gap-2">
          <Plug size={24} className="text-brand-400" />
          Integrasi
        </h1>
        <p className="page-subtitle max-w-2xl">
          Stub koneksi marketplace dan payment gateway. Token, API key, dan password belum disimpan karena encrypted credential storage belum tersedia.
        </p>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      <form onSubmit={createConnection} className="premium-card p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as Provider)}
            className="input"
          >
            {PROVIDERS.map((item) => (
              <option key={item} value={item}>{PROVIDER_LABELS[item]}</option>
            ))}
          </select>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Nama koneksi"
            className="input"
          />
          <input
            value={storeLabel}
            onChange={(event) => setStoreLabel(event.target.value)}
            placeholder="Label toko/import"
            className="input"
          />
          <button
            type="submit"
            disabled={saving || !businessId}
            className="btn-primary"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Tambah
          </button>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {connections.length === 0 ? (
          <div className="premium-card p-5 text-sm text-surface-400">
            Belum ada koneksi integrasi.
          </div>
        ) : connections.map((connection) => (
          <div key={connection.id} className="premium-card premium-card-hover p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{connection.display_name}</p>
                <p className="text-xs text-surface-500">{PROVIDER_LABELS[connection.provider]}</p>
              </div>
              <span className={`rounded-lg px-2.5 py-1 text-xs ${
                connection.status === 'disabled'
                  ? 'bg-surface-700 text-surface-400'
                  : 'bg-brand-500/10 text-brand-400'
              }`}>
                {connection.status}
              </span>
            </div>
            <p className="mt-4 text-xs leading-5 text-surface-400">{connection.secret_handling_note}</p>
            <button
              onClick={() => disableConnection(connection)}
              className="mt-4 flex items-center gap-2 rounded-xl border border-surface-700 px-3 py-2 text-xs text-surface-300 hover:text-white"
            >
              <Check size={13} />
              {connection.status === 'disabled' ? 'Aktifkan stub' : 'Disable stub'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
