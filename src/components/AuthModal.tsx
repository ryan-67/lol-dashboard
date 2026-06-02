import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'

type AuthView = 'signin' | 'signup' | 'forgot'

interface AuthModalProps {
  open: boolean
  onClose: () => void
}

const inputClass =
  'w-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] font-[family-name:var(--font-mono)] outline-none focus:border-[var(--border-focus)]'

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const {
    signInWithEmail,
    signUpWithEmail,
    resetPasswordForEmail,
    signInWithGoogle,
    signInWithDiscord,
  } = useAuth()

  const [view, setView] = useState<AuthView>('signin')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [forgotSuccess, setForgotSuccess] = useState(false)

  if (!open) return null

  const resetForm = () => {
    setEmail('')
    setUsername('')
    setPassword('')
    setConfirmPassword('')
    setError(null)
    setForgotSuccess(false)
  }

  const switchView = (next: AuthView) => {
    resetForm()
    setView(next)
  }

  const handleOverlayClick = () => {
    resetForm()
    setView('signin')
    onClose()
  }

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: signInError } = await signInWithEmail(email, password)
    setSubmitting(false)
    if (signInError) {
      setError(signInError)
      return
    }
    resetForm()
    setView('signin')
    onClose()
  }

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('passwords do not match')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error: signUpError } = await signUpWithEmail(email, password, username)
    setSubmitting(false)
    if (signUpError) {
      setError(signUpError)
      return
    }
    resetForm()
    setView('signin')
    onClose()
  }

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: resetError } = await resetPasswordForEmail(email)
    setSubmitting(false)
    if (resetError) {
      setError(resetError)
      return
    }
    setForgotSuccess(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(12, 12, 12, 0.85)' }}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        data-lenis-prevent
      >
        {view === 'signin' && (
          <>
            <h2 className="card-title">sign in</h2>
            <form className="flex flex-col gap-3 mt-4" onSubmit={handleSignIn}>
              <input
                type="email"
                className={inputClass}
                placeholder="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <input
                type="password"
                className={inputClass}
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              {error && <p className="text-sm text-[#c45c5c]">{error}</p>}
              <button type="submit" className="btn w-full" disabled={submitting}>
                sign in
              </button>
            </form>
            <p className="text-secondary text-xs mt-3">
              don&apos;t have an account?{' '}
              <button type="button" className="text-accent underline" onClick={() => switchView('signup')}>
                sign up
              </button>
            </p>
            <p className="text-secondary text-xs mt-1">
              <button type="button" className="text-accent underline" onClick={() => switchView('forgot')}>
                forgot password?
              </button>
            </p>
            <OAuthSection onGoogle={signInWithGoogle} onDiscord={signInWithDiscord} />
          </>
        )}

        {view === 'signup' && (
          <>
            <h2 className="card-title">create account</h2>
            <form className="flex flex-col gap-3 mt-4" onSubmit={handleSignUp}>
              <input
                type="text"
                className={inputClass}
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
              <input
                type="email"
                className={inputClass}
                placeholder="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <input
                type="password"
                className={inputClass}
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <input
                type="password"
                className={inputClass}
                placeholder="confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              {error && <p className="text-sm text-[#c45c5c]">{error}</p>}
              <button type="submit" className="btn w-full" disabled={submitting}>
                create account
              </button>
            </form>
            <p className="text-secondary text-xs mt-3">
              already have an account?{' '}
              <button type="button" className="text-accent underline" onClick={() => switchView('signin')}>
                sign in
              </button>
            </p>
            <OAuthSection onGoogle={signInWithGoogle} onDiscord={signInWithDiscord} />
          </>
        )}

        {view === 'forgot' && (
          <>
            <h2 className="card-title">reset password</h2>
            {forgotSuccess ? (
              <p className="text-secondary text-sm mt-4">
                password reset link sent, check your email
              </p>
            ) : (
              <form className="flex flex-col gap-3 mt-4" onSubmit={handleForgot}>
                <input
                  type="email"
                  className={inputClass}
                  placeholder="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                {error && <p className="text-sm text-[#c45c5c]">{error}</p>}
                <button type="submit" className="btn w-full" disabled={submitting}>
                  send reset link
                </button>
              </form>
            )}
            <p className="text-secondary text-xs mt-3">
              <button type="button" className="text-accent underline" onClick={() => switchView('signin')}>
                back to sign in
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function OAuthSection({
  onGoogle,
  onDiscord,
}: {
  onGoogle: () => Promise<void>
  onDiscord: () => Promise<void>
}) {
  return (
    <div className="mt-6">
      <p className="text-secondary text-xs text-center mb-3">or continue with</p>
      <div className="flex gap-2">
        <button type="button" className="btn flex-1" onClick={() => onGoogle()}>
          google
        </button>
        <button type="button" className="btn flex-1" onClick={() => onDiscord()}>
          discord
        </button>
      </div>
    </div>
  )
}
