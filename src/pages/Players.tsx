import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import { useAuth } from '../context/AuthContext'
import type { Player } from '../hooks/useDashboardData'
import { TIER1_LEAGUES } from '../lib/mergeSlices'
import {
  ROLES,
  bestPlayerForRole,
  isDisplayablePlayer,
  playersForRole,
  rankPlayersByRole,
  type RoleFilter,
  type RoleKey,
} from '../lib/playerRadar'
import RoleFilterBar from '../components/players/RoleFilterBar'
import PlayerDropdown from '../components/players/PlayerDropdown'
import { playerKey, resolveDefaultPlayerKey } from '../lib/playerAnalytics'
import { supabase } from '../lib/supabaseClient'
import PageHeader, { PageHeaderReadout } from '../components/ui/PageHeader'
import PowerRankingsPanel from '../components/rankings/PowerRankingsPanel'
import SectionSubnav, { type SectionSubnavItem } from '../components/ui/SectionSubnav'
import type { RatingRole } from '../lib/loadPlayerRatings'
import { powerRegionsFromSelectedLeagues } from '../lib/powerRegionFilter'

const PlayerRadarChart = lazy(() => import('../components/players/PlayerRadarChart'))
const PlayerFormChart = lazy(() => import('../components/players/PlayerFormChart'))
const PlayerTrendsCompare = lazy(() => import('../components/players/PlayerTrendsCompare'))
const PlayerMetricsTableCard = lazy(() => import('../components/players/PlayerMetricsTableCard'))

const SUBNAV_ITEMS: SectionSubnavItem[] = [
  { id: 'players-rankings', label: 'Rankings' },
  { id: 'players-radar', label: 'Radar' },
  { id: 'players-compare', label: 'Compare' },
  { id: 'players-tables', label: 'Tables' },
]

export default function Players() {
  const { user } = useAuth()
  const { filteredPlayers, league, selectedLeagues } = useDashboard()
  const deferredPlayers = useDeferredValue(filteredPlayers)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [selectedPlayerKeys, setSelectedPlayerKeys] = useState<string[]>([])
  const [showTable, setShowTable] = useState(false)

  const powerRegions = useMemo(
    () => powerRegionsFromSelectedLeagues(selectedLeagues),
    [selectedLeagues],
  )

  const players = useMemo(
    () =>
      deferredPlayers
        .filter(isDisplayablePlayer)
        .filter((p) => (TIER1_LEAGUES as readonly string[]).includes(p.league))
        // Ranking boards keep a sample floor; early-split players still exist in
        // merged data for tournaments / entity pages / weekly hub.
        .filter((p) => p.games >= 5),
    [deferredPlayers],
  )

  const tier1Players = players

  const roleFilteredPlayers = useMemo(() => {
    if (roleFilter === 'all') return players
    return playersForRole(players, roleFilter)
  }, [players, roleFilter])

  const radarPlayers = useMemo(() => {
    if (roleFilter === 'all') {
      return ROLES.map((role) => {
        const best = bestPlayerForRole(tier1Players, role)
        return best ? { player: best, role } : null
      }).filter((x): x is { player: Player; role: RoleKey } => x !== null)
    }
    const ranked = rankPlayersByRole(players, roleFilter, 10)
    return ranked.map((player) => ({ player, role: roleFilter }))
  }, [players, tier1Players, roleFilter])

  const powerRankingsRole: RatingRole = roleFilter === 'all' ? 'mid' : roleFilter

  const [favoritePlayerName, setFavoritePlayerName] = useState<string | null>(null)
  const [favoriteTeamName, setFavoriteTeamName] = useState<string | null>(null)
  const [favoritesLoaded, setFavoritesLoaded] = useState(false)
  const [heavyReady, setHeavyReady] = useState(false)
  const userPickedRef = useRef(false)

  // Rankings board first; defer Recharts radars/form until the tab is interactive.
  useEffect(() => {
    let cancelled = false
    const arm = () => {
      if (!cancelled) setHeavyReady(true)
    }
    let idleId: number | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(arm, { timeout: 600 })
    } else {
      timeoutId = setTimeout(arm, 0)
    }
    return () => {
      cancelled = true
      if (idleId != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId != null) clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    async function loadProfileDefaults() {
      if (!user) {
        setFavoritePlayerName(null)
        setFavoriteTeamName(null)
        setFavoritesLoaded(true)
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('favorite_player, favorite_team')
        .eq('id', user.id)
        .maybeSingle()
      setFavoritePlayerName((data?.favorite_player as string | null) ?? null)
      setFavoriteTeamName((data?.favorite_team as string | null) ?? null)
      setFavoritesLoaded(true)
    }
    setFavoritesLoaded(false)
    void loadProfileDefaults()
  }, [user])

  useEffect(() => {
    userPickedRef.current = false
  }, [favoritePlayerName, favoriteTeamName])

  useEffect(() => {
    if (!favoritesLoaded || !players.length) return

    setSelectedPlayerKeys((prev) => {
      const valid = prev.filter((key) => players.some((p) => playerKey(p) === key))
      if (userPickedRef.current && valid.length) return valid

      const defaultKey = resolveDefaultPlayerKey(players, favoritePlayerName, favoriteTeamName)
      return defaultKey ? [defaultKey] : []
    })
  }, [favoritePlayerName, favoriteTeamName, favoritesLoaded, players])

  const selectedPlayers = useMemo(
    () =>
      selectedPlayerKeys
        .map((key) => players.find((p) => playerKey(p) === key))
        .filter((p): p is Player => Boolean(p)),
    [players, selectedPlayerKeys],
  )

  return (
    <div className="page-section">
      <PageHeader
        eyebrow="players"
        title="player rankings & form"
        subtitle="Current-form instrument — model power boards, role radars, and last-8-series form signals."
        meta={
          <>
            <PageHeaderReadout label="players" value={players.length} />
            <PageHeaderReadout label="league" value={league} />
          </>
        }
      />
      <SectionSubnav
        items={SUBNAV_ITEMS}
        extra={<RoleFilterBar value={roleFilter} onChange={setRoleFilter} />}
      />

      <section id="players-rankings" className="players-section">
        <PowerRankingsPanel
          limit={8}
          role={powerRankingsRole}
          hideRoleTabs
          regions={powerRegions}
        />
      </section>

      <section id="players-radar" className="players-section">
        {!heavyReady ? (
          <p className="text-secondary text-sm" aria-live="polite">
            loading role radars…
          </p>
        ) : radarPlayers.length === 0 ? (
          <div className="empty-state">No players match the current filters.</div>
        ) : (
          <Suspense fallback={<p className="text-secondary text-sm">loading role radars…</p>}>
            <div className={`radar-grid${roleFilter === 'all' ? ' radar-grid-5' : ''}`}>
              {radarPlayers.map(({ player, role }) => {
                const cohort =
                  roleFilter === 'all'
                    ? playersForRole(tier1Players, role)
                    : playersForRole(players, role)
                return (
                  <PlayerRadarChart
                    key={`${player.name}-${player.team}-${role}`}
                    player={player}
                    role={role}
                    cohort={cohort}
                  />
                )
              })}
            </div>
          </Suspense>
        )}
      </section>

      <section id="players-compare" className="players-section player-analytics-section">
        <PlayerDropdown
          players={players}
          selectedKeys={selectedPlayerKeys}
          favoritePlayerName={favoritePlayerName}
          favoriteTeamName={favoriteTeamName}
          onChange={(keys) => {
            userPickedRef.current = true
            setSelectedPlayerKeys(keys)
          }}
        />
        {heavyReady && selectedPlayers.length > 0 ? (
          <Suspense fallback={<p className="text-secondary text-sm">loading form charts…</p>}>
            <PlayerTrendsCompare players={selectedPlayers} cohortPlayers={players} />
            <PlayerFormChart players={selectedPlayers} cohortPlayers={players} />
          </Suspense>
        ) : null}
      </section>

      <section id="players-tables" className="players-section">
        <div className="players-table-toggle">
          <button type="button" className="btn" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Hide Tables' : 'Show Tables'}
          </button>
        </div>

        {showTable ? (
          <Suspense fallback={<p className="text-secondary text-sm">loading tables…</p>}>
            <PlayerMetricsTableCard
              players={players}
              filteredPlayers={roleFilteredPlayers}
              roleFilter={roleFilter}
            />
          </Suspense>
        ) : null}
      </section>
    </div>
  )
}
