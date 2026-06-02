import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { scrollEntrance } from '../../theme/animations'
import { useAuth } from '../../context/AuthContext'
import ChatSidebar from './ChatSidebar'
import ChatWindow from './ChatWindow'
import { useAgentChat } from './useAgentChat'
import type { ConversationRow, MessageRow, ProfileRow } from './types'

export default function NuckyAIContainer() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    searchParams.get('conversation_id'),
  )
  const { streaming, sendMessage, appendErrorBubble } = useAgentChat()

  useGSAP(() => {
    scrollEntrance(document.querySelector('.nuckyai-shell'))
  }, [])

  const isSubscribed = !!profile?.is_subscribed

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, is_subscribed, plan')
      .eq('id', user.id)
      .maybeSingle()
    setProfile((data as ProfileRow | null) ?? null)
  }, [user])

  const loadConversations = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('conversations')
      .select('id, title, updated_at, created_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    setConversations((data as ConversationRow[] | null) ?? [])
  }, [user])

  const loadMessages = useCallback(
    async (conversationId: string) => {
      if (!user) return
      const { data } = await supabase
        .from('messages')
        .select('id, role, content, created_at')
        .eq('user_id', user.id)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      setMessages((data as MessageRow[] | null) ?? [])
    },
    [user],
  )

  useEffect(() => {
    void loadProfile()
    void loadConversations()
  }, [loadProfile, loadConversations])

  useEffect(() => {
    const fromQuery = searchParams.get('conversation_id')
    if (fromQuery && fromQuery !== activeConversationId) {
      setActiveConversationId(fromQuery)
    }
  }, [searchParams, activeConversationId])

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }
    void loadMessages(activeConversationId)
  }, [activeConversationId, loadMessages])

  const send = useCallback(
    (message: string) => {
      const now = new Date().toISOString()
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: message, created_at: now },
        { role: 'assistant', content: '', created_at: now },
      ])

      void sendMessage({
        message,
        conversationId: activeConversationId ?? undefined,
        onMetadata: (conversationId) => {
          setActiveConversationId(conversationId)
          const next = new URLSearchParams(searchParams)
          next.set('conversation_id', conversationId)
          setSearchParams(next, { replace: true })
        },
        onChunk: (chunk) => {
          setMessages((prev) => {
            const copy = [...prev]
            for (let i = copy.length - 1; i >= 0; i -= 1) {
              if (copy[i].role === 'assistant') {
                copy[i] = { ...copy[i], content: `${copy[i].content}${chunk}` }
                break
              }
            }
            return copy
          })
        },
        onDone: () => {
          void loadConversations()
          if (activeConversationId) {
            void loadMessages(activeConversationId)
          }
        },
        onError: (err) => {
          setMessages((prev) => appendErrorBubble(prev, err))
        },
      })
    },
    [activeConversationId, appendErrorBubble, loadConversations, loadMessages, searchParams, sendMessage, setSearchParams],
  )

  const regenerate = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser?.content) return
    send(lastUser.content)
  }, [messages, send])

  const beginNewChat = useCallback(() => {
    setActiveConversationId(null)
    setMessages([])
    const next = new URLSearchParams(searchParams)
    next.delete('conversation_id')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const heading = useMemo(() => {
    if (!profile) return 'nuckyAI'
    return profile.username ? `nuckyAI — @${profile.username}` : 'nuckyAI'
  }, [profile])

  if (!user) {
    return (
      <div className="card nuckyai-shell">
        <h2 className="card-title">nuckyAI</h2>
        <p className="text-secondary text-sm mt-3">login required.</p>
      </div>
    )
  }

  if (!isSubscribed) {
    return (
      <div className="card nuckyai-shell">
        <h2 className="card-title">nuckyAI</h2>
        <p className="text-secondary text-sm mt-3">nuckyAI is only available with a subscription.</p>
      </div>
    )
  }

  return (
    <div className="card nuckyai-shell p-0 overflow-hidden h-[calc(100vh-220px)] min-h-[620px] flex flex-col">
      <div className="border-b border-[var(--border-subtle)] px-3 py-2 flex items-center justify-between bg-[var(--bg-surface)]">
        <h2 className="text-sm text-[var(--text-primary)]">{heading}</h2>
        <button
          type="button"
          className="md:hidden border border-[var(--border-subtle)] px-2 py-1 text-xs text-[var(--text-secondary)]"
          onClick={() => setMobileSidebarOpen(true)}
        >
          chats
        </button>
      </div>
      <div className="flex-1 min-h-0 flex">
        <ChatSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={setActiveConversationId}
          onNewChat={beginNewChat}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <ChatWindow messages={messages} streaming={streaming} onSend={send} onRegenerate={regenerate} />
      </div>
    </div>
  )
}
