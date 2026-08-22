import { useEffect, useState } from 'react'
import AuthModal from '../AuthModal'
import NuckyAiPaywall from '../nuckyai/NuckyAiPaywall'
import ChatWindow from '../nuckyai/ChatWindow'
import { useChatSession } from '../../context/ChatSessionContext'
import { useProfile } from '../../context/ProfileContext'
import { useAuth } from '../../context/AuthContext'

interface ChatPaneProps {
  /** When true, fill available height without outer card chrome */
  embedded?: boolean
}

function ChatLoading({ embedded }: { embedded: boolean }) {
  return (
    <div className={`chat-pane ${embedded ? 'chat-pane-embedded' : ''}`}>
      <div className="chat-pane-loading" aria-busy="true" aria-live="polite">
        <div className="chat-pane-loading-pulse" />
        <p className="text-secondary text-sm">loading nucky…</p>
      </div>
    </div>
  )
}

export default function ChatPane({ embedded = false }: ChatPaneProps) {
  const { loading: authLoading } = useAuth()
  const chat = useChatSession()
  const { profile } = useProfile()
  const displayName =
    profile?.username ?? chat.profile?.username ?? undefined
  const [composerReady, setComposerReady] = useState(false)

  useEffect(() => {
    if (chat.user && chat.isSubscribed && chat.subscriptionReady) {
      setComposerReady(true)
    }
    if (!chat.user) setComposerReady(false)
  }, [chat.user, chat.isSubscribed, chat.subscriptionReady])

  if (authLoading) {
    return <ChatLoading embedded={embedded} />
  }

  if (!chat.user) {
    return (
      <div className={`chat-pane ${embedded ? 'chat-pane-embedded' : ''}`}>
        <div className="chat-pane-gate">
          <h2 className="chat-pane-title">nucky</h2>
          <NuckyAiPaywall
            onAction={() => chat.setShowAuth(true)}
            actionLabel="unlock beta"
            footnote="login or create an account to continue to checkout."
          />
        </div>
        <AuthModal open={chat.showAuth} onClose={() => chat.setShowAuth(false)} />
      </div>
    )
  }

  if (!chat.subscriptionReady && !composerReady) {
    return <ChatLoading embedded={embedded} />
  }

  if (!chat.isSubscribed && !(composerReady && !chat.subscriptionReady)) {
    return (
      <div className={`chat-pane ${embedded ? 'chat-pane-embedded' : ''}`}>
        <div className="chat-pane-gate">
          <h2 className="chat-pane-title">nucky</h2>
          {chat.toast ? <p className="chat-pane-toast">{chat.toast}</p> : null}
          <NuckyAiPaywall
            onAction={() => void chat.subscribe()}
            actionLabel={chat.checkoutLoading ? 'loading...' : 'unlock beta'}
            actionDisabled={chat.checkoutLoading}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`chat-pane ${embedded ? 'chat-pane-embedded' : ''}`}>
      {chat.toast ? (
        <div className="chat-pane-toast-bar" onClick={() => chat.clearToast()}>
          {chat.toast}
        </div>
      ) : null}
      <ChatWindow
        messages={chat.messages}
        streaming={chat.streaming}
        sending={chat.sending}
        quotaBlocked={chat.quotaBlocked}
        onSend={chat.send}
        onRegenerate={chat.regenerate}
        onRetry={chat.regenerate}
        onStop={chat.stop}
        inputFocusTrigger={chat.inputFocusTrigger || 1}
        displayName={displayName}
      />
    </div>
  )
}
