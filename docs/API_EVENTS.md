# API and Event Contracts

## Idempotency

`POST /api/transactions` accepts `Idempotency-Key`. Reuse the same key only for the same logical request. Invoice payment writes use a provider payment ID, provider transaction ID, or request idempotency key.

## Journal State

- `posted`: included in reporting.
- `voided`: original journal was reversed; its reversal entry remains posted to preserve the audit trail.

## Webhooks

Provider webhooks are signature-verified before processing. Each event is inserted into `webhook_events` with a unique `(provider, event_key)` pair; duplicates are acknowledged without repeating side effects.

## Errors

- `401`: no authenticated user.
- `403`: authenticated user lacks business role permission.
- `402`: plan limit reached.
- `409`: invalid state transition, duplicate provider payment, or immutable journal update.
- `503`: optional integration is not configured.
