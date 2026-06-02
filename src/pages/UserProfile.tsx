import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { useAuth } from '../context/AuthContext'
import { useDashboard } from '../context/DashboardContext'
import { supabase } from '../lib/supabaseClient'
import { scrollEntrance, scrollEntranceStagger } from '../theme/animations'

interface ProfileSettingsRow {
  username: string | null
  favorite_player: string | null
  favorite_team: string | null
}

export default function UserProfile() {
  const { user } = useAuth()
  const { filteredPlayers, filteredTeams } = useDashboard()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [username, setUsername] = useState('')
  const [favoritePlayer, setFavoritePlayer] = useState('')
  const [favoriteTeam, setFavoriteTeam] = useState('')
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const playerOptions = useMemo(() => {
    return Array.from(new Set(filteredPlayers.map((player) => player.name).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    )
  }, [filteredPlayers])

  const teamOptions = useMemo(() => {
    return Array.from(new Set(filteredTeams.map((team) => team.name).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    )
  }, [filteredTeams])

  const loadProfile = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('username, favorite_player, favorite_team')
      .eq('id', user.id)
      .maybeSingle()
    const row = (data as ProfileSettingsRow | null) ?? null
    setUsername(row?.username ?? '')
    setFavoritePlayer(row?.favorite_player ?? '')
    setFavoriteTeam(row?.favorite_team ?? '')
    setLoading(false)
  }, [user])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  useGSAP(() => {
    scrollEntrance(document.querySelector('.profile-shell'))
    scrollEntranceStagger(document.querySelector('.profile-form'), '.profile-field')
  }, [])

  const save = useCallback(async () => {
    if (!user) return
    setSaving(true)
    const payload = {
      username: username.trim() || null,
      favorite_player: favoritePlayer.trim() || null,
      favorite_team: favoriteTeam.trim() || null,
    }
    const { error } = await supabase.from('profiles').update(payload).eq('id', user.id)
    setSaving(false)
    if (error) {
      setSavedMsg('save failed. try again.')
      return
    }
    setSavedMsg('profile updated.')
    window.setTimeout(() => setSavedMsg(null), 1800)
  }, [favoritePlayer, favoriteTeam, user, username])

  if (!user) {
    return (
      <div className="card profile-shell">
        <h2 className="card-title">user profile</h2>
        <p className="text-secondary text-sm mt-2">login required.</p>
      </div>
    )
  }

  return (
    <div className="profile-shell page-section space-y-6">
      <section className="card">
        <h2 className="card-title">user profile</h2>
        <p className="card-subtitle mb-0">set your username and favorite defaults for the players view.</p>
      </section>

      <section className="card profile-form space-y-4">
        {loading ? (
          <div className="text-sm text-[var(--text-secondary)]">loading profile...</div>
        ) : (
          <>
            <div className="profile-field space-y-2">
              <label className="label-field">username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={24}
                className="w-full border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                placeholder="pick a username"
              />
            </div>

            <div className="profile-field space-y-2">
              <label className="label-field">favorite player</label>
              <select
                value={favoritePlayer}
                onChange={(e) => setFavoritePlayer(e.target.value)}
                className="w-full border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
              >
                <option value="">none</option>
                {playerOptions.map((player) => (
                  <option key={player} value={player}>
                    {player}
                  </option>
                ))}
              </select>
            </div>

            <div className="profile-field space-y-2">
              <label className="label-field">favorite team</label>
              <select
                value={favoriteTeam}
                onChange={(e) => setFavoriteTeam(e.target.value)}
                className="w-full border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
              >
                <option value="">none</option>
                {teamOptions.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </div>

            <div className="profile-field flex items-center gap-3">
              <button type="button" className="btn" disabled={saving} onClick={save}>
                {saving ? 'saving...' : 'save profile'}
              </button>
              {savedMsg && <span className="text-xs text-[var(--accent)]">{savedMsg}</span>}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
