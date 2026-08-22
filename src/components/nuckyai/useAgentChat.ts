import { useCallback, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { MessageRow } from './types'

export interface AgentFilterContext {
  league?: string
  split?: string
  year?: string
  selectedLeagues?: string[]
  selectedYears?: string[]
  selectedSplits?: string[]
}

interface SendMessageArgs {
  message: string
  conversationId?: string
  filter?: AgentFilterContext
  onMetadata?: (conversationId: string) => void
  onChunk?: (chunk: string) => void
  onDone?: () => void
  onError?: (message: string) => void
}

interface AgentMetadataEvent {
  type: 'metadata'
  conversation_id: string
}

interface AgentChunkEvent {
  type: 'chunk'
  chunk: string
}

interface AgentErrorEvent {
  type: 'error'
  code: string
  message?: string
  reset_at?: string
}

type AgentSseEvent = AgentMetadataEvent | AgentChunkEvent | AgentErrorEvent

function parseDataLine(line: string): string | null {
  if (!line.startsWith('data:')) return null
  return line.slice(5).trim()
}

function getFunctionUrl(): string {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  return `${base}/functions/v1/agent-chat`
}

function mapHttpError(status: number): string {
  if (status === 401) return 'session expired — log in again.'
  if (status === 403) return 'subscription required — upgrade to chat with nucky.'
  if (status === 429) return 'monthly usage limit reached — check your profile for reset date.'
  if (status >= 500) return 'server error — try again in a moment.'
  return `request failed (${status}). try again.`
}

function mapSseError(event: AgentErrorEvent): string {
  if (event.code === 'quota_exceeded') {
    return event.message ?? 'you\'ve hit your usage limit for the month.'
  }
  if (event.code === 'unauthorized') return 'session expired — log in again.'
  if (event.code === 'forbidden') return 'subscription required — upgrade to chat with nucky.'
  return event.message ?? 'nucky hit an error. try again.'
}

export function useAgentChat() {
  const [streaming, setStreaming] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    inFlightRef.current = false
    setStreaming(false)
  }, [])

  const sendMessage = useCallback(
    async ({
      message,
      conversationId,
      filter,
      onMetadata,
      onChunk,
      onDone,
      onError,
    }: SendMessageArgs): Promise<boolean> => {
      if (inFlightRef.current) return false

      inFlightRef.current = true
      setStreamError(null)
      setStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
        const response = await fetch(getFunctionUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(anonKey ? { apikey: anonKey } : {}),
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({
            message,
            conversation_id: conversationId,
            league: filter?.league,
            split: filter?.split,
            year: filter?.year,
            selectedLeagues: filter?.selectedLeagues,
            selectedYears: filter?.selectedYears,
            selectedSplits: filter?.selectedSplits,
            client_now: new Date().toISOString(),
          }),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error(mapHttpError(response.status))
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        let doneCalled = false
        const finish = () => {
          if (doneCalled) return
          doneCalled = true
          onDone?.()
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const data = parseDataLine(line.trim())
            if (!data) continue
            if (data === '[DONE]') {
              finish()
              continue
            }

            let parsed: AgentSseEvent | null = null
            try {
              parsed = JSON.parse(data) as AgentSseEvent
            } catch {
              parsed = null
            }

            if (!parsed) continue
            if (parsed.type === 'metadata' && parsed.conversation_id) {
              onMetadata?.(parsed.conversation_id)
            }
            if (parsed.type === 'chunk' && parsed.chunk) {
              onChunk?.(parsed.chunk)
            }
            if (parsed.type === 'error') {
              const msg = mapSseError(parsed)
              setStreamError(msg)
              onError?.(msg)
              finish()
              return true
            }
          }
        }
        finish()
        return true
      } catch (err) {
        if (controller.signal.aborted) return true
        const msg =
          err instanceof Error && err.message && !err.message.startsWith('agent request failed')
            ? err.message
            : err instanceof Error
              ? err.message
              : 'nucky is taking a nap. try again.'
        setStreamError(msg)
        onError?.(msg)
        return true
      } finally {
        inFlightRef.current = false
        setStreaming(false)
        abortRef.current = null
      }
    },
    [],
  )

  const appendErrorBubble = useCallback((messages: MessageRow[], message: string): MessageRow[] => {
    return [
      ...messages,
      {
        role: 'assistant',
        content: message,
        created_at: new Date().toISOString(),
      },
    ]
  }, [])

  return {
    streaming,
    streamError,
    sendMessage,
    stop,
    appendErrorBubble,
  }
}
