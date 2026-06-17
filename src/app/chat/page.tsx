import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChatInterface from '@/components/chat/ChatInterface'
import type { ChatMessage } from '@/types'

export default async function ChatPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
        title: `Chat ${new Date().toLocaleDateString('id-ID')}`
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
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-surface-800 bg-surface-900/80 backdrop-blur-sm">
        <h1 className="font-semibold text-white">Chat dengan Akun.AI</h1>
        <p className="text-xs text-surface-400">{business.name} - Ketik natural, AI yang ngerjain sisanya</p>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-hidden">
        {session && (
          <ChatInterface
            sessionId={session.id}
            businessId={business.id}
            initialMessages={messages}
          />
        )}
      </div>
    </div>
  )
}
