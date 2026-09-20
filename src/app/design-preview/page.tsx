import { notFound } from 'next/navigation'
import AppSidebar from '@/components/layout/Sidebar'
import DashboardStatsCards from '@/components/dashboard/StatsCards'
import CashSimulator from '@/components/dashboard/CashSimulator'
import {
  AccountTable,
  FinancialChart,
} from '@/components/reports/ReportVisuals'
import OCRReceiptUploader from '@/components/transactions/OCRReceiptUploader'
import DraftReview from '@/components/transactions/DraftReview'
export default function DesignPreview({
  searchParams,
}: {
  searchParams: { view?: string }
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const view = searchParams.view || 'dashboard'
  const accounts = [
    { id: '11111111-1111-4111-8111-111111111111', code: '1-001', name: 'Kas' },
    {
      id: '22222222-2222-4222-8222-222222222222',
      code: '5-001',
      name: 'Beban pembelian',
    },
  ]
  return (
    <div className="workspace flex h-dvh overflow-hidden">
      <AppSidebar businessName="Preview · data contoh" />
      <main className="min-w-0 flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="page-shell">
          <div className="page-header">
            <div>
              <p className="eyebrow">Preview pengembangan / data contoh</p>
              <h1 className="page-title">
                {view === 'reports'
                  ? 'Laporan laba rugi'
                  : view === 'capture'
                    ? 'Scan dokumen'
                    : view === 'draft'
                      ? 'Periksa draft transaksi'
                      : 'Pusat keputusan bisnis'}
              </h1>
              <p className="page-subtitle">
                Komponen aplikasi dengan data sintetis. Tidak terhubung ke
                bisnis Anda.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {['dashboard', 'reports', 'capture', 'draft'].map((v) => (
                <a
                  key={v}
                  href={`/design-preview?view=${v}`}
                  className="btn-secondary !text-xs"
                >
                  {v}
                </a>
              ))}
            </div>
          </div>
          {view === 'capture' ? (
            <OCRReceiptUploader businessId="00000000-0000-4000-8000-000000000000" />
          ) : view === 'draft' ? (
            <DraftReview
              initial={{
                business_id: '00000000-0000-4000-8000-000000000000',
                date: '2026-09-18',
                description: 'Contoh pembelian bahan baku',
                source: 'ai',
                entries: [
                  { account_id: accounts[1].id, debit: 108400, credit: 0 },
                  { account_id: accounts[0].id, debit: 0, credit: 108400 },
                ],
              }}
              accounts={accounts}
            />
          ) : view === 'reports' ? (
            <div className="report-layout">
              <section className="premium-card overflow-hidden">
                <h2 className="border-b border-white/10 p-5 font-semibold">
                  Ringkasan laba rugi
                </h2>
                <AccountTable
                  title="Pendapatan"
                  accounts={[
                    {
                      id: 'r',
                      code: '4-001',
                      name: 'Pendapatan penjualan',
                      balance: 3700000,
                    },
                  ]}
                  total={3700000}
                />
                <AccountTable
                  title="Beban"
                  negative
                  accounts={[
                    {
                      id: 'e',
                      code: '5-001',
                      name: 'Beban pembelian',
                      balance: 1250000,
                    },
                    {
                      id: 'f',
                      code: '5-002',
                      name: 'Beban gaji',
                      balance: 600000,
                    },
                    {
                      id: 'g',
                      code: '5-003',
                      name: 'Beban sewa',
                      balance: 200000,
                    },
                    {
                      id: 'h',
                      code: '5-004',
                      name: 'Beban listrik & air',
                      balance: 100000,
                    },
                    {
                      id: 'i',
                      code: '5-008',
                      name: 'Beban lain-lain',
                      balance: 50000,
                    },
                  ]}
                  total={2200000}
                />
                <div className="flex justify-between bg-brand-500/10 p-5 font-semibold text-brand-300">
                  <span>Laba bersih</span>
                  <span>Rp1.500.000</span>
                </div>
              </section>
              <aside className="premium-card p-5">
                <h2 className="mb-5 font-semibold">Pendapatan vs beban</h2>
                <FinancialChart
                  values={[
                    { name: 'Pendapatan', value: 3700000 },
                    { name: 'Beban', value: 2200000 },
                  ]}
                />
                <p className="mt-5 text-xs leading-6 text-surface-400">
                  Data contoh untuk inspeksi tata letak, bukan laporan usaha.
                </p>
              </aside>
            </div>
          ) : (
            <>
              <DashboardStatsCards
                stats={{
                  cash_balance: 12400000,
                  monthly_revenue: 3700000,
                  monthly_expenses: 2200000,
                  monthly_profit: 1500000,
                  revenue_change_pct: 0,
                  expense_change_pct: 0,
                }}
              />
              <div className="report-layout">
                <CashSimulator cashNow={12400000} />
                <section className="premium-card p-5">
                  <h2 className="mb-4 font-semibold">
                    Dari diagnosis ke tindakan
                  </h2>
                  <p className="text-sm leading-7 text-surface-300">
                    Periksa hubungan laba, kas, piutang, dan persediaan. Uji
                    asumsi sebelum menyimpan tindakan.
                  </p>
                  <p className="mt-5 text-xs leading-6 text-surface-400">
                    Diagnosis AI dan action plan membutuhkan sesi bisnis.
                    Preview ini hanya menguji tampilan serta perhitungan
                    skenario lokal.
                  </p>
                </section>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
