import { useState } from 'react'
import type { LivePlayerRow, TeamSide } from '../../lib/live/types'
import { ChampionIcon } from '../entities'
import { itemIconUrl } from '../../lib/entities/assets'

interface LiveScoreboardProps {
  players: LivePlayerRow[]
  blueLabel: string
  redLabel: string
}

function roleRank(role: string | null): number {
  if (!role) return 99
  const r = role.toLowerCase().trim()
  if (r === 'top' || r.startsWith('top')) return 0
  if (r === 'jng' || r === 'jungle' || r.startsWith('jung')) return 1
  if (r === 'mid' || r === 'middle' || r.startsWith('mid')) return 2
  if (r === 'bot' || r === 'adc' || r === 'bottom' || r.startsWith('ad')) return 3
  if (r === 'sup' || r === 'support' || r.startsWith('supp')) return 4
  return 99
}

function fmtGold(gold: number | null): string {
  if (gold == null) return '—'
  if (gold >= 1000) return `${(gold / 1000).toFixed(1)}k`
  return String(gold)
}

function fmtDiff(value: number | null, isGold = false): string {
  if (value == null) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const abs = Math.abs(value)
  const body = isGold && abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : String(abs)
  return `${sign}${body}`
}

function diffClass(value: number | null): string {
  if (value == null || value === 0) return ''
  return value > 0 ? 'live-diff-pos' : 'live-diff-neg'
}

function ItemIcons({ items }: { items: number[] }) {
  const slots = [...items].slice(0, 7)
  while (slots.length < 6) slots.push(0)
  return (
    <div className="live-items">
      {slots.map((id, i) => (
        <span key={i} className="live-item-slot">
          {id > 0 ? (
            <img
              src={itemIconUrl(id)}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden'
              }}
            />
          ) : null}
        </span>
      ))}
    </div>
  )
}

function ExtendedStats({ p }: { p: LivePlayerRow }) {
  const rows: Array<{ label: string; value: string; cls?: string }> = [
    { label: 'KDA', value: `${p.kills ?? 0} / ${p.deaths ?? 0} / ${p.assists ?? 0}` },
    { label: 'CS (CS/min)', value: `${p.cs ?? 0}${p.csPerMin != null ? ` (${p.csPerMin.toFixed(1)})` : ''}` },
    { label: 'Gold (G/min)', value: `${fmtGold(p.gold)}${p.goldPerMin != null ? ` (${p.goldPerMin})` : ''}` },
    { label: 'Gold diff @15', value: fmtDiff(p.gd15, true), cls: diffClass(p.gd15) },
    { label: 'CS diff @15', value: fmtDiff(p.csd15), cls: diffClass(p.csd15) },
    { label: 'XP diff @15', value: fmtDiff(p.xpd15), cls: diffClass(p.xpd15) },
    { label: 'Plates taken', value: p.platesTaken != null ? String(p.platesTaken) : '—' },
    { label: 'Dmg to champions', value: p.damageToChampions != null ? p.damageToChampions.toLocaleString() : '—' },
    { label: 'Dmg to turrets', value: p.damageToTurrets != null ? p.damageToTurrets.toLocaleString() : '—' },
    { label: 'Dmg to objectives', value: p.damageToObjectives != null ? p.damageToObjectives.toLocaleString() : '—' },
    { label: 'Vision score', value: p.visionScore != null ? String(p.visionScore) : '—' },
  ]
  return (
    <div className="live-player-extended">
      {rows.map((r) => (
        <div key={r.label} className="live-player-extended-stat">
          <span className="live-player-extended-label">{r.label}</span>
          <span className={`live-player-extended-value ${r.cls ?? ''}`.trim()}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function PlayerRow({ p, side }: { p: LivePlayerRow; side: TeamSide }) {
  const [open, setOpen] = useState(false)
  const kdaRatio =
    p.deaths && p.deaths > 0
      ? ((p.kills ?? 0) + (p.assists ?? 0)) / p.deaths
      : (p.kills ?? 0) + (p.assists ?? 0)

  return (
    <>
      <tr className={`live-sb-row live-sb-row-${side}${open ? ' is-open' : ''}`}>
        <td className="live-sb-champ">
          <span className="live-sb-champ-icon">
            <ChampionIcon name={p.championName ?? ''} size={28} />
            {p.level != null ? <span className="live-sb-level">{p.level}</span> : null}
          </span>
          <button
            type="button"
            className="live-sb-name"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            title="Show detailed stats"
          >
            <span className="live-sb-role">{(p.role ?? '').toUpperCase()}</span>
            {p.name}
            <span className="live-sb-caret">{open ? '▾' : '▸'}</span>
          </button>
        </td>
        <td className="live-sb-kda">
          {p.kills ?? 0}/{p.deaths ?? 0}/{p.assists ?? 0}
          <span className="live-sb-kda-ratio">{kdaRatio.toFixed(1)}</span>
        </td>
        <td className="live-sb-cs">{p.cs ?? 0}</td>
        <td className="live-sb-gold">{fmtGold(p.gold)}</td>
        <td className={`live-sb-gd ${diffClass(p.gd15)}`}>{fmtDiff(p.gd15, true)}</td>
        <td className="live-sb-items">
          <ItemIcons items={p.items} />
        </td>
      </tr>
      {open ? (
        <tr className="live-sb-extended-row">
          <td colSpan={6}>
            <ExtendedStats p={p} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

function TeamTable({ players, side, label }: { players: LivePlayerRow[]; side: TeamSide; label: string }) {
  const sorted = [...players].sort((a, b) => roleRank(a.role) - roleRank(b.role))
  return (
    <div className={`live-sb-team live-sb-team-${side}`}>
      <div className={`live-sb-team-head live-sb-team-head-${side}`}>
        <span className={`live-bar-side live-bar-side-${side}`}>{side === 'blue' ? 'Blue' : 'Red'}</span>
        <span className="live-sb-team-name">{label}</span>
      </div>
      <div className="table-wrap">
        <table className="live-sb-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>KDA</th>
              <th>CS</th>
              <th>Gold</th>
              <th>GD@15</th>
              <th>Items</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <PlayerRow key={`${p.name}-${i}`} p={p} side={side} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function LiveScoreboard({ players, blueLabel, redLabel }: LiveScoreboardProps) {
  const blue = players.filter((p) => p.side === 'blue')
  const red = players.filter((p) => p.side === 'red')

  if (!blue.length && !red.length) {
    return (
      <div className="empty-state">
        Live player stats will appear here once the in-game feed is published. Tap a player name for
        detailed stats.
      </div>
    )
  }

  return (
    <div className="live-scoreboard">
      <TeamTable players={blue} side="blue" label={blueLabel} />
      <TeamTable players={red} side="red" label={redLabel} />
    </div>
  )
}
