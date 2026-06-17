import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))
  const error = searchParams.get('error')

  if (error) {
    console.error('Google OAuth error:', error)
    return NextResponse.redirect(`${origin}/auth/login?error=oauth_failed`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=no_code`)
  }

  const supabase = createClient()
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data.user) {
    console.error('Session exchange error:', exchangeError)
    return NextResponse.redirect(`${origin}/auth/login?error=session_failed`)
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', data.user.id)
    .limit(1)
    .maybeSingle()

  if (!business) {
    return NextResponse.redirect(`${origin}/settings?setup=true`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
