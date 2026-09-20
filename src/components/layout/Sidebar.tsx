'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  MessageSquare,
  Receipt,
  ScanLine,
  FileText,
  Package,
  BarChart3,
  Settings,
  LogOut,
  Users,
  CreditCard,
  Landmark,
  Plug,
  Menu,
  X,
  Store,
  ArrowUpRight,
} from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandAssets'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

const items = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/capture', icon: ScanLine, label: 'Scan dokumen' },
  { href: '/transactions', icon: Receipt, label: 'Transaksi' },
  { href: '/invoices', icon: FileText, label: 'Invoice' },
  { href: '/inventory', icon: Package, label: 'Inventory' },
  { href: '/reports', icon: BarChart3, label: 'Laporan' },
  { href: '/chat', icon: MessageSquare, label: 'AI Assistant' },
  { href: '/tax', icon: Landmark, label: 'Pajak UMKM' },
  { href: '/team', icon: Users, label: 'Akun & akses' },
  { href: '/integrations', icon: Plug, label: 'Integrasi' },
  { href: '/billing', icon: CreditCard, label: 'Paket & tagihan' },
  { href: '/settings', icon: Settings, label: 'Pengaturan' },
]
export default function AppSidebar({
  businessName,
}: {
  businessName?: string
}) {
  const [open, setOpen] = useState(false)
  const [showCapturePrompt, setShowCapturePrompt] = useState(true)
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    setOpen(false)
  }, [pathname])
  useEffect(() => {
    setShowCapturePrompt(
      window.localStorage.getItem('akunai:capture-prompt-dismissed') !== 'true',
    )
  }, [])
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])
  async function logout() {
    const { error } = await createClient().auth.signOut()
    if (error) {
      toast.error('Gagal keluar. Coba lagi.')
      return
    }
    router.replace('/auth/login')
    router.refresh()
  }
  function dismissCapturePrompt() {
    window.localStorage.setItem('akunai:capture-prompt-dismissed', 'true')
    setShowCapturePrompt(false)
  }
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-white/10 bg-[#041019] px-4 md:hidden">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold"
        >
          <BrandMark className="h-7 w-7" />
          Akun.AI
        </Link>
        <button
          className="btn-icon"
          aria-label={open ? 'Tutup navigasi' : 'Buka navigasi'}
          aria-expanded={open}
          aria-controls="workspace-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <button
          aria-label="Tutup navigasi"
          className="fixed inset-0 top-14 z-30 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="workspace-nav"
        className={`${open ? 'flex' : 'hidden'} fixed bottom-0 left-0 top-14 z-40 w-[224px] shrink-0 flex-col border-r border-[#20313d] bg-[#041019] md:static md:flex md:h-dvh`}
      >
        <Link
          href="/dashboard"
          className="hidden h-[78px] shrink-0 items-center gap-3 border-b border-[#20313d] px-5 md:flex"
        >
          <BrandMark className="h-8 w-8" />
          <span className="text-xl font-semibold tracking-tight">Akun.AI</span>
        </Link>
        <div className="mx-3 mb-3 mt-5 flex items-center gap-3 rounded-lg border border-[#20313d] p-3">
          <Store size={21} className="shrink-0 text-brand-400" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">
              {businessName || 'Workspace Anda'}
            </p>
            <p className="mt-1 text-[11px] text-surface-400">
              Workspace bisnis
            </p>
          </div>
        </div>
        <nav
          aria-label="Navigasi utama"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2"
        >
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname.startsWith(href) ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors ${pathname.startsWith(href) ? 'bg-brand-500/15 text-brand-300' : 'text-surface-300 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon size={17} strokeWidth={1.6} />
              {label}
            </Link>
          ))}
        </nav>
        {showCapturePrompt && <div className="relative m-3 rounded-xl border border-[#20313d] p-3 pr-9">
          <button
            type="button"
            aria-label="Tutup ajakan scan dokumen"
            onClick={dismissCapturePrompt}
            className="absolute right-2 top-2 rounded-md p-1 text-surface-500 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <X size={14} />
          </button>
          <p className="text-xs font-medium">Satu bukti, pembukuan rapi.</p>
          <p className="mb-3 mt-1 text-[11px] leading-5 text-surface-400">
            Mulai dari struk atau invoice bisnis Anda.
          </p>
          <Link href="/capture" className="btn-secondary w-full !py-2 !text-xs">
            Scan dokumen <ArrowUpRight size={14} />
          </Link>
        </div>}
        <button
          onClick={logout}
          className="flex items-center gap-3 border-t border-[#20313d] px-6 py-4 text-xs text-surface-400 hover:text-white"
        >
          <LogOut size={16} />
          Keluar
        </button>
      </aside>
    </>
  )
}
