import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { getWhatsAppConfig, hasSupabaseAdminConfig } from '@/lib/whatsapp/config'
import { dispatchWhatsAppText } from '@/lib/whatsapp/dispatcher'
import { extractTextMessages } from '@/lib/whatsapp/payload'
import { resolveBusinessForMessage } from '@/lib/whatsapp/resolver'

export const dynamic = 'force-dynamic'

type MessageProcessingResult = {
  providerMessageId?: string
  mapped: boolean
  intent?: string
  status: 'processed' | 'ignored' | 'failed'
  reason?: string
}

function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string) {
  if (!signature?.startsWith('sha256=')) return false

  const received = Buffer.from(signature.slice('sha256='.length), 'hex')
  const expected = Buffer.from(
    createHmac('sha256', appSecret).update(rawBody).digest('hex'),
    'hex',
  )

  return received.length === expected.length && timingSafeEqual(received, expected)
}

export async function GET(request: NextRequest) {
  const config = getWhatsAppConfig()
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  if (!config.verifyToken) {
    return NextResponse.json({ error: 'WhatsApp verify token is not configured' }, { status: 503 })
  }

  if (mode === 'subscribe' && token === config.verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Invalid verification token' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const config = getWhatsAppConfig()
  if (!config.appSecret) {
    return NextResponse.json({ error: 'WhatsApp app secret is not configured' }, { status: 503 })
  }

  const rawBody = await request.text()
  if (!verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'), config.appSecret)) {
    return NextResponse.json({ error: 'Invalid WhatsApp webhook signature' }, { status: 401 })
  }

  let payload: unknown

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const messages = extractTextMessages(payload as Parameters<typeof extractTextMessages>[0])
  if (messages.length === 0) {
    return NextResponse.json({ received: true, ignored: true, reason: 'No text messages' })
  }

  if (!hasSupabaseAdminConfig()) {
    console.warn('WhatsApp webhook received messages but Supabase admin config is missing.')
    return NextResponse.json({
      received: true,
      ignored: true,
      reason: 'Supabase admin config missing',
      count: messages.length,
    })
  }

  const supabase = createAdminClient()
  const results: MessageProcessingResult[] = []

  for (const message of messages) {
    const resolved = await resolveBusinessForMessage(supabase, message)

    if (!resolved) {
      console.info('WhatsApp message ignored because no business mapping was found.', {
        from: message.from,
        phoneNumberId: message.phoneNumberId,
        displayPhoneNumber: message.displayPhoneNumber,
      })
      results.push({
        providerMessageId: message.providerMessageId,
        mapped: false,
        status: 'ignored',
        reason: 'No business mapping found',
      })
      continue
    }

    try {
      const dispatch = await dispatchWhatsAppText(resolved.businessId, message.text)

      const { error } = await supabase
        .from('whatsapp_messages')
        .upsert({
          business_id: resolved.businessId,
          connection_id: resolved.connectionId || null,
          provider: 'meta',
          provider_message_id: message.providerMessageId || null,
          direction: 'inbound',
          message_type: 'text',
          from_wa_id: message.from,
          to_phone_number_id: message.phoneNumberId || null,
          body: message.text,
          intent: dispatch.intent,
          status: 'processed',
          response_body: dispatch.responseText,
          payload: message.raw,
          processed_at: new Date().toISOString(),
        }, { onConflict: 'provider,provider_message_id' })

      if (error) throw error

      results.push({
        providerMessageId: message.providerMessageId,
        mapped: true,
        intent: dispatch.intent,
        status: 'processed',
      })
    } catch (error) {
      console.error('WhatsApp message processing failed:', error)

      await supabase
        .from('whatsapp_messages')
        .upsert({
          business_id: resolved.businessId,
          connection_id: resolved.connectionId || null,
          provider: 'meta',
          provider_message_id: message.providerMessageId || null,
          direction: 'inbound',
          message_type: 'text',
          from_wa_id: message.from,
          to_phone_number_id: message.phoneNumberId || null,
          body: message.text,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown WhatsApp processing error',
          payload: message.raw,
          processed_at: new Date().toISOString(),
        }, { onConflict: 'provider,provider_message_id' })

      results.push({
        providerMessageId: message.providerMessageId,
        mapped: true,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json({ received: true, results })
}
