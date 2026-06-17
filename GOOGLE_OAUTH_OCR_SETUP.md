# Google OAuth & OCR Setup Guide

## Google OAuth Setup

### 1. Enable di Supabase

1. Buka **Supabase Dashboard** → project kamu
2. Kiri sidebar → **Authentication** → **Providers**
3. Klik **Google** → toggle ON
4. Copy **Callback URL** yang tertera (format: `https://xxxx.supabase.co/auth/v1/callback`)

### 2. Buat Google OAuth App

1. Buka [Google Cloud Console](https://console.cloud.google.com)
2. Buat project baru atau pilih yang ada
3. Sidebar → **APIs & Services** → **OAuth consent screen**
   - User Type: **External**
   - Isi App name, email, dll
   - Scopes: tambah `email` dan `profile`
4. Sidebar → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: paste **Callback URL** dari Supabase
5. Copy **Client ID** dan **Client Secret**

### 3. Paste ke Supabase

Kembali ke Supabase → Authentication → Providers → Google:
- Client ID: paste dari Google Cloud
- Client Secret: paste dari Google Cloud
- Klik **Save**

### 4. Tambah ke .env.local

```env
# Tidak perlu tambah env baru — Supabase handle semuanya
# Pastikan NEXT_PUBLIC_SUPABASE_URL dan ANON_KEY sudah terisi
```

### 5. Test

Buka `/auth/login` → klik **Lanjutkan dengan Google** → pilih akun Google → redirect ke `/dashboard`.

Untuk user baru via Google: bisnis + chart of accounts dibuat otomatis.

---

## OCR Receipt Setup

### Model yang Digunakan

OCR menggunakan **GPT-4o-mini** via OpenRouter (vision-capable, murah).

Estimasi cost: ~$0.001-0.003 per foto struk.

### Tambah ke .env.local

```env
# Sudah ada dari sebelumnya — tidak perlu tambah
OPENROUTER_API_KEY=sk-or-v1-...
```

OpenRouter sudah support GPT-4o-mini. Tidak perlu setup tambahan.

### Cara Kerja OCR

```
User upload foto struk
    ↓
/api/ocr (POST multipart/form-data)
    ↓
Server encode image → base64
    ↓
Kirim ke GPT-4o-mini via OpenRouter (dengan chart of accounts sebagai context)
    ↓
LLM return JSON: date, description, items, total, journal entries
    ↓
Frontend tampilkan preview
    ↓
User klik "Simpan" → POST /api/transactions
    ↓
Tersimpan ke database ✅
```

### Format yang Didukung
- JPG / JPEG
- PNG
- WEBP
- HEIC / HEIF (iPhone photos)
- Max size: 5MB

---

## PDF Export Setup

### Local Development (tanpa Puppeteer)

Untuk development, export PDF menggunakan **browser print fallback**:
1. API return HTML
2. Frontend buka tab baru
3. Browser otomatis trigger `window.print()`
4. User save as PDF dari print dialog

Tidak perlu install apapun untuk development.

### Production (Vercel) — Full PDF

Install deps:
```bash
npm install puppeteer-core @sparticuz/chromium
```

Tambah ke `next.config.js`:
```js
/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), 'canvas', 'jsdom']
    return config
  },
}
```

Di Vercel: set function timeout ke 30s untuk export route:
```json
// vercel.json
{
  "functions": {
    "src/app/api/export/route.ts": {
      "maxDuration": 30
    }
  }
}
```

---

## Excel Export Setup

Install dep:
```bash
npm install exceljs
```

Tidak perlu konfigurasi tambahan. ExcelJS berjalan di server-side Next.js.

### Plan Requirements
- PDF Export: Starter plan ke atas
- Excel Export: Pro plan only
