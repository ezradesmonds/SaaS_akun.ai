import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/guard'
import AdminSidebar from '@/components/admin/AdminSidebar'

export const metadata = { title: 'Admin — Akun.AI' }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  if (!admin) redirect('/dashboard?error=forbidden')

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <AdminSidebar email={admin.email} />
      <main className="flex-1 overflow-y-auto bg-slate-950">
        {children}
      </main>
    </div>
  )
}
