import { useState } from 'react'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import SuggestedPrompts from './SuggestedPrompts'
import type { MessageRow } from './types'

interface ChatWindowProps {
  messages: MessageRow[]
  streaming: boolean
  onSend: (message: string) => void
  onRegenerate: () => void
  onRetry: () => void
  onStop: () => void
  inputFocusTrigger?: number
}

export default function ChatWindow({
  messages,
  streaming,
  onSend,
  onRegenerate,
  onRetry,
  onStop,
  inputFocusTrigger,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('')
  const showConversation = messages.length > 0 || streaming

  const send = () => {
    if (!draft.trim()) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    <section className="flex-1 min-h-0 flex flex-col bg-[var(--bg-base)]">
      {showConversation ? (
        <MessageList
          messages={messages}
          onRegenerate={onRegenerate}
          onRetry={onRetry}
          isTyping={streaming}
          streaming={streaming}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 max-w-2xl">
            <p className="text-sm text-[var(--text-primary)]">ask nucky...</p>
            <SuggestedPrompts onPick={onSend} />
          </div>
        </div>
      )}
      <ChatInput
        value={draft}
        onChange={setDraft}
        onSend={send}
        disabled={streaming}
        onStop={onStop}
        focusTrigger={inputFocusTrigger}
      />
    </section>
  )
}
