import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppSidebar from '@/components/layout/Sidebar'

async function getBusinessName() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('businesses')
    .select('name')
    .eq('user_id', user.id)
    .single()

  return data?.name
}

export default async function TaxLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const businessName = await getBusinessName()

  return (
    <div className="flex h-screen overflow-hidden app-bg">
      <AppSidebar businessName={businessName || undefined} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
