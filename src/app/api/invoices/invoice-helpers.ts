import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackUsage } from '@/lib/permissions/guard'

export const InvoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(240),
  quantity: z.number().positive().max(999999),
  unit_price: z.number().min(0).max(999999999999),
  discount_amount: z.number().min(0).max(999999999999).optional(),
})

export const InvoiceBaseSchema = z.object({
  business_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  invoice_number: z.string().trim().min(1).max(80),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(['draft', 'issued', 'paid']).optional(),
  discount_amount: z.number().min(0).optional(),
  ppn_rate: z.number().min(0).max(1).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  terms: z.string().trim().max(1000).optional().nullable(),
  payment_provider: z.string().trim().max(40).optional().nullable(),
  provider_invoice_id: z.string().trim().max(120).optional().nullable(),
  provider_transaction_id: z.string().trim().max(120).optional().nullable(),
  provider_checkout_url: z.string().trim().url().max(500).optional().nullable(),
  provider_payment_status: z.string().trim().max(80).optional().nullable(),
  mayar_checkout_url: z.string().trim().url().max(500).optional().nullable(),
  mayar_status: z.string().trim().max(80).optional().nullable(),
  npwp: z.string().trim().max(40).optional().nullable(),
  tax_invoice_number: z.string().trim().max(120).optional().nullable(),
  tax_invoice_status: z.string().trim().max(80).optional().nullable(),
  payment_account_id: z.string().uuid().optional().nullable(),
  items: z.array(InvoiceItemSchema).min(1).max(100),
})

export const PaymentSchema = z.object({
  business_id: z.string().uuid(),
  amount: z.number().positive(),
  paid_at: z.string().datetime().optional(),
  method: z.string().trim().max(80).optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  payment_provider: z.string().trim().max(40).optional().nullable(),
  provider_payment_id: z.string().trim().max(120).optional().nullable(),
  provider_transaction_id: z.string().trim().max(120).optional().nullable(),
  provider_status: z.string().trim().max(80).optional().nullable(),
  mayar_status: z.string().trim().max(80).optional().nullable(),
  payment_account_id: z.string().uuid().optional().nullable(),
})

export type InvoicePayload = z.infer<typeof InvoiceBaseSchema>
export type PaymentPayload = z.infer<typeof PaymentSchema>

type InvoiceItem = z.infer<typeof InvoiceItemSchema>
type SupabaseClient = ReturnType<typeof createClient>

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculateInvoiceAmounts(items: InvoiceItem[], invoiceDiscount = 0, ppnRate = 0) {
  const normalizedItems = items.map((item) => {
    const discount = item.discount_amount || 0
    const lineTotal = Math.max(0, item.quantity * item.unit_price - discount)
    return {
      description: item.description,
      quantity: item.quantity,
      unit_price: roundMoney(item.unit_price),
      discount_amount: roundMoney(discount),
      line_total: roundMoney(lineTotal),
    }
  })
  const itemSubtotal = roundMoney(normalizedItems.reduce((sum, item) => sum + item.line_total, 0))
  const subtotalAfterDiscount = Math.max(0, itemSubtotal - invoiceDiscount)
  const ppnAmount = roundMoney(subtotalAfterDiscount * ppnRate)
  const totalAmount = roundMoney(subtotalAfterDiscount + ppnAmount)

  return {
    items: normalizedItems,
    subtotal_amount: itemSubtotal,
    discount_amount: roundMoney(invoiceDiscount),
    ppn_rate: ppnRate,
    ppn_amount: ppnAmount,
    total_amount: totalAmount,
  }
}

export async function getInvoiceBusiness(supabase: SupabaseClient, invoiceId: string) {
  const { data, error } = await supabase
    .from('invoices')
    .select('business_id, status, total_amount, amount_paid, transaction_id')
    .eq('id', invoiceId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as {
    business_id: string
    status: 'draft' | 'issued' | 'paid' | 'void'
    total_amount: number
    amount_paid: number
    transaction_id: string | null
  } | null
}

export async function customerBelongsToBusiness(
  supabase: SupabaseClient,
  businessId: string,
  customerId?: string | null,
) {
  if (!customerId) return true
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return Boolean(data)
}

async function getAccountByCode(supabase: SupabaseClient, businessId: string, codes: string[]) {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .in('code', codes)

  if (error) throw new Error(error.message)
  const accounts = (data || []) as { id: string; code: string; name: string; type: string }[]
  return codes.map((code) => accounts.find((account) => account.code === code)).find(Boolean) || null
}

export async function canPostInvoiceSafely(
  supabase: SupabaseClient,
  businessId: string,
  totalAmount: number,
  ppnAmount: number,
  paymentAccountId?: string | null,
  needsPayment = false,
) {
  if (totalAmount <= 0) return { ok: false, reason: 'Total invoice harus lebih dari 0 untuk diposting.' }
  if (ppnAmount > 0) {
    return {
      ok: false,
      reason: 'Invoice dengan PPN disimpan sebagai draft karena akun PPN keluaran belum tersedia.',
    }
  }

  const receivable = await getAccountByCode(supabase, businessId, ['1-003'])
  const revenue = await getAccountByCode(supabase, businessId, ['4-001'])
  if (!receivable || !revenue) {
    return {
      ok: false,
      reason: 'Akun Piutang Usaha dan Pendapatan Penjualan harus tersedia sebelum invoice diposting.',
    }
  }

  let paymentAccount = null
  if (needsPayment) {
    if (paymentAccountId) {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, code, name, type')
        .eq('id', paymentAccountId)
        .eq('business_id', businessId)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw new Error(error.message)
      paymentAccount = data as { id: string; code: string; name: string; type: string } | null
    } else {
      paymentAccount = await getAccountByCode(supabase, businessId, ['1-002', '1-001'])
    }

    if (!paymentAccount || paymentAccount.type !== 'ASSET') {
      return {
        ok: false,
        reason: 'Akun kas/bank aktif dibutuhkan untuk menandai invoice sebagai paid.',
      }
    }
  }

  return { ok: true, receivable, revenue, paymentAccount, reason: null }
}

export async function createJournalTransaction(
  supabase: SupabaseClient,
  businessId: string,
  date: string,
  description: string,
  reference: string,
  entries: { account_id: string; debit: number; credit: number; note?: string }[],
) {
  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .insert({ business_id: businessId, date, description, reference, source: 'manual' })
    .select()
    .single()

  if (txError) throw new Error(txError.message)

  const { error: linesError } = await supabase
    .from('transaction_lines')
    .insert(entries.map((entry) => ({ ...entry, transaction_id: tx.id })))

  if (linesError) {
    await supabase.from('transactions').delete().eq('id', tx.id).eq('business_id', businessId)
    throw new Error(linesError.message)
  }

  await trackUsage(businessId, 'tx_count')

  return tx as { id: string }
}

export async function postInvoiceIssuance(
  supabase: SupabaseClient,
  businessId: string,
  invoiceId: string,
  invoiceNumber: string,
  issueDate: string,
  totalAmount: number,
  receivableAccountId: string,
  revenueAccountId: string,
) {
  const tx = await createJournalTransaction(
    supabase,
    businessId,
    issueDate,
    `Invoice ${invoiceNumber}`,
    invoiceNumber,
    [
      { account_id: receivableAccountId, debit: totalAmount, credit: 0, note: `Piutang invoice ${invoiceNumber}` },
      { account_id: revenueAccountId, debit: 0, credit: totalAmount, note: `Pendapatan invoice ${invoiceNumber}` },
    ],
  )

  await supabase
    .from('invoices')
    .update({ transaction_id: tx.id, updated_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('business_id', businessId)

  return tx
}

export async function recordInvoicePayment(
  supabase: SupabaseClient,
  businessId: string,
  invoiceId: string,
  invoiceNumber: string,
  payment: PaymentPayload,
  receivableAccountId?: string,
  paymentAccountId?: string,
) {
  let txId: string | null = null
  if (receivableAccountId && paymentAccountId) {
    const paidDate = (payment.paid_at || new Date().toISOString()).slice(0, 10)
    const tx = await createJournalTransaction(
      supabase,
      businessId,
      paidDate,
      `Pembayaran invoice ${invoiceNumber}`,
      payment.reference || invoiceNumber,
      [
        { account_id: paymentAccountId, debit: payment.amount, credit: 0, note: payment.method || 'Pembayaran invoice' },
        { account_id: receivableAccountId, debit: 0, credit: payment.amount, note: `Pelunasan ${invoiceNumber}` },
      ],
    )
    txId = tx.id
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({
      business_id: businessId,
      invoice_id: invoiceId,
      transaction_id: txId,
      amount: payment.amount,
      paid_at: payment.paid_at || new Date().toISOString(),
      method: payment.method || null,
      reference: payment.reference || null,
      notes: payment.notes || null,
      payment_provider: payment.payment_provider || null,
      provider_payment_id: payment.provider_payment_id || null,
      provider_transaction_id: payment.provider_transaction_id || null,
      provider_status: payment.provider_status || null,
      mayar_status: payment.mayar_status || null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('amount_paid, total_amount')
    .eq('id', invoiceId)
    .eq('business_id', businessId)
    .single()

  if (invoiceError) throw new Error(invoiceError.message)
  const nextPaid = roundMoney(Number(invoice.amount_paid || 0) + payment.amount)
  const nextStatus = nextPaid >= Number(invoice.total_amount || 0) ? 'paid' : 'issued'

  const { error: updateError } = await supabase
    .from('invoices')
    .update({ amount_paid: nextPaid, status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('business_id', businessId)

  if (updateError) throw new Error(updateError.message)
  return data
}
