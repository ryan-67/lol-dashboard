import type { ConversationRow } from './types'

interface ChatSidebarProps {
  conversations: ConversationRow[]
  activeConversationId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

function relativeDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const deltaMs = Date.now() - d.getTime()
  const hours = Math.floor(deltaMs / 3_600_000)
  if (hours < 1) return 'now'
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export default function ChatSidebar({
  conversations,
  activeConversationId,
  onSelect,
  onNewChat,
  mobileOpen,
  onCloseMobile,
}: ChatSidebarProps) {
  const panel = (
    <aside className="w-[280px] border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col h-full">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <button type="button" className="btn w-full" onClick={onNewChat}>
          new chat
        </button>
      </div>
      <div className="overflow-y-auto p-2">
        {conversations.map((conversation) => {
          const active = conversation.id === activeConversationId
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => {
                onSelect(conversation.id)
                onCloseMobile()
              }}
              className={`w-full text-left border px-3 py-2 mb-2 transition-colors ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-bg)]'
                  : 'border-[var(--border-subtle)] hover:border-[var(--border-focus)]'
              }`}
            >
              <div className="text-sm text-[var(--text-primary)] truncate">{conversation.title}</div>
              <div className="text-[11px] text-[var(--text-tertiary)] mt-1">
                {relativeDate(conversation.updated_at || conversation.created_at)}
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )

  return (
    <>
      <div className="hidden md:flex h-full">{panel}</div>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-[rgba(12,12,12,0.9)]" onClick={onCloseMobile}>
          <div className="h-full w-[280px]" onClick={(e) => e.stopPropagation()}>
            {panel}
          </div>
        </div>
      )}
    </>
  )
}
