import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { scrollEntrance, scrollEntranceStagger } from '../theme/animations'

const FAQ_ITEMS = [
  {
    question: 'what is nucky.gg?',
    answer:
      'nucky.gg is a tier-1 League of Legends esports analytics product — a free dashboard plus an optional AI analyst. Stats come from Oracle\'s Elixir pro match data (LCK, LPL, LEC, LCS, plus MSI, Worlds, and First Stand), refreshed on a disciplined ingest pipeline.',
  },
  {
    question: 'how do i use the dashboard?',
    answer:
      'Open /dashboard, then pick league, year, and split from the sticky header — filters apply everywhere. Overview highlights weekly standouts. Players and Teams support radars, form charts, and compare flows. Matchups compares two teams head-to-head. Click any player, team, or champion name to open its identity page.',
  },
  {
    question: 'what is nucky / nuckyAI?',
    answer:
      'nucky is the subscription analyst chat on nucky.gg — the same product voice users talk to. It streams answers grounded in the pro-play database, plus weekly esports context from sources like Liquipedia, patch notes, and schedules. Matchups and comparisons can include inline radar charts like the dashboard.',
  },
  {
    question: 'what makes nucky different from chatgpt or other chatbots?',
    answer:
      'Generic chatbots guess from training data alone. nucky pulls verified tier-1 match stats when you ask for numbers, searches indexed esports sources for tournament context, and stays in its lane — LoL esports only — saying when it does not have data. Series predictions come from a proprietary walk-forward model, not LLM improvisation.',
  },
  {
    question: 'how is nucky different from raw LoL esports stat sites?',
    answer:
      'Raw-stat sites mostly mirror box scores. nucky adds proprietary region Elo, player ratings, champion matchup evidence, and an AI layer that explains those signals. The public accuracy scorecard documents whether the prediction stack beats a naive baseline.',
  },
  {
    question: 'does nucky watch every series live?',
    answer:
      'No. nucky ingests completed match data, builds ratings and trends from that history, and can form analyses and predictions from those artifacts. It does not claim to watch broadcasts or consume every live frame.',
  },
  {
    question: 'why is nuckyAI subscription gated?',
    answer:
      'nuckyAI beta ($3.99/mo via Stripe) covers LLM inference and tool calls with usage caps during active development. Full launch pricing is planned at $5/mo. The dashboard and analytics tabs remain free to browse.',
  },
]

const ABOUT_TEXT =
  "hi i'm geonbu, lolesports fan and solo developer. you can probably tell im a GENG fan by the design of nucky.gg. i made nucky.gg because i wanted a place where i could have cleaner, visual access to lolesports metrics and stats that's actually pro play relevant. i also created nuckyAI because i wanted an AI agent tool that had real context and understanding about pro play to be able to give me key insights and analysis, leveraging it to make predictions and bets on pro play games."

export default function FAQ() {
  const rootRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    scrollEntrance(rootRef.current?.querySelector('.landing-section-head') ?? null)
    scrollEntranceStagger(rootRef.current, '.landing-faq-item')
  }, { scope: rootRef })

  return (
    <div className="landing-doc" ref={rootRef}>
      <div className="landing-section-head">
        <p className="landing-section-label">faq</p>
        <h1>questions, answered</h1>
        <p className="landing-section-lead">basics about nucky.gg, the dashboard, and nuckyAI.</p>
      </div>

      <div className="landing-faq-list">
        {FAQ_ITEMS.map((item) => (
          <article key={item.question} className="landing-faq-item">
            <h2>{item.question}</h2>
            <p>{item.answer}</p>
          </article>
        ))}
      </div>

      <section className="landing-section" style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '2.5rem', paddingTop: '2.5rem' }}>
        <p className="landing-section-label">about</p>
        <p className="landing-section-lead" style={{ marginBottom: '1.5rem' }}>
          {ABOUT_TEXT}
        </p>
        <p className="landing-section-lead" style={{ marginBottom: '0.75rem' }}>
          support the solo build:{' '}
          <a
            href="https://buymeacoffee.com/geonbu"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)' }}
          >
            buymeacoffee.com/geonbu
          </a>
        </p>
        <p className="landing-section-lead" style={{ marginBottom: 0 }}>
          contact: nuckyaigg@gmail.com
        </p>
      </section>
    </div>
  )
}
