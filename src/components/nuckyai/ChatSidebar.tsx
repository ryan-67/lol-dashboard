import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import {
  conversationHref,
  shouldHandleConversationClick,
  shouldOpenConversationInNewBrowsingContext,
  shouldShowConversationListSkeleton,
} from './chatSessionGuards'
import type { ConversationRow } from './types'

interface ChatSidebarProps {
  conversations: ConversationRow[]
  loading?: boolean
  activeConversationId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
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

function MenuDotsIcon() {
  return (
    <span className="chat-sidebar-menu-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

export default function ChatSidebar({
  conversations,
  loading = false,
  activeConversationId,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
  mobileOpen,
  onCloseMobile,
}: ChatSidebarProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const pendingConversation = conversations.find((c) => c.id === confirmDeleteId)
  const renamingConversation = conversations.find((c) => c.id === renameId)

  useEffect(() => {
    if (!menuOpenId) return
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpenId])

  useEffect(() => {
    if (!renameId) return
    renameInputRef.current?.focus()
    renameInputRef.current?.select()
  }, [renameId])

  const submitRename = () => {
    if (!renameId) return
    const next = renameValue.trim()
    if (!next) return
    onRename(renameId, next)
    setRenameId(null)
    setRenameValue('')
  }

  const handleConversationClick = (e: MouseEvent<HTMLAnchorElement>, conversationId: string) => {
    if (shouldOpenConversationInNewBrowsingContext(e)) return
    if (!shouldHandleConversationClick(e)) return
    e.preventDefault()
    onSelect(conversationId)
    onCloseMobile()
  }

  const handleConversationKeyDown = (e: KeyboardEvent<HTMLAnchorElement>, conversationId: string) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    if (shouldOpenConversationInNewBrowsingContext(e)) return
    e.preventDefault()
    e.stopPropagation()
    onSelect(conversationId)
    onCloseMobile()
  }

  const panel = (
    <aside className="w-[280px] border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col h-full relative">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <button type="button" className="btn w-full" onClick={onNewChat}>
          new chat
        </button>
      </div>
      <div className="overflow-y-auto p-2 flex-1 min-h-0" data-lenis-prevent>
        {shouldShowConversationListSkeleton(loading, conversations.length) && (
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
        {!shouldShowConversationListSkeleton(loading, conversations.length) &&
          conversations.length === 0 && (
          <div className="text-xs text-[var(--text-tertiary)] px-2 py-3">
            no conversations yet. start one above
          </div>
        )}
        {!shouldShowConversationListSkeleton(loading, conversations.length) &&
          conversations.map((conversation) => {
            const active = conversation.id === activeConversationId
            const menuOpen = menuOpenId === conversation.id
            return (
              <div
                key={conversation.id}
                className={`flex items-stretch mb-2 border transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-bg)]'
                    : 'border-[var(--border-subtle)] hover:border-[var(--border-focus)]'
                }`}
              >
                <a
                  href={conversationHref(conversation.id)}
                  target="_self"
                  onClick={(e) => handleConversationClick(e, conversation.id)}
                  onKeyDown={(e) => handleConversationKeyDown(e, conversation.id)}
                  className="flex-1 min-w-0 text-left px-3 py-2"
                >
                  <div className="text-sm text-[var(--text-primary)] truncate">
                    {conversation.title}
                  </div>
                  <div className="text-[11px] text-[var(--text-tertiary)] mt-1">
                    {relativeDate(conversation.updated_at || conversation.created_at)}
                  </div>
                </a>
                <div className="relative shrink-0" ref={menuOpen ? menuRef : undefined}>
                  <button
                    type="button"
                    className="chat-sidebar-menu-btn"
                    aria-label={`Options for ${conversation.title}`}
                    aria-expanded={menuOpen}
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpenId(menuOpen ? null : conversation.id)
                    }}
                  >
                    <MenuDotsIcon />
                  </button>
                  {menuOpen && (
                    <div className="chat-sidebar-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="chat-sidebar-menu-item"
                        onClick={async (e) => {
                          e.stopPropagation()
                          setMenuOpenId(null)
                          try {
                            await navigator.clipboard.writeText(
                              new URL(conversationHref(conversation.id), window.location.origin).toString(),
                            )
                          } catch {
                            /* ignore */
                          }
                        }}
                      >
                        share
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="chat-sidebar-menu-item"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpenId(null)
                          setRenameId(conversation.id)
                          setRenameValue(conversation.title)
                        }}
                      >
                        rename
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="chat-sidebar-menu-item chat-sidebar-menu-item--danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpenId(null)
                          setConfirmDeleteId(conversation.id)
                        }}
                      >
                        delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
      </div>

      {renameId && (
        <div
          className="chat-sidebar-rename"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-rename-title"
        >
          <p id="chat-rename-title" className="text-sm text-[var(--text-primary)] mb-3">
            rename chat
          </p>
          {renamingConversation && (
            <p className="text-xs text-[var(--text-tertiary)] mb-2 truncate">
              was: {renamingConversation.title}
            </p>
          )}
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="chat-sidebar-rename-input"
            maxLength={120}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename()
              if (e.key === 'Escape') {
                setRenameId(null)
                setRenameValue('')
              }
            }}
          />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              className="btn flex-1"
              onClick={() => {
                setRenameId(null)
                setRenameValue('')
              }}
            >
              cancel
            </button>
            <button
              type="button"
              className="btn flex-1"
              disabled={!renameValue.trim()}
              onClick={submitRename}
            >
              save
            </button>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div
          className="chat-delete-confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-delete-title"
        >
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
              className="btn flex-1 chat-sidebar-menu-item--danger"
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
