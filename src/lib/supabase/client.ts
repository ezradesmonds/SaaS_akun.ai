import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Konfigurasi Supabase belum tersedia pada deployment ini')
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  )
}
