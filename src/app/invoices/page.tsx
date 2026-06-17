import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import InvoicesClient from '@/components/invoices/InvoicesClient'

export default async function InvoicesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: membership } = await supabase
    .from('business_members')
    .select('business_id, businesses(id, name)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  const business = Array.isArray(membership?.businesses)
    ? membership?.businesses[0]
    : membership?.businesses

  if (!business) redirect('/settings?setup=true')

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('business_id', business.id)
    .eq('is_active', true)
    .order('code')

  return (
    <InvoicesClient
      businessId={business.id}
      businessName={business.name}
      accounts={accounts || []}
    />
  )
}
