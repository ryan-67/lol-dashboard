import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { useAuth } from '../context/AuthContext'
import { useDashboard } from '../context/DashboardContext'
import { openStripePortal, startStripeCheckout } from '../lib/billing'
import { getAuthRedirectUrl } from '../lib/authRedirect'
import { supabase } from '../lib/supabaseClient'
import { scrollEntrance, scrollEntranceStagger } from '../theme/animations'

interface ProfileSettingsRow {
  username: string | null
  favorite_player: string | null
  favorite_team: string | null
  is_subscribed: boolean | null
  plan: string | null
}

interface SubscriptionRow {
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function UserProfile() {
  const { user } = useAuth()
  const { filteredPlayers, filteredTeams } = useDashboard()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [billingLoading, setBillingLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [favoritePlayer, setFavoritePlayer] = useState('')
  const [favoriteTeam, setFavoriteTeam] = useState('')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [plan, setPlan] = useState<'free' | 'pro'>('free')
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [billingMsg, setBillingMsg] = useState<string | null>(null)

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
      .select('username, favorite_player, favorite_team, is_subscribed, plan')
      .eq('id', user.id)
      .maybeSingle()

    const { data: subData } = await supabase
      .from('subscriptions')
      .select('status, current_period_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const row = (data as ProfileSettingsRow | null) ?? null
    const subRow = (subData as SubscriptionRow | null) ?? null
    const activeSub = subRow?.status === 'active' || subRow?.status === 'trialing'

    setUsername(row?.username ?? '')
    setFavoritePlayer(row?.favorite_player ?? '')
    setFavoriteTeam(row?.favorite_team ?? '')
    setSubscription(subRow)
    setIsSubscribed(Boolean(row?.is_subscribed) || activeSub)
    setPlan(row?.plan === 'pro' || activeSub ? 'pro' : 'free')
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
    const cleanUsername = username.trim()
    const payload = {
      id: user.id,
      username: cleanUsername || null,
      favorite_player: favoritePlayer.trim() || null,
      favorite_team: favoriteTeam.trim() || null,
    }
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' })
    setSaving(false)
    if (error) {
      if (error.code === '23505') {
        setSavedMsg('username already taken.')
      } else {
        setSavedMsg(`save failed: ${error.message}`)
      }
      return
    }
    setSavedMsg('profile updated.')
    window.setTimeout(() => setSavedMsg(null), 1800)
  }, [favoritePlayer, favoriteTeam, user, username])

  const subscribe = useCallback(async () => {
    setBillingLoading(true)
    setBillingMsg(null)
    try {
      const url = await startStripeCheckout()
      window.location.assign(url)
    } catch {
      setBillingMsg('checkout failed. try again.')
    } finally {
      setBillingLoading(false)
    }
  }, [])

  const manageSubscription = useCallback(async () => {
    setBillingLoading(true)
    setBillingMsg(null)
    try {
      const url = await openStripePortal(getAuthRedirectUrl('/profile'))
      window.location.assign(url)
    } catch {
      setBillingMsg('could not open billing portal. try again.')
    } finally {
      setBillingLoading(false)
    }
  }, [])

  if (!user) {
    return (
      <div className="card profile-shell">
        <h2 className="card-title">user profile</h2>
        <p className="text-secondary text-sm mt-2">login required.</p>
      </div>
    )
  }

  const renewalDate = formatDate(subscription?.current_period_end ?? null)

  return (
    <div className="profile-shell page-section space-y-6">
      <section className="card">
        <h2 className="card-title">user profile</h2>
        <p className="card-subtitle mb-0">set your username and favorite defaults for the players view.</p>
      </section>

      <section className="card profile-form space-y-4">
        <div className="profile-field space-y-2">
          <label className="label-field">plan</label>
          <div className="flex items-center gap-3">
            <span className="text-sm uppercase tracking-wide text-[var(--accent)]">{plan}</span>
            {isSubscribed && subscription?.cancel_at_period_end && (
              <span className="text-xs text-[var(--text-secondary)]">cancels at period end</span>
            )}
          </div>
          {isSubscribed && renewalDate && (
            <p className="text-xs text-[var(--text-secondary)]">
              {subscription?.cancel_at_period_end ? 'access until' : 'renews'} {renewalDate}
            </p>
          )}
          <div className="flex items-center gap-3 pt-1">
            {isSubscribed ? (
              <button type="button" className="btn" disabled={billingLoading} onClick={manageSubscription}>
                {billingLoading ? 'loading...' : 'manage / cancel subscription'}
              </button>
            ) : (
              <button type="button" className="btn" disabled={billingLoading} onClick={subscribe}>
                {billingLoading ? 'loading...' : 'upgrade to pro'}
              </button>
            )}
            {billingMsg && <span className="text-xs text-[var(--text-secondary)]">{billingMsg}</span>}
          </div>
        </div>

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
