import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  AccountingIntentSchema,
  classifyAccountingIntent,
  OpenRouterConfigError,
  OpenRouterUnavailableError,
  type LLMMessage,
} from '@/lib/openrouter/client'
import { executeAccountingIntent, getAccountCatalog } from '@/lib/accounting/chat-intents'
import { getAuthContext, trackUsage, AUTH_ERRORS } from '@/lib/permissions/guard'
import { z } from 'zod'

const ChatRequestSchema = z.object({
  session_id: z.string().uuid(),
  business_id: z.string().uuid(),
  message: z.string().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).optional().default([]),
})

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = ChatRequestSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError('Invalid request', 400, parsed.error.flatten())
    }

    const { session_id, business_id, message, history } = parsed.data

    const ctx = await getAuthContext(business_id)
    if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
    if (!ctx.can('use_ai_chat')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })
    if (!ctx.withinLimit('ai')) {
      return NextResponse.json({
        ...AUTH_ERRORS.plan_limit_ai,
        usage: ctx.usage,
        plan: ctx.plan,
      }, { status: 402 })
    }

    const supabase = createClient()
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', session_id)
      .eq('business_id', business_id)
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (sessionError) return jsonError(sessionError.message, 500)
    if (!session) return jsonError('Chat session not found', 404)

    await supabase.from('chat_messages').insert({
      session_id,
      role: 'user',
      content: message,
    })

    const accountCatalog = await getAccountCatalog(business_id)
    const messages: LLMMessage[] = [
      ...history.slice(-8),
      { role: 'user', content: message },
    ]

    const intent = await classifyAccountingIntent({ messages, accountCatalog })
    const validatedIntent = AccountingIntentSchema.parse(intent)
    const execution = await executeAccountingIntent(business_id, validatedIntent)

    const { data: savedMessage } = await supabase
      .from('chat_messages')
      .insert({
        session_id,
        role: 'assistant',
        content: execution.message,
        tool_calls: execution.toolCalls.length > 0 ? execution.toolCalls : null,
      })
      .select()
      .single()

    trackUsage(business_id, 'ai_calls')

    return NextResponse.json({
      message: execution.message,
      message_id: savedMessage?.id,
      intent: validatedIntent.intent,
      tool_calls: execution.toolCalls,
      usage: {
        ai_calls: ctx.usage.ai_calls + 1,
        ai_calls_limit: ctx.usage.ai_calls_limit,
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)

    if (error instanceof OpenRouterConfigError) {
      return jsonError(error.message, 503)
    }

    if (error instanceof OpenRouterUnavailableError) {
      const status = error.status && error.status >= 400 && error.status < 500 ? 502 : 503
      return jsonError(error.message, status)
    }

    if (error instanceof z.ZodError) {
      return jsonError('AI mengembalikan JSON yang tidak valid. Coba ulangi dengan instruksi lebih jelas.', 422, error.flatten())
    }

    return jsonError('AI chat sedang bermasalah. Coba lagi sebentar.', 500)
  }
}
