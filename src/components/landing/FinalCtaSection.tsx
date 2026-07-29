import { Link } from 'react-router-dom'

interface FinalCtaSectionProps {
  signedIn: boolean
  homePath: string
  onCreateAccount: () => void
}

/** Closing moment — the wireframe returns to the full shush pose behind the CTA. */
export default function FinalCtaSection({
  signedIn,
  homePath,
  onCreateAccount,
}: FinalCtaSectionProps) {
  return (
    <section
      className="finale"
      id="get-started"
      data-companion="front"
      data-companion-x="-28"
      data-companion-y="0"
      data-companion-scale="0.92"
      data-companion-opacity="0.85"
      aria-label="Get started with nucky"
    >
      <div className="finale-inner landing-inner">
        <p className="finale-label" data-reveal="blur-in">the signal is quiet. that&apos;s the point.</p>
        <h2 className="finale-title" data-motion-text>
          stop guessing. start reading the signal.
        </h2>
        <p className="finale-sub" data-reveal="fade-up">
          Browse the free dashboard today. Bring the analyst in when you want the evidence explained.
        </p>
        <div className="finale-actions" data-reveal="fade-up">
          <Link className="landing-btn landing-btn-primary landing-btn-lg" to="/dashboard" data-magnetic>
            open the dashboard
            <span className="landing-btn-icon" aria-hidden="true">→</span>
          </Link>
          {signedIn ? (
            <Link className="landing-btn landing-btn-ghost landing-btn-lg" to={homePath} data-magnetic>
              open app
            </Link>
          ) : (
            <button
              type="button"
              className="landing-btn landing-btn-ghost landing-btn-lg"
              onClick={onCreateAccount}
              data-magnetic
            >
              create account
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
