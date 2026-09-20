import { z } from 'zod'

export const JournalLineSchema = z.object({
  account_id: z.string().uuid(),
  debit: z.number().finite().min(0),
  credit: z.number().finite().min(0),
  note: z.string().trim().max(250).optional(),
})

export const JournalEntrySchema = z.object({
  business_id: z.string().uuid(),
  date: z.string().date(),
  description: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(120).optional(),
  source: z.enum(['manual', 'ai', 'import', 'invoice', 'payment']).default('manual'),
  entries: z.array(JournalLineSchema).min(2).max(100),
})

export type JournalLine = z.infer<typeof JournalLineSchema>
export type JournalEntry = z.infer<typeof JournalEntrySchema>

export function validateJournalLines(entries: JournalLine[]) {
  if (entries.some(e => !Number.isFinite(e.debit) || !Number.isFinite(e.credit) || e.debit < 0 || e.credit < 0)) return { error: 'Nominal jurnal harus valid dan tidak negatif' } as const
  if (entries.length < 2) {
    return { error: 'Minimal 2 baris jurnal diperlukan' } as const
  }

  const invalidLine = entries.find((entry) =>
    (entry.debit > 0 && entry.credit > 0) || (entry.debit === 0 && entry.credit === 0),
  )
  if (invalidLine) {
    return { error: 'Setiap baris harus berisi debit atau kredit saja, tidak keduanya' } as const
  }

  const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0)
  const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0)
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      error: `Tidak balance: total debit (${totalDebit}) tidak sama dengan total kredit (${totalCredit})`,
    } as const
  }

  return { entries, totalDebit, totalCredit } as const
}

export function createIdempotencyKey() {
  return crypto.randomUUID()
}
