# Architecture

## Boundaries

- **UI:** Next.js App Router pages and client components collect input and render states.
- **API/application layer:** Route handlers authenticate the request, enforce role/plan policy, and call domain functions.
- **Accounting domain:** `src/lib/accounting` validates journal input and produces report data. Financial writes use PostgreSQL RPCs only.
- **Database:** Supabase Auth, RLS, constraints, and `SECURITY DEFINER` routines protect tenant data and accounting invariants.
- **Integrations:** OpenRouter, Mayar, OCR, and WhatsApp are optional adapters. Their payloads are untrusted.

## Trust Model

The browser never receives the service role key. User routes operate with the user JWT and are checked again by RLS/RPC membership rules. Webhook handlers use service role only after provider-signature validation and persist an event before applying side effects.

## Async Model

Current webhook work is synchronous but persisted in `webhook_events` for retry visibility. OCR, reminders, exports, reconciliation, and marketplace imports require a durable job worker before public scale; they must not rely on an HTTP request remaining alive.

## Observability

Audit logs capture important business/admin actions. Production deployment still requires external error tracking, alerting, backup checks, and job/webhook failure monitoring.
