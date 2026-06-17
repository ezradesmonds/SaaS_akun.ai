# Akun.AI 🤖💰

> Akuntansi UMKM yang bisa diajak ngobrol. Input transaksi, tanya laporan, dapatkan insight — semua lewat chat.

## Tech Stack

- **Frontend + Backend**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **LLM**: MiniMax 2.5 via OpenRouter (free tier)
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
3. Copy-paste isi file `supabase/migrations/001_initial_schema.sql` dan run
4. Ambil credentials dari **Settings > API**

### 3. Setup OpenRouter

1. Daftar di [openrouter.ai](https://openrouter.ai)
2. Buat API key baru
3. MiniMax 2.5 sudah tersedia free tier

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
callLLM() → OpenRouter → MiniMax 2.5
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

## Roadmap

- [ ] MVP: Auth + Chat + Transaksi + Dashboard
- [ ] V1: Export PDF, Balance Sheet, multi-kategori
- [ ] V2: WhatsApp bot, upload struk OCR, multi-user
- [ ] V3: Subscription billing (Midtrans), laporan pajak
