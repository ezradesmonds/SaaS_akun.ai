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
    <div className="flex h-screen overflow-hidden app-bg">
      <AppSidebar businessName={business?.name} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
