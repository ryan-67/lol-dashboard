import { useMemo, useState } from 'react'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import SuggestedPrompts from './SuggestedPrompts'
import type { MessageRow } from './types'

interface ChatWindowProps {
  messages: MessageRow[]
  streaming: boolean
  onSend: (message: string) => void
  onRegenerate: () => void
}

export default function ChatWindow({ messages, streaming, onSend, onRegenerate }: ChatWindowProps) {
  const [draft, setDraft] = useState('')
  const isEmpty = useMemo(() => messages.length === 0, [messages.length])

  const send = () => {
    if (!draft.trim()) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    <section className="flex-1 min-h-0 flex flex-col bg-[var(--bg-base)]">
      {isEmpty ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 max-w-2xl">
            <p className="text-sm text-[var(--text-primary)]">who should nuckyAI expose today?</p>
            <SuggestedPrompts onPick={onSend} />
          </div>
        </div>
      ) : (
        <MessageList messages={messages} onRegenerate={onRegenerate} isTyping={streaming} />
      )}
      <ChatInput value={draft} onChange={setDraft} onSend={send} disabled={streaming} />
    </section>
  )
}
