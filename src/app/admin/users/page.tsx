'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Search, Loader2, ChevronLeft, ChevronRight,
  MoreVertical, ShieldOff, Shield, Crown, Zap,
  Trash2, X, AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'

interface UserRow {
  business_id: string
  business_name: string
  business_type: string
  created_at: string
  suspended_at: string | null
  user_id: string
  email: string
  plan: string
  subscription_status: string
  usage_this_month: { tx_count: number; ai_calls: number }
}

const PLAN_BADGE: Record<string, string> = {
  free:    'bg-slate-700 text-slate-300',
  starter: 'bg-brand-500/20 text-brand-400',
  pro:     'bg-amber-500/20 text-amber-400',
}

const PLAN_ICON: Record<string, React.ReactNode> = {
  starter: <Zap size={10} />,
  pro:     <Crown size={10} />,
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionMenu, setActionMenu] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{
    type: string; businessId: string; name: string
  } | null>(null)

  const perPage = 20
  const totalPages = Math.ceil(total / perPage)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      ...(search && { search }),
      ...(planFilter && { plan: planFilter }),
    })
    const res = await fetch(`/api/admin/users?${params}`)
    const json = await res.json()
    setUsers(json.data || [])
    setTotal(json.total || 0)
    setLoading(false)
  }, [page, search, planFilter])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useEffect(() => { setPage(1) }, [search, planFilter])

  const doAction = async (action: string, businessId: string, extra?: Record<string, string>) => {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, business_id: businessId, ...extra })
    })
    const json = await res.json()
    if (res.ok) {
      toast.success(json.message)
      fetchUsers()
    } else {
      toast.error(json.error || 'Aksi gagal')
    }
    setConfirmModal(null)
    setActionMenu(null)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Users & Businesses</h1>
        <p className="text-sm text-slate-400 mt-0.5">{total} total bisnis terdaftar</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama bisnis..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl
              text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500/50" />
        </div>

        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-red-500/50">
          <option value="">Semua Plan</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
        </select>

        {(search || planFilter) && (
          <button onClick={() => { setSearch(''); setPlanFilter('') }}
            className="px-3 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm flex items-center gap-1.5">
            <X size={13} /> Reset
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-800/60 rounded-2xl border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-red-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/50">
                  {['Bisnis / Email', 'Plan', 'Status', 'Usage (bulan ini)', 'Bergabung', 'Aksi'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.business_id}
                    className={`border-b border-slate-700/50 last:border-0 transition-colors
                      ${u.suspended_at ? 'bg-red-500/5' : 'hover:bg-slate-700/20'}`}>

                    <td className="px-4 py-3">
                      <p className="text-sm text-white font-medium">{u.business_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{u.email}</p>
                      {u.suspended_at && (
                        <span className="text-[10px] text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded mt-1 inline-block">
                          SUSPENDED
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_BADGE[u.plan] || PLAN_BADGE.free}`}>
                        {PLAN_ICON[u.plan]}
                        {u.plan.toUpperCase()}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full
                        ${u.subscription_status === 'active' ? 'bg-emerald-500/15 text-emerald-400'
                          : u.subscription_status === 'past_due' ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-slate-700 text-slate-400'}`}>
                        {u.subscription_status || 'active'}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-300">{u.usage_this_month.tx_count} tx</p>
                      <p className="text-xs text-slate-500">{u.usage_this_month.ai_calls} AI calls</p>
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(u.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>

                    <td className="px-4 py-3 relative">
                      <button onClick={() => setActionMenu(actionMenu === u.business_id ? null : u.business_id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors">
                        <MoreVertical size={15} />
                      </button>

                      {actionMenu === u.business_id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setActionMenu(null)} />
                          <div className="absolute right-4 top-10 z-20 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-44">
                            {/* Override plan */}
                            <div className="border-b border-slate-700 px-3 py-2">
                              <p className="text-xs text-slate-500 mb-1.5">Override Plan</p>
                              {['free', 'starter', 'pro'].map(p => (
                                <button key={p} onClick={() => { doAction('override_plan', u.business_id, { plan: p }); setActionMenu(null) }}
                                  className={`block w-full text-left px-2 py-1.5 rounded text-xs transition-colors
                                    ${u.plan === p ? 'text-brand-400 bg-brand-500/10' : 'text-slate-300 hover:bg-slate-700'}`}>
                                  {p.charAt(0).toUpperCase() + p.slice(1)}
                                  {u.plan === p && ' ✓'}
                                </button>
                              ))}
                            </div>

                            {/* Suspend / Unsuspend */}
                            {u.suspended_at ? (
                              <button onClick={() => doAction('unsuspend', u.business_id)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                                <Shield size={12} /> Unsuspend
                              </button>
                            ) : (
                              <button onClick={() => setConfirmModal({ type: 'suspend', businessId: u.business_id, name: u.business_name })}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors">
                                <ShieldOff size={12} /> Suspend
                              </button>
                            )}

                            {/* Delete */}
                            <button onClick={() => setConfirmModal({ type: 'delete', businessId: u.business_id, name: u.business_name })}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors border-t border-slate-700">
                              <Trash2 size={12} /> Hapus
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {users.length === 0 && !loading && (
              <div className="text-center py-12 text-slate-500 text-sm">Tidak ada data</div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Halaman {page} dari {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmModal(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                ${confirmModal.type === 'delete' ? 'bg-red-500/15' : 'bg-amber-500/15'}`}>
                <AlertTriangle size={18} className={confirmModal.type === 'delete' ? 'text-red-400' : 'text-amber-400'} />
              </div>
              <div>
                <p className="font-semibold text-white">
                  {confirmModal.type === 'delete' ? 'Hapus Bisnis' : 'Suspend Bisnis'}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  {confirmModal.type === 'delete'
                    ? `"${confirmModal.name}" akan dihapus permanen beserta semua datanya.`
                    : `"${confirmModal.name}" tidak akan bisa login sampai di-unsuspend.`
                  }
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-sm">
                Batal
              </button>
              <button
                onClick={() => doAction(confirmModal.type, confirmModal.businessId, confirmModal.type === 'suspend' ? { reason: 'Suspended by admin' } : {})}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold
                  ${confirmModal.type === 'delete' ? 'bg-red-500 hover:bg-red-400' : 'bg-amber-500 hover:bg-amber-400'}`}>
                {confirmModal.type === 'delete' ? 'Hapus Permanen' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
