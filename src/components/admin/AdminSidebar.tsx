'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Building2, DollarSign,
  ScrollText, Shield, ExternalLink, LogOut
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const NAV = [
  { href: '/admin',           icon: LayoutDashboard, label: 'Overview'  },
  { href: '/admin/users',     icon: Users,           label: 'Users'     },
  { href: '/admin/businesses',icon: Building2,        label: 'Businesses'},
  { href: '/admin/revenue',   icon: DollarSign,      label: 'Revenue'   },
  { href: '/admin/logs',      icon: ScrollText,      label: 'Audit Logs'},
]

export default function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname()
  const router = useRouter()

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center">
            <Shield size={13} className="text-red-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-white tracking-wide">AKUN.AI</p>
            <p className="text-[10px] text-red-400 font-semibold uppercase tracking-widest">Admin</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== '/admin' && pathname.startsWith(href))
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
                ${active
                  ? 'bg-red-500/15 text-red-400 font-medium'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}>
              <Icon size={16} className="flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-slate-800 space-y-1">
        <Link href="/dashboard" target="_blank"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
          <ExternalLink size={13} />
          Buka App
        </Link>
        <div className="px-3 py-2">
          <p className="text-[10px] text-slate-600 truncate">{email}</p>
        </div>
        <button onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <LogOut size={13} />
          Logout
        </button>
      </div>
    </aside>
  )
}
