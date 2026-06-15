import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble'
import type { MessageRow } from './types'

interface MessageListProps {
  messages: MessageRow[]
  onRegenerate: () => void
  onRetry: () => void
  isTyping: boolean
  streaming?: boolean
}

export default function MessageList({
  messages,
  onRegenerate,
  onRetry,
  isTyping,
  streaming = false,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)

  const updateAutoScrollState = () => {
    const el = containerRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    shouldAutoScrollRef.current = distance <= 200
  }

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages, isTyping])

  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'assistant') return i
    }
    return -1
  })()

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3"
      data-lenis-prevent
      onScroll={updateAutoScrollState}
    >
      {messages.map((message, idx) => (
        <MessageBubble
          key={message.id ?? `${message.role}-${message.created_at ?? idx}-${idx}`}
          message={message}
          isAssistant={message.role === 'assistant'}
          onRegenerate={onRegenerate}
          onRetry={onRetry}
          deferCharts={streaming && idx === lastAssistantIdx}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
