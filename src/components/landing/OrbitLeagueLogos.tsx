import { LeagueLogo } from '../entities'

const ORBIT_LEAGUES = [
  { key: 'LCK', label: 'LCK', kind: 'domestic' as const },
  { key: 'LPL', label: 'LPL', kind: 'domestic' as const },
  { key: 'LEC', label: 'LEC', kind: 'domestic' as const },
  { key: 'LCS', label: 'LCS', kind: 'domestic' as const },
  { key: 'First Stand', label: 'First Stand', kind: 'intl' as const },
  { key: 'MSI', label: 'MSI', kind: 'intl' as const },
  { key: 'Worlds', label: 'Worlds', kind: 'intl' as const },
  { key: 'EWC', label: 'EWC', kind: 'intl' as const },
]

/**
 * Persistent orbit of league/tournament logos (React Bits Orbit Images idea,
 * GSAP/CSS-native — no Motion dependency). Reduced motion → static grid.
 */
export default function OrbitLeagueLogos() {
  return (
    <div className="landing-orbit" aria-label="League and tournament coverage">
      <div className="landing-orbit-stage" aria-hidden="true">
        <div className="landing-orbit-core">
          <span className="landing-orbit-core-mark" />
          <span className="landing-orbit-core-label">tier-1</span>
        </div>
        <div className="landing-orbit-ring landing-orbit-ring--outer">
          {ORBIT_LEAGUES.map((league, i) => (
            <div
              key={league.key}
              className={`landing-orbit-item kind-${league.kind}${league.key === 'EWC' ? ' is-ewc' : ''}`}
              style={{ ['--orbit-i' as string]: i, ['--orbit-n' as string]: ORBIT_LEAGUES.length }}
            >
              <div className="landing-orbit-logo">
                <LeagueLogo league={league.key} size={32} />
              </div>
              <span className="landing-orbit-name">{league.label}</span>
            </div>
          ))}
        </div>
        <div className="landing-orbit-ring landing-orbit-ring--path" />
      </div>

      {/* Accessible static fallback / reduced-motion grid */}
      <ul className="landing-orbit-grid">
        {ORBIT_LEAGUES.map((league) => (
          <li key={league.key} className={`landing-league-card kind-${league.kind}${league.key === 'EWC' ? ' is-ewc' : ''}`}>
            <div className="landing-league-card-logo">
              <LeagueLogo league={league.key} size={28} />
            </div>
            <div className="landing-league-card-meta">
              <span className="landing-league-card-name">{league.label}</span>
              <span className="landing-league-card-kind">
                {league.kind === 'domestic' ? 'tier-1' : 'international'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
