import { useCallback, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { MessageRow } from './types'

interface SendMessageArgs {
  message: string
  conversationId?: string
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

type AgentSseEvent = AgentMetadataEvent | AgentChunkEvent

function parseDataLine(line: string): string | null {
  if (!line.startsWith('data:')) return null
  return line.slice(5).trim()
}

function getFunctionUrl(): string {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  return `${base}/functions/v1/agent-chat`
}

export function useAgentChat() {
  const [streaming, setStreaming] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }, [])

  const sendMessage = useCallback(
    async ({
      message,
      conversationId,
      onMetadata,
      onChunk,
      onDone,
      onError,
    }: SendMessageArgs) => {
      if (streaming) return

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
          }),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error(`agent request failed (${response.status})`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

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
              onDone?.()
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
          }
        }
      } catch {
        const msg = 'nuckyAI is taking a nap. try again.'
        setStreamError(msg)
        onError?.(msg)
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [streaming],
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
