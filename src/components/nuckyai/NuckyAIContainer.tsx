import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { useSearchParams } from 'react-router-dom'
import { startStripeCheckout, syncStripeSubscription } from '../../lib/billing'
import { supabase } from '../../lib/supabaseClient'
import { fetchSubscriptionState } from '../../lib/subscription'
import { scrollEntrance } from '../../theme/animations'
import { useAuth } from '../../context/AuthContext'
import ChatSidebar from './ChatSidebar'
import ChatWindow from './ChatWindow'
import AuthModal from '../AuthModal'
import NuckyAiPaywall from './NuckyAiPaywall'
import { useAgentChat } from './useAgentChat'
import { pickThinkingMessage } from '../../lib/nuckyThinking'
import {
  canAcceptChatSubmit,
  shouldFlipSubscriptionReadyOff,
  shouldReloadConversationMessages,
} from './chatSessionGuards'
import type { ConversationRow, MessageRow, ProfileRow } from './types'

export default function NuckyAIContainer() {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    searchParams.get('conversation_id'),
  )
  /** True while an in-flight send owns the message list — skip DB reloads that would wipe streaming state. */
  const pendingSendRef = useRef(false)
  const sendLockRef = useRef(false)
  const conversationsHydratedRef = useRef(false)
  const resolvedUserIdRef = useRef<string | null>(null)
  const searchParamsRef = useRef(searchParams)
  const activeConversationIdRef = useRef(activeConversationId)
  const messagesRef = useRef(messages)
  const [inputFocusTrigger, setInputFocusTrigger] = useState(0)
  const { streaming, sendMessage, stop } = useAgentChat()

  searchParamsRef.current = searchParams
  activeConversationIdRef.current = activeConversationId
  messagesRef.current = messages

  useGSAP(() => {
    scrollEntrance(document.querySelector('.nuckyai-shell'))
  }, [])

  const applyConversationId = useCallback(
    (conversationId: string | null) => {
      const next = new URLSearchParams(searchParamsRef.current)
      if (conversationId) next.set('conversation_id', conversationId)
      else next.delete('conversation_id')
      setSearchParams(next, { replace: true })
    },
    [setSearchParams],
  )

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      setIsSubscribed(false)
      return
    }
    const [{ data: profileData }, subscriptionState] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, avatar_url, is_subscribed, plan')
        .eq('id', userId)
        .maybeSingle(),
      fetchSubscriptionState(userId),
    ])
    setProfile((profileData as ProfileRow | null) ?? null)
    setIsSubscribed(subscriptionState.isSubscribed)
  }, [userId])

  const loadConversations = useCallback(async () => {
    if (!userId) return
    if (!conversationsHydratedRef.current) setConversationsLoading(true)
    try {
      const { data } = await supabase
        .from('conversations')
        .select('id, title, updated_at, created_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
      setConversations((data as ConversationRow[] | null) ?? [])
      conversationsHydratedRef.current = true
    } finally {
      setConversationsLoading(false)
    }
  }, [userId])

  const loadMessages = useCallback(
    async (conversationId: string) => {
      if (!userId || pendingSendRef.current) return
      const { data, error } = await supabase
        .from('messages')
        .select('id, role, content, created_at')
        .eq('user_id', userId)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (pendingSendRef.current) return
      if (error) {
        console.error('[nuckyAI] failed to load messages', error.message)
        setToast('could not load chat history — try again.')
        return
      }

      setMessages((data as MessageRow[] | null) ?? [])
    },
    [userId],
  )

  const selectConversation = useCallback(
    (conversationId: string) => {
      if (pendingSendRef.current && conversationId === activeConversationIdRef.current) return
      pendingSendRef.current = false
      setActiveConversationId(conversationId)
      applyConversationId(conversationId)
      if (conversationId === activeConversationIdRef.current && messagesRef.current.length > 0) {
        return
      }
      void loadMessages(conversationId)
    },
    [applyConversationId, loadMessages],
  )

  useEffect(() => {
    let cancelled = false

    if (authLoading) return

    if (!userId) {
      const timer = window.setTimeout(() => {
        if (cancelled) return
        resolvedUserIdRef.current = null
        conversationsHydratedRef.current = false
        setProfile(null)
        setIsSubscribed(false)
      }, 400)
      return () => {
        cancelled = true
        window.clearTimeout(timer)
      }
    }

    if (shouldFlipSubscriptionReadyOff(resolvedUserIdRef.current, userId)) {
      conversationsHydratedRef.current = false
    }
    resolvedUserIdRef.current = userId

    void (async () => {
      const state = await fetchSubscriptionState(userId)
      if (cancelled) return
      if (!state.isSubscribed) {
        try {
          await syncStripeSubscription()
        } catch (err) {
          console.warn('[nuckyAI] stripe sync failed', err)
        }
      }
      if (cancelled) return
      await loadProfile()
      if (cancelled) return
      await loadConversations()
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, userId, loadProfile, loadConversations])

  useEffect(() => {
    const checkout = searchParams.get('checkout')
    if (checkout === 'success') {
      const sessionId = searchParams.get('session_id')
      void (async () => {
        try {
          await syncStripeSubscription(sessionId ?? undefined)
        } catch (err) {
          console.warn('[nuckyAI] checkout sync failed', err)
        }
        await loadProfile()
      })()
      setToast('welcome to nuckyAI')
      const next = new URLSearchParams(searchParams)
      next.delete('checkout')
      next.delete('session_id')
      setSearchParams(next, { replace: true })
    } else if (checkout === 'cancel') {
      setToast('no worries - come back anytime')
      const next = new URLSearchParams(searchParams)
      next.delete('checkout')
      setSearchParams(next, { replace: true })
    }
  }, [loadProfile, searchParams, setSearchParams])

  // Restore conversation from URL on mount / external navigation
  useEffect(() => {
    const fromQuery = searchParams.get('conversation_id')
    if (
      !shouldReloadConversationMessages({
        queryId: fromQuery,
        activeId: activeConversationIdRef.current,
        messageCount: messagesRef.current.length,
        sendInFlight: pendingSendRef.current,
      })
    ) {
      return
    }
    setActiveConversationId(fromQuery)
    void loadMessages(fromQuery as string)
  }, [loadMessages, searchParams])

  const releaseSend = useCallback(() => {
    sendLockRef.current = false
    pendingSendRef.current = false
  }, [])

  const streamAssistant = useCallback(
    (message: string, options?: { skipUserAppend?: boolean }): boolean => {
      if (
        !canAcceptChatSubmit({
          text: message,
          sendLocked: sendLockRef.current,
          streaming: sendLockRef.current,
        })
      ) {
        return false
      }

      const now = new Date().toISOString()
      const displayMessage = message.trim()
      sendLockRef.current = true
      pendingSendRef.current = true

      setMessages((prev) => {
        const withoutLastAssistant =
          options?.skipUserAppend && prev.length && prev[prev.length - 1]?.role === 'assistant'
            ? prev.slice(0, -1)
            : prev

        const base = options?.skipUserAppend
          ? withoutLastAssistant
          : [
              ...withoutLastAssistant,
              {
                role: 'user' as const,
                content: displayMessage,
                created_at: now,
              },
            ]

        return [
          ...base,
          {
            role: 'assistant' as const,
            content: pickThinkingMessage(displayMessage),
            created_at: now,
            retryable: false,
            thinking: true,
          },
        ]
      })

      let receivedChunk = false

      void sendMessage({
        message,
        conversationId: activeConversationIdRef.current ?? undefined,
        onMetadata: (conversationId) => {
          setActiveConversationId(conversationId)
          applyConversationId(conversationId)
        },
        onChunk: (chunk) => {
          receivedChunk = true
          setMessages((prev) => {
            const copy = [...prev]
            for (let i = copy.length - 1; i >= 0; i -= 1) {
              if (copy[i].role === 'assistant') {
                const wasThinking = copy[i].thinking
                copy[i] = {
                  ...copy[i],
                  thinking: false,
                  content: wasThinking ? chunk : `${copy[i].content}${chunk}`,
                }
                break
              }
            }
            return copy
          })
        },
        onDone: () => {
          releaseSend()
          if (!receivedChunk) {
            setMessages((prev) => {
              const copy = [...prev]
              for (let i = copy.length - 1; i >= 0; i -= 1) {
                if (copy[i].role === 'assistant' && copy[i].thinking) {
                  copy[i] = {
                    ...copy[i],
                    thinking: false,
                    content: "couldn't get a response — try again.",
                    retryable: true,
                  }
                  break
                }
              }
              return copy
            })
          }
          void loadConversations()
        },
        onError: (err) => {
          releaseSend()
          setMessages((prev) => {
            const copy = [...prev]
            for (let i = copy.length - 1; i >= 0; i -= 1) {
              if (copy[i].role === 'assistant') {
                copy[i] = {
                  ...copy[i],
                  content: err,
                  retryable: true,
                  thinking: false,
                }
                return copy
              }
            }
            return [
              ...copy,
              { role: 'assistant', content: err, created_at: new Date().toISOString(), retryable: true },
            ]
          })
        },
      }).then((started) => {
        if (started === false) releaseSend()
      })
      return true
    },
    [applyConversationId, loadConversations, releaseSend, sendMessage],
  )

  const send = useCallback((message: string) => streamAssistant(message), [streamAssistant])

  const regenerate = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser?.content) return
    streamAssistant(lastUser.content, { skipUserAppend: true })
  }, [messages, streamAssistant])

  const beginNewChat = useCallback(() => {
    pendingSendRef.current = false
    sendLockRef.current = false
    setActiveConversationId(null)
    setMessages([])
    setInputFocusTrigger((n) => n + 1)
    applyConversationId(null)
  }, [applyConversationId])

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!userId) return
      await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', userId)
      if (error) {
        setToast('could not delete chat. try again.')
        return
      }
      if (activeConversationId === conversationId) {
        beginNewChat()
      }
      setConversations((prev) => prev.filter((c) => c.id !== conversationId))
    },
    [activeConversationId, beginNewChat, userId],
  )

  const renameConversation = useCallback(
    async (conversationId: string, title: string) => {
      if (!userId) return
      const trimmed = title.trim()
      if (!trimmed) return

      const { error } = await supabase
        .from('conversations')
        .update({ title: trimmed, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('user_id', userId)

      if (error) {
        setToast('could not rename chat. try again.')
        return
      }

      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, title: trimmed, updated_at: new Date().toISOString() } : c,
        ),
      )
    },
    [userId],
  )

  const heading = useMemo(() => {
    if (!profile) return 'nuckyAI'
    return profile.username ? `nuckyAI — @${profile.username}` : 'nuckyAI'
  }, [profile])

  const subscribe = useCallback(async () => {
    if (!user) return
    setCheckoutLoading(true)
    try {
      const synced = await syncStripeSubscription()
      if (synced.isSubscribed) {
        await loadProfile()
        setToast('welcome to nuckyAI')
        return
      }
      const url = await startStripeCheckout()
      window.location.assign(url)
    } catch {
      setToast('checkout failed. try again.')
    } finally {
      setCheckoutLoading(false)
    }
  }, [user, loadProfile])

  if (!user) {
    return (
      <>
        <div className="card nuckyai-shell">
          <h2 className="card-title">nuckyAI</h2>
          <NuckyAiPaywall
            onAction={() => setShowAuth(true)}
            actionLabel="unlock beta"
            footnote="login or create an account to continue to checkout."
          />
        </div>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
      </>
    )
  }

  if (!isSubscribed) {
    return (
      <div className="card nuckyai-shell">
        <h2 className="card-title">nuckyAI</h2>
        {toast && (
          <div className="mb-3 border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            {toast}
          </div>
        )}
        <NuckyAiPaywall
          onAction={() => void subscribe()}
          actionLabel={checkoutLoading ? 'loading...' : 'unlock beta'}
          actionDisabled={checkoutLoading}
        />
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
      {toast && (
        <div
          className={`border-b border-[var(--border-subtle)] px-3 py-2 text-xs ${
            toast.includes('welcome')
              ? 'bg-[rgba(22,163,74,0.08)] text-[rgb(22,163,74)]'
              : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
          }`}
        >
          {toast}
        </div>
      )}
      <div className="flex-1 min-h-0 flex">
        <ChatSidebar
          conversations={conversations}
          loading={conversationsLoading}
          activeConversationId={activeConversationId}
          onSelect={selectConversation}
          onNewChat={beginNewChat}
          onDelete={(id) => void deleteConversation(id)}
          onRename={(id, title) => void renameConversation(id, title)}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <ChatWindow
          messages={messages}
          streaming={streaming}
          onSend={send}
          onRegenerate={regenerate}
          onRetry={regenerate}
          onStop={stop}
          inputFocusTrigger={inputFocusTrigger}
        />
      </div>
    </div>
  )
}
