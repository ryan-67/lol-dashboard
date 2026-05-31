import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const inputClass =
  'w-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] font-[family-name:var(--font-mono)] outline-none focus:border-[var(--border-focus)]'

export default function ResetPassword() {
  const [codeValid, setCodeValid] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (!code) {
      setCodeValid(false)
      return
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      setCodeValid(!exchangeError)
      if (exchangeError) setError(exchangeError.message)
    })
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('passwords do not match')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setSuccess(true)
  }

  if (codeValid === null) {
    return (
      <div className="card max-w-md mx-auto mt-8">
        <p className="text-secondary text-sm">verifying reset link...</p>
      </div>
    )
  }

  if (codeValid === false) {
    return (
      <div className="card max-w-md mx-auto mt-8">
        <p className="text-secondary text-sm">invalid or expired reset link</p>
      </div>
    )
  }

  if (success) {
    return (
      <div className="card max-w-md mx-auto mt-8">
        <p className="text-secondary text-sm mb-4">password updated</p>
        <Link to="/" className="btn inline-flex">
          go home
        </Link>
      </div>
    )
  }

  return (
    <div className="card max-w-md mx-auto mt-8">
      <h2 className="card-title">set new password</h2>
      <form className="flex flex-col gap-3 mt-4" onSubmit={handleSubmit}>
        <input
          type="password"
          className={inputClass}
          placeholder="new password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
        <input
          type="password"
          className={inputClass}
          placeholder="confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
        {error && <p className="text-sm text-[#c45c5c]">{error}</p>}
        <button type="submit" className="btn w-full" disabled={submitting}>
          update password
        </button>
      </form>
    </div>
  )
}
