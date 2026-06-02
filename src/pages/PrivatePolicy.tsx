import { useGSAP } from '@gsap/react'
import { scrollEntrance, scrollEntranceStagger } from '../theme/animations'

const POLICY_POINTS = [
  'we only collect the minimum data needed to run accounts, subscriptions, and app functionality.',
  'account identifiers (email, profile metadata) are used for authentication and access control.',
  'subscription status is managed through stripe webhooks and not sold to third parties.',
  'chat messages may be stored to provide conversation history and improve product reliability.',
  'we do not intentionally collect sensitive personal data beyond what is required for service operation.',
  'you can request data deletion or account removal by emailing nuckyaigg@gmail.com.',
]

export default function PrivatePolicy() {
  useGSAP(() => {
    scrollEntrance(document.querySelector('.policy-shell'))
    scrollEntranceStagger(document.querySelector('.policy-list'), '.policy-item')
  }, [])

  return (
    <div className="policy-shell page-section space-y-6">
      <section className="card">
        <h2 className="card-title">private policy</h2>
        <p className="card-subtitle mb-0">effective 2026. basic privacy standards for nucky.gg.</p>
      </section>

      <section className="policy-list space-y-3">
        {POLICY_POINTS.map((point, idx) => (
          <article key={point} className="policy-item card p-4">
            <div className="text-xs text-[var(--accent)] mb-2">0{idx + 1}</div>
            <p className="text-sm text-[var(--text-secondary)] leading-6">{point}</p>
          </article>
        ))}
      </section>

      <section className="card">
        <h3 className="text-sm text-[var(--text-primary)] mb-2">questions</h3>
        <p className="text-sm text-[var(--text-secondary)]">contact nuckyaigg@gmail.com</p>
      </section>
    </div>
  )
}
