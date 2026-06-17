import type { AccountType } from '@/types'

export const DEFAULT_ACCOUNTS: {
  code: string
  name: string
  type: AccountType
}[] = [
  { code: '1-001', name: 'Kas', type: 'ASSET' },
  { code: '1-002', name: 'Bank', type: 'ASSET' },
  { code: '1-003', name: 'Piutang Usaha', type: 'ASSET' },
  { code: '1-004', name: 'Persediaan Barang', type: 'ASSET' },
  { code: '1-005', name: 'Perlengkapan Kantor', type: 'ASSET' },
  { code: '1-006', name: 'Peralatan', type: 'ASSET' },
  { code: '2-001', name: 'Hutang Usaha', type: 'LIABILITY' },
  { code: '2-002', name: 'Hutang Bank', type: 'LIABILITY' },
  { code: '3-001', name: 'Modal Pemilik', type: 'EQUITY' },
  { code: '3-002', name: 'Laba Ditahan', type: 'EQUITY' },
  { code: '4-001', name: 'Pendapatan Penjualan', type: 'REVENUE' },
  { code: '4-002', name: 'Pendapatan Jasa', type: 'REVENUE' },
  { code: '4-003', name: 'Pendapatan Lain-lain', type: 'REVENUE' },
  { code: '5-001', name: 'Beban Pembelian', type: 'EXPENSE' },
  { code: '5-002', name: 'Beban Gaji', type: 'EXPENSE' },
  { code: '5-003', name: 'Beban Sewa', type: 'EXPENSE' },
  { code: '5-004', name: 'Beban Listrik & Air', type: 'EXPENSE' },
  { code: '5-005', name: 'Beban Transportasi', type: 'EXPENSE' },
  { code: '5-006', name: 'Beban Pemasaran', type: 'EXPENSE' },
  { code: '5-007', name: 'Beban Perlengkapan', type: 'EXPENSE' },
  { code: '5-008', name: 'Beban Lain-lain', type: 'EXPENSE' },
]

type AccountClient = {
  from: (table: 'accounts') => {
    upsert: (
      values: {
        business_id: string
        code: string
        name: string
        type: AccountType
        is_active: boolean
      }[],
      options: { onConflict: string }
    ) => PromiseLike<{ error: { message: string } | null }>
  }
}

export async function ensureDefaultAccounts(client: AccountClient, businessId: string) {
  const rows = DEFAULT_ACCOUNTS.map((account) => ({
    business_id: businessId,
    ...account,
    is_active: true,
  }))

  const { error } = await client
    .from('accounts')
    .upsert(rows, { onConflict: 'business_id,code' })

  if (error) throw new Error(error.message)
}
