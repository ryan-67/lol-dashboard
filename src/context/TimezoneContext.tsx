import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabaseClient'
import { setTimezoneStore } from '../lib/timezoneStore'
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_OPTIONS,
  TIMEZONE_STORAGE_KEY,
  normalizeTimezone,
} from '../lib/timezones'

interface TimezoneContextValue {
  timezone: string
  setTimezone: (tz: string) => Promise<void>
  timezoneOptions: typeof TIMEZONE_OPTIONS
}

const TimezoneContext = createContext<TimezoneContextValue | null>(null)

function readStoredTimezone(): string {
  try {
    return normalizeTimezone(localStorage.getItem(TIMEZONE_STORAGE_KEY))
  } catch {
    return DEFAULT_TIMEZONE
  }
}

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [timezone, setTimezoneState] = useState(readStoredTimezone)

  useEffect(() => {
    setTimezoneStore(timezone)
  }, [timezone])

  useEffect(() => {
    if (!user) {
      setTimezoneState(readStoredTimezone())
      return
    }

    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return
      const profileTz = normalizeTimezone((data as { timezone?: string | null } | null)?.timezone)
      setTimezoneState(profileTz)
      setTimezoneStore(profileTz)
      try {
        localStorage.setItem(TIMEZONE_STORAGE_KEY, profileTz)
      } catch {
        /* ignore */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  const setTimezone = useCallback(
    async (tz: string) => {
      const next = normalizeTimezone(tz)
      setTimezoneState(next)
      setTimezoneStore(next)
      try {
        localStorage.setItem(TIMEZONE_STORAGE_KEY, next)
      } catch {
        /* ignore */
      }

      if (user) {
        await supabase.from('profiles').upsert({ id: user.id, timezone: next }, { onConflict: 'id' })
      }
    },
    [user],
  )

  const value = useMemo(
    () => ({ timezone, setTimezone, timezoneOptions: TIMEZONE_OPTIONS }),
    [timezone, setTimezone],
  )

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>
}

export function useTimezone() {
  const ctx = useContext(TimezoneContext)
  if (!ctx) throw new Error('useTimezone must be used inside TimezoneProvider')
  return ctx
}
