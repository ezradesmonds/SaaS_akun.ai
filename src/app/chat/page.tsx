import FinancialInsights from '@/components/dashboard/FinancialInsights'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChatInterface from '@/components/chat/ChatInterface'
import type { ChatMessage } from '@/types'

export default async function ChatPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Get business
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('user_id', user.id)
    .single()

  if (!business) redirect('/settings?setup=true')

  // Get or create chat session (always use latest session today)
  let session

  const { data: existing } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('business_id', business.id)
    .eq('user_id', user.id)
    .gte('created_at', new Date().toISOString().split('T')[0])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) {
    session = existing
  } else {
    const { data: newSession } = await supabase
      .from('chat_sessions')
      .insert({
        business_id: business.id,
        user_id: user.id,
        title: `Chat ${new Date().toLocaleDateString('id-ID')}`,
      })
      .select()
      .single()
    session = newSession
  }

  // Get messages for this session
  let messages: ChatMessage[] = []
  if (session) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(50)

    messages = data || []
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-surface-800 bg-surface-900/80 backdrop-blur-sm">
        <h1 className="font-semibold text-white">AI Assistant</h1>
        <p className="text-xs text-surface-400">
          {business.name} - Baca data bisnis dan periksa draft sebelum mencatat
        </p>
      </div>

      {/* Chat area */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-[600px] min-w-0 xl:min-h-0">
          {session && (
            <ChatInterface
              sessionId={session.id}
              businessId={business.id}
              initialMessages={messages}
            />
          )}
        </div>
        <aside className="overflow-y-auto border-l border-white/10 p-5">
          <FinancialInsights businessId={business.id} />
        </aside>
      </div>
    </div>
  )
}
