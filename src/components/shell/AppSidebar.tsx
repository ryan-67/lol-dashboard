import { useEffect, useRef, useState, type ComponentType } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import {
  ChartLine,
  ChatCircleDots,
  Lock,
  Pulse,
  Shield,
  SquaresFour,
  SquareSplitHorizontal,
  Sword,
  Trophy,
  UsersThree,
  type IconProps,
} from '@phosphor-icons/react'
import { useOptionalChatSession } from '../../context/ChatSessionContext'
import { useViewPreference } from '../../context/ViewPreferenceContext'
import EntitySearch from './EntitySearch'
import ProfileMenu from './ProfileMenu'
import SignalLoader from '../ui/SignalLoader'
import { pathForView } from '../../lib/viewPreference'
import {
  conversationHref,
  shouldHandleConversationClick,
  shouldOpenConversationInNewBrowsingContext,
  shouldShowConversationListSkeleton,
} from '../nuckyai/chatSessionGuards'
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

interface DashTab {
  id: string
  label: string
  icon: ComponentType<IconProps>
  gated?: boolean
  tag?: string
}

const DASH_TABS: DashTab[] = [
  { id: 'overview', label: 'overview', icon: SquaresFour },
  { id: 'players', label: 'players', icon: UsersThree },
  { id: 'teams', label: 'teams', icon: Shield },
  { id: 'champions', label: 'champions', icon: Sword },
  { id: 'tournaments', label: 'tournaments', icon: Trophy },
  // V3-3: nav is free; future odds gated inside the page (not a hard wall).
  { id: 'predictions', label: 'predictions', icon: Pulse, tag: 'model' },
]

/** Preserve the current tab when jumping between dashboard and duo. */
function modeTarget(pathname: string, target: ShellMode): string {
  if (target === 'chat') return '/chat'
  const base = target === 'duo' ? '/duo' : '/dashboard'
  const tail = pathname.replace(/^\/(duo|dashboard)/, '')
  if (pathname.startsWith('/duo') || pathname.startsWith('/dashboard')) {
    return `${base}${tail}` || base
  }
  return base
}

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
  return new URL(conversationHref(id), window.location.origin).toString()
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
      <Link
        to={conversationHref(conversation.id)}
        className="app-sidebar-convo"
        target="_self"
        onClick={(e) => {
          if (shouldOpenConversationInNewBrowsingContext(e)) return
          if (!shouldHandleConversationClick(e)) return
          e.preventDefault()
          onSelect()
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          if (shouldOpenConversationInNewBrowsingContext(e)) return
          e.preventDefault()
          e.stopPropagation()
          onSelect()
        }}
      >
        {conversation.title || 'untitled'}
      </Link>
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

  const showChatHistory = (mode === 'duo' || mode === 'chat') && chat?.isSubscribed
  const showNewChat = mode === 'duo' || mode === 'chat'
  const subscribed = Boolean(chat?.isSubscribed)

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
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="6" fill="#0a0d0e" />
              <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="5.4" stroke="#57c4cf" strokeOpacity="0.5" />
              <path d="M8.2 7.2h4.1v9.1L19.7 7.2h4.1v17.6h-4.1v-9.1L12.3 24.8H8.2V7.2Z" fill="#8fe7ee" />
              <path d="M8.2 7.2h1.15v17.6H8.2V7.2Z" fill="#f3f0e7" fillOpacity="0.92" />
              <path d="M22.65 7.2H23.8v17.6h-1.15V7.2Z" fill="#f3f0e7" fillOpacity="0.72" />
              <path d="M12.3 16.3 19.7 7.2h1.05L13.15 16.9l-.85-.6Z" fill="#f3f0e7" fillOpacity="0.55" />
              <path d="M23.8 7.2h1.2l-.35 17.6H23.8V7.2Z" fill="#2a6f76" fillOpacity="0.85" />
            </svg>
          </span>
          <span>nucky</span>
        </Link>

        <nav className="app-mode-switch" aria-label="Workspace mode">
          <NavLink
            to={modeTarget(location.pathname, 'dashboard')}
            className={`app-mode-switch-btn${mode === 'dashboard' ? ' is-active' : ''}`}
            aria-current={mode === 'dashboard' ? 'page' : undefined}
          >
            <ChartLine size={13} aria-hidden />
            <span className="app-mode-switch-label">data</span>
          </NavLink>
          <NavLink
            to={modeTarget(location.pathname, 'duo')}
            title={!subscribed ? 'subscribe for nucky chat' : undefined}
            className={`app-mode-switch-btn${mode === 'duo' ? ' is-active' : ''}${subscribed ? '' : ' is-gated'}`}
            aria-current={mode === 'duo' ? 'page' : undefined}
          >
            <SquareSplitHorizontal size={13} aria-hidden />
            <span className="app-mode-switch-label">duo</span>
          </NavLink>
          <NavLink
            to="/chat"
            title={!subscribed ? 'subscribe for nucky chat' : undefined}
            className={`app-mode-switch-btn${mode === 'chat' ? ' is-active' : ''}${subscribed ? '' : ' is-gated'}`}
            aria-current={mode === 'chat' ? 'page' : undefined}
          >
            <ChatCircleDots size={13} aria-hidden />
            <span className="app-mode-switch-label">chat</span>
          </NavLink>
        </nav>

        {showNewChat ? (
          <button
            type="button"
            className="app-sidebar-new-chat"
            onClick={() => chat?.beginNewChat()}
            disabled={!subscribed}
          >
            + new chat
          </button>
        ) : null}

        <EntitySearch compact placeholder="search…" />

        {mode !== 'chat' ? (
          <nav className="app-sidebar-nav" aria-label="Primary">
            <p className="app-sidebar-section-label app-sidebar-nav-label">analytics</p>
            {DASH_TABS.map((tab) => {
              const gated = Boolean(tab.gated) && !subscribed
              const Icon = tab.icon
              return (
                <NavLink
                  key={tab.id}
                  to={dashPath(mode, tab.id)}
                  end={tab.id === 'overview'}
                  title={
                    gated
                      ? 'subscribe for access'
                      : tab.id === 'predictions'
                        ? 'schedule free · future odds paid'
                        : undefined
                  }
                  className={({ isActive }) =>
                    `app-sidebar-link${isActive ? ' is-active' : ''}${gated ? ' is-gated' : ''}`
                  }
                >
                  <span className="app-sidebar-link-icon">
                    <Icon size={15} aria-hidden />
                  </span>
                  <span className="app-sidebar-link-text">{tab.label}</span>
                  {gated ? (
                    <span className="app-sidebar-link-tag">
                      <Lock size={9} aria-hidden /> {tab.tag ?? ''}
                    </span>
                  ) : tab.tag ? (
                    <span className="app-sidebar-link-tag">{tab.tag}</span>
                  ) : null}
                </NavLink>
              )
            })}
          </nav>
        ) : (
          <p className="app-sidebar-chat-hint">switch to data for boards · duo for split view</p>
        )}
      </div>

      {showChatHistory && chat ? (
        <div
          className={`app-sidebar-conversations${mode === 'chat' ? ' app-sidebar-conversations--focus' : ''}`}
          data-lenis-prevent
        >
          <p className="app-sidebar-section-label">conversations</p>
          {shareToast ? <p className="app-sidebar-convo-toast">{shareToast}</p> : null}
          {shouldShowConversationListSkeleton(chat.conversationsLoading, chat.conversations.length) ? (
            <SignalLoader compact label="loading chats…" />
          ) : chat.conversations.length === 0 ? (
            <div className="app-sidebar-convo-empty" role="status">
              <p className="app-sidebar-muted">no chats yet</p>
              <p className="app-sidebar-muted-hint">pick a prompt or ask anything</p>
            </div>
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
