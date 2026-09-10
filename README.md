# Akun.AI 🤖💰

> Akuntansi UMKM yang bisa diajak ngobrol. Input transaksi, tanya laporan, dapatkan insight — semua lewat chat.

## Tech Stack

- **Frontend + Backend**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **LLM**: OpenRouter, configured through `OPENROUTER_MODEL`
- **Styling**: Tailwind CSS
- **Hosting**: Vercel

## Setup Guide

### 1. Clone & Install

```bash
git clone <repo-url>
cd akun-ai
npm install
```

### 2. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com)
2. Masuk ke **SQL Editor**
3. Jalankan migration `001_initial_schema.sql` sampai `014_secure_ledger_and_invoice_posting.sql` secara berurutan
4. Ambil credentials dari **Settings > API**

### 3. Setup OpenRouter

1. Daftar di [openrouter.ai](https://openrouter.ai)
2. Buat API key baru
3. Atur `OPENROUTER_MODEL`; untuk OCR gunakan model vision melalui `OPENROUTER_OCR_MODEL`

### 4. Environment Variables

```bash
cp .env.local.example .env.local
```

Isi `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=your-configured-model
OPENROUTER_OCR_MODEL=your-vision-model
MAYAR_API_KEY=your-mayar-api-key
MAYAR_WEBHOOK_SECRET=your-webhook-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run Development

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts          # LLM orchestration (agentic loop)
│   │   ├── transactions/route.ts  # CRUD transaksi
│   │   └── reports/route.ts       # Generate laporan
│   ├── auth/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── dashboard/page.tsx
│   ├── chat/page.tsx
│   └── transactions/page.tsx
├── components/
│   ├── chat/ChatInterface.tsx     # Core chat UI
│   ├── dashboard/StatsCards.tsx
│   └── layout/Sidebar.tsx
├── lib/
│   ├── supabase/client.ts         # Browser client
│   ├── supabase/server.ts         # Server client + Admin client
│   ├── openrouter/client.ts       # LLM + tool definitions + system prompt
│   └── accounting/tools.ts        # Tool executor (LLM → DB bridge)
└── types/index.ts                 # Global TypeScript types
```

## Core Flow: Chat → LLM → Tool → DB

```
User: "tadi beli kertas 50rb"
  ↓
/api/chat (POST)
  ↓
callLLM() → OpenRouter → configured model
  ↓
LLM calls tool: get_accounts({ search: "kas" })
  ↓
executeTool() → Supabase DB
  ↓
LLM calls tool: create_transaction({ ... })
  ↓
executeTool() → Insert to DB (double-entry)
  ↓
LLM responds: "Oke, udah dicatat! Pengeluaran Rp50.000 untuk kertas. ✅"
  ↓
User sees response in chat
```

## Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

Set environment variables di Vercel dashboard.

## Engineering Specifications

- [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Accounting invariants](docs/ACCOUNTING_INVARIANTS.md)
- [API and event contracts](docs/API_EVENTS.md)

Before public deployment, apply all migrations to a staging Supabase project and verify journal posting, reversals, invoice payments, RLS, and webhook retries.

## Product Boundaries

Official e-Faktur export, tax filing, merchant categorisation, cashflow forecasting, financial health scoring, and anonymised benchmarks are deferred. See [Product requirements](docs/PRODUCT_REQUIREMENTS.md) for the maintained scope.
