import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

const BMC_URL = 'https://buymeacoffee.com/geonbu'
const CONTACT_EMAIL = 'geonbu@nucky.gg'

export default function Contact() {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !subject.trim() || !message.trim()) {
      setStatus('error')
      setErrorMsg('name, subject, and message are required.')
      return
    }

    setStatus('sending')
    setErrorMsg(null)

    try {
      const res = await fetch(`https://formsubmit.co/ajax/${CONTACT_EMAIL}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          subject: subject.trim(),
          message: message.trim(),
          _subject: `[nucky.gg] ${subject.trim()}`,
          _template: 'table',
          _captcha: 'false',
        }),
      })

      if (!res.ok) {
        throw new Error('send failed')
      }

      setStatus('sent')
      setName('')
      setSubject('')
      setMessage('')
    } catch {
      // Fallback: open mail client so the message still reaches you
      const body = encodeURIComponent(
        `From: ${name.trim()}\n\n${message.trim()}`,
      )
      const subj = encodeURIComponent(`[nucky.gg] ${subject.trim()}`)
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subj}&body=${body}`
      setStatus('sent')
    }
  }

  return (
    <div className="contact-page page-section">
      <section className="card contact-hero">
        <p className="contact-eyebrow">contact</p>
        <h1 className="card-title">get in touch</h1>
        <p className="card-subtitle mb-0">
          Questions, bugs, ideas, or partnership notes — reach out anytime.
        </p>
      </section>

      <div className="contact-grid">
        <section className="card contact-links">
          <h2 className="card-title">links</h2>
          <ul className="contact-link-list">
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="contact-link">
                <span className="contact-link-label">email</span>
                <span className="contact-link-value">{CONTACT_EMAIL}</span>
              </a>
            </li>
            <li>
              <a
                href={BMC_URL}
                target="_blank"
                rel="noreferrer"
                className="contact-link"
              >
                <span className="contact-link-label">support</span>
                <span className="contact-link-value">buy me a coffee</span>
              </a>
            </li>
            <li>
              <Link to="/#faq" className="contact-link">
                <span className="contact-link-label">help</span>
                <span className="contact-link-value">faq</span>
              </Link>
            </li>
          </ul>
        </section>

        <section className="card contact-form-card">
          <h2 className="card-title">send a message</h2>
          <form className="contact-form" onSubmit={(e) => void onSubmit(e)}>
            <label className="label-field" htmlFor="contact-name">
              name
            </label>
            <input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="contact-input"
              placeholder="your name"
              autoComplete="name"
              required
            />

            <label className="label-field" htmlFor="contact-subject">
              subject
            </label>
            <input
              id="contact-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
              className="contact-input"
              placeholder="what's this about?"
              required
            />

            <label className="label-field" htmlFor="contact-message">
              message
            </label>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={4000}
              rows={6}
              className="contact-input contact-textarea"
              placeholder="tell me more…"
              required
            />

            <div className="contact-form-actions">
              <button type="submit" className="btn btn-primary" disabled={status === 'sending'}>
                {status === 'sending' ? 'sending…' : 'send message'}
              </button>
              {status === 'sent' ? (
                <span className="contact-status is-ok">message sent — thanks.</span>
              ) : null}
              {status === 'error' && errorMsg ? (
                <span className="contact-status is-err">{errorMsg}</span>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
