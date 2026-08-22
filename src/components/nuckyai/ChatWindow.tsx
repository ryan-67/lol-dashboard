import { useEffect, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import { canAcceptChatSubmit } from './chatSessionGuards'
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
  sending?: boolean
  quotaBlocked?: boolean
  onSend: (message: string) => boolean | 'duplicate' | void
  onRegenerate: () => void
  onRetry: (assistantIndex: number) => void
  onStop: () => void
  inputFocusTrigger?: number
  displayName?: string
}

export default function ChatWindow({
  messages,
  streaming,
  sending = false,
  quotaBlocked = false,
  onSend,
  onRegenerate,
  onRetry,
  onStop,
  inputFocusTrigger = 1,
  displayName,
}: ChatWindowProps) {
  const emptyRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const draftRef = useRef(draft)
  const sendLockRef = useRef(false)
  const composerQuietUntilRef = useRef(0)
  const showConversation = messages.length > 0 || streaming || sending
  const inputLocked = streaming || sending || quotaBlocked
  draftRef.current = draft

  useEffect(() => {
    if (streaming || sending) {
      sendLockRef.current = true
      return
    }
    sendLockRef.current = false
  }, [sending, streaming])

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

  const handleSubmitText = (text: string): boolean => {
    if (Date.now() < composerQuietUntilRef.current) return false
    const trimmed = text.trim()
    if (
      !canAcceptChatSubmit({
        text: trimmed,
        sendLocked: sendLockRef.current,
        streaming: inputLocked,
        quotaBlocked,
      })
    ) {
      return false
    }
    sendLockRef.current = true
    draftRef.current = ''
    setDraft('')
    const accepted = onSend(trimmed)
    // In-flight / duplicate must not put a leftover prompt back into the composer.
    if (accepted === false) {
      sendLockRef.current = false
      draftRef.current = trimmed
      setDraft(trimmed)
      return false
    }
    return true
  }

  const handleSend = () => handleSubmitText(draftRef.current)

  const handleRetry = (assistantIndex: number) => {
    composerQuietUntilRef.current = Date.now() + 500
    onRetry(assistantIndex)
  }

  return (
    <section className={`chat-window${showConversation ? '' : ' justify-center'}`}>
      {showConversation ? (
        <MessageList
          messages={messages}
          onRegenerate={onRegenerate}
          onRetry={handleRetry}
          isTyping={streaming || sending}
          streaming={streaming || sending}
        />
      ) : (
        <div className="chat-empty !flex-none" data-lenis-prevent ref={emptyRef}>
          <p className="chat-empty-eyebrow chat-empty-reveal">analyst · evidence-backed</p>
          <h1 className="chat-empty-greeting chat-empty-reveal">{greetingForNow(displayName)}</h1>
          <p className="chat-empty-sub chat-empty-reveal">
            Ask about players, teams, drafts, and series lean — grounded in the same ratings and
            match evidence as the dashboard.
          </p>
          <div className="chat-empty-prompts" role="list" aria-label="Suggested prompts">
            {PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="chat-empty-prompt"
                role="listitem"
                onClick={() => handleSubmitText(prompt)}
              >
                <span className="chat-empty-prompt-slash" aria-hidden="true">
                  /
                </span>
                <span>{prompt}</span>
                <span className="chat-empty-prompt-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={showConversation ? undefined : 'chat-empty-input-slot mx-auto w-full px-6 pb-10'}>
        <ChatInput
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          disabled={inputLocked}
          onStop={onStop}
          focusTrigger={inputFocusTrigger}
          floating={!showConversation}
        />
      </div>
    </section>
  )
}
