import { useEffect, useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { useDashboard } from '../context/DashboardContext'
import { useAuth } from '../context/AuthContext'
import type { Player } from '../hooks/useDashboardData'
import { formatNum, formatPct } from '../lib/format'
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
import SortableTh from '../components/ui/SortableTh'
import { findDefaultPlayerKey, playerKey } from '../lib/playerAnalytics'
import { scrollEntranceStagger, refreshScrollTrigger } from '../theme/animations'
import { supabase } from '../lib/supabaseClient'

export default function Players() {
  const { user } = useAuth()
  const { filteredPlayers, league, split } = useDashboard()
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [selectedPlayerKeys, setSelectedPlayerKeys] = useState<string[]>([])
  const [showTable, setShowTable] = useState(false)
  const [sortKey, setSortKey] = useState<keyof Player>('kda')
  const [sortDesc, setSortDesc] = useState(true)

  const players = useMemo(
    () => filteredPlayers.filter(isDisplayablePlayer),
    [filteredPlayers],
  )

  const roleFilteredPlayers = useMemo(() => {
    if (roleFilter === 'all') return players
    return playersForRole(players, roleFilter)
  }, [players, roleFilter])

  const radarPlayers = useMemo(() => {
    if (roleFilter === 'all') {
      return ROLES.map((role) => {
        const best = bestPlayerForRole(players, role)
        return best ? { player: best, role } : null
      }).filter((x): x is { player: Player; role: RoleKey } => x !== null)
    }
    const ranked = rankPlayersByRole(players, roleFilter, 10)
    return ranked.map((player) => ({ player, role: roleFilter }))
  }, [players, roleFilter])

  const radarGridRef = useRef<HTMLDivElement>(null)
  const analyticsRef = useRef<HTMLDivElement>(null)
  const [favoritePlayerName, setFavoritePlayerName] = useState<string | null>(null)
  const [favoriteTeamName, setFavoriteTeamName] = useState<string | null>(null)

  useEffect(() => {
    async function loadProfileDefaults() {
      if (!user) {
        setFavoritePlayerName(null)
        setFavoriteTeamName(null)
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('favorite_player, favorite_team')
        .eq('id', user.id)
        .maybeSingle()
      setFavoritePlayerName((data?.favorite_player as string | null) ?? null)
      setFavoriteTeamName((data?.favorite_team as string | null) ?? null)
    }
    void loadProfileDefaults()
  }, [user])

  useEffect(() => {
    setSelectedPlayerKeys((prev) => {
      const valid = prev.filter((key) => players.some((p) => playerKey(p) === key))
      if (valid.length) return valid
      if (favoritePlayerName) {
        const favorite = players.find((player) => {
          if (player.name !== favoritePlayerName) return false
          if (!favoriteTeamName) return true
          return player.team === favoriteTeamName
        })
        if (favorite) return [playerKey(favorite)]
      }
      const defaultKey = findDefaultPlayerKey(players)
      return defaultKey ? [defaultKey] : []
    })
  }, [favoritePlayerName, favoriteTeamName, players])

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

  const sorted = useMemo(() => {
    return [...roleFilteredPlayers].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDesc ? bv - av : av - bv
      }
      return sortDesc
        ? String(bv ?? '').localeCompare(String(av ?? ''))
        : String(av ?? '').localeCompare(String(bv ?? ''))
    })
  }, [roleFilteredPlayers, sortKey, sortDesc])

  const toggleSort = (key: keyof Player) => {
    if (sortKey === key) setSortDesc(!sortDesc)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  return (
    <div className="page-section">
      <RoleFilterBar value={roleFilter} onChange={setRoleFilter} />

      {radarPlayers.length === 0 ? (
        <div className="empty-state">No players match the current filters.</div>
      ) : (
        <div
          ref={radarGridRef}
          className={`radar-grid${roleFilter === 'all' ? ' radar-grid-5' : ''}`}
        >
          {radarPlayers.map(({ player, role }) => {
            const cohort = playersForRole(players, role)
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
          onChange={setSelectedPlayerKeys}
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
          {showTable ? 'Hide Full Metrics Table' : 'Show Full Metrics Table'}
        </button>
      </div>

      {showTable && (
        <div className="card">
          <h2 className="card-title">Full Player Metrics</h2>
          <p className="card-subtitle">
            {roleFilter === 'all'
              ? 'All players in the current league and split.'
              : `Players filtered to ${roleFilter.toUpperCase()}.`}
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="Player" columnKey="name" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Team" columnKey="team" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="League" columnKey="league" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Position" columnKey="position" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Games" columnKey="games" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="KDA" columnKey="kda" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="KP" columnKey="kp" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="DMG %" columnKey="dmgShare" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="GD@15" columnKey="gd15" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="CS@15" columnKey="csd15" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="XP@15" columnKey="xpd15" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="DPM" columnKey="dpm" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Vision" columnKey="visionScore" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Gold %" columnKey="goldShare" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="FB %" columnKey="firstBloodRate" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                  <SortableTh label="Obj Ctrl" columnKey="objControl" sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={16}>No players match the current filters.</td>
                  </tr>
                ) : (
                  sorted.map((p) => (
                    <tr key={`${p.name}-${p.team}-${p.league}`}>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-secondary">{p.team ?? '—'}</td>
                      <td className="text-secondary">{p.league ?? '—'}</td>
                      <td className="text-secondary uppercase">{p.position ?? '—'}</td>
                      <td className="text-secondary">{p.games ?? '—'}</td>
                      <td className="text-accent font-medium">{formatNum(p.kda, 2)}</td>
                      <td className="text-secondary">{formatPct(p.kp, 1)}</td>
                      <td className="text-secondary">{formatPct(p.dmgShare, 1)}</td>
                      <td className="text-secondary">
                        {typeof p.gd15 === 'number' ? `${p.gd15 > 0 ? '+' : ''}${p.gd15}` : '—'}
                      </td>
                      <td className="text-secondary">
                        {typeof p.csd15 === 'number' ? `${p.csd15 > 0 ? '+' : ''}${p.csd15}` : '—'}
                      </td>
                      <td className="text-secondary">
                        {typeof p.xpd15 === 'number' ? `${p.xpd15 > 0 ? '+' : ''}${p.xpd15}` : '—'}
                      </td>
                      <td className="text-secondary">{formatNum(p.dpm, 0)}</td>
                      <td className="text-secondary">{formatNum(p.visionScore, 1)}</td>
                      <td className="text-secondary">{formatPct(p.goldShare, 1)}</td>
                      <td className="text-secondary">{formatPct(p.firstBloodRate, 1)}</td>
                      <td className="text-secondary">{formatNum(p.objControl, 2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
