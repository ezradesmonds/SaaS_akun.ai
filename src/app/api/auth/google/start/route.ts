import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get('next'))
  const origin = request.nextUrl.origin

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.redirect(`${origin}/auth/login?error=config_missing`)
  }

  const supabase = createClient()
  const redirectTo = `${origin}/api/auth/google?next=${encodeURIComponent(next)}`
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { access_type: 'offline', prompt: 'consent' },
      skipBrowserRedirect: true,
    },
  })

  if (error || !data.url) {
    console.error('Unable to start Google OAuth:', error)
    return NextResponse.redirect(`${origin}/auth/login?error=oauth_unavailable`)
  }

  return NextResponse.redirect(data.url)
}
