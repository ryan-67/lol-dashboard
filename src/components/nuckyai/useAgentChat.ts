import { useCallback, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { classifyChatError, interpretAgentSseData } from './chatSessionGuards'
import type { AgentChatError, MessageRow } from './types'

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
  onError?: (error: AgentChatError) => void
}

function parseDataLine(line: string): string | null {
  if (!line.startsWith('data:')) return null
  return line.slice(5).trim()
}

function getFunctionUrl(): string {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  return `${base}/functions/v1/agent-chat`
}

function mapHttpError(status: number): AgentChatError {
  if (status === 401) return classifyChatError('401')
  if (status === 403) return classifyChatError('403')
  if (status === 429) return classifyChatError('429')
  if (status >= 500) return classifyChatError('500')
  return classifyChatError(undefined, `request failed (${status}). try again.`)
}

export function useAgentChat() {
  const [streaming, setStreaming] = useState(false)
  const [streamError, setStreamError] = useState<AgentChatError | null>(null)
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

      const emitError = (error: AgentChatError) => {
        setStreamError(error)
        onError?.(error)
      }

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
          emitError(mapHttpError(response.status))
          return true
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let settled = false

        const finishOk = () => {
          if (settled) return
          settled = true
          onDone?.()
        }

        const finishError = (error: AgentChatError) => {
          if (settled) return
          settled = true
          emitError(error)
        }

        const handleData = (data: string) => {
          if (settled) return
          const event = interpretAgentSseData(data)
          if (event.type === 'done') {
            finishOk()
            return
          }
          if (event.type === 'metadata') {
            onMetadata?.(event.conversationId)
            return
          }
          if (event.type === 'chunk') {
            onChunk?.(event.text)
            return
          }
          if (event.type === 'error') {
            finishError(event.error)
          }
        }

        const consume = (text: string, flushRemainder: boolean) => {
          buffer += text
          const lines = buffer.split('\n')
          if (!flushRemainder) {
            buffer = lines.pop() ?? ''
          } else {
            buffer = ''
          }
          for (const line of lines) {
            const data = parseDataLine(line.trim())
            if (!data) continue
            handleData(data)
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (value) consume(decoder.decode(value, { stream: true }), false)
          if (done) {
            consume(decoder.decode(), true)
            break
          }
        }
        if (!settled) finishOk()
        return true
      } catch (err) {
        if (controller.signal.aborted) return true
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'nucky is taking a nap. try again.'
        emitError(classifyChatError(undefined, msg))
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
        kind: 'error',
        errorKind: 'unknown',
        retryable: true,
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
