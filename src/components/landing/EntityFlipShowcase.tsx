import { useEffect, useState } from 'react'
import { LeagueLogo, TeamLogo } from '../entities'
import { teamLogoUrlFromName } from '../../lib/entities'

type PlayerExample = {
  kind: 'player'
  name: string
  team: string
  league: string
  role: string
  kda: string
  games: string
  wl: string
  winrate: string
  score: string
  rankLine: string
  box: { value: string; width: number; negative?: boolean }
  soc: { value: string; width: number }
  footnote: string
}

type TeamExample = {
  kind: 'team'
  name: string
  league: string
  winrate: string
  record: string
  score: string
  rankLine: string
  bandMin: string
  bandMax: string
  elo: string
  markerPct: number
  avgPct: number
  confidence: string
  lastSeries: string
}

type Example = PlayerExample | TeamExample

/** Showcase snapshots matching live dashboard player/team + model card compositions. */
const EXAMPLES: Example[] = [
  {
    kind: 'player',
    name: 'Chovy',
    team: 'Gen.G',
    league: 'LCK',
    role: 'MID',
    kda: '5.83',
    games: '59',
    wl: '42-17',
    winrate: '71.2%',
    score: '98.0',
    rankLine: '#1 of 25 MIDs · 100th percentile',
    box: { value: '+0.448', width: 92 },
    soc: { value: '+0.086', width: 28 },
    footnote: 'Trained over thousands of tier-1 games · 36.5 effective games weighted toward recent form',
  },
  {
    kind: 'team',
    name: 'Gen.G',
    league: 'LCK',
    winrate: '71.2%',
    record: '42-17',
    score: '93.0',
    rankLine: '#1 of 71 globally · #1 in LCK',
    bandMin: '1319',
    bandMax: '1805',
    elo: '1805',
    markerPct: 98,
    avgPct: 72,
    confidence: 'High',
    lastSeries: '0d ago',
  },
  {
    kind: 'player',
    name: 'Faker',
    team: 'T1',
    league: 'LCK',
    role: 'MID',
    kda: '3.27',
    games: '88',
    wl: '61-27',
    winrate: '69.3%',
    score: '34.8',
    rankLine: '#17 of 25 MIDs · 33rd percentile',
    box: { value: '-0.058', width: 22, negative: true },
    soc: { value: '+0.086', width: 28 },
    footnote: 'Trained over thousands of tier-1 games · 60.2 effective games weighted toward recent form',
  },
  {
    kind: 'team',
    name: 'T1',
    league: 'LCK',
    winrate: '69.3%',
    record: '61-27',
    score: '83.1',
    rankLine: '#3 of 71 globally · #2 in LCK',
    bandMin: '1319',
    bandMax: '1805',
    elo: '1740',
    markerPct: 86,
    avgPct: 50,
    confidence: 'High',
    lastSeries: '0d ago',
  },
  {
    kind: 'player',
    name: 'Canyon',
    team: 'Gen.G',
    league: 'LCK',
    role: 'JUNGLE',
    kda: '4.77',
    games: '59',
    wl: '42-17',
    winrate: '71.2%',
    score: '57.4',
    rankLine: '#2 of 25 JUNGLEs · 96th percentile',
    box: { value: '+0.123', width: 78 },
    soc: { value: '+0.086', width: 55 },
    footnote: 'Trained over thousands of tier-1 games · 36.5 effective games weighted toward recent form',
  },
  {
    kind: 'player',
    name: 'Zeus',
    team: 'Hanwha Life Esports',
    league: 'LCK',
    role: 'TOP',
    kda: '3.60',
    games: '84',
    wl: '61-23',
    winrate: '72.6%',
    score: '77.4',
    rankLine: '#2 of 25 TOPs · 96th percentile',
    box: { value: '+0.283', width: 80 },
    soc: { value: '+0.086', width: 40 },
    footnote: 'Trained over thousands of tier-1 games · 47.3 effective games weighted toward recent form',
  },
  {
    kind: 'team',
    name: 'G2 Esports',
    league: 'LEC',
    winrate: '62.3%',
    record: '38-23',
    score: '74.5',
    rankLine: '#5 of 71 globally · #1 in LEC',
    bandMin: '1391',
    bandMax: '1684',
    elo: '1684',
    markerPct: 96,
    avgPct: 48,
    confidence: 'High',
    lastSeries: '3d ago',
  },
  {
    kind: 'player',
    name: 'Knight',
    team: 'Bilibili Gaming',
    league: 'LPL',
    role: 'MID',
    kda: '8.02',
    games: '76',
    wl: '54-22',
    winrate: '71.1%',
    score: '67.3',
    rankLine: '#3 of 25 MIDs · 92nd percentile',
    box: { value: '+0.272', width: 75 },
    soc: { value: '+0.016', width: 8 },
    footnote: 'Trained over thousands of tier-1 games · 61.5 effective games weighted toward recent form',
  },
  {
    kind: 'team',
    name: 'LYON',
    league: 'LCS',
    winrate: '63.2%',
    record: '36-21',
    score: '60.4',
    rankLine: '#12 of 71 globally · #2 in LCS',
    bandMin: '1367',
    bandMax: '1601',
    elo: '1592',
    markerPct: 88,
    avgPct: 42,
    confidence: 'High',
    lastSeries: '4d ago',
  },
]

function PlayerFront({ ex }: { ex: PlayerExample }) {
  return (
    <div className="landing-flip-face landing-flip-face--entity">
      <div className="landing-flip-entity-main">
        <p className="landing-flip-eyebrow">
          <span className="signal-dot" aria-hidden="true" />
          player
        </p>
        <h3 className="landing-flip-name">{ex.name}</h3>
        <p className="landing-flip-meta">
          <TeamLogo name={ex.team} size={16} />
          <span>{ex.team}</span>
          <span aria-hidden="true">·</span>
          <LeagueLogo league={ex.league} size={14} />
          <span>
            {ex.league} · {ex.role}
          </span>
        </p>
      </div>
      <div className="landing-flip-stats">
        {[
          ['KDA', ex.kda],
          ['GAMES', ex.games],
          ['W-L', ex.wl],
          ['WINRATE', ex.winrate],
        ].map(([label, value]) => (
          <div key={label} className="landing-flip-stat">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlayerBack({ ex }: { ex: PlayerExample }) {
  return (
    <div className="landing-flip-face landing-flip-face--model">
      <div className="landing-flip-model-main">
        <p className="landing-flip-eyebrow">nucky model rating</p>
        <p className="landing-flip-score">
          <strong>{ex.score}</strong>
          <span>/ 100</span>
        </p>
        <p className="landing-flip-rank">{ex.rankLine}</p>
      </div>
      <div className="landing-flip-bars">
        <div className="landing-flip-bar-row">
          <span>Box-score impact</span>
          <div className="landing-flip-bar-track">
            <span
              className={`landing-flip-bar-fill${ex.box.negative ? ' is-neg' : ''}`}
              style={{ width: `${ex.box.width}%` }}
            />
          </div>
          <em className={ex.box.negative ? 'is-neg' : ''}>{ex.box.value}</em>
        </div>
        <div className="landing-flip-bar-row">
          <span>Strength of competition</span>
          <div className="landing-flip-bar-track">
            <span className="landing-flip-bar-fill" style={{ width: `${ex.soc.width}%` }} />
          </div>
          <em>{ex.soc.value}</em>
        </div>
        <p className="landing-flip-footnote">{ex.footnote}</p>
      </div>
    </div>
  )
}

function TeamFront({ ex }: { ex: TeamExample }) {
  const logo = teamLogoUrlFromName(ex.name)
  return (
    <div className="landing-flip-face landing-flip-face--entity">
      <div className="landing-flip-entity-main">
        <p className="landing-flip-eyebrow">
          <span className="signal-dot" aria-hidden="true" />
          team
        </p>
        <h3 className="landing-flip-name landing-flip-name--team">
          {logo ? <img src={logo} alt="" width={36} height={36} /> : null}
          {ex.name}
        </h3>
        <p className="landing-flip-meta">
          <LeagueLogo league={ex.league} size={14} />
          <span>{ex.league}</span>
        </p>
      </div>
      <div className="landing-flip-stats landing-flip-stats--team">
        {[
          ['WINRATE', ex.winrate],
          ['RECORD', ex.record],
        ].map(([label, value]) => (
          <div key={label} className="landing-flip-stat">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function TeamBack({ ex }: { ex: TeamExample }) {
  return (
    <div className="landing-flip-face landing-flip-face--model">
      <div className="landing-flip-model-main">
        <p className="landing-flip-eyebrow">nucky model strength</p>
        <p className="landing-flip-score">
          <strong>{ex.score}</strong>
          <span>/ 100</span>
        </p>
        <p className="landing-flip-rank">{ex.rankLine}</p>
      </div>
      <div className="landing-flip-band">
        <p className="landing-flip-band-label">{ex.league} rating band</p>
        <div className="landing-flip-band-track">
          <span className="landing-flip-band-min">{ex.bandMin}</span>
          <span className="landing-flip-band-avg" style={{ left: `${ex.avgPct}%` }} />
          <span className="landing-flip-band-dot" style={{ left: `${ex.markerPct}%` }} title={`Elo ${ex.elo}`} />
          <span className="landing-flip-band-elo" style={{ left: `${ex.markerPct}%` }}>
            Elo {ex.elo}
          </span>
          <span className="landing-flip-band-max">{ex.bandMax}</span>
        </div>
        <p className="landing-flip-band-meta">
          Confidence: <em>{ex.confidence}</em>
          <span aria-hidden="true"> · </span>
          Last series: {ex.lastSeries}
        </p>
        <p className="landing-flip-footnote">
          Elo trained over historical tier-1 series · dot = {ex.name}, tick = region average
        </p>
      </div>
    </div>
  )
}

function FlipCard({ example, forceFlip }: { example: Example; forceFlip: boolean }) {
  const [hoverFlip, setHoverFlip] = useState(false)
  const [pinned, setPinned] = useState(false)
  const flipped = pinned || hoverFlip || forceFlip

  return (
    <button
      type="button"
      className={`landing-flip-card${flipped ? ' is-flipped' : ''}`}
      onClick={() => setPinned((p) => !p)}
      onMouseEnter={() => setHoverFlip(true)}
      onMouseLeave={() => setHoverFlip(false)}
      aria-pressed={flipped}
      aria-label={
        example.kind === 'player'
          ? `${example.name} — flip for nucky model rating`
          : `${example.name} — flip for nucky model strength`
      }
    >
      <div className="landing-flip-inner">
        <div className="landing-flip-front">
          {example.kind === 'player' ? <PlayerFront ex={example} /> : <TeamFront ex={example} />}
        </div>
        <div className="landing-flip-back">
          {example.kind === 'player' ? <PlayerBack ex={example} /> : <TeamBack ex={example} />}
        </div>
      </div>
    </button>
  )
}

export default function EntityFlipShowcase() {
  const [index, setIndex] = useState(0)
  const [autoFlip, setAutoFlip] = useState(false)
  const visible = [EXAMPLES[index % EXAMPLES.length], EXAMPLES[(index + 1) % EXAMPLES.length]]

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const id = window.setInterval(() => {
      setAutoFlip((f) => {
        if (!f) return true
        setIndex((i) => (i + 2) % EXAMPLES.length)
        return false
      })
    }, 3400)
    return () => window.clearInterval(id)
  }, [])

  return (
    <section className="landing-flip-section" aria-label="Example player and team ratings">
      <div className="landing-section-head">
        <p className="landing-section-label">model surfaces</p>
        <h2 className="landing-section-title">model diagnostics for lolesports entities</h2>
      </div>
      <div className="landing-flip-rail">
        {visible.map((ex) => (
          <FlipCard key={`${ex.kind}-${ex.name}-${index}`} example={ex} forceFlip={autoFlip} />
        ))}
      </div>
    </section>
  )
}
