import { useGSAP } from '@gsap/react'
import { scrollEntrance, scrollEntranceStagger } from '../theme/animations'

const FAQ_ITEMS = [
  {
    question: 'what is nucky.gg?',
    answer:
      'nucky.gg is a tier-1 League of Legends esports analytics dashboard — Overview hub, Players, Teams, Champions, Matchups, and dedicated identity pages for players, teams, and champions. Stats come from Oracle\'s Elixir pro match data (LCK, LPL, LEC, LCS, plus MSI, Worlds, and First Stand), refreshed automatically when new OE CSVs land on Drive.',
  },
  {
    question: 'how do i use the dashboard?',
    answer:
      'Pick league, year, and split from the sticky header — filters apply everywhere. Overview highlights weekly standouts (Player of the Week, Team of the Week by role, hottest team, weekly recap). Players and Teams support radars, form charts, and compare flows. Matchups compares two teams head-to-head with team and lane radars. Click any player, team, or champion name to open its identity page.',
  },
  {
    question: 'what is nucky / nuckyAI?',
    answer:
      'nucky is the subscription analyst chat on nucky.gg — same name as the product voice users talk to ("hey nucky"). it streams answers grounded in the same pro-play database as the dashboard, plus weekly esports context from Liquipedia, patch notes, Reddit, Kalshi odds, and schedules. matchups and comparisons include inline radar charts like the dashboard.',
  },
  {
    question: 'what makes nucky different from chatgpt, claude, etc?',
    answer:
      'generic chatbots guess from training data alone. nucky pulls verified tier-1 match stats when you ask for numbers, searches indexed esports sources for tournament news and meta, and knows the 2026 calendar (e.g. MSI qualifiers and dates) without inventing fake KDA lines. it stays in its lane — lolesports only — and says when it does not have data.',
  },
  {
    question: 'why is nucky subscription gated?',
    answer:
      'Pro subscription ($9.99/mo via Stripe) covers LLM inference, embeddings, and infrastructure so response quality and refresh cadence stay reliable. The dashboard and analytics tabs remain free to browse.',
  },
]

const ABOUT_TEXT =
  "hi i'm geonbu, lolesports fan and solo developer. you can probably tell im a GENG fan by the design of nucky.gg. i made nucky.gg because i wanted a place where i could have cleaner, visual access to lolesports metrics and stats that's actually pro play relevant. i also created nuckyAI because i wanted an AI agent tool that had real context and understanding about pro play to be able to give me key insights and analysis, leveraging it to make predictions and bets on pro play games."

export default function FAQ() {
  useGSAP(() => {
    scrollEntrance(document.querySelector('.faq-shell'))
    scrollEntranceStagger(document.querySelector('.faq-list'), '.faq-item')
  }, [])

  return (
    <div className="faq-shell page-section space-y-6">
      <section className="card">
        <h2 className="card-title">faq</h2>
        <p className="card-subtitle mb-0">basic questions about nucky.gg and nucky.</p>
      </section>

      <section className="faq-list space-y-3">
        {FAQ_ITEMS.map((item) => (
          <article key={item.question} className="faq-item card p-4">
            <h3 className="text-sm text-[var(--accent)] mb-2">{item.question}</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-6">{item.answer}</p>
          </article>
        ))}
      </section>

      <section className="card">
        <h3 className="text-sm text-[var(--text-primary)] mb-2">about</h3>
        <p className="text-sm text-[var(--text-secondary)] leading-6">{ABOUT_TEXT}</p>
      </section>

      <section className="card">
        <h3 className="text-sm text-[var(--text-primary)] mb-2">support nucky.gg</h3>
        <p className="text-sm text-[var(--text-secondary)] leading-6">
          nucky.gg is a solo project — if it helps your drafts, bets, or watch parties, consider buying me a coffee.{' '}
          <a
            href="https://buymeacoffee.com/geonbu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] underline underline-offset-2"
          >
            buymeacoffee.com/geonbu
          </a>
        </p>
      </section>

      <section className="card">
        <h3 className="text-sm text-[var(--text-primary)] mb-2">contact</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          nuckyaigg@gmail.com
        </p>
      </section>
    </div>
  )
}
