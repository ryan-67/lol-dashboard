import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { fetchSubscriptionState } from '../../lib/subscription'
import AuthModal from '../AuthModal'

export default function ProfileMenu() {
  const { user, loading, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!user) {
        if (mounted) setUsername(null)
        return
      }
      const { profile } = await fetchSubscriptionState(user.id)
      if (mounted) setUsername((profile?.username as string | null) ?? null)
    }
    void load()
    return () => {
      mounted = false
    }
  }, [user])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  if (loading) return null

  if (!user) {
    return (
      <div className="profile-menu profile-menu-guest">
        <button type="button" className="profile-menu-login" onClick={() => setShowAuth(true)}>
          sign in
        </button>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} initialView="signin" />
      </div>
    )
  }

  const initial = (username ?? user.email ?? 'n').slice(0, 1).toUpperCase()
  const displayName = username ? `@${username}` : user.email ?? 'account'

  return (
    <div className="profile-menu" ref={wrapRef}>
      {open ? (
        <div className="profile-menu-flyout" role="menu">
          <Link to="/profile" className="profile-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <span className="profile-menu-icon" aria-hidden>
              ⚙
            </span>
            settings
          </Link>
          <a
            href="mailto:geonbu@nucky.gg?subject=nucky%20feedback"
            className="profile-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className="profile-menu-icon" aria-hidden>
              ✎
            </span>
            a problem? an idea?
          </a>
          <button
            type="button"
            className="profile-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              void signOut()
            }}
          >
            <span className="profile-menu-icon" aria-hidden>
              →
            </span>
            sign out
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="profile-menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="profile-menu-avatar" aria-hidden>
          {initial}
        </span>
        <span className="profile-menu-meta">
          <span className="profile-menu-name">{displayName}</span>
          <span className="profile-menu-email">{user.email}</span>
        </span>
        <span className="profile-menu-chevrons" aria-hidden>
          ↕
        </span>
      </button>
    </div>
  )
}
