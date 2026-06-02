import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble'
import type { MessageRow } from './types'

interface MessageListProps {
  messages: MessageRow[]
  onRegenerate: () => void
  isTyping: boolean
}

export default function MessageList({ messages, onRegenerate, isTyping }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isTyping])

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map((message, idx) => (
        <MessageBubble
          key={`${message.created_at ?? 'm'}-${idx}`}
          message={message}
          isAssistant={message.role === 'assistant'}
          onRegenerate={onRegenerate}
        />
      ))}
      {isTyping && (
        <div className="text-xs text-[var(--text-tertiary)] animate-pulse">nuckyAI is typing...</div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
