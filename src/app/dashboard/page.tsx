import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { executeTool } from '@/lib/accounting/tools'
import DashboardStatsCards from '@/components/dashboard/StatsCards'
import { MessageSquare, Receipt, ArrowRight, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import type { DashboardStats, Transaction } from '@/types'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Get user's business (first one for now)
  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!business) redirect('/settings?setup=true')

  // Fetch dashboard data
  let stats: DashboardStats | null = null
  let recentTx: Transaction[] = []

  try {
    stats = await executeTool('get_dashboard_stats', {}, business.id) as unknown as DashboardStats

    const { data: txData } = await supabase
      .from('transactions')
      .select(`
        *,
        lines:transaction_lines(
          debit, credit,
          account:accounts(name, type)
        )
      `)
      .eq('business_id', business.id)
      .order('date', { ascending: false })
      .limit(5)

    recentTx = txData || []
  } catch (e) {
    console.error('Dashboard data error:', e)
  }

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="page-header">
        <div>
          <p className="eyebrow">Ringkasan Bisnis</p>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">{business.name}</p>
        </div>
        <Link
          href="/chat"
          className="btn-primary"
        >
          <MessageSquare size={15} />
          Tanya AI
        </Link>
      </div>

      {/* Stats */}
      {stats && <DashboardStatsCards stats={stats} />}

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions */}
        <div className="lg:col-span-2 premium-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Receipt size={16} className="text-brand-400" />
              Transaksi Terbaru
            </h2>
            <Link href="/transactions" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
              Lihat semua <ArrowRight size={12} />
            </Link>
          </div>

          {recentTx.length === 0 ? (
            <div className="empty-state py-10">
              <Receipt size={34} className="mb-3 opacity-35" />
              <p className="text-sm">Belum ada transaksi.</p>
              <Link href="/chat" className="mt-3 btn-secondary">Catat lewat chat <ArrowRight size={14} /></Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTx.map(tx => {
                const total = tx.lines?.reduce((s, l) => s + Number(l.debit), 0) || 0
                const isRevenue = tx.lines?.some(l => l.account?.type === 'REVENUE')

                return (
                  <div key={tx.id} className="flex items-center justify-between rounded-xl px-3 py-2.5
                    transition-colors hover:bg-white/[0.035]">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{tx.description}</p>
                      <p className="text-xs text-surface-500 mt-0.5">
                        {new Date(tx.date).toLocaleDateString('id-ID', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                        {' - '}
                        <span className={`px-1.5 py-0.5 rounded-md text-xs
                          ${tx.source === 'ai'
                            ? 'bg-brand-500/15 text-brand-400'
                            : 'bg-surface-700 text-surface-400'
                          }`}>
                          {tx.source === 'ai' ? 'AI' : 'Manual'}
                        </span>
                      </p>
                    </div>
                    <p className={`text-sm font-semibold ml-4 flex-shrink-0
                      ${isRevenue ? 'text-brand-400' : 'text-surface-300'}`}>
                      {isRevenue ? '+' : '-'}Rp{(total / 1000).toFixed(0)}rb
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="premium-card p-5">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-brand-400" />
            Aksi Cepat
          </h2>
          <div className="space-y-2">
            {[
              { label: 'Catat Penjualan', href: '/chat', hint: 'via Chat AI' },
              { label: 'Lihat Laba Rugi', href: '/reports?type=profit_loss', hint: 'bulan ini' },
              { label: 'Input Manual', href: '/transactions', hint: 'form manual' },
              { label: 'Neraca Saldo', href: '/reports?type=balance_sheet', hint: 'per hari ini' },
            ].map(action => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center justify-between px-3 py-3
                  rounded-xl border border-transparent hover:border-white/10 hover:bg-white/[0.04] transition-all group"
              >
                <div>
                  <p className="text-sm text-white group-hover:text-brand-300 transition-colors">
                    {action.label}
                  </p>
                  <p className="text-xs text-surface-500">{action.hint}</p>
                </div>
                <ArrowRight size={14} className="text-surface-600 group-hover:text-brand-400 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
