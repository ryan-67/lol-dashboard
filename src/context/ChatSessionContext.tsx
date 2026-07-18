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
import { useDashboard } from './DashboardContext'
import { useAgentChat } from '../components/nuckyai/useAgentChat'
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
  send: (message: string) => void
  regenerate: () => void
  stop: () => void
  subscribe: () => Promise<void>
  clearToast: () => void
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null)

export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const {
    league,
    year,
    split,
    selectedLeagues,
    selectedYears,
    selectedSplits,
  } = useDashboard()
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
  const [inputFocusTrigger, setInputFocusTrigger] = useState(0)
  const { streaming, sendMessage, stop } = useAgentChat()

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      setIsSubscribed(false)
      setSubscriptionReady(true)
      return
    }
    setSubscriptionReady(false)
    const [{ data: profileData }, subscriptionState] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, avatar_url, is_subscribed, plan')
        .eq('id', user.id)
        .maybeSingle(),
      fetchSubscriptionState(user.id),
    ])
    setProfile((profileData as ProfileRow | null) ?? null)
    setIsSubscribed(subscriptionState.isSubscribed)
    setSubscriptionReady(true)
  }, [user])

  const loadConversations = useCallback(async () => {
    if (!user) return
    setConversationsLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select('id, title, updated_at, created_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    setConversations((data as ConversationRow[] | null) ?? [])
    setConversationsLoading(false)
  }, [user])

  const loadMessages = useCallback(
    async (conversationId: string) => {
      if (!user) return
      const { data, error } = await supabase
        .from('messages')
        .select('id, role, content, created_at')
        .eq('user_id', user.id)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (error) {
        setToast('could not load chat history — try again.')
        return
      }
      setMessages((data as MessageRow[] | null) ?? [])
    },
    [user],
  )

  const selectConversation = useCallback(
    (conversationId: string) => {
      pendingSendRef.current = false
      setActiveConversationId(conversationId)
      const next = new URLSearchParams(searchParams)
      next.set('conversation_id', conversationId)
      setSearchParams(next, { replace: true })
      void loadMessages(conversationId)
    },
    [loadMessages, searchParams, setSearchParams],
  )

  useEffect(() => {
    void (async () => {
      if (!user) {
        setProfile(null)
        setIsSubscribed(false)
        setSubscriptionReady(true)
        return
      }
      setSubscriptionReady(false)
      const state = await fetchSubscriptionState(user.id)
      if (!state.isSubscribed) {
        try {
          await syncStripeSubscription()
        } catch {
          /* ignore */
        }
      }
      await loadProfile()
      await loadConversations()
    })()
  }, [user, loadProfile, loadConversations])

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
    if (!fromQuery || pendingSendRef.current) return
    if (fromQuery === activeConversationId && messages.length > 0) return
    setActiveConversationId(fromQuery)
    void loadMessages(fromQuery)
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const agentFilter = useMemo(
    () => ({
      league,
      year,
      split,
      selectedLeagues,
      selectedYears,
      selectedSplits,
    }),
    [league, year, split, selectedLeagues, selectedYears, selectedSplits],
  )

  const streamAssistant = useCallback(
    (message: string, options?: { skipUserAppend?: boolean }) => {
      const now = new Date().toISOString()
      const displayMessage = message.trim()
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
              { role: 'user' as const, content: displayMessage, created_at: now },
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
        conversationId: activeConversationId ?? undefined,
        filter: agentFilter,
        onMetadata: (conversationId) => {
          setActiveConversationId(conversationId)
          const next = new URLSearchParams(searchParams)
          next.set('conversation_id', conversationId)
          setSearchParams(next, { replace: true })
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
          pendingSendRef.current = false
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
          pendingSendRef.current = false
          setMessages((prev) => {
            const copy = [...prev]
            for (let i = copy.length - 1; i >= 0; i -= 1) {
              if (copy[i].role === 'assistant') {
                copy[i] = { ...copy[i], content: err, retryable: true, thinking: false }
                return copy
              }
            }
            return [
              ...copy,
              { role: 'assistant', content: err, created_at: new Date().toISOString(), retryable: true },
            ]
          })
        },
      })
    },
    [activeConversationId, agentFilter, loadConversations, searchParams, sendMessage, setSearchParams],
  )

  const send = useCallback((message: string) => streamAssistant(message), [streamAssistant])

  const regenerate = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser?.content || streaming) return
    streamAssistant(lastUser.content, { skipUserAppend: true })
  }, [messages, streamAssistant, streaming])

  const beginNewChat = useCallback(() => {
    pendingSendRef.current = false
    setActiveConversationId(null)
    setMessages([])
    setInputFocusTrigger((n) => n + 1)
    const next = new URLSearchParams(searchParams)
    next.delete('conversation_id')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return
      await supabase.from('messages').delete().eq('conversation_id', conversationId).eq('user_id', user.id)
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', user.id)
      if (error) {
        setToast('could not delete chat. try again.')
        return
      }
      if (activeConversationId === conversationId) beginNewChat()
      setConversations((prev) => prev.filter((c) => c.id !== conversationId))
    },
    [activeConversationId, beginNewChat, user],
  )

  const renameConversation = useCallback(
    async (conversationId: string, title: string) => {
      if (!user) return
      const trimmed = title.trim()
      if (!trimmed) return
      const { error } = await supabase
        .from('conversations')
        .update({ title: trimmed, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('user_id', user.id)
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
    [user],
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
