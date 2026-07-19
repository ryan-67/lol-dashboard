import { useEffect, useRef, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useOptionalChatSession } from '../../context/ChatSessionContext'
import { useViewPreference } from '../../context/ViewPreferenceContext'
import EntitySearch from './EntitySearch'
import ProfileMenu from './ProfileMenu'
import { pathForView } from '../../lib/viewPreference'
import type { ConversationRow } from '../nuckyai/types'

type ShellMode = 'duo' | 'chat' | 'dashboard'

function detectMode(pathname: string): ShellMode {
  if (pathname.startsWith('/duo')) return 'duo'
  if (pathname.startsWith('/chat')) return 'chat'
  return 'dashboard'
}

function dashPath(mode: ShellMode, tab: string): string {
  if (mode === 'duo') return tab === 'overview' ? '/duo' : `/duo/${tab}`
  return tab === 'overview' ? '/dashboard' : `/dashboard/${tab}`
}

const DASH_TABS = [
  { id: 'overview', label: 'overview' },
  { id: 'players', label: 'players' },
  { id: 'teams', label: 'teams' },
  { id: 'champions', label: 'champions' },
  { id: 'tournaments', label: 'tournaments' },
  { id: 'matchups', label: 'matchups' },
  { id: 'predictions', label: 'nucky prediction model', gated: true },
] as const

function MenuDotsIcon() {
  return (
    <span className="app-sidebar-convo-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

function conversationShareUrl(id: string): string {
  const url = new URL('/chat', window.location.origin)
  url.searchParams.set('conversation_id', id)
  return url.toString()
}

interface ConversationItemProps {
  conversation: ConversationRow
  active: boolean
  onSelect: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onShare: (id: string) => void
}

function ConversationItem({
  conversation,
  active,
  onSelect,
  onRename,
  onDelete,
  onShare,
}: ConversationItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(conversation.title || '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  useEffect(() => {
    if (!renaming) return
    renameInputRef.current?.focus()
    renameInputRef.current?.select()
  }, [renaming])

  const submitRename = () => {
    const next = renameValue.trim()
    if (!next) return
    onRename(conversation.id, next)
    setRenaming(false)
  }

  if (renaming) {
    return (
      <li className="app-sidebar-convo-row is-renaming">
        <input
          ref={renameInputRef}
          type="text"
          className="app-sidebar-convo-rename-input"
          value={renameValue}
          maxLength={120}
          aria-label="Rename conversation"
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitRename()
            if (e.key === 'Escape') {
              setRenaming(false)
              setRenameValue(conversation.title || '')
            }
          }}
          onBlur={() => {
            // Allow click on save via mousedown first; cancel if empty
            if (!renameValue.trim()) {
              setRenaming(false)
              setRenameValue(conversation.title || '')
            }
          }}
        />
        <button type="button" className="app-sidebar-convo-rename-save" onMouseDown={(e) => e.preventDefault()} onClick={submitRename}>
          save
        </button>
      </li>
    )
  }

  if (confirmDelete) {
    return (
      <li className="app-sidebar-convo-row is-confirm-delete">
        <span className="app-sidebar-convo-confirm-label">delete this chat?</span>
        <button
          type="button"
          className="app-sidebar-convo-confirm-btn"
          onClick={() => setConfirmDelete(false)}
        >
          cancel
        </button>
        <button
          type="button"
          className="app-sidebar-convo-confirm-btn is-danger"
          onClick={() => {
            onDelete(conversation.id)
            setConfirmDelete(false)
          }}
        >
          delete
        </button>
      </li>
    )
  }

  return (
    <li className={`app-sidebar-convo-row${active ? ' is-active' : ''}${menuOpen ? ' is-menu-open' : ''}`}>
      <button type="button" className="app-sidebar-convo" onClick={onSelect}>
        {conversation.title || 'untitled'}
      </button>
      <div className="app-sidebar-convo-menu-wrap" ref={menuOpen ? menuRef : undefined}>
        <button
          type="button"
          className="app-sidebar-convo-menu-btn"
          aria-label={`Options for ${conversation.title || 'untitled'}`}
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
        >
          <MenuDotsIcon />
        </button>
        {menuOpen ? (
          <div className="app-sidebar-convo-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className="app-sidebar-convo-menu-item"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                onShare(conversation.id)
              }}
            >
              share
            </button>
            <button
              type="button"
              role="menuitem"
              className="app-sidebar-convo-menu-item"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                setRenameValue(conversation.title || '')
                setRenaming(true)
              }}
            >
              rename
            </button>
            <button
              type="button"
              role="menuitem"
              className="app-sidebar-convo-menu-item is-danger"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                setConfirmDelete(true)
              }}
            >
              delete
            </button>
          </div>
        ) : null}
      </div>
    </li>
  )
}

export default function AppSidebar() {
  const location = useLocation()
  const mode = detectMode(location.pathname)
  const { defaultView, homePath } = useViewPreference()
  const chat = useOptionalChatSession()
  const [shareToast, setShareToast] = useState<string | null>(null)

  // Chat-preference + on /chat: collapse dash tabs to single Dashboard link
  const chatOnlyNav = mode === 'chat' && defaultView === 'chat'
  const showChatHistory = (mode === 'duo' || mode === 'chat') && chat?.isSubscribed
  const showNewChat = mode === 'duo' || mode === 'chat'
  const showNuckyLink = mode === 'dashboard'

  const handleShare = async (id: string) => {
    const url = conversationShareUrl(id)
    try {
      await navigator.clipboard.writeText(url)
      setShareToast('link copied')
      chat?.clearToast()
    } catch {
      setShareToast('could not copy link')
    }
    window.setTimeout(() => setShareToast(null), 1800)
  }

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-top">
        <Link to={homePath || pathForView(defaultView)} className="app-sidebar-brand">
          <span className="nucky-mark" aria-hidden>
            N
          </span>
          <span>nucky</span>
        </Link>

        {showNewChat ? (
          <button
            type="button"
            className="app-sidebar-new-chat"
            onClick={() => chat?.beginNewChat()}
            disabled={!chat?.isSubscribed}
          >
            + new chat
          </button>
        ) : null}

        <EntitySearch compact placeholder="search…" />

        <nav className="app-sidebar-nav" aria-label="Primary">
          {showNuckyLink ? (
            <NavLink to={homePath || pathForView(defaultView)} className="app-sidebar-link">
              nucky
            </NavLink>
          ) : null}

          {chatOnlyNav ? (
            <NavLink to="/dashboard" className="app-sidebar-link">
              dashboard
            </NavLink>
          ) : (
            <>
              <p className="app-sidebar-section-label app-sidebar-nav-label">analytics</p>
              {DASH_TABS.map((tab) => {
                const gated = 'gated' in tab && tab.gated && !chat?.isSubscribed
                return (
                  <NavLink
                    key={tab.id}
                    to={dashPath(mode, tab.id)}
                    end={tab.id === 'overview'}
                    title={gated ? 'subscribe for access' : undefined}
                    className={({ isActive }) =>
                      `app-sidebar-link${isActive ? ' is-active' : ''}${gated ? ' is-gated' : ''}`
                    }
                  >
                    {tab.label}
                  </NavLink>
                )
              })}
            </>
          )}
        </nav>
      </div>

      {showChatHistory && chat ? (
        <div className="app-sidebar-conversations" data-lenis-prevent>
          <p className="app-sidebar-section-label">conversations</p>
          {shareToast ? <p className="app-sidebar-convo-toast">{shareToast}</p> : null}
          {chat.conversationsLoading ? (
            <p className="app-sidebar-muted">loading…</p>
          ) : chat.conversations.length === 0 ? (
            <p className="app-sidebar-muted">no chats yet</p>
          ) : (
            <ul className="app-sidebar-convo-list">
              {chat.conversations.map((c) => (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  active={c.id === chat.activeConversationId}
                  onSelect={() => chat.selectConversation(c.id)}
                  onRename={(id, title) => void chat.renameConversation(id, title)}
                  onDelete={(id) => void chat.deleteConversation(id)}
                  onShare={(id) => void handleShare(id)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="app-sidebar-spacer" />
      )}

      <ProfileMenu />
    </aside>
  )
}
