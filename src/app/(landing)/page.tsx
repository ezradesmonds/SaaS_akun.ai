import Link from 'next/link'
import Image from 'next/image'
import { BrandLockup, BrandMark, brandAssets } from '@/components/brand/BrandAssets'
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  Check,
  CreditCard,
  FileText,
  Landmark,
  LockKeyhole,
  MessageSquare,
  Package,
  ReceiptText,
  ShieldCheck,
  Wallet,
  Zap,
} from 'lucide-react'

export const metadata = {
  title: 'Akun.AI - Akuntansi UMKM yang Bisa Diajak Ngobrol',
  description: 'SaaS akuntansi modern untuk UMKM Indonesia. Catat transaksi, invoice, stok, laporan, pajak, dan tanya AI dari satu workspace.',
}

const NAV_ITEMS = [
  { href: '#produk', label: 'Produk' },
  { href: '#fitur', label: 'Fitur' },
  { href: '#harga', label: 'Harga' },
  { href: '#faq', label: 'FAQ' },
]

const LOGOS = ['Warung Makan', 'Toko Online', 'Laundry', 'Freelancer', 'Distributor', 'Jasa Servis']

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Chat AI',
    text: 'Catat dan tanya laporan dengan bahasa sehari-hari.',
  },
  {
    icon: ReceiptText,
    title: 'Invoice',
    text: 'Buat invoice, piutang, pembayaran, dan metadata pajak.',
  },
  {
    icon: Package,
    title: 'Inventory',
    text: 'Pantau stok, mutasi, lokasi, dan low-stock alert.',
  },
  {
    icon: BarChart3,
    title: 'Reports',
    text: 'Laba rugi, neraca, kas, revenue, expense, CSV, print.',
  },
  {
    icon: Landmark,
    title: 'Pajak',
    text: 'Ringkasan PPN berbasis transaksi asli.',
  },
  {
    icon: ShieldCheck,
    title: 'Aman',
    text: 'Role, RLS Supabase, membership, dan audit logs.',
  },
]

const WORKFLOW = [
  {
    step: '01',
    title: 'Setup bisnis',
    text: 'Daftar, isi profil bisnis, lalu chart of accounts dibuat otomatis dan idempotent.',
  },
  {
    step: '02',
    title: 'Catat harian',
    text: 'Input manual, invoice, OCR struk, inventory, atau chat AI. Semua masuk ke accounting ledger.',
  },
  {
    step: '03',
    title: 'Ambil keputusan',
    text: 'Lihat cash balance, profit, expense breakdown, laporan pajak, dan performa bisnis tiap periode.',
  },
]

const PLANS = [
  {
    name: 'Free',
    price: 'Rp0',
    note: 'untuk mulai rapi',
    features: ['50 transaksi/bulan', '30 chat AI/bulan', 'Dashboard dan laporan dasar', '1 user'],
    highlight: false,
  },
  {
    name: 'Starter',
    price: 'Rp29rb',
    note: 'untuk UMKM aktif',
    features: ['500 transaksi/bulan', '300 chat AI/bulan', 'Invoice dan piutang', '3 member tim', 'Pembayaran via Mayar'],
    highlight: true,
  },
  {
    name: 'Pro',
    price: 'Rp79rb',
    note: 'untuk bisnis berkembang',
    features: ['Transaksi unlimited', 'Chat AI unlimited', 'Inventory multi-lokasi', 'WhatsApp bot', 'Priority support'],
    highlight: false,
  },
]

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-300 backdrop-blur">
      {children}
    </span>
  )
}

function SectionIntro({
  label,
  title,
  text,
}: {
  label: string
  title: string
  text: string
}) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">{label}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white md:text-5xl">{title}</h2>
      <p className="mt-4 text-sm leading-7 text-slate-400 md:text-base">{text}</p>
    </div>
  )
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#080a0f] text-white">
      <Navbar />
      <Hero />
      <LogoStrip />
      <ProductSection />
      <FeatureSection />
      <WorkflowSection />
      <SecuritySection />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
      <Footer />
    </main>
  )
}

function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080a0f]/78 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Akun.AI home">
          <BrandMark className="h-8 w-8 rounded-lg" />
          <span className="text-sm font-semibold tracking-normal text-white">Akun.AI</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href} className="text-sm text-slate-400 transition-colors hover:text-white">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/auth/login" className="hidden rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:text-white sm:block">
            Masuk
          </Link>
          <Link href="/auth/register" className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-950 transition-all hover:-translate-y-0.5 hover:bg-emerald-100">
            Mulai gratis
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <BackgroundGrid />
      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 md:pt-20 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[0.98fr_1.02fr]">
          <div className="text-center lg:text-left">
            <BrandLockup className="mx-auto h-[92px] w-[280px] rounded-2xl border border-white/10 bg-[#071018] shadow-[0_20px_80px_rgba(16,185,129,0.12)] sm:h-[108px] sm:w-[330px] lg:mx-0" />

            <div className="mt-8 flex justify-center lg:justify-start">
              <Badge>
                <BadgeCheck size={13} className="text-emerald-300" />
                SaaS akuntansi untuk UMKM Indonesia
              </Badge>
            </div>

            <h1 className="mt-7 text-5xl font-semibold leading-[0.96] tracking-normal text-white md:text-7xl lg:text-[86px]">
              Akuntansi UMKM yang bisa diajak ngobrol.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300 md:text-xl lg:max-w-2xl">
              Catat transaksi, invoice, stok, laporan, pajak, dan tanya AI dari satu workspace yang dibuat untuk cara kerja UMKM Indonesia.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Link href="/auth/register" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-950 shadow-2xl shadow-emerald-950/40 transition-all hover:-translate-y-0.5 hover:bg-emerald-200 sm:w-auto">
                Coba gratis
                <ArrowRight size={16} />
              </Link>
              <Link href="/auth/login" className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/[0.1] sm:w-auto">
                Lihat dashboard
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-400 lg:justify-start">
              <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-300" /> QRIS dan transfer via Mayar</span>
              <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-300" /> Supabase RLS multi-tenant</span>
              <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-300" /> OpenRouter model configurable</span>
            </div>
          </div>

          <MascotShowcase />
        </div>

        <ProductPreview />
      </div>
    </section>
  )
}

function MascotShowcase() {
  return (
    <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
      <div className="absolute inset-x-10 bottom-8 h-28 rounded-full bg-emerald-400/15 blur-3xl" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[28px] border border-emerald-300/18 bg-[#071018]/80 shadow-[0_40px_140px_rgba(0,0,0,0.5)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(16,185,129,0.18),transparent_34%),linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent)]" aria-hidden="true" />
        <div className="relative aspect-[0.78] min-h-[520px] sm:aspect-[0.9] lg:aspect-[0.82]">
          <Image
            src={brandAssets.mascot}
            alt="Maskot Akun.AI membawa ledger dan memberi insight bisnis"
            fill
            priority
            sizes="(max-width: 1024px) 90vw, 560px"
            className="object-cover object-center"
          />
        </div>
        <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur-md">
          <p className="text-sm font-semibold text-white">Asisten pintar untuk operasional UMKM</p>
          <p className="mt-1 text-sm leading-6 text-emerald-100/80">Scan struk, baca laporan, dan bantu jawab pertanyaan keuangan harian.</p>
        </div>
      </div>
    </div>
  )
}

function BackgroundGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.15),transparent_30%),radial-gradient(circle_at_center,rgba(8,10,15,0.2),#080a0f_72%)]" />
    </div>
  )
}

function ProductPreview() {
  const rows = [
    ['Penjualan harian', 'Kas', '+Rp2,4jt', 'posted'],
    ['Bayar supplier', 'HPP', '-Rp860rb', 'posted'],
    ['Invoice INV-1029', 'Piutang', '+Rp1,2jt', 'draft'],
    ['Mutasi stok kopi', 'Gudang A', '-24 pcs', 'synced'],
  ]

  return (
      <div className="landing-scene mt-14 w-full max-w-5xl">
        <div className="rounded-2xl border border-white/12 bg-[#10141d]/88 p-2 shadow-[0_50px_160px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Akun.AI Ledger</span>
          </div>

          <div className="grid gap-2 p-2 md:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 text-left">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Saldo Kas</p>
                  <p className="text-3xl font-semibold text-white">Rp48,7jt</p>
                </div>
                <Wallet className="text-emerald-300" size={26} />
              </div>
              <div className="grid grid-cols-12 items-end gap-2">
                {[38, 54, 42, 68, 58, 82, 64, 88, 72, 92, 78, 96].map((height, index) => (
                  <span
                    key={height + index}
                    className="landing-bar rounded-t bg-emerald-300/70"
                    style={{ height: `${height}px`, animationDelay: `${index * 90}ms` }}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-white">AI assistant</p>
                <Bot size={18} className="text-emerald-300" />
              </div>
              <div className="space-y-2 text-left text-xs">
                <p className="rounded-lg bg-white/[0.07] px-3 py-2 text-slate-300">bulan ini untung berapa?</p>
                <p className="rounded-lg bg-emerald-300/12 px-3 py-2 text-emerald-100">Laba bersih Rp12,8jt. Margin naik 8,4% dari bulan lalu.</p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 p-2 pt-0">
            {rows.map((row, index) => (
              <div key={row[0]} className="landing-row grid grid-cols-[1fr_0.7fr_0.5fr_0.35fr] items-center gap-3 rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2 text-xs" style={{ animationDelay: `${index * 150}ms` }}>
                <span className="text-slate-200">{row[0]}</span>
                <span className="text-slate-500">{row[1]}</span>
                <span className={row[2].startsWith('+') ? 'text-emerald-300' : 'text-rose-300'}>{row[2]}</span>
                <span className="text-slate-500">{row[3]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
  )
}

function LogoStrip() {
  return (
    <section className="border-y border-white/10 bg-white/[0.025]">
      <div className="mx-auto max-w-7xl py-7">
        <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Dibuat untuk operasional UMKM sehari-hari</p>
        <div className="logo-marquee mt-6 overflow-hidden">
          <div className="logo-marquee-track">
            {[...LOGOS, ...LOGOS, ...LOGOS].map((item, index) => (
              <span key={`${item}-${index}`} className="mx-5 inline-flex rounded-full border border-white/10 bg-white/[0.045] px-5 py-2 text-sm font-semibold text-slate-300">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ProductSection() {
  return (
    <section id="produk" className="px-4 py-24 sm:px-6 lg:px-8">
      <SectionIntro
        label="Product"
        title="Bukan sekadar catatan. Ini sistem operasi keuangan UMKM."
        text="Transaksi harian, kas, piutang, stok, dan laporan tersambung ke ledger yang sama."
      />
      <div className="mx-auto max-w-6xl rounded-2xl border border-white/10 bg-white/[0.035] p-2">
        <div className="grid divide-y divide-white/10 md:grid-cols-3 md:divide-x md:divide-y-0">
        {[
          { icon: FileText, title: 'Ledger', value: 'Balanced', text: 'Debit dan kredit selalu divalidasi.' },
          { icon: CreditCard, title: 'Payment', value: 'Mayar', text: 'QRIS dan transfer bank lokal.' },
          { icon: LockKeyhole, title: 'Access', value: 'RLS', text: 'Data aman per bisnis dan role.' },
        ].map(({ icon: Icon, title, value, text }) => (
          <div key={title} className="flex items-start gap-4 p-6 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-300">
              <Icon size={20} />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
            </div>
          </div>
        ))}
        </div>
      </div>
    </section>
  )
}

function FeatureSection() {
  return (
    <section id="fitur" className="border-y border-white/10 bg-white/[0.025] px-4 py-24 sm:px-6 lg:px-8">
      <SectionIntro
        label="Features"
        title="Yang penting terlihat dulu. Detailnya tetap tersedia saat dibutuhkan."
        text="Landing ini sengaja dibuat lebih ringan: fokus pada hasil yang user cari, bukan daftar modul panjang."
      />
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0f141d] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.35)]">
          <div className="absolute right-6 top-6 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">
            live insight
          </div>
          <div className="mt-12 space-y-4">
            <div>
              <p className="text-sm text-slate-500">Profit bulan ini</p>
              <p className="mt-1 text-5xl font-semibold tracking-normal text-white">Rp12,8jt</p>
            </div>
            <div className="grid grid-cols-7 items-end gap-2 pt-8">
              {[56, 84, 62, 96, 74, 108, 90].map((height, index) => (
                <span key={height} className="landing-bar rounded-t-xl bg-emerald-300/70" style={{ height, animationDelay: `${index * 120}ms` }} />
              ))}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
              <p className="text-sm font-medium text-white">Akun.AI</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Margin naik karena expense supplier turun 14%. Cek invoice jatuh tempo minggu ini sebelum restock.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-1">
          {FEATURES.map(({ icon: Icon, title, text }, index) => (
            <div key={title} className="group grid grid-cols-[44px_1fr] gap-4 rounded-2xl px-2 py-4 transition-colors hover:bg-white/[0.035]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-emerald-300">
                <Icon size={18} />
              </span>
              <div className="border-b border-white/10 pb-4 group-last:border-0">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-base font-semibold text-white">{title}</h3>
                  <span className="text-xs text-slate-600">0{index + 1}</span>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-400">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function WorkflowSection() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8">
      <SectionIntro
        label="Workflow"
        title="Dari transaksi mentah ke laporan siap baca."
        text="Alurnya mengikuti mental model pemilik usaha: setup, catat, pantau. Kompleksitas akuntansi tetap ada, tapi tidak mengganggu kerja harian."
      />
      <div className="mx-auto max-w-5xl">
        <div className="relative grid gap-8 md:grid-cols-3">
          <div className="absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-transparent via-emerald-300/40 to-transparent md:block" />
        {WORKFLOW.map((item) => (
          <div key={item.step} className="relative text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-emerald-300/30 bg-[#080a0f] text-xs font-semibold text-emerald-300">
              {item.step}
            </span>
            <h3 className="mt-6 text-xl font-semibold text-white">{item.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{item.text}</p>
          </div>
        ))}
        </div>
      </div>
    </section>
  )
}

function SecuritySection() {
  const items = [
    'LLM tidak pernah menulis SQL',
    'Zod validation untuk AI JSON',
    'Role owner/admin/member',
    'Audit logs untuk aksi penting',
  ]

  return (
    <section className="border-y border-white/10 bg-[#0d1119] px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Trust Layer</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white md:text-5xl">AI boleh membantu. Sistem tetap yang memutuskan.</h2>
          <p className="mt-5 text-sm leading-7 text-slate-400 md:text-base">
            Akun.AI memisahkan interpretasi AI dari eksekusi backend. Output AI divalidasi, lalu fungsi internal yang aman menjalankan aksi sesuai permission user.
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
            <ShieldCheck size={17} className="text-emerald-300" />
            Safety checklist
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-3 text-sm text-slate-300">
                <Check size={14} className="text-emerald-300" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section id="harga" className="px-4 py-24 sm:px-6 lg:px-8">
      <SectionIntro
        label="Pricing"
        title="Mulai gratis, upgrade saat operasional makin ramai."
        text="Harga dibuat masuk akal untuk UMKM Indonesia, dengan pembayaran lokal via Mayar."
      />
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div key={plan.name} className={`relative rounded-lg border p-6 transition-all hover:-translate-y-1 ${plan.highlight ? 'border-emerald-300/45 bg-emerald-300/10' : 'border-white/10 bg-white/[0.035]'}`}>
            {plan.highlight && (
              <span className="absolute -top-3 left-5 rounded-full bg-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-950">Populer</span>
            )}
            <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
            <p className="mt-2 text-sm text-slate-500">{plan.note}</p>
            <p className="mt-6 text-4xl font-semibold tracking-normal text-white">{plan.price}<span className="text-sm font-normal text-slate-500">/bulan</span></p>
            <ul className="mt-6 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-slate-300">
                  <Check size={14} className="mt-1 text-emerald-300" />
                  {feature}
                </li>
              ))}
            </ul>
            <Link href="/auth/register" className={`mt-7 inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition-all ${plan.highlight ? 'bg-emerald-300 text-emerald-950 hover:bg-emerald-200' : 'border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]'}`}>
              Pilih {plan.name}
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}

function FAQSection() {
  return (
    <section id="faq" className="border-y border-white/10 bg-white/[0.025] px-4 py-24 sm:px-6 lg:px-8">
      <SectionIntro
        label="FAQ"
        title="Pertanyaan umum sebelum mulai."
        text="Beberapa keputusan produk dibuat khusus untuk konteks UMKM Indonesia."
      />
      <div className="mx-auto grid max-w-4xl gap-3">
        {[
          ['Kenapa Mayar, bukan Stripe?', 'Target utamanya UMKM Indonesia, jadi QRIS dan transfer bank lokal lebih cocok daripada kartu internasional.'],
          ['Apakah AI otomatis menyimpan transaksi?', 'Kalau transaksi ambigu, sistem membuat draft atau bertanya lanjut. Transaksi tetap divalidasi double-entry.'],
          ['Apakah data tiap bisnis aman?', 'Akses data dibatasi membership bisnis, role permission, RLS Supabase, dan service-role hanya dipakai di server.'],
        ].map(([q, a]) => (
          <div key={q} className="rounded-lg border border-white/10 bg-[#0f141d] p-5">
            <h3 className="font-semibold text-white">{q}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{a}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="px-4 py-24 text-center sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Badge>
          <Zap size={13} className="text-emerald-300" />
          Siap dipakai sebagai SaaS accounting workspace
        </Badge>
        <h2 className="mt-6 text-4xl font-semibold tracking-normal text-white md:text-6xl">Rapikan keuangan bisnis tanpa menunggu akhir bulan.</h2>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-400 md:text-base">
          Mulai dari transaksi pertama, lalu biarkan laporan, stok, piutang, dan insight ikut tersusun otomatis.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/auth/register" className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition-all hover:-translate-y-0.5 hover:bg-emerald-100">
            Mulai gratis
            <ArrowRight size={16} />
          </Link>
          <Link href="/auth/login" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-white/[0.1]">
            Masuk ke dashboard
          </Link>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/10 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-slate-500 md:flex-row">
        <div className="flex items-center gap-2">
          <BrandMark className="h-7 w-7 rounded-lg" />
          <span className="font-semibold text-slate-300">Akun.AI</span>
        </div>
        <div className="flex flex-wrap justify-center gap-5">
          <a href="#produk" className="hover:text-white">Produk</a>
          <a href="#fitur" className="hover:text-white">Fitur</a>
          <a href="#harga" className="hover:text-white">Harga</a>
          <Link href="/auth/login" className="hover:text-white">Masuk</Link>
        </div>
        <p>Copyright 2026 Akun.AI</p>
      </div>
    </footer>
  )
}
