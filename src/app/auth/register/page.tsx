'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BrandMark } from '@/components/brand/BrandAssets'
import { Loader2, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

type Step = 'account' | 'business'

const BUSINESS_TYPES = [
  { value: 'toko', label: 'Toko / Warung' },
  { value: 'jasa', label: 'Jasa / Servis' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'umkm', label: 'UMKM Lainnya' },
]

function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.toLowerCase().includes('failed to fetch')) {
    return 'Supabase belum terkoneksi. Cek NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local, lalu restart npm run dev.'
  }
  return message
}

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('account')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [bizName, setBizName] = useState('')
  const [bizType, setBizType] = useState('toko')

  const handleAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('Password minimal 6 karakter')
      return
    }
    setStep('business')
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = createClient()
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      })

      if (authError) {
        toast.error(friendlyAuthError(authError))
        setLoading(false)
        return
      }

      if (!authData.session) {
        toast.success('Akun dibuat. Cek email kamu untuk verifikasi, lalu login untuk setup bisnis.')
        router.push('/auth/login')
        router.refresh()
        return
      }

      const setupResponse = await fetch('/api/business/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: bizName, type: bizType }),
      })

      if (!setupResponse.ok) {
        const errorBody = await setupResponse.json().catch(() => null)
        toast.error(errorBody?.retryable
          ? 'Akun dibuat, tapi setup bisnis belum selesai. Coba lanjutkan setup.'
          : errorBody?.error || 'Gagal membuat bisnis')
        setLoading(false)
        router.push('/settings?setup=true')
        return
      }

      toast.success('Akun berhasil dibuat! Selamat datang')
      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      toast.error(friendlyAuthError(error))
      setLoading(false)
    }
  }

  return (
    <div className="app-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm relative premium-card p-6">
        <div className="text-center mb-8">
          <BrandMark className="mb-4 h-14 w-14 rounded-2xl" />
          <h1 className="text-2xl font-bold text-white">Daftar Gratis</h1>
          <p className="text-surface-400 text-sm mt-1">
            {step === 'account' ? 'Buat akun kamu' : 'Setup bisnis kamu'}
          </p>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {(['account', 'business'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${step === s || (s === 'account' && step === 'business')
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-950/30'
                  : 'bg-white/[0.06] text-surface-400'
                }`}>
                {i + 1}
              </div>
              <span className={`text-xs ${step === s ? 'text-brand-400' : 'text-surface-500'}`}>
                {s === 'account' ? 'Akun' : 'Bisnis'}
              </span>
              {i === 0 && <ChevronRight size={12} className="text-surface-600 ml-auto" />}
            </div>
          ))}
        </div>

        {step === 'account' ? (
          <form onSubmit={handleAccount} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Nama Lengkap</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Budi Santoso"
                className="input px-4 py-3"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="kamu@email.com"
                className="input px-4 py-3"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Min. 6 karakter"
                className="input px-4 py-3"
              />
            </div>
            <button type="submit" className="btn-primary w-full py-3">
              Lanjut <ChevronRight size={16} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Nama Bisnis</label>
              <input
                type="text"
                value={bizName}
                onChange={e => setBizName(e.target.value)}
                required
                placeholder="Toko Maju Jaya"
                className="input px-4 py-3"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Jenis Bisnis</label>
              <div className="grid grid-cols-2 gap-2">
                {BUSINESS_TYPES.map(bt => (
                  <button
                    key={bt.value}
                    type="button"
                    onClick={() => setBizType(bt.value)}
                    className={`py-2.5 px-3 rounded-xl text-sm text-left transition-all
                      ${bizType === bt.value
                        ? 'bg-brand-500/15 border-brand-500/50 text-brand-300 border shadow-focus'
                        : 'bg-white/[0.035] border border-white/10 text-surface-300 hover:border-white/20'
                      }`}
                  >
                    {bt.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Membuat akun...' : 'Mulai Gratis'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-surface-400 mt-6">
          Sudah punya akun?{' '}
          <Link href="/auth/login" className="text-brand-400 hover:text-brand-300 font-medium">
            Masuk
          </Link>
        </p>
      </div>
    </div>
  )
}
