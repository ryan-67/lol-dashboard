import type { LiveGameSummary, LiveMatchSummary } from '../../lib/live/types'
import LiveTeamLogo from './LiveTeamLogo'

interface LiveGameStatsBarProps {
  summary: LiveMatchSummary
  game: LiveGameSummary | null
}

function fmtGold(gold: number | null): string {
  if (gold == null) return '—'
  if (gold >= 1000) return `${(gold / 1000).toFixed(1)}K`
  return String(gold)
}

function fmtClock(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function ObjGroup({ towers, dragons, barons, align }: {
  towers: number | null
  dragons: number | null
  barons: number | null
  align: 'left' | 'right'
}) {
  return (
    <div className={`live-bar-objs live-bar-objs-${align}`}>
      <span className="live-bar-obj" title="Towers">⌖ {towers ?? 0}</span>
      <span className="live-bar-obj" title="Dragons">🐉 {dragons ?? 0}</span>
      <span className="live-bar-obj" title="Barons">⬣ {barons ?? 0}</span>
    </div>
  )
}

export default function LiveGameStatsBar({ summary, game }: LiveGameStatsBarProps) {
  const blue = game?.blue ?? null
  const red = game?.red ?? null
  const blueGold = blue?.gold ?? null
  const redGold = red?.gold ?? null
  const goldDiff = blueGold != null && redGold != null ? blueGold - redGold : null
  const clock = game?.gameClockSeconds ?? null

  const blueName = blue?.name ?? summary.team1.name
  const redName = red?.name ?? summary.team2.name

  return (
    <div className="live-bar">
      <div className="live-bar-team live-bar-team-blue">
        <LiveTeamLogo name={blueName} logoUrl={blue?.logoUrl ?? summary.team1.logoUrl} size={32} />
        <div className="live-bar-team-meta">
          <span className="live-bar-team-name">{blueName}</span>
          <span className="live-bar-side live-bar-side-blue">Blue</span>
        </div>
        <ObjGroup towers={blue?.towers ?? null} dragons={blue?.dragons ?? null} barons={blue?.barons ?? null} align="left" />
      </div>

      <div className="live-bar-center">
        <div className="live-bar-gold">
          <span className="live-bar-gold-val">{fmtGold(blueGold)}</span>
          {goldDiff != null && goldDiff !== 0 ? (
            <span className={`live-bar-gold-diff ${goldDiff > 0 ? 'pos' : 'neg'}`}>
              {goldDiff > 0 ? '+' : '−'}{fmtGold(Math.abs(goldDiff))}
            </span>
          ) : null}
          <span className="live-bar-gold-label">gold</span>
        </div>
        <div className="live-bar-kills">
          <span className="live-bar-kill blue">{blue?.kills ?? 0}</span>
          <span className="live-bar-kill-sep">/</span>
          <span className="live-bar-kill red">{red?.kills ?? 0}</span>
        </div>
        <div className="live-bar-clock">{fmtClock(clock)}</div>
      </div>

      <div className="live-bar-team live-bar-team-red">
        <ObjGroup towers={red?.towers ?? null} dragons={red?.dragons ?? null} barons={red?.barons ?? null} align="right" />
        <div className="live-bar-team-meta live-bar-team-meta-right">
          <span className="live-bar-team-name">{redName}</span>
          <span className="live-bar-side live-bar-side-red">Red</span>
        </div>
        <LiveTeamLogo name={redName} logoUrl={red?.logoUrl ?? summary.team2.logoUrl} size={32} />
      </div>
    </div>
  )
}
