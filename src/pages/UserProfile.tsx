import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { useAuth } from '../context/AuthContext'
import { useDashboard } from '../context/DashboardContext'
import { openStripePortal, startStripeCheckout, syncStripeSubscription } from '../lib/billing'
import { getAuthRedirectUrl } from '../lib/authRedirect'
import { supabase } from '../lib/supabaseClient'
import { scrollEntrance, scrollEntranceStagger } from '../theme/animations'
import { formatProfileDate } from '../lib/format'
import { useTimezone } from '../context/TimezoneContext'
import {
  fetchMyAgentUsage,
  formatUsagePercent,
  formatUsageResetDate,
  type AgentUsageMonthly,
} from '../lib/agentUsage'
import { useViewPreference } from '../context/ViewPreferenceContext'
import { useProfile } from '../context/ProfileContext'
import { type DefaultView, isDefaultView } from '../lib/viewPreference'
import {
  AVATAR_ACCEPT,
  AVATAR_MAX_BYTES,
  AvatarUploadError,
  removeUserAvatar,
  uploadUserAvatar,
} from '../lib/avatarUpload'

interface ProfileSettingsRow {
  username: string | null
  avatar_url: string | null
  favorite_player: string | null
  favorite_team: string | null
  is_subscribed: boolean | null
  plan: string | null
  timezone: string | null
  default_view: string | null
}

const PROFILE_SELECT =
  'username, avatar_url, favorite_player, favorite_team, is_subscribed, plan, timezone, default_view'

const DEFAULT_VIEW_OPTIONS: { value: DefaultView; label: string; hint: string }[] = [
  { value: 'duo', label: 'duo', hint: 'chat + dashboard side by side' },
  { value: 'chat', label: 'chat', hint: 'full-width nucky chat' },
  { value: 'dashboard', label: 'dashboard', hint: 'full-width analytics' },
]

interface SubscriptionRow {
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
}

function formatDate(value: string | null): string | null {
  return formatProfileDate(value)
}

export default function UserProfile() {
  const { user } = useAuth()
  const { filteredPlayers, filteredTeams } = useDashboard()
  const { timezone, setTimezone, timezoneOptions } = useTimezone()
  const { defaultView, setDefaultView } = useViewPreference()
  const { applyLocalProfile, refreshProfile } = useProfile()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [billingLoading, setBillingLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [favoritePlayer, setFavoritePlayer] = useState('')
  const [favoriteTeam, setFavoriteTeam] = useState('')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [plan, setPlan] = useState<'free' | 'pro'>('free')
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [billingMsg, setBillingMsg] = useState<string | null>(null)
  const [agentUsage, setAgentUsage] = useState<AgentUsageMonthly | null>(null)
  const [homeView, setHomeView] = useState<DefaultView>(defaultView)

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

  const applyRow = useCallback((row: ProfileSettingsRow | null, subRow: SubscriptionRow | null) => {
    const activeSub = subRow?.status === 'active' || subRow?.status === 'trialing'
    setUsername(row?.username ?? '')
    setAvatarUrl(row?.avatar_url ?? null)
    setFavoritePlayer(row?.favorite_player ?? '')
    setFavoriteTeam(row?.favorite_team ?? '')
    setSubscription(subRow)
    setIsSubscribed(Boolean(row?.is_subscribed) || activeSub)
    setPlan(row?.plan === 'pro' || activeSub ? 'pro' : 'free')
    if (row && isDefaultView(row.default_view)) {
      setHomeView(row.default_view)
    }
  }, [])

  const loadProfile = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let data: ProfileSettingsRow | null = null
    const primary = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', user.id).maybeSingle()

    if (primary.error) {
      // Older DBs may lack default_view — retry without it so username still loads.
      const fallback = await supabase
        .from('profiles')
        .select('username, avatar_url, favorite_player, favorite_team, is_subscribed, plan, timezone')
        .eq('id', user.id)
        .maybeSingle()
      data = fallback.data
        ? ({ ...(fallback.data as object), default_view: null } as ProfileSettingsRow)
        : null
    } else {
      data = (primary.data as ProfileSettingsRow | null) ?? null
    }

    const { data: subData } = await supabase
      .from('subscriptions')
      .select('status, current_period_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let row = (data as ProfileSettingsRow | null) ?? null
    let subRow = (subData as SubscriptionRow | null) ?? null
    let activeSub = subRow?.status === 'active' || subRow?.status === 'trialing'

    if (!activeSub && !row?.is_subscribed && row?.plan !== 'pro') {
      try {
        const synced = await syncStripeSubscription()
        if (synced.isSubscribed) {
          const [{ data: refreshed }, { data: refreshedSub }] = await Promise.all([
            supabase.from('profiles').select(PROFILE_SELECT).eq('id', user.id).maybeSingle(),
            supabase
              .from('subscriptions')
              .select('status, current_period_end, cancel_at_period_end')
              .eq('user_id', user.id)
              .in('status', ['active', 'trialing'])
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ])
          row = (refreshed as ProfileSettingsRow | null) ?? row
          subRow = (refreshedSub as SubscriptionRow | null) ?? subRow
          activeSub = subRow?.status === 'active' || subRow?.status === 'trialing'
        }
      } catch {
        // Stripe sync is best-effort; profile still loads from DB.
      }
    }

    applyRow(row, subRow)

    const subscribed = Boolean(row?.is_subscribed) || activeSub
    if (subscribed) {
      const usage = await fetchMyAgentUsage()
      setAgentUsage(usage)
    } else {
      setAgentUsage(null)
    }

    setLoading(false)
  }, [applyRow, user])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  useGSAP(() => {
    scrollEntrance(document.querySelector('.profile-shell'))
    scrollEntranceStagger(document.querySelector('.profile-form'), '.profile-field')
  }, [])

  const persistAvatarUrl = useCallback(
    async (nextUrl: string | null) => {
      if (!user) return
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, avatar_url: nextUrl }, { onConflict: 'id' })
      if (error) throw error
      setAvatarUrl(nextUrl)
      applyLocalProfile({ id: user.id, avatar_url: nextUrl })
      await refreshProfile()
    },
    [applyLocalProfile, refreshProfile, user],
  )

  const onAvatarPick = useCallback(
    async (file: File | null) => {
      if (!user || !file) return
      setAvatarUploading(true)
      setSavedMsg(null)
      try {
        const url = await uploadUserAvatar(user.id, file)
        await persistAvatarUrl(url)
        setSavedMsg('avatar updated.')
        window.setTimeout(() => setSavedMsg(null), 1800)
      } catch (err) {
        const msg =
          err instanceof AvatarUploadError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'avatar upload failed.'
        setSavedMsg(msg)
      } finally {
        setAvatarUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [persistAvatarUrl, user],
  )

  const onAvatarRemove = useCallback(async () => {
    if (!user) return
    setAvatarUploading(true)
    setSavedMsg(null)
    try {
      await removeUserAvatar(user.id)
      await persistAvatarUrl(null)
      setSavedMsg('avatar removed.')
      window.setTimeout(() => setSavedMsg(null), 1800)
    } catch (err) {
      setSavedMsg(err instanceof Error ? err.message : 'could not remove avatar.')
    } finally {
      setAvatarUploading(false)
    }
  }, [persistAvatarUrl, user])

  const save = useCallback(async () => {
    if (!user) return
    setSaving(true)
    setSavedMsg(null)
    const cleanUsername = username.trim().replace(/^@+/, '').toLowerCase()
    if (cleanUsername && !/^[a-z0-9_]{2,24}$/.test(cleanUsername)) {
      setSaving(false)
      setSavedMsg('username: 2–24 chars, letters/numbers/underscore only.')
      return
    }

    // Upsert core identity fields first so username/favorites always stick even if
    // optional columns (default_view) are missing on older DBs.
    const coreFields = {
      id: user.id,
      username: cleanUsername || null,
      favorite_player: favoritePlayer.trim() || null,
      favorite_team: favoriteTeam.trim() || null,
      avatar_url: avatarUrl,
      timezone,
    }

    const { data: saved, error: coreError } = await supabase
      .from('profiles')
      .upsert(coreFields, { onConflict: 'id' })
      .select('id, username, avatar_url, favorite_player, favorite_team')
      .single()

    if (coreError) {
      setSaving(false)
      if (coreError.code === '23505') {
        setSavedMsg('username already taken.')
      } else {
        setSavedMsg(`save failed: ${coreError.message}`)
      }
      return
    }

    // Persist default home separately so a missing column can't block username save.
    let viewError: string | null = null
    try {
      await setDefaultView(homeView)
    } catch (err) {
      viewError = err instanceof Error ? err.message : 'default home failed'
    }

    // Re-affirm timezone to DB (also saved on select change).
    const { error: tzError } = await supabase
      .from('profiles')
      .upsert({ id: user.id, timezone }, { onConflict: 'id' })

    const nextUsername = saved?.username ?? (cleanUsername || null)
    const nextAvatar = saved?.avatar_url ?? avatarUrl
    const nextPlayer = saved?.favorite_player ?? (favoritePlayer.trim() || null)
    const nextTeam = saved?.favorite_team ?? (favoriteTeam.trim() || null)

    applyLocalProfile({
      id: user.id,
      username: nextUsername,
      avatar_url: nextAvatar,
      favorite_player: nextPlayer,
      favorite_team: nextTeam,
    })
    await refreshProfile()
    setUsername(nextUsername ?? '')
    setAvatarUrl(nextAvatar)

    setSaving(false)
    if (tzError) {
      setSavedMsg(`profile saved, but timezone sync failed: ${tzError.message}`)
      return
    }
    if (viewError) {
      setSavedMsg(`profile saved, but default home sync failed: ${viewError}`)
      return
    }
    setSavedMsg('profile updated.')
    window.setTimeout(() => setSavedMsg(null), 1800)
  }, [
    applyLocalProfile,
    avatarUrl,
    favoritePlayer,
    favoriteTeam,
    homeView,
    refreshProfile,
    setDefaultView,
    timezone,
    user,
    username,
  ])

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
  const usagePercent =
    agentUsage != null
      ? formatUsagePercent(agentUsage.tokens_used, agentUsage.tokens_limit)
      : 0
  const avatarInitial = (username.trim() || user.email || 'n').slice(0, 1).toUpperCase()

  return (
    <div className="profile-shell page-section space-y-6">
      <section className="card">
        <h2 className="card-title">user profile</h2>
        <p className="card-subtitle mb-0">
          set your username, avatar, and favorite defaults. changes stay until you update them again.
        </p>
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
          {isSubscribed && agentUsage && (
            <div className="profile-usage">
              <div className="profile-usage-header">
                <span className="profile-usage-label">nucky usage this month</span>
                <span className="profile-usage-pct">{usagePercent}%</span>
              </div>
              <div
                className="profile-usage-bar"
                role="progressbar"
                aria-valuenow={usagePercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="nucky monthly token usage"
              >
                <div className="profile-usage-bar-fill" style={{ width: `${usagePercent}%` }} />
              </div>
              <p className="profile-usage-reset">
                resets {formatUsageResetDate(agentUsage.reset_at)}
              </p>
            </div>
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
              <label className="label-field">avatar</label>
              <div className="profile-avatar-row">
                <div className="profile-avatar-preview" aria-hidden>
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{avatarInitial}</span>}
                </div>
                <div className="profile-avatar-actions">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={AVATAR_ACCEPT}
                    className="sr-only"
                    id="profile-avatar-input"
                    disabled={avatarUploading}
                    onChange={(e) => void onAvatarPick(e.target.files?.[0] ?? null)}
                  />
                  <label
                    htmlFor="profile-avatar-input"
                    className={`btn${avatarUploading ? ' opacity-50 pointer-events-none' : ''}`}
                  >
                    {avatarUploading ? 'uploading…' : avatarUrl ? 'change photo' : 'upload photo'}
                  </label>
                  {avatarUrl ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={avatarUploading}
                      onClick={() => void onAvatarRemove()}
                    >
                      remove
                    </button>
                  ) : null}
                  <p className="text-xs text-[var(--text-secondary)]">
                    JPEG, PNG, WebP, or GIF · up to {Math.round(AVATAR_MAX_BYTES / (1024 * 1024))} MB ·
                    cropped square · shown in the sidebar (and later in hub discussions).
                  </p>
                </div>
              </div>
            </div>

            <div className="profile-field space-y-2">
              <label className="label-field">username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={24}
                className="w-full border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                placeholder="pick a username"
                autoComplete="username"
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

            <div className="profile-field space-y-2">
              <label className="label-field">timezone</label>
              <select
                value={timezone}
                onChange={(e) => void setTimezone(e.target.value)}
                className="w-full border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
              >
                {timezoneOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[var(--text-secondary)]">
                Dates and times on nucky.gg default to PST/PDT. Selecting a timezone updates
                displayed dates and times to match your preference.
              </p>
            </div>

            <div className="profile-field space-y-2">
              <label className="label-field">default home</label>
              <div className="space-y-2" role="radiogroup" aria-label="Default home view">
                {DEFAULT_VIEW_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-start gap-3 cursor-pointer text-sm text-[var(--text-primary)]"
                  >
                    <input
                      type="radio"
                      name="default-view"
                      value={opt.value}
                      checked={homeView === opt.value}
                      onChange={() => setHomeView(opt.value)}
                      className="mt-1 accent-[var(--accent)]"
                    />
                    <span>
                      <span className="uppercase tracking-wide text-[var(--accent)]">{opt.label}</span>
                      <span className="block text-xs text-[var(--text-secondary)]">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                where you land after sign-in. current mode still follows the URL you open.
              </p>
            </div>

            <div className="profile-field flex items-center gap-3">
              <button
                type="button"
                className="btn"
                disabled={saving || avatarUploading}
                onClick={() => void save()}
              >
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
