# Stripe Setup Guide for Akun.AI

## Step 1: Buat Akun Stripe

1. Daftar di https://stripe.com
2. Masuk ke **Stripe Dashboard**
3. Untuk development, pastikan toggle **Test mode** ON (kanan atas)

## Step 2: Buat Products & Prices

Di Stripe Dashboard → **Product catalog** → **Add product**

### Starter Plan
- Name: `Akun.AI Starter`
- Price: `$2.00 / month` (atau sesuai kebutuhan)
- Billing: **Recurring** → Monthly
- Setelah dibuat, copy **Price ID** (format: `price_xxxxx`)

### Pro Plan
- Name: `Akun.AI Pro`
- Price: `$5.00 / month`
- Billing: **Recurring** → Monthly
- Copy **Price ID**

Paste ke `.env.local`:
```
STRIPE_PRICE_STARTER=price_xxxxx
STRIPE_PRICE_PRO=price_xxxxx
```

## Step 3: Stripe Secret Key

Dashboard → **Developers** → **API keys**

Copy **Secret key** (starts with `sk_test_` for test mode):
```
STRIPE_SECRET_KEY=sk_test_xxxxx
```

## Step 4: Setup Webhook (Local Development)

Install Stripe CLI:
```bash
# Mac
brew install stripe/stripe-cli/stripe

# Windows
# Download dari https://github.com/stripe/stripe-cli/releases
```

Login & forward webhook ke local:
```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy webhook secret yang muncul (format: `whsec_xxxxx`):
```
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

## Step 5: Setup Webhook (Production/Vercel)

Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**

- URL: `https://yourapp.vercel.app/api/stripe/webhook`
- Events to listen:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
  - `invoice.paid`

Copy **Signing secret** → paste ke `STRIPE_WEBHOOK_SECRET`

## Step 6: Setup Customer Portal

Stripe Dashboard → **Settings** → **Billing** → **Customer portal**

Enable features:
- ✅ Cancel subscriptions
- ✅ Update payment methods
- ✅ View billing history
- ✅ Update subscriptions (untuk upgrade/downgrade)

## Step 7: Test Cards

Untuk testing tanpa kartu nyata:

| Kartu | Number | Hasil |
|-------|--------|-------|
| Sukses | `4242 4242 4242 4242` | Payment berhasil |
| Gagal | `4000 0000 0000 0002` | Payment ditolak |
| 3D Secure | `4000 0025 0000 3155` | Butuh auth 3DS |

Gunakan expired date: `12/34`, CVV: `123`

## Full .env.local Example

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OpenRouter
OPENROUTER_API_KEY=sk-or-v1-...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Flow Lengkap Testing

1. `npm run dev`
2. Di terminal lain: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
3. Buka app → Register → Dashboard
4. Klik **Billing** → **Upgrade ke Starter**
5. Di Stripe checkout, pakai kartu `4242 4242 4242 4242`
6. Redirect balik ke `/billing?success=true`
7. Cek database Supabase → tabel `subscriptions` → plan harus berubah ke `starter`
