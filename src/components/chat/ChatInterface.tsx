'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Loader2, Plus, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface ChatInterfaceProps {
  sessionId: string
  businessId: string
  initialMessages?: Message[]
}

const QUICK_PROMPTS = [
  'Saldo kas sekarang berapa?',
  'Bulan ini untung atau rugi?',
  'Catat penjualan hari ini',
  'Tampilkan laporan bulan ini',
]

export default function ChatInterface({
  sessionId,
  businessId,
  initialMessages = []
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      created_at: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      // Build history (last 10 messages for context window efficiency)
      const history = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          business_id: businessId,
          message: text.trim(),
          history
        })
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Gagal mengirim pesan')

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.message,
        created_at: new Date().toISOString()
      }

      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal terhubung ke AI. Coba lagi ya.'
      toast.error(message)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: message,
        created_at: new Date().toISOString()
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [messages, loading, sessionId, businessId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {messages.length === 0 && (
          <EmptyState onPrompt={sendMessage} />
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={msg.id} message={msg} index={i} />
        ))}

        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      {messages.length === 0 && (
        <div className="px-4 pb-2 sm:px-6 lg:px-8 flex gap-2 flex-wrap">
          {QUICK_PROMPTS.map(p => (
            <button
              key={p}
              onClick={() => sendMessage(p)}
              className="chip hover:border-brand-400/50 hover:text-white"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 sm:px-6 lg:px-8">
        <div className="premium-card flex gap-3 items-end p-3 focus-within:border-brand-400/50 focus-within:shadow-focus transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik pesan... (contoh: 'tadi beli kertas 50rb')"
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent resize-none outline-none text-sm
              text-white placeholder:text-surface-500
              max-h-32 leading-relaxed"
            style={{ minHeight: '24px' }}
            onInput={e => {
              const t = e.target as HTMLTextAreaElement
              t.style.height = 'auto'
              t.style.height = `${Math.min(t.scrollHeight, 128)}px`
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-brand-500 shadow-lg shadow-brand-950/30
              flex items-center justify-center
              hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-150 active:scale-95"
          >
            {loading
              ? <Loader2 size={16} className="animate-spin text-white" />
              : <Send size={16} className="text-white" />
            }
          </button>
        </div>
        <p className="text-xs text-surface-600 text-center mt-2">
          Tekan Enter untuk kirim, Shift+Enter untuk baris baru
        </p>
      </div>
    </div>
  )
}

// ============================================================
// Sub-components
// ============================================================

function EmptyState({ onPrompt }: { onPrompt: (p: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 text-center">
      <div className="w-16 h-16 rounded-2xl border border-brand-400/25 bg-brand-500/15 flex items-center justify-center mb-4 shadow-lg shadow-brand-950/25">
        <Sparkles size={28} className="text-brand-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">Halo, saya Akun.AI</h3>
      <p className="text-surface-400 text-sm max-w-sm leading-relaxed">
        Saya bisa bantu catat transaksi, menjawab laporan keuangan,
        dan memberi insight bisnis dengan bahasa sehari-hari.
      </p>
    </div>
  )
}

function MessageBubble({ message, index }: { message: Message; index: number }) {
  const isUser = message.role === 'user'

  return (
    <div
      className={`flex gap-3 message-animate ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
        ${isUser ? 'bg-brand-500 shadow-lg shadow-brand-950/25' : 'bg-surface-800 border border-white/10'}`}>
        {isUser
          ? <User size={14} className="text-white" />
          : <Bot size={14} className="text-brand-400" />
        }
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
          ${isUser
            ? 'bg-brand-500 text-white rounded-tr-sm shadow-lg shadow-brand-950/25'
            : 'bg-surface-900/80 text-surface-100 rounded-tl-sm border border-white/10'
          }`}>
          {message.content}
        </div>
        <span className="text-xs text-surface-600 px-1">
          {new Date(message.created_at).toLocaleTimeString('id-ID', {
            hour: '2-digit', minute: '2-digit'
          })}
        </span>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 message-animate">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-700 border border-surface-600
        flex items-center justify-center">
        <Bot size={14} className="text-brand-400" />
      </div>
      <div className="bg-surface-800 border border-surface-700 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1.5 items-center h-4">
          <div className="w-1.5 h-1.5 rounded-full bg-brand-400 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-brand-400 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-brand-400 typing-dot" />
        </div>
      </div>
    </div>
  )
}
