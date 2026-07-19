import { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '../../context/DashboardContext'
import {
  buildEntitySearchIndex,
  searchEntities,
  type EntitySearchEntry,
} from '../../lib/entities/searchIndex'
import { isTier1Player, isTier1Team } from '../../lib/mergeSlices'
import { teamMatchesCanonical } from '../../lib/entities'
import { normalizePosition } from '../../lib/playerRadar'
import TeamModelCard from '../entities/TeamModelCard'
import PlayerModelCard from '../players/PlayerModelCard'
import ScoreCaveat from '../ui/ScoreCaveat'
import { EntityLink, TeamLogo, ChampionIcon, TeamStatTrends } from '../entities'
import { computeOpScores, isDisplayableChampion } from '../../lib/championAnalytics'
import { formatNum, formatPct } from '../../lib/format'
import { opScoreTo100 } from '../../lib/scoreNormalize'
import { OP_SCORE_HINT } from '../../lib/metricHints'

export default function PredictionAnalysisTab() {
  const { catalog, filteredPlayers, filteredTeams, filteredChampions } = useDashboard()
  const [index, setIndex] = useState<EntitySearchEntry[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<EntitySearchEntry | null>(null)

  useEffect(() => {
    if (!catalog) return
    void buildEntitySearchIndex(catalog).then(setIndex)
  }, [catalog])

  const results = useMemo(() => searchEntities(index, query).slice(0, 12), [index, query])

  const teams = useMemo(() => filteredTeams.filter(isTier1Team), [filteredTeams])
  const players = useMemo(() => filteredPlayers.filter(isTier1Player), [filteredPlayers])

  const team = useMemo(() => {
    if (selected?.type !== 'team') return null
    return teams.find((t) => teamMatchesCanonical(t.name, selected.label)) ?? null
  }, [selected, teams])

  const player = useMemo(() => {
    if (selected?.type !== 'player') return null
    return players.find((p) => p.name.toLowerCase() === selected.label.toLowerCase()) ?? null
  }, [selected, players])

  const championEntry = useMemo(() => {
    if (selected?.type !== 'champion') return null
    const displayable = filteredChampions.filter(isDisplayableChampion)
    const scored = computeOpScores(displayable, 1).all
    return scored.find((e) => e.champion.name.toLowerCase() === selected.label.toLowerCase()) ?? null
  }, [selected, filteredChampions])

  return (
    <div className="predictions-analysis-tab">
      <ScoreCaveat label="model analysis vs filter form" />
      <p className="card-subtitle">
        Search a player, team, or champion for nucky model current-strength outlook and related
        charts.
      </p>

      <div className="predictions-analysis-search">
        <input
          type="search"
          className="entity-search-input predictions-analysis-input"
          placeholder="search player, team, or champion…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(null)
          }}
          aria-label="Search entities for model analysis"
        />
        {query.trim() && !selected && results.length > 0 ? (
          <ul className="predictions-analysis-results" role="listbox">
            {results.map((entry) => (
              <li key={`${entry.type}-${entry.slug}`}>
                <button
                  type="button"
                  className="predictions-analysis-result"
                  onClick={() => {
                    setSelected(entry)
                    setQuery(entry.label)
                  }}
                >
                  {entry.type === 'champion' ? (
                    <ChampionIcon name={entry.label} size={18} />
                  ) : entry.type === 'team' ? (
                    <TeamLogo name={entry.label} size={18} />
                  ) : null}
                  <span>{entry.label}</span>
                  <span className="text-secondary text-sm">{entry.type}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {!selected ? (
        <p className="text-secondary text-sm">pick an entity to load model outlook.</p>
      ) : selected.type === 'team' && team ? (
        <div className="predictions-analysis-stack">
          <TeamModelCard team={team} />
          <TeamStatTrends players={players} teamSlugOrName={team.name} />
        </div>
      ) : selected.type === 'player' && player ? (
        <div className="predictions-analysis-stack">
          <PlayerModelCard player={player} role={normalizePosition(player.position) ?? 'mid'} />
          <p className="text-secondary text-sm">
            Open the full identity page for filter-window radars and game logs:{' '}
            <EntityLink type="player" name={player.name} showIcon={false} />
          </p>
        </div>
      ) : selected.type === 'champion' && championEntry ? (
        <div className="card">
          <h3 className="card-title">
            <ChampionIcon name={championEntry.champion.name} size={28} />{' '}
            {championEntry.champion.name}
          </h3>
          <p className="card-subtitle" title={OP_SCORE_HINT}>
            OP score in the current dashboard slice (presence / WR / ban / KDA composite) — not the
            same as weekly Champion of the Week when filters differ.
          </p>
          <div className="predictions-champ-metrics">
            <div>
              <span className="text-secondary text-sm">OP /100</span>
              <p className="text-accent font-mono text-2xl">
                {formatNum(opScoreTo100(championEntry.opScore), 1)}
              </p>
            </div>
            <div>
              <span className="text-secondary text-sm">presence</span>
              <p>{formatPct(championEntry.champion.presence, 1)}</p>
            </div>
            <div>
              <span className="text-secondary text-sm">winrate</span>
              <p>{formatPct(championEntry.champion.winrate, 1)}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-secondary text-sm">
          no model outlook for {selected.label} in the current data slice.
        </p>
      )}
    </div>
  )
}
