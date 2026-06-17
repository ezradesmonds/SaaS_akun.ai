import { z } from 'zod'
import { PLANS, type Plan } from '@/lib/permissions/plans'

const MayarInvoiceResponseSchema = z.object({
  statusCode: z.number(),
  messages: z.string().optional(),
  data: z.object({
    id: z.string(),
    transactionId: z.string().optional(),
    transaction_id: z.string().optional(),
    link: z.string().url(),
    expiredAt: z.union([z.number(), z.string()]).optional(),
    extraData: z.record(z.unknown()).optional(),
  }),
})

export class MayarConfigError extends Error {
  constructor(message = getMayarSetupMessage()) {
    super(message)
    this.name = 'MayarConfigError'
  }
}

export class MayarApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MayarApiError'
    this.status = status
  }
}

export function getMayarConfigStatus() {
  const missing = [
    ['MAYAR_API_KEY', process.env.MAYAR_API_KEY],
    ['MAYAR_DEFAULT_MOBILE', process.env.MAYAR_DEFAULT_MOBILE],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key)

  return {
    configured: missing.length === 0 && Boolean(process.env.MAYAR_WEBHOOK_SECRET),
    checkoutConfigured: missing.length === 0,
    webhookConfigured: Boolean(process.env.MAYAR_WEBHOOK_SECRET),
    webhookSecretConfigured: Boolean(process.env.MAYAR_WEBHOOK_SECRET),
    missing,
    dashboardUrl: process.env.MAYAR_DASHBOARD_URL || 'https://web.mayar.id',
  }
}

export function getMayarSetupMessage() {
  const { missing } = getMayarConfigStatus()
  return missing.length > 0
    ? `Mayar belum dikonfigurasi. Isi ${missing.join(', ')} di environment untuk mengaktifkan QRIS/transfer bank.`
    : 'Mayar belum siap. Periksa konfigurasi billing.'
}

function getMayarApiKey() {
  const apiKey = process.env.MAYAR_API_KEY
  if (!apiKey) throw new MayarConfigError()
  return apiKey
}

function getMayarBaseUrl() {
  return (process.env.MAYAR_BASE_URL || 'https://api.mayar.id/hl/v1').replace(/\/$/, '')
}

export function getPlanFromMayarPayload(payload: unknown): Plan {
  const data = (payload as { data?: Record<string, unknown> })?.data || {}
  const extraData = data.extraData as Record<string, unknown> | undefined
  const plan = extraData?.plan || data.plan || data.productName

  if (plan === 'pro' || plan === PLANS.pro.name) return 'pro'
  if (plan === 'starter' || plan === PLANS.starter.name) return 'starter'
  return 'free'
}

export function verifyMayarWebhookSecret(requestUrl: string, headerSecret: string | null) {
  const expected = process.env.MAYAR_WEBHOOK_SECRET
  if (!expected) return false
  return headerSecret === expected
}

export async function createMayarInvoice({
  businessId,
  plan,
  customerName,
  customerEmail,
  customerMobile,
  redirectUrl,
}: {
  businessId: string
  plan: Exclude<Plan, 'free'>
  customerName: string
  customerEmail: string
  customerMobile?: string | null
  redirectUrl: string
}) {
  const mobile = customerMobile || process.env.MAYAR_DEFAULT_MOBILE
  if (!mobile) throw new MayarConfigError()

  const planConfig = PLANS[plan]
  const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const response = await fetch(`${getMayarBaseUrl()}/invoice/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getMayarApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: customerName,
      email: customerEmail,
      mobile,
      redirectUrl,
      description: `Langganan Akun.AI ${planConfig.name} - 1 bulan`,
      expiredAt,
      items: [
        {
          quantity: 1,
          rate: planConfig.price_idr,
          description: `Akun.AI ${planConfig.name}`,
        },
      ],
      extraData: {
        noCustomer: businessId,
        idProd: plan,
        business_id: businessId,
        plan,
        provider: 'mayar',
      },
    }),
  })

  const text = await response.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new MayarApiError('Mayar mengembalikan respons yang tidak valid.', response.status)
  }

  if (!response.ok) {
    const message = (json as { messages?: string; message?: string })?.messages
      || (json as { message?: string })?.message
      || 'Gagal membuat invoice Mayar.'
    throw new MayarApiError(message, response.status)
  }

  const parsed = MayarInvoiceResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new MayarApiError('Format respons Mayar tidak sesuai.', response.status)
  }

  return {
    invoiceId: parsed.data.data.id,
    transactionId: parsed.data.data.transactionId || parsed.data.data.transaction_id || null,
    url: parsed.data.data.link,
    expiredAt: parsed.data.data.expiredAt || null,
  }
}
