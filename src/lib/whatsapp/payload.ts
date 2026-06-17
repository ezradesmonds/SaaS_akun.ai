export type WhatsAppTextMessage = {
  providerMessageId?: string
  from: string
  text: string
  timestamp?: string
  phoneNumberId?: string
  displayPhoneNumber?: string
  profileName?: string
  raw: unknown
}

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: {
          display_phone_number?: string
          phone_number_id?: string
        }
        contacts?: Array<{
          wa_id?: string
          profile?: {
            name?: string
          }
        }>
        messages?: Array<{
          id?: string
          from?: string
          timestamp?: string
          type?: string
          text?: {
            body?: string
          }
        }>
      }
    }>
  }>
}

export function extractTextMessages(payload: WhatsAppWebhookPayload): WhatsAppTextMessage[] {
  const entries = payload.entry || []
  const messages: WhatsAppTextMessage[] = []

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value
      const metadata = value?.metadata
      const contacts = value?.contacts || []

      for (const message of value?.messages || []) {
        if (message.type !== 'text' || !message.from || !message.text?.body) continue

        const contact = contacts.find((item) => item.wa_id === message.from)
        messages.push({
          providerMessageId: message.id,
          from: message.from,
          text: message.text.body.trim(),
          timestamp: message.timestamp,
          phoneNumberId: metadata?.phone_number_id,
          displayPhoneNumber: metadata?.display_phone_number,
          profileName: contact?.profile?.name,
          raw: { metadata, contact, message },
        })
      }
    }
  }

  return messages
}

