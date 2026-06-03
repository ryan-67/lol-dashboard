import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const params = new URLSearchParams(window.location.search)
    const oauthError = params.get('error')
    const oauthDescription = params.get('error_description')

    if (oauthError) {
      setError(oauthDescription ?? oauthError)
      return
    }

    async function finishAuth() {
      const code = params.get('code')
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          if (mounted) setError(exchangeError.message)
          return
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session && mounted) {
        navigate('/', { replace: true })
        return
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      if (hashParams.get('access_token') && mounted) {
        navigate('/', { replace: true })
        return
      }
    }

    void finishAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        navigate('/', { replace: true })
      }
    })

    const timeout = window.setTimeout(() => {
      if (mounted) {
        setError((prev) => prev ?? 'login timed out. try again.')
      }
    }, 15000)

    return () => {
      mounted = false
      subscription.unsubscribe()
      window.clearTimeout(timeout)
    }
  }, [navigate])

  if (error) {
    return (
      <div className="card max-w-md mx-auto mt-8 space-y-3">
        <p className="text-secondary text-sm">login failed: {error}</p>
        <Link to="/" className="btn inline-block">
          back home
        </Link>
      </div>
    )
  }

  return (
    <div className="card max-w-md mx-auto mt-8">
      <p className="text-secondary text-sm">logging you in...</p>
    </div>
  )
}
