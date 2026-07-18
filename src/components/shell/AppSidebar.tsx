import { NavLink, Link, useLocation } from 'react-router-dom'
import { useOptionalChatSession } from '../../context/ChatSessionContext'
import { useViewPreference } from '../../context/ViewPreferenceContext'
import EntitySearch from './EntitySearch'
import ProfileMenu from './ProfileMenu'

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
] as const

export default function AppSidebar() {
  const location = useLocation()
  const mode = detectMode(location.pathname)
  const { defaultView } = useViewPreference()
  const chat = useOptionalChatSession()

  // Chat-preference + on /chat: collapse dash tabs to single Dashboard link
  const chatOnlyNav = mode === 'chat' && defaultView === 'chat'
  const showChatHistory = (mode === 'duo' || mode === 'chat') && chat?.isSubscribed
  const showNewChat = mode === 'duo' || mode === 'chat'
  const showNuckyLink = mode === 'dashboard'

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-top">
        <Link to={mode === 'duo' ? '/duo' : mode === 'chat' ? '/chat' : '/dashboard'} className="app-sidebar-brand">
          <span className="app-sidebar-mark" aria-hidden>
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
            <NavLink to="/chat" className="app-sidebar-link">
              nucky
            </NavLink>
          ) : null}

          {chatOnlyNav ? (
            <NavLink to="/dashboard" className="app-sidebar-link">
              dashboard
            </NavLink>
          ) : (
            DASH_TABS.map((tab) => (
              <NavLink
                key={tab.id}
                to={dashPath(mode, tab.id)}
                end={tab.id === 'overview'}
                className={({ isActive }) => `app-sidebar-link${isActive ? ' is-active' : ''}`}
              >
                {tab.label}
              </NavLink>
            ))
          )}
        </nav>
      </div>

      {showChatHistory ? (
        <div className="app-sidebar-conversations" data-lenis-prevent>
          <p className="app-sidebar-section-label">conversations</p>
          {chat.conversationsLoading ? (
            <p className="app-sidebar-muted">loading…</p>
          ) : chat.conversations.length === 0 ? (
            <p className="app-sidebar-muted">no chats yet</p>
          ) : (
            <ul className="app-sidebar-convo-list">
              {chat.conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`app-sidebar-convo${c.id === chat.activeConversationId ? ' is-active' : ''}`}
                    onClick={() => chat.selectConversation(c.id)}
                  >
                    {c.title || 'untitled'}
                  </button>
                </li>
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
