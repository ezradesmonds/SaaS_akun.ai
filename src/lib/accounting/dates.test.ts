import { describe, expect, it } from 'vitest'
import { businessPeriods, businessToday, BusinessDateSchema } from './dates'
import { JournalEntrySchema, validateJournalLines } from './journal'
describe('WIB accounting dates', () => {
  it('uses the next Jakarta day before UTC midnight', () => {
    expect(businessToday(new Date('2026-09-17T18:00:00Z'))).toBe('2026-09-18')
  })
  it('clamps comparable periods at month end including leap years', () => {
    expect(businessPeriods(new Date('2024-03-31T05:00:00Z'))).toMatchObject({lastStart:'2024-02-01',lastEnd:'2024-02-29',comparableEnd:'2024-02-29'})
    expect(businessPeriods(new Date('2026-01-02T05:00:00Z'))).toMatchObject({lastStart:'2025-12-01',comparableEnd:'2025-12-02'})
  })
  it('rejects impossible calendar dates', () => {
    expect(BusinessDateSchema.safeParse('2026-02-30').success).toBe(false)
    expect(JournalEntrySchema.shape.date.safeParse('2026-02-30').success).toBe(false)
  })
})
describe('invalid journal amounts', () => {
  for (const invalid of [-1,NaN,Infinity]) it(`rejects ${invalid}`, () => {
    expect(validateJournalLines([{account_id:'a',debit:invalid,credit:0},{account_id:'b',debit:0,credit:100}]).error).toBeTruthy()
  })
})
