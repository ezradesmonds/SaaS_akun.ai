import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import InventoryClient from '@/components/inventory/InventoryClient'

export default async function InventoryPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: membership } = await supabase
    .from('business_members')
    .select('business_id, businesses(id, name)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  let business = Array.isArray(membership?.businesses)
    ? membership?.businesses[0]
    : membership?.businesses

  if (!business) {
    const { data: ownedBusiness } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    business = ownedBusiness || undefined
  }

  if (!business) redirect('/settings?setup=true')

  return (
    <InventoryClient
      businessId={business.id}
      businessName={business?.name || 'Inventory'}
    />
  )
}
