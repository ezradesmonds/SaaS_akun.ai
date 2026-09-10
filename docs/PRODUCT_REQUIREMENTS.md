# Product Requirements

## Product Boundary

Akun.AI helps Indonesian UMKM record daily transactions and understand financial position. It is not a tax filing service, bank, marketplace, or accounting-firm substitute.

## V1 Workflows

1. Register, create a business, and receive a default chart of accounts.
2. Record a balanced journal manually or confirm an AI-proposed draft.
3. Issue an invoice, record a payment, and maintain receivable balance.
4. View cash, profit and loss, and balance-sheet reports from journal lines.
5. Manage plan billing through Mayar.

## Non-Functional Requirements

- Tenant data is visible only to business members.
- Every posted journal has at least two lines and equal debit/credit totals.
- Posted journals are corrected through reversal, not mutation or deletion.
- Payment, journal, and webhook retries are idempotent.
- AI returns structured data and requires confirmation when a transaction is ambiguous.
- Missing integration credentials return a recoverable setup error.

## Deferred Features

Business-specific COA templates, merchant categorisation, cashflow forecasts, health scores, anonymised benchmarks, official e-Faktur export, and marketplace synchronisation are not V1 commitments.
