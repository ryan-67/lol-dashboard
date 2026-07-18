import AuthModal from '../AuthModal'
import NuckyAiPaywall from '../nuckyai/NuckyAiPaywall'
import ChatWindow from '../nuckyai/ChatWindow'
import { useChatSession } from '../../context/ChatSessionContext'

interface ChatPaneProps {
  /** When true, fill available height without outer card chrome */
  embedded?: boolean
}

export default function ChatPane({ embedded = false }: ChatPaneProps) {
  const chat = useChatSession()

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

  if (!chat.isSubscribed) {
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
        onSend={chat.send}
        onRegenerate={chat.regenerate}
        onRetry={chat.regenerate}
        onStop={chat.stop}
        inputFocusTrigger={chat.inputFocusTrigger || 1}
        displayName={chat.profile?.username ?? chat.user.email?.split('@')[0] ?? undefined}
      />
    </div>
  )
}
