import { useGSAP } from '@gsap/react'
import { scrollEntrance, scrollEntranceStagger } from '../theme/animations'

const FAQ_ITEMS = [
  {
    question: 'what is nucky.gg?',
    answer:
      'nucky.gg is a league of legends analytics dashboard focused on tier1 lolesports data, matchup context, and pro play insights.',
  },
  {
    question: 'how do i use the dashboard?',
    answer:
      'use the top tabs to move between overview, players, teams, champions, and matchups. each tab filters and visualizes the same core data from oracle\'s elixir.',
  },
  {
    question: 'what is nuckyAI?',
    answer:
      'nuckyAI is the analyst chat layer. it combines live database stats with external context (patch/meta/news) to answer questions and generate takes quickly.',
  },
  {
    question: 'why is nuckyAI subscription gated?',
    answer:
      'subscription helps cover model and infrastructure cost while keeping response quality and update frequency stable.',
  },
  {
    question: 'who can i contact for support?',
    answer:
      'email nuckyaigg@gmail.com for account help, access issues, bug reports, or feedback.',
  },
]

export default function FAQ() {
  useGSAP(() => {
    scrollEntrance(document.querySelector('.faq-shell'))
    scrollEntranceStagger(document.querySelector('.faq-list'), '.faq-item')
  }, [])

  return (
    <div className="faq-shell page-section space-y-6">
      <section className="card">
        <h2 className="card-title">faq</h2>
        <p className="card-subtitle mb-0">basic questions about nucky.gg and nuckyAI.</p>
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
        <h3 className="text-sm text-[var(--text-primary)] mb-2">contact</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          nuckyaigg@gmail.com
        </p>
      </section>
    </div>
  )
}
