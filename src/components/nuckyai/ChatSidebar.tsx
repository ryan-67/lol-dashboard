import { useState } from 'react'
import type { ConversationRow } from './types'

interface ChatSidebarProps {
  conversations: ConversationRow[]
  loading?: boolean
  activeConversationId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onDelete: (id: string) => void
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
  loading = false,
  activeConversationId,
  onSelect,
  onNewChat,
  onDelete,
  mobileOpen,
  onCloseMobile,
}: ChatSidebarProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const pendingConversation = conversations.find((c) => c.id === confirmDeleteId)

  const panel = (
    <aside className="w-[280px] border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col h-full relative">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <button type="button" className="btn w-full" onClick={onNewChat}>
          new chat
        </button>
      </div>
      <div className="overflow-y-auto p-2 flex-1 min-h-0">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={`skeleton-${idx}`}
                className="border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-3 animate-pulse"
              >
                <div className="h-3 w-2/3 bg-[var(--bg-elevated)]" />
                <div className="h-2 w-1/3 bg-[var(--bg-elevated)] mt-2" />
              </div>
            ))}
          </div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="text-xs text-[var(--text-tertiary)] px-2 py-3">
            no conversations yet. start one above
          </div>
        )}
        {!loading &&
          conversations.map((conversation) => {
            const active = conversation.id === activeConversationId
            return (
              <div
                key={conversation.id}
                className={`flex items-stretch mb-2 border transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-bg)]'
                    : 'border-[var(--border-subtle)] hover:border-[var(--border-focus)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(conversation.id)
                    onCloseMobile()
                  }}
                  className="flex-1 min-w-0 text-left px-3 py-2"
                >
                  <div className="text-sm text-[var(--text-primary)] truncate">
                    {conversation.title}
                  </div>
                  <div className="text-[11px] text-[var(--text-tertiary)] mt-1">
                    {relativeDate(conversation.updated_at || conversation.created_at)}
                  </div>
                </button>
                <button
                  type="button"
                  className="chat-delete-btn shrink-0 px-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  aria-label={`Delete ${conversation.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmDeleteId(conversation.id)
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
      </div>

      {confirmDeleteId && (
        <div className="chat-delete-confirm" role="dialog" aria-modal="true" aria-labelledby="chat-delete-title">
          <p id="chat-delete-title" className="text-sm text-[var(--text-primary)] mb-3">
            are you sure you want to delete this chat?
          </p>
          {pendingConversation && (
            <p className="text-xs text-[var(--text-secondary)] mb-3 truncate">
              {pendingConversation.title}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn flex-1" onClick={() => setConfirmDeleteId(null)}>
              cancel
            </button>
            <button
              type="button"
              className="btn flex-1"
              onClick={() => {
                onDelete(confirmDeleteId)
                setConfirmDeleteId(null)
              }}
            >
              delete
            </button>
          </div>
        </div>
      )}
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
