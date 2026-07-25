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
import { fetchSubscriptionState } from '../lib/subscription'
import {
  DEFAULT_VIEW,
  effectiveHomeView,
  isDefaultView,
  pathForView,
  readLocalViewPreference,
  writeLocalViewPreference,
  type DefaultView,
} from '../lib/viewPreference'

interface ViewPreferenceContextValue {
  /** Saved preference (may be duo/chat even for free users). */
  preferredView: DefaultView
  /** Effective default after subscription gating. */
  defaultView: DefaultView
  setDefaultView: (view: DefaultView) => Promise<void>
  homePath: string
  loading: boolean
  isSubscribed: boolean
}

const ViewPreferenceContext = createContext<ViewPreferenceContextValue | null>(null)

export function ViewPreferenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [preferredView, setPreferredView] = useState<DefaultView>(readLocalViewPreference)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!user) {
        if (mounted) {
          setPreferredView(readLocalViewPreference())
          setIsSubscribed(false)
          setLoading(false)
        }
        return
      }
      setLoading(true)
      const [{ data }, subState] = await Promise.all([
        supabase.from('profiles').select('default_view').eq('id', user.id).maybeSingle(),
        fetchSubscriptionState(user.id),
      ])
      if (!mounted) return
      const fromDb = data?.default_view
      if (isDefaultView(fromDb)) {
        setPreferredView(fromDb)
        writeLocalViewPreference(fromDb)
      } else {
        setPreferredView(readLocalViewPreference())
      }
      setIsSubscribed(subState.isSubscribed)
      setLoading(false)
    }
    void load()
    return () => {
      mounted = false
    }
  }, [user])

  const setDefaultView = useCallback(
    async (view: DefaultView) => {
      setPreferredView(view)
      writeLocalViewPreference(view)
      if (!user) return
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, default_view: view }, { onConflict: 'id' })
      if (error) {
        console.warn('[viewPreference] failed to persist', error.message)
        throw new Error(error.message)
      }
    },
    [user],
  )

  const defaultView = useMemo(
    () => effectiveHomeView(preferredView, Boolean(user && isSubscribed)),
    [preferredView, user, isSubscribed],
  )

  return (
    <ViewPreferenceContext.Provider
      value={{
        preferredView,
        defaultView,
        setDefaultView,
        homePath: pathForView(defaultView),
        loading,
        isSubscribed: Boolean(user && isSubscribed),
      }}
    >
      {children}
    </ViewPreferenceContext.Provider>
  )
}

export function useViewPreference() {
  const ctx = useContext(ViewPreferenceContext)
  if (!ctx) throw new Error('useViewPreference must be used within ViewPreferenceProvider')
  return ctx
}

export { pathForView, DEFAULT_VIEW }
