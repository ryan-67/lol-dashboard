import { useEffect, useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
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
import PlayerRadarChart from '../components/players/PlayerRadarChart'
import PlayerDropdown from '../components/players/PlayerDropdown'
import PlayerFormChart from '../components/players/PlayerFormChart'
import PlayerChampionPool from '../components/players/PlayerChampionPool'
import PlayerConsistencyStrip from '../components/players/PlayerConsistencyStrip'
import PlayerMetricsTableCard from '../components/players/PlayerMetricsTableCard'
import { playerKey, resolveDefaultPlayerKey } from '../lib/playerAnalytics'
import { scrollEntranceStagger, refreshScrollTrigger } from '../theme/animations'
import { supabase } from '../lib/supabaseClient'
import PageHeader from '../components/ui/PageHeader'
import PowerRankingsPanel from '../components/rankings/PowerRankingsPanel'

export default function Players() {
  const { user } = useAuth()
  const { filteredPlayers, league, split } = useDashboard()
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [selectedPlayerKeys, setSelectedPlayerKeys] = useState<string[]>([])
  const [showTable, setShowTable] = useState(false)

  const players = useMemo(
    () => filteredPlayers.filter(isDisplayablePlayer).filter((p) => (TIER1_LEAGUES as readonly string[]).includes(p.league)),
    [filteredPlayers],
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

  const radarGridRef = useRef<HTMLDivElement>(null)
  const analyticsRef = useRef<HTMLDivElement>(null)
  const [favoritePlayerName, setFavoritePlayerName] = useState<string | null>(null)
  const [favoriteTeamName, setFavoriteTeamName] = useState<string | null>(null)
  const [favoritesLoaded, setFavoritesLoaded] = useState(false)
  const userPickedRef = useRef(false)

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

  useGSAP(
    () => {
      scrollEntranceStagger(analyticsRef.current, '.player-chart-card')
    },
    { scope: analyticsRef, dependencies: [selectedPlayers.length, league, split] },
  )

  useGSAP(
    () => {
      scrollEntranceStagger(radarGridRef.current, '.radar-card')
    },
    { scope: radarGridRef, dependencies: [roleFilter, league, split, radarPlayers.length] },
  )

  useEffect(() => {
    requestAnimationFrame(() => refreshScrollTrigger())
  }, [roleFilter, league, split, showTable, radarPlayers.length, selectedPlayers.length])

  return (
    <div className="page-section">
      <PageHeader
        eyebrow="players"
        title="player rankings & form"
        subtitle="Role radars, form trajectories, champion pools, and consistency — filtered by league and split."
      />
      <PowerRankingsPanel limit={8} />
      <RoleFilterBar value={roleFilter} onChange={setRoleFilter} />

      {radarPlayers.length === 0 ? (
        <div className="empty-state">No players match the current filters.</div>
      ) : (
        <div
          ref={radarGridRef}
          className={`radar-grid${roleFilter === 'all' ? ' radar-grid-5' : ''}`}
        >
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
      )}

      <section ref={analyticsRef} className="player-analytics-section">
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
        {selectedPlayers.length > 0 && (
          <>
            <div className="player-analytics-grid">
              <PlayerFormChart players={selectedPlayers} cohortPlayers={players} />
              <PlayerChampionPool players={selectedPlayers} />
            </div>
            <PlayerConsistencyStrip players={selectedPlayers} cohortPlayers={players} />
          </>
        )}
      </section>

      <div className="players-table-toggle">
        <button type="button" className="btn" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Hide Tables' : 'Show Tables'}
        </button>
      </div>

      {showTable && (
        <PlayerMetricsTableCard
          players={players}
          filteredPlayers={roleFilteredPlayers}
          roleFilter={roleFilter}
        />
      )}
    </div>
  )
}
