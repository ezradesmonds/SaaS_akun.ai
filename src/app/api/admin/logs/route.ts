import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, ADMIN_FORBIDDEN } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return ADMIN_FORBIDDEN

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || 100), 200)
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data || [] })
}
