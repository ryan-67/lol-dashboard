/**
 * "the signal" — a quiet manifesto beat between the FAQ and the finale.
 * The pointing finger returns here (pointing up, full circle) so the head
 * can dissolve back into place over it in the closing CTA.
 */
export default function SignalSection() {
  return (
    <section
      className="signal"
      id="signal"
      data-companion="point-up"
      data-companion-x="0"
      data-companion-y="14"
      data-companion-scale="0.55"
      data-companion-opacity="0.9"
      aria-label="The nucky signal"
    >
      <div className="signal-inner landing-inner">
        <p className="signal-label" data-reveal="blur-in">the quiet part</p>
        <h2 className="signal-title" data-motion-text>
          no hype. no hedging. just the signal.
        </h2>
        <ul className="signal-points" data-reveal-group>
          <li data-reveal-item>twelve years of pro-play memory</li>
          <li data-reveal-item>ratings rebuilt after every match</li>
          <li data-reveal-item>a track record anyone can audit</li>
        </ul>
      </div>
    </section>
  )
}
