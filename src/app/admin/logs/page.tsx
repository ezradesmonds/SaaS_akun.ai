'use client'

import { useEffect, useState } from 'react'
import { ScrollText, Loader2 } from 'lucide-react'

interface AuditLog {
  id: string
  actor_id: string
  action: string
  target_type: string
  target_id: string
  metadata: Record<string, unknown>
  ip_address: string
  created_at: string
}

const ACTION_COLORS: Record<string, string> = {
  suspend_business:   'text-amber-400 bg-amber-500/10',
  unsuspend_business: 'text-emerald-400 bg-emerald-500/10',
  delete_business:    'text-red-400 bg-red-500/10',
  override_plan:      'text-blue-400 bg-blue-500/10',
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/logs')
      .then(res => res.json())
      .then(({ data }) => {
        setLogs(data || [])
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 size={22} className="animate-spin text-red-400" /></div>

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <ScrollText size={20} className="text-red-400" />
          Audit Logs
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">Semua aksi admin dicatat di sini</p>
      </div>

      <div className="bg-slate-800/60 rounded-2xl border border-slate-700 overflow-hidden">
        {logs.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            <ScrollText size={32} className="mx-auto mb-3 opacity-30" />
            Belum ada log audit
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {logs.map(log => (
              <div key={log.id} className="px-4 py-3.5 flex items-start gap-4 hover:bg-slate-700/20 transition-colors">
                <div className={`flex-shrink-0 text-xs font-mono px-2.5 py-1 rounded-lg ${ACTION_COLORS[log.action] || 'text-slate-400 bg-slate-700'}`}>
                  {log.action}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate">
                    {log.target_type} · <span className="font-mono text-xs text-slate-500">{log.target_id?.slice(0, 8)}…</span>
                  </p>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <p className="text-xs text-slate-600 mt-0.5 font-mono">{JSON.stringify(log.metadata)}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-slate-500">
                    {new Date(log.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  </p>
                  <p className="text-xs text-slate-600">
                    {new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
