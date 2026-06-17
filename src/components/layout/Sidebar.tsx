'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandMark } from '@/components/brand/BrandAssets'
import {
  LayoutDashboard, MessageSquare, Receipt, FileText, Package,
  BarChart3, Settings, ChevronLeft, ChevronRight,
  LogOut, Users, CreditCard, Landmark, Plug
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

const NAV_ITEMS = [
  { href: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/chat',         icon: MessageSquare,   label: 'Chat AI'   },
  { href: '/transactions', icon: Receipt,          label: 'Transaksi' },
  { href: '/invoices',     icon: FileText,         label: 'Invoice'   },
  { href: '/inventory',    icon: Package,          label: 'Stok'      },
  { href: '/reports',      icon: BarChart3,        label: 'Laporan'   },
  { href: '/tax',          icon: Landmark,         label: 'Pajak'     },
  { href: '/integrations', icon: Plug,             label: 'Integrasi' },
  { href: '/team',         icon: Users,            label: 'Tim'       },
  { href: '/billing',      icon: CreditCard,       label: 'Billing'   },
  { href: '/settings',     icon: Settings,         label: 'Pengaturan'},
]

export default function AppSidebar({ businessName }: { businessName?: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Sampai jumpa!')
    router.replace('/auth/login')
    router.refresh()
  }

  return (
    <aside className={`
      relative flex flex-col h-screen
      bg-surface-950/80 border-r border-white/10 backdrop-blur-xl shadow-premium
      transition-all duration-300 ease-in-out
      ${collapsed ? 'w-16' : 'w-60'}
    `}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <BrandMark className="h-9 w-9" />
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-bold text-white text-sm tracking-normal">Akun.AI</p>
            <p className="text-xs text-surface-400 truncate">{businessName || 'Loading...'}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1.5 px-2">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`
                relative flex items-center gap-3 px-3 py-2.5 rounded-xl
                transition-all duration-200 group
                ${active
                  ? 'bg-brand-500/15 text-brand-200 font-semibold shadow-focus'
                  : 'text-surface-400 hover:text-white hover:bg-white/[0.055]'
                }
              `}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />
              )}
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span className="text-sm">{label}</span>}
              {collapsed && (
                <div className="absolute left-14 bg-surface-900 text-white text-xs px-2.5 py-1.5 rounded-lg
                  opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50
                  border border-white/10 shadow-premium">
                  {label}
                </div>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="p-2 border-t border-white/10">
        <button
          onClick={handleLogout}
          aria-label="Keluar"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
            text-surface-400 hover:text-red-400 hover:bg-red-500/10
            transition-all duration-200 text-sm"
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && 'Keluar'}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Buka sidebar' : 'Tutup sidebar'}
        aria-expanded={!collapsed}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full
          bg-surface-900 border border-white/10 shadow-lg
          flex items-center justify-center
          hover:bg-surface-800 transition-colors"
      >
        {collapsed
          ? <ChevronRight size={12} className="text-surface-400" />
          : <ChevronLeft size={12} className="text-surface-400" />
        }
      </button>
    </aside>
  )
}
