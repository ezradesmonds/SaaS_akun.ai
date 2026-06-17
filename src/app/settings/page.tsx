'use client'

import { useState, useEffect } from 'react'
import { Settings, Building2, BookOpen, Loader2, Check, Plus, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Business, Account, BusinessType } from '@/types'

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const
const TYPE_LABELS: Record<string, string> = {
  ASSET: 'Aset', LIABILITY: 'Kewajiban',
  EQUITY: 'Ekuitas', REVENUE: 'Pendapatan', EXPENSE: 'Beban'
}
const TYPE_COLORS: Record<string, string> = {
  ASSET: 'text-blue-400', LIABILITY: 'text-red-400',
  EQUITY: 'text-purple-400', REVENUE: 'text-brand-400', EXPENSE: 'text-amber-400'
}

export default function SettingsPage() {
  const [tab, setTab] = useState<'business' | 'accounts'>('business')
  const [business, setBusiness] = useState<Business | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: biz } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', user.id)
        .single()

      setBusiness(biz)

      if (biz) {
        const { data: accs } = await supabase
          .from('accounts')
          .select('*')
          .eq('business_id', biz.id)
          .order('code')

        setAccounts(accs || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    )
  }

  if (!business) {
    return (
      <BusinessSetup
        onCreated={(createdBusiness) => {
          setBusiness(createdBusiness)
          router.replace('/dashboard')
          router.refresh()
        }}
      />
    )
  }

  return (
    <div className="page-shell max-w-4xl">
      {/* Header */}
      <div>
        <p className="eyebrow">Workspace</p>
        <h1 className="page-title flex items-center gap-2">
          <Settings size={24} className="text-brand-400" />
          Pengaturan
        </h1>
      </div>

      {/* Tabs */}
      <div className="panel-soft flex gap-1 p-1 w-fit">
        {[
          { key: 'business', label: 'Bisnis', icon: Building2 },
          { key: 'accounts', label: 'Akun', icon: BookOpen },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as 'business' | 'accounts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === key
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-950/30'
                : 'text-surface-400 hover:text-white hover:bg-white/[0.04]'
              }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'business' && (
        <BusinessSettings business={business} onSaved={setBusiness} />
      )}

      {tab === 'accounts' && (
        <AccountsSettings
          businessId={business.id}
          accounts={accounts}
          onRefresh={async () => {
            const supabase = createClient()
            const { data } = await supabase
              .from('accounts')
              .select('*')
              .eq('business_id', business.id)
              .order('code')
            setAccounts(data || [])
          }}
        />
      )}
    </div>
  )
}

// â”€â”€ Business Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BusinessSetup({ onCreated }: { onCreated: (business: Business) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<BusinessType>('toko')
  const [saving, setSaving] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const response = await fetch('/api/business/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type }),
    })

    setSaving(false)

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      toast.error(body?.error || 'Gagal membuat bisnis')
      return
    }

    const body = await response.json()
    toast.success('Bisnis siap digunakan')
    onCreated(body.business)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={handleCreate} className="w-full max-w-md premium-card p-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 size={20} className="text-brand-400" />
            Setup Bisnis
          </h1>
          <p className="text-sm text-surface-400 mt-1">Lengkapi bisnis untuk mulai memakai Akun.AI.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-surface-300 mb-1.5">Nama Bisnis</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            required
            minLength={2}
            placeholder="Toko Maju Jaya"
            className="input px-4"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-surface-300 mb-1.5">Jenis Bisnis</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as BusinessType)}
            className="input px-4"
          >
            <option value="toko">Toko / Warung</option>
            <option value="jasa">Jasa / Servis</option>
            <option value="freelancer">Freelancer</option>
            <option value="umkm">UMKM Lainnya</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary w-full"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Buat Bisnis
        </button>
      </form>
    </div>
  )
}
function BusinessSettings({ business, onSaved }: { business: Business; onSaved: (b: Business) => void }) {
  const [name, setName] = useState(business.name)
  const [description, setDescription] = useState(business.description || '')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('businesses')
      .update({ name, description })
      .eq('id', business.id)
      .select()
      .single()

    setLoading(false)
    if (error) { toast.error('Gagal menyimpan'); return }
    onSaved(data)
    toast.success('Profil bisnis diperbarui')
  }

  return (
    <div className="premium-card p-6 space-y-5">
      <h2 className="font-semibold text-white">Profil Bisnis</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-surface-300 mb-1.5">Nama Bisnis</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="input px-4"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-surface-300 mb-1.5">Deskripsi (opsional)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="Ceritakan sedikit tentang bisnis kamu..."
            className="input px-4 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-surface-300 mb-1.5">Jenis Bisnis</label>
            <div className="px-4 py-2.5 bg-surface-900 border border-surface-700 rounded-xl text-sm text-surface-400">
              {business.type}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-300 mb-1.5">Mata Uang</label>
            <div className="px-4 py-2.5 bg-surface-900 border border-surface-700 rounded-xl text-sm text-surface-400">
              {business.currency}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        className="btn-primary"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        Simpan Perubahan
      </button>
    </div>
  )
}

// â”€â”€ Accounts Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AccountsSettings({
  businessId, accounts, onRefresh
}: {
  businessId: string
  accounts: Account[]
  onRefresh: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<typeof ACCOUNT_TYPES[number]>('ASSET')
  const [saving, setSaving] = useState(false)

  const grouped = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = accounts.filter(a => a.type === type)
    return acc
  }, {} as Record<string, Account[]>)

  const handleAdd = async () => {
    if (!newCode.trim() || !newName.trim()) {
      toast.error('Isi kode dan nama akun')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('accounts')
      .insert({ business_id: businessId, code: newCode, name: newName, type: newType })

    setSaving(false)
    if (error) {
      toast.error(error.message.includes('unique') ? 'Kode akun sudah ada' : 'Gagal menambah akun')
      return
    }

    toast.success('Akun ditambahkan')
    setNewCode(''); setNewName(''); setShowAdd(false)
    onRefresh()
  }

  const toggleActive = async (acc: Account) => {
    const supabase = createClient()
    await supabase
      .from('accounts')
      .update({ is_active: !acc.is_active })
      .eq('id', acc.id)
    onRefresh()
  }

  return (
    <div className="space-y-4">
      {/* Add Account */}
      {showAdd ? (
        <div className="premium-card border-brand-500/30 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Tambah Akun Baru</h3>
          <div className="grid grid-cols-3 gap-3">
            <input
              value={newCode}
              onChange={e => setNewCode(e.target.value)}
              placeholder="Kode (mis: 1-010)"
              className="input"
            />
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nama akun"
              className="input"
            />
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as typeof ACCOUNT_TYPES[number])}
              className="input"
            >
              {ACCOUNT_TYPES.map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400
                text-white text-sm font-medium disabled:opacity-60"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Tambah
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-xl border border-surface-700 text-surface-400
                hover:text-white text-sm"
            >
              Batal
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-surface-600
            text-surface-400 hover:text-white hover:border-brand-500 text-sm transition-colors w-full justify-center"
        >
          <Plus size={14} /> Tambah Akun Baru
        </button>
      )}

      {/* Grouped accounts */}
      {ACCOUNT_TYPES.map(type => (
        grouped[type].length > 0 && (
          <div key={type} className="premium-card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-700 flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${TYPE_COLORS[type]}`}>
                {TYPE_LABELS[type]}
              </span>
              <span className="text-xs text-surface-500">({grouped[type].length} akun)</span>
            </div>
            <div className="divide-y divide-surface-700/50">
              {grouped[type].map(acc => (
                <div key={acc.id} className={`flex items-center justify-between px-4 py-2.5
                  ${!acc.is_active ? 'opacity-40' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-surface-500 w-14 flex-shrink-0">{acc.code}</span>
                    <span className="text-sm text-white">{acc.name}</span>
                  </div>
                  <button
                    onClick={() => toggleActive(acc)}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors
                      ${acc.is_active
                        ? 'bg-brand-500/15 text-brand-400 hover:bg-red-500/15 hover:text-red-400'
                        : 'bg-surface-700 text-surface-500 hover:bg-brand-500/15 hover:text-brand-400'
                      }`}
                  >
                    {acc.is_active ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      ))}
    </div>
  )
}

