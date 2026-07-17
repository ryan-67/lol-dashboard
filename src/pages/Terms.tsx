import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { scrollEntrance, scrollEntranceStagger } from '../theme/animations'

const TERMS = [
  {
    title: 'acceptance',
    body: 'by using nucky.gg you agree to these terms. if you do not agree, do not use the service.',
  },
  {
    title: 'the service',
    body: 'nucky.gg provides LoL esports analytics and an optional subscription AI analyst (nuckyAI). features, availability, and beta limits may change as the product develops.',
  },
  {
    title: 'accounts',
    body: 'you are responsible for credentials and activity under your account. provide accurate information and keep access secure.',
  },
  {
    title: 'subscriptions',
    body: 'paid plans are billed through stripe. fees, renewals, and cancellations follow the stripe checkout / customer portal flow shown at purchase time. beta pricing may change at full launch.',
  },
  {
    title: 'acceptable use',
    body: 'do not abuse the API or chat endpoints, attempt to scrape private artifacts, disrupt the service, or use nucky to violate applicable law. automated bulk extraction of proprietary model outputs is not allowed.',
  },
  {
    title: 'no wagering advice',
    body: 'predictions and analyses are informational. nucky does not guarantee outcomes and is not a licensed betting advisor. you alone decide how to use any probability or lean.',
  },
  {
    title: 'intellectual property',
    body: 'nucky branding, UI, and proprietary model artifacts are owned by the operator. league of legends assets and trademarks belong to their respective owners. riot games is not affiliated with nucky.gg.',
  },
  {
    title: 'disclaimer',
    body: 'the service is provided as-is without warranties of uninterrupted availability or perfect accuracy. analytics and model outputs can be wrong.',
  },
  {
    title: 'limitation of liability',
    body: 'to the maximum extent permitted by law, nucky.gg is not liable for indirect, incidental, or consequential damages arising from use of the site, chat, or predictions.',
  },
  {
    title: 'contact',
    body: 'questions about these terms: nuckyaigg@gmail.com.',
  },
]

export default function Terms() {
  const rootRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    scrollEntrance(rootRef.current?.querySelector('.landing-section-head') ?? null)
    scrollEntranceStagger(rootRef.current, '.landing-legal-item')
  }, { scope: rootRef })

  return (
    <div className="landing-doc" ref={rootRef}>
      <div className="landing-section-head">
        <p className="landing-section-label">legal</p>
        <h1>terms of use</h1>
        <p className="landing-section-lead">effective 2026. basic terms for using nucky.gg and nuckyAI.</p>
      </div>

      <div className="landing-legal-list">
        {TERMS.map((item, idx) => (
          <article key={item.title} className="landing-legal-item">
            <strong>
              {String(idx + 1).padStart(2, '0')} · {item.title}
            </strong>
            {item.body}
          </article>
        ))}
      </div>
    </div>
  )
}
