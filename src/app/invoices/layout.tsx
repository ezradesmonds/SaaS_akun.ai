import { redirect } from 'next/navigation'
import AppSidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'

export default async function InvoicesLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('name')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  return (
    <div className="workspace flex h-dvh overflow-hidden app-bg">
      <AppSidebar businessName={business?.name} />
      <main className="min-w-0 flex-1 overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
