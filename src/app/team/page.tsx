'use client'

import { useState, useEffect } from 'react'
import {
  Users, Mail, Trash2, ChevronDown,
  Loader2, Crown, Shield, User, Send, X, Plus
} from 'lucide-react'
import toast from 'react-hot-toast'
import { PLANS, type MemberRole } from '@/lib/permissions/plans'

interface Member {
  id: string
  role: MemberRole
  joined_at: string
  user_id: string
  email: string
  name: string
  is_you: boolean
}

interface Invitation {
  id: string
  email: string
  role: MemberRole
  expires_at: string
  created_at: string
}

interface TeamData {
  members: Member[]
  invitations: Invitation[]
  plan_limit: number
  current_count: number
}

const ROLE_CONFIG: Record<MemberRole, { label: string; icon: typeof Crown; color: string }> = {
  owner:  { label: 'Owner',  icon: Crown,  color: 'text-amber-400' },
  admin:  { label: 'Admin',  icon: Shield, color: 'text-blue-400'  },
  member: { label: 'Member', icon: User,   color: 'text-surface-400' },
}

export default function TeamPage() {
  const [data, setData] = useState<TeamData | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<MemberRole>('member')
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)

  const load = async (bizId: string) => {
    const res = await fetch(`/api/team?business_id=${bizId}`)
    const json = await res.json()
    setData(json)

    // Detect my role from members list
    const me = json.members?.find((m: Member) => m.is_you)
    if (me) setMyRole(me.role)
  }

  useEffect(() => {
    fetch('/api/accounts?detect=true')
      .then(r => r.json())
      .then(d => {
        if (!d.business_id) return
        setBusinessId(d.business_id)
        return load(d.business_id)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleRoleChange = async (memberId: string, newRole: MemberRole) => {
    if (!businessId) return
    const res = await fetch('/api/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, member_id: memberId, role: newRole })
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Role diperbarui')
    load(businessId)
  }

  const handleRemove = async (memberId: string, name: string) => {
    if (!businessId) return
    if (!confirm(`Hapus ${name} dari bisnis ini?`)) return

    const res = await fetch(`/api/team?member_id=${memberId}&business_id=${businessId}`, {
      method: 'DELETE'
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Member dihapus')
    load(businessId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    )
  }

  const canInvite = myRole === 'owner' || myRole === 'admin'
  const canManage = myRole === 'owner'
  const atLimit = data ? data.current_count >= data.plan_limit : false

  return (
    <div className="page-shell max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Kolaborasi</p>
          <h1 className="page-title flex items-center gap-2">
            <Users size={24} className="text-brand-400" />
            Tim
          </h1>
          <p className="page-subtitle">
            {data?.current_count || 0} / {data?.plan_limit || 1} member
          </p>
        </div>
        {canInvite && (
          <button
            onClick={() => {
              if (atLimit) {
                toast.error('Limit member tercapai. Upgrade plan untuk tambah member.')
                return
              }
              setShowInvite(true)
            }}
            className="btn-primary"
          >
            <Plus size={15} />
            Undang Member
          </button>
        )}
      </div>

      {/* Invite form */}
      {showInvite && businessId && (
        <InviteForm
          businessId={businessId}
          onSent={() => { setShowInvite(false); load(businessId) }}
          onClose={() => setShowInvite(false)}
        />
      )}

      {/* Members list */}
      <div className="premium-card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Member Aktif</h2>
        </div>
        <div className="divide-y divide-surface-700/50">
          {data?.members.map(member => {
            const rc = ROLE_CONFIG[member.role]
            const Icon = rc.icon
            return (
              <div key={member.id} className="flex items-center justify-between px-4 py-3.5 gap-3">
                {/* Avatar + info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-white">
                      {(member.name || member.email)?.[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      {member.name || member.email}
                      {member.is_you && (
                        <span className="ml-2 text-xs text-surface-500">(kamu)</span>
                      )}
                    </p>
                    <p className="text-xs text-surface-500 truncate">{member.email}</p>
                  </div>
                </div>

                {/* Role + actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Role badge / selector */}
                  {canManage && member.role !== 'owner' && !member.is_you ? (
                    <RoleSelector
                      currentRole={member.role}
                      onChange={role => handleRoleChange(member.id, role)}
                    />
                  ) : (
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                      bg-surface-700 text-xs font-medium ${rc.color}`}>
                      <Icon size={11} />
                      {rc.label}
                    </div>
                  )}

                  {/* Remove */}
                  {canManage && member.role !== 'owner' && !member.is_you && (
                    <button
                      onClick={() => handleRemove(member.id, member.name || member.email)}
                      className="p-1.5 rounded-lg text-surface-600 hover:text-red-400
                        hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pending invitations */}
      {data?.invitations && data.invitations.length > 0 && (
        <div className="premium-card overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-700">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Mail size={14} className="text-surface-400" />
              Undangan Pending ({data.invitations.length})
            </h2>
          </div>
          <div className="divide-y divide-surface-700/50">
            {data.invitations.map(inv => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-white">{inv.email}</p>
                  <p className="text-xs text-surface-500">
                    {ROLE_CONFIG[inv.role].label} - Expires{' '}
                    {new Date(inv.expires_at).toLocaleDateString('id-ID')}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                  Menunggu
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role legend */}
      <div className="premium-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wide">Penjelasan Role</h3>
        {(Object.entries(ROLE_CONFIG) as [MemberRole, typeof ROLE_CONFIG[MemberRole]][]).map(([role, rc]) => {
          const Icon = rc.icon
          const descriptions: Record<MemberRole, string> = {
            owner: 'Akses penuh termasuk billing, bisa hapus bisnis.',
            admin: 'Bisa input transaksi, undang member, edit pengaturan. Tidak bisa akses billing.',
            member: 'Bisa input transaksi dan lihat laporan. Tidak bisa hapus atau ubah pengaturan.',
          }
          return (
            <div key={role} className="flex items-start gap-3">
              <div className={`flex items-center gap-1.5 w-20 flex-shrink-0 ${rc.color}`}>
                <Icon size={13} />
                <span className="text-xs font-medium">{rc.label}</span>
              </div>
              <p className="text-xs text-surface-500">{descriptions[role]}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function RoleSelector({
  currentRole, onChange
}: {
  currentRole: MemberRole
  onChange: (r: MemberRole) => void
}) {
  const [open, setOpen] = useState(false)
  const rc = ROLE_CONFIG[currentRole]
  const Icon = rc.icon

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg
          bg-surface-700 hover:bg-surface-600 text-xs font-medium
          transition-colors ${rc.color}`}
      >
        <Icon size={11} />
        {rc.label}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-surface-800 border border-surface-700
            rounded-xl shadow-xl z-20 overflow-hidden min-w-32">
            {(['admin', 'member'] as MemberRole[]).map(role => {
              const r = ROLE_CONFIG[role]
              const RI = r.icon
              return (
                <button
                  key={role}
                  onClick={() => { onChange(role); setOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs
                    hover:bg-surface-700 transition-colors text-left
                    ${role === currentRole ? r.color : 'text-surface-300'}`}
                >
                  <RI size={12} />
                  {r.label}
                  {role === currentRole && <span className="ml-auto text-brand-400">✓</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function InviteForm({
  businessId, onSent, onClose
}: {
  businessId: string
  onSent: () => void
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [loading, setLoading] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)

  const handleSend = async () => {
    if (!email) return
    setLoading(true)
    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, email, role })
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      toast.error(json.error || 'Gagal mengirim undangan')
      return
    }

    setInviteUrl(json.invitation_url)
    toast.success(`Undangan berhasil dibuat!`)
  }

  if (inviteUrl) {
    return (
      <div className="premium-card border-brand-500/30 bg-brand-500/10 p-5 space-y-3">
        <div className="flex items-start justify-between">
          <p className="text-sm font-semibold text-white">Undangan siap!</p>
          <button onClick={onSent}><X size={16} className="text-surface-400" /></button>
        </div>
        <p className="text-xs text-surface-400">
          Kirim link ini ke <strong className="text-white">{email}</strong>:
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={inviteUrl}
            className="flex-1 px-3 py-2 bg-surface-900 border border-surface-700 rounded-lg
              text-xs text-surface-300 font-mono"
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(inviteUrl)
              toast.success('Link disalin!')
            }}
            className="px-3 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-lg text-xs"
          >
            Salin
          </button>
        </div>
        <p className="text-xs text-surface-500">Link berlaku 7 hari.</p>
      </div>
    )
  }

  return (
    <div className="premium-card border-brand-500/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Send size={14} className="text-brand-400" />
          Undang Member Baru
        </h3>
        <button onClick={onClose}><X size={16} className="text-surface-500" /></button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-surface-300 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="teman@email.com"
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-300 mb-1.5">Role</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value as 'admin' | 'member')}
            className="input"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleSend}
        disabled={!email || loading}
        className="btn-primary w-full"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        {loading ? 'Membuat undangan...' : 'Buat Link Undangan'}
      </button>
    </div>
  )
}
