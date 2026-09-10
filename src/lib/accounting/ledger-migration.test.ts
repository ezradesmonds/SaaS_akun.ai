import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/014_secure_ledger_and_invoice_posting.sql'),
  'utf8',
)

describe('ledger migration security contract', () => {
  it('requires a user identity before posting or reversing journals', () => {
    expect(migration).toContain("RAISE EXCEPTION 'Authentication is required to post a transaction'")
    expect(migration).toContain("RAISE EXCEPTION 'Authentication is required to reverse a transaction'")
  })

  it('does not expose ledger RPC execution to PUBLIC', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION post_journal_transaction')
    expect(migration).toContain('REVOKE ALL ON FUNCTION reverse_journal_transaction')
  })

  it('includes atomic invoice issuance and payment functions', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION post_invoice_issuance')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION record_invoice_payment_atomic')
  })
})
