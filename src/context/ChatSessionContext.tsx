import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { startStripeCheckout, syncStripeSubscription } from '../lib/billing'
import { supabase } from '../lib/supabaseClient'
import { fetchSubscriptionState } from '../lib/subscription'
import { pickThinkingMessage } from '../lib/nuckyThinking'
import { useAuth } from './AuthContext'
import { useAgentChat } from '../components/nuckyai/useAgentChat'
import {
  appendPendingTurn,
  applyStreamChunk,
  applyStreamDone,
  applyStreamError,
  canAcceptChatSubmit,
  createChatRequestId,
  hydrateLoadedMessages,
  isAuxiliaryBlankHref,
  shouldFlipSubscriptionReadyOff,
  shouldReloadConversationMessages,
} from '../components/nuckyai/chatSessionGuards'
import type { ConversationRow, MessageRow, ProfileRow } from '../components/nuckyai/types'

interface ChatSessionContextValue {
  user: ReturnType<typeof useAuth>['user']
  profile: ProfileRow | null
  isSubscribed: boolean
  /** False until first subscription resolve for the current user. */
  subscriptionReady: boolean
  conversations: ConversationRow[]
  conversationsLoading: boolean
  messages: MessageRow[]
  streaming: boolean
  sending: boolean
  quotaBlocked: boolean
  activeConversationId: string | null
  toast: string | null
  checkoutLoading: boolean
  inputFocusTrigger: number
  showAuth: boolean
  setShowAuth: (open: boolean) => void
  selectConversation: (id: string) => void
  beginNewChat: () => void
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  send: (message: string) => boolean
  regenerate: () => void
  stop: () => void
  subscribe: () => Promise<void>
  clearToast: () => void
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null)

export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [subscriptionReady, setSubscriptionReady] = useState(false)
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    searchParams.get('conversation_id'),
  )
  const pendingSendRef = useRef(false)
  const sendLockRef = useRef(false)
  const activeRequestIdRef = useRef<string | null>(null)
  const conversationsHydratedRef = useRef(false)
  const resolvedUserIdRef = useRef<string | null>(null)
  const searchParamsRef = useRef(searchParams)
  const activeConversationIdRef = useRef(activeConversationId)
  const messagesRef = useRef(messages)
  const [sending, setSending] = useState(false)
  const [quotaBlocked, setQuotaBlocked] = useState(false)
  const [inputFocusTrigger, setInputFocusTrigger] = useState(0)
  const { streaming, sendMessage, stop: stopStream } = useAgentChat()

  searchParamsRef.current = searchParams
  activeConversationIdRef.current = activeConversationId
  messagesRef.current = messages

  const applyConversationId = useCallback(
    (conversationId: string | null) => {
      if (conversationId && isAuxiliaryBlankHref(conversationId)) return
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
      setSubscriptionReady(true)
      return
    }
    try {
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
      setSubscriptionReady(true)
    } catch {
      setSubscriptionReady(true)
    }
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
        setToast('could not load chat history — try again.')
        return
      }
      setMessages(hydrateLoadedMessages((data as MessageRow[] | null) ?? []))
    },
    [userId],
  )

  const selectConversation = useCallback(
    (conversationId: string) => {
      if (pendingSendRef.current && conversationId === activeConversationIdRef.current) return
      if (pendingSendRef.current) {
        stopStream()
      }
      pendingSendRef.current = false
      sendLockRef.current = false
      activeRequestIdRef.current = null
      setSending(false)
      setActiveConversationId(conversationId)
      applyConversationId(conversationId)
      if (
        conversationId === activeConversationIdRef.current &&
        messagesRef.current.length > 0
      ) {
        return
      }
      void loadMessages(conversationId)
    },
    [applyConversationId, loadMessages, stopStream],
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
        setSubscriptionReady(true)
      }, 400)
      return () => {
        cancelled = true
        window.clearTimeout(timer)
      }
    }

    if (shouldFlipSubscriptionReadyOff(resolvedUserIdRef.current, userId)) {
      setSubscriptionReady(false)
      conversationsHydratedRef.current = false
    }
    resolvedUserIdRef.current = userId

    void (async () => {
      try {
        const state = await fetchSubscriptionState(userId)
        if (cancelled) return
        if (!state.isSubscribed) {
          try {
            await syncStripeSubscription()
          } catch {
            /* ignore */
          }
        }
        if (cancelled) return
        await loadProfile()
        if (cancelled) return
        await loadConversations()
      } catch {
        if (!cancelled) setSubscriptionReady(true)
      }
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
        } catch {
          /* ignore */
        }
        await loadProfile()
      })()
      setToast('welcome to nucky')
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

  const releaseSend = useCallback((requestId?: string) => {
    if (requestId && activeRequestIdRef.current && activeRequestIdRef.current !== requestId) {
      return
    }
    sendLockRef.current = false
    pendingSendRef.current = false
    activeRequestIdRef.current = null
    setSending(false)
  }, [])

  const streamAssistant = useCallback(
    (message: string, options?: { skipUserAppend?: boolean }): boolean => {
      if (isAuxiliaryBlankHref(window.location.href)) return false
      if (
        !canAcceptChatSubmit({
          text: message,
          sendLocked: sendLockRef.current,
          streaming: sendLockRef.current,
          quotaBlocked,
        })
      ) {
        return false
      }

      const now = new Date().toISOString()
      const displayMessage = message.trim()
      const requestId = createChatRequestId()
      sendLockRef.current = true
      pendingSendRef.current = true
      activeRequestIdRef.current = requestId
      setSending(true)

      setMessages((prev) =>
        appendPendingTurn(prev, {
          requestId,
          text: displayMessage,
          thinking: pickThinkingMessage(displayMessage),
          createdAt: now,
          skipUserAppend: options?.skipUserAppend,
        }),
      )

      let receivedChunk = false
      void sendMessage({
        message,
        conversationId: activeConversationIdRef.current ?? undefined,
        onMetadata: (conversationId) => {
          if (activeRequestIdRef.current !== requestId) return
          setActiveConversationId(conversationId)
          applyConversationId(conversationId)
        },
        onChunk: (chunk) => {
          if (!chunk.trim()) return
          receivedChunk = true
          setMessages((prev) => applyStreamChunk(prev, requestId, chunk))
        },
        onDone: () => {
          setMessages((prev) => applyStreamDone(prev, requestId, receivedChunk))
          releaseSend(requestId)
          void loadConversations()
        },
        onError: (err) => {
          if (err.kind === 'quota') setQuotaBlocked(true)
          setMessages((prev) => applyStreamError(prev, requestId, err))
          releaseSend(requestId)
        },
      }).then((started) => {
        if (started === false) releaseSend(requestId)
      })
      return true
    },
    [applyConversationId, loadConversations, quotaBlocked, releaseSend, sendMessage],
  )

  const send = useCallback((message: string) => streamAssistant(message), [streamAssistant])

  const regenerate = useCallback(() => {
    if (quotaBlocked) return
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (lastAssistant?.kind === 'error' && lastAssistant.errorKind === 'quota') return
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser?.content) return
    streamAssistant(lastUser.content, { skipUserAppend: true })
  }, [messages, quotaBlocked, streamAssistant])

  const beginNewChat = useCallback(() => {
    if (pendingSendRef.current) stopStream()
    pendingSendRef.current = false
    sendLockRef.current = false
    activeRequestIdRef.current = null
    setSending(false)
    setActiveConversationId(null)
    setMessages([])
    setInputFocusTrigger((n) => n + 1)
    applyConversationId(null)
  }, [applyConversationId, stopStream])

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!userId) return
      await supabase.from('messages').delete().eq('conversation_id', conversationId).eq('user_id', userId)
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', userId)
      if (error) {
        setToast('could not delete chat. try again.')
        return
      }
      if (activeConversationId === conversationId) beginNewChat()
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

  const subscribe = useCallback(async () => {
    if (!user) return
    setCheckoutLoading(true)
    try {
      const synced = await syncStripeSubscription()
      if (synced.isSubscribed) {
        await loadProfile()
        setToast('welcome to nucky')
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

  const stop = useCallback(() => {
    const requestId = activeRequestIdRef.current
    stopStream()
    if (requestId) {
      setMessages((prev) => applyStreamDone(prev, requestId, false))
    }
    releaseSend(requestId ?? undefined)
  }, [releaseSend, stopStream])

  const value = useMemo<ChatSessionContextValue>(
    () => ({
      user,
      profile,
      isSubscribed,
      subscriptionReady,
      conversations,
      conversationsLoading,
      messages,
      streaming,
      sending,
      quotaBlocked,
      activeConversationId,
      toast,
      checkoutLoading,
      inputFocusTrigger,
      showAuth,
      setShowAuth,
      selectConversation,
      beginNewChat,
      deleteConversation,
      renameConversation,
      send,
      regenerate,
      stop,
      subscribe,
      clearToast: () => setToast(null),
    }),
    [
      user,
      profile,
      isSubscribed,
      subscriptionReady,
      conversations,
      conversationsLoading,
      messages,
      streaming,
      sending,
      quotaBlocked,
      activeConversationId,
      toast,
      checkoutLoading,
      inputFocusTrigger,
      showAuth,
      selectConversation,
      beginNewChat,
      deleteConversation,
      renameConversation,
      send,
      regenerate,
      stop,
      subscribe,
    ],
  )

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
}

export function useChatSession() {
  const ctx = useContext(ChatSessionContext)
  if (!ctx) throw new Error('useChatSession must be used within ChatSessionProvider')
  return ctx
}

export function useOptionalChatSession() {
  return useContext(ChatSessionContext)
}
