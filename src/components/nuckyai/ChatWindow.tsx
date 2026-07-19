import { useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import type { MessageRow } from './types'

const PROMPTS = [
  'analyze faker vs chovy',
  'who wins geng vs t1?',
  'compare canyon and peanut this split',
  'which junglers are overperforming on current patch?',
  'break down T1 draft tendencies in LCK',
] as const

function greetingForNow(name?: string): string {
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${hello}, ${name}` : hello
}

interface ChatWindowProps {
  messages: MessageRow[]
  streaming: boolean
  onSend: (message: string) => void
  onRegenerate: () => void
  onRetry: () => void
  onStop: () => void
  inputFocusTrigger?: number
  displayName?: string
}

export default function ChatWindow({
  messages,
  streaming,
  onSend,
  onRegenerate,
  onRetry,
  onStop,
  inputFocusTrigger = 1,
  displayName,
}: ChatWindowProps) {
  const emptyRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const showConversation = messages.length > 0 || streaming

  useGSAP(
    () => {
      if (showConversation || !emptyRef.current) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      gsap.from(emptyRef.current.querySelectorAll('.chat-empty-reveal'), {
        opacity: 0,
        y: 14,
        duration: 0.5,
        stagger: 0.07,
        ease: 'power3.out',
      })
      gsap.from(emptyRef.current.querySelectorAll('.chat-empty-prompt'), {
        opacity: 0,
        y: 10,
        duration: 0.4,
        stagger: 0.045,
        delay: 0.2,
        ease: 'power2.out',
      })
    },
    { dependencies: [showConversation], scope: emptyRef },
  )

  const send = () => {
    if (!draft.trim()) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    <section className="chat-window">
      {showConversation ? (
        <MessageList
          messages={messages}
          onRegenerate={onRegenerate}
          onRetry={onRetry}
          isTyping={streaming}
          streaming={streaming}
        />
      ) : (
        <div className="chat-empty" data-lenis-prevent ref={emptyRef}>
          <h1 className="chat-empty-greeting chat-empty-reveal">{greetingForNow(displayName)}</h1>
          <p className="chat-empty-sub chat-empty-reveal">
            Ask about players, teams, drafts, and statistics of LoL esports — or search an identity
            to open it in the dashboard.
          </p>
          <div className="chat-empty-input-slot chat-empty-reveal">
            <ChatInput
              value={draft}
              onChange={setDraft}
              onSend={send}
              disabled={streaming}
              onStop={onStop}
              focusTrigger={inputFocusTrigger}
              floating
            />
          </div>
          <div className="chat-empty-prompts">
            {PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="chat-empty-prompt"
                onClick={() => onSend(prompt)}
              >
                <span className="chat-empty-prompt-slash">/</span>
                <span>{prompt}</span>
                <span className="chat-empty-prompt-chevron">›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showConversation ? (
        <ChatInput
          value={draft}
          onChange={setDraft}
          onSend={send}
          disabled={streaming}
          onStop={onStop}
          focusTrigger={inputFocusTrigger}
        />
      ) : null}
    </section>
  )
}
