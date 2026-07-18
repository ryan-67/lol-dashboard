import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabaseClient'
import {
  DEFAULT_VIEW,
  isDefaultView,
  pathForView,
  readLocalViewPreference,
  writeLocalViewPreference,
  type DefaultView,
} from '../lib/viewPreference'

interface ViewPreferenceContextValue {
  defaultView: DefaultView
  setDefaultView: (view: DefaultView) => Promise<void>
  homePath: string
  loading: boolean
}

const ViewPreferenceContext = createContext<ViewPreferenceContextValue | null>(null)

export function ViewPreferenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [defaultView, setDefaultViewState] = useState<DefaultView>(readLocalViewPreference)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!user) {
        if (mounted) {
          setDefaultViewState(readLocalViewPreference())
          setLoading(false)
        }
        return
      }
      setLoading(true)
      const { data } = await supabase
        .from('profiles')
        .select('default_view')
        .eq('id', user.id)
        .maybeSingle()
      if (!mounted) return
      const fromDb = data?.default_view
      if (isDefaultView(fromDb)) {
        setDefaultViewState(fromDb)
        writeLocalViewPreference(fromDb)
      } else {
        setDefaultViewState(readLocalViewPreference())
      }
      setLoading(false)
    }
    void load()
    return () => {
      mounted = false
    }
  }, [user])

  const setDefaultView = useCallback(
    async (view: DefaultView) => {
      setDefaultViewState(view)
      writeLocalViewPreference(view)
      if (!user) return
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, default_view: view }, { onConflict: 'id' })
      if (error) {
        console.warn('[viewPreference] failed to persist', error.message)
      }
    },
    [user],
  )

  return (
    <ViewPreferenceContext.Provider
      value={{
        defaultView,
        setDefaultView,
        homePath: pathForView(defaultView),
        loading,
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
