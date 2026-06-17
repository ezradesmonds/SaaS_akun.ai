import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TransactionsClient from './TransactionsClient'

export default async function TransactionsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!business) redirect('/settings?setup=true')

  // Get accounts for the form
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('business_id', business.id)
    .eq('is_active', true)
    .order('code')

  return (
    <TransactionsClient
      businessId={business.id}
      accounts={accounts || []}
    />
  )
}
