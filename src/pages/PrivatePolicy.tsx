import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { scrollEntrance, scrollEntranceStagger } from '../theme/animations'

const POLICY_POINTS = [
  {
    title: 'minimum collection',
    body: 'we only collect the minimum data needed to run accounts, subscriptions, and app functionality.',
  },
  {
    title: 'account identifiers',
    body: 'email and profile metadata are used for authentication and access control.',
  },
  {
    title: 'billing',
    body: 'subscription status is managed through stripe webhooks and is not sold to third parties.',
  },
  {
    title: 'chat history',
    body: 'chat messages may be stored to provide conversation history and improve product reliability.',
  },
  {
    title: 'sensitive data',
    body: 'we do not intentionally collect sensitive personal data beyond what is required for service operation.',
  },
  {
    title: 'deletion',
    body: 'you can request data deletion or account removal by emailing nuckyaigg@gmail.com.',
  },
]

export default function PrivatePolicy() {
  const rootRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    scrollEntrance(rootRef.current?.querySelector('.landing-section-head') ?? null)
    scrollEntranceStagger(rootRef.current, '.landing-legal-item')
  }, { scope: rootRef })

  return (
    <div className="landing-doc" ref={rootRef}>
      <div className="landing-section-head">
        <p className="landing-section-label">legal</p>
        <h1>privacy</h1>
        <p className="landing-section-lead">effective 2026. basic privacy standards for nucky.gg.</p>
      </div>

      <div className="landing-legal-list">
        {POLICY_POINTS.map((point, idx) => (
          <article key={point.title} className="landing-legal-item">
            <strong>
              {String(idx + 1).padStart(2, '0')} · {point.title}
            </strong>
            {point.body}
          </article>
        ))}
      </div>

      <p className="landing-model-note" style={{ marginTop: '2rem' }}>
        questions: nuckyaigg@gmail.com
      </p>
    </div>
  )
}
