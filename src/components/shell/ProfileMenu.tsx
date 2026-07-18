import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../context/ProfileContext'
import AuthModal from '../AuthModal'

export default function ProfileMenu() {
  const { user, loading, signOut } = useAuth()
  const { profile } = useProfile()
  const [open, setOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

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

  const username = profile?.username?.trim() || null
  const initial = (username ?? user.email ?? 'n').slice(0, 1).toUpperCase()
  const displayName = username ? `@${username}` : 'set username'
  const secondaryLine = username ? user.email ?? '' : user.email ?? 'account'

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
          <Link to="/contact" className="profile-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <span className="profile-menu-icon" aria-hidden>
              ✎
            </span>
            contact
          </Link>
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
          {secondaryLine ? <span className="profile-menu-email">{secondaryLine}</span> : null}
        </span>
        <span className="profile-menu-chevrons" aria-hidden>
          ↕
        </span>
      </button>
    </div>
  )
}
