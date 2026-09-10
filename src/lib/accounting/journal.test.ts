import { describe, expect, it } from 'vitest'
import { validateJournalLines } from './journal'

const cash = '11111111-1111-4111-8111-111111111111'
const revenue = '22222222-2222-4222-8222-222222222222'

describe('journal invariants', () => {
  it('accepts a balanced double-entry journal', () => {
    const result = validateJournalLines([
      { account_id: cash, debit: 150_000, credit: 0 },
      { account_id: revenue, debit: 0, credit: 150_000 },
    ])

    expect(result).toMatchObject({ totalDebit: 150_000, totalCredit: 150_000 })
  })

  it('rejects an unbalanced journal', () => {
    const result = validateJournalLines([
      { account_id: cash, debit: 150_000, credit: 0 },
      { account_id: revenue, debit: 0, credit: 149_999 },
    ])

    expect(result).toMatchObject({ error: expect.stringContaining('Tidak balance') })
  })

  it('rejects a line containing both debit and credit', () => {
    const result = validateJournalLines([
      { account_id: cash, debit: 100, credit: 100 },
      { account_id: revenue, debit: 0, credit: 100 },
    ])

    expect(result).toMatchObject({ error: expect.stringContaining('debit atau kredit') })
  })

  it('rejects an empty-value journal line', () => {
    const result = validateJournalLines([
      { account_id: cash, debit: 0, credit: 0 },
      { account_id: revenue, debit: 0, credit: 100 },
    ])

    expect(result).toMatchObject({ error: expect.stringContaining('debit atau kredit') })
  })
})
