import Image from 'next/image'

export const brandAssets = {
  mark: '/brand/akun-logo-mark.png',
  lockup: '/brand/akun-logo-lockup.png',
  mascot: '/brand/akun-mascot-hero.png',
}

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 overflow-hidden rounded-xl border border-emerald-300/25 bg-[#071018] shadow-lg shadow-emerald-950/30 ${className}`}>
      <Image src={brandAssets.mark} alt="Akun.AI" fill sizes="64px" className="object-cover" />
    </span>
  )
}

export function BrandLockup({ className = '' }: { className?: string }) {
  return (
    <span className={`relative block overflow-hidden ${className}`}>
      <Image src={brandAssets.lockup} alt="Akun.AI - Catat. Pahami. Bertumbuh." fill sizes="(max-width: 768px) 280px, 420px" className="object-cover" />
    </span>
  )
}
