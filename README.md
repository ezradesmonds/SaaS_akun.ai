# Akun.AI

Akun.AI is an AI-assisted accounting SaaS for Indonesian SMEs. It combines bookkeeping workflows, financial reports, invoicing, inventory support, billing, and AI assistance on top of a Supabase-backed Next.js application.

## Overview

The project is built as a multi-business accounting workspace. Users can record transactions, review reports, manage invoices and inventory, and use an AI assistant for accounting support. The backend also includes subscription billing, role-based access, usage limits, audit trails, and integration points for WhatsApp and OCR-based receipt processing.

## Key Features

- Multi-business onboarding with company profile setup and chart of accounts.
- Double-entry transaction flow with debit/credit validation before persistence.
- Accounting dashboard for revenue, expense, cash flow, and business health summaries.
- Financial reports, including profit and loss, balance sheet, and cash flow views.
- AI accounting assistant backed by OpenRouter for contextual finance help.
- OCR receipt/document processing flow for extracting transaction data from uploaded files.
- Invoice and receivable management, including PDF generation support.
- Inventory and stock-related workflows for businesses that sell physical goods.
- Tax-related modules and reporting integration points.
- Team access, roles, permissions, subscription plans, usage limits, and audit logs.
- Mayar billing/webhook integration for subscription lifecycle handling.
- WhatsApp webhook integration for messaging and assistant workflows.

## Tech Stack

- Framework: Next.js 14, React 18, TypeScript
- Styling: Tailwind CSS
- Data and auth: Supabase Postgres, Supabase Auth, Supabase SSR
- State and validation: Zustand, Zod
- Charts and reporting: Recharts, ExcelJS
- PDF/browser rendering: Puppeteer Core, Sparticuz Chromium
- AI and OCR: OpenRouter-compatible models and vision workflows
- Billing and messaging: Mayar, WhatsApp Cloud API integration points

## Project Structure

```text
src/app/                 Next.js App Router pages and API routes
src/app/api/             Transaction, report, OCR, chat, billing, invoice, and webhook APIs
src/components/          Shared UI and domain components
src/lib/                 Supabase clients, helpers, validation, and service utilities
supabase/migrations/     Database schema, RLS, ledger, invoices, inventory, tax, and billing changes
public/                  Static assets
```

## Getting Started

```bash
npm install
npm run dev
```

Create a `.env.local` file before running the full app. Required values depend on the enabled modules, but typically include Supabase, OpenRouter, Mayar, WhatsApp, and application URL configuration.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
MAYAR_API_KEY=
MAYAR_WEBHOOK_SECRET=
WHATSAPP_ACCESS_TOKEN=
```

Apply the Supabase migrations before using the accounting modules.

## Security Notes

- Supabase Row Level Security and permission checks are part of the data model and should stay enabled.
- Service role keys must only be used on the server side.
- Webhook endpoints should validate provider signatures/secrets before mutating billing or messaging state.
- AI-generated accounting suggestions should be treated as assistance, not as final bookkeeping authority. Persisted transactions still need deterministic validation.

## Testing and Quality

Recommended checks before deployment:

```bash
npm run lint
npm run build
```

Add feature tests around ledger posting, RLS behavior, billing webhooks, invoice numbering, OCR failure cases, and AI assistant guardrails before using this in a production finance environment.

## Status

Portfolio SaaS project with production-oriented architecture. The most sensitive areas are accounting correctness, RLS coverage, webhook verification, and AI output validation.