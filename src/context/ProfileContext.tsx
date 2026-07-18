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

export interface UserProfileRow {
  id: string
  username: string | null
  avatar_url: string | null
  favorite_player: string | null
  favorite_team: string | null
  is_subscribed: boolean | null
  plan: string | null
}

interface ProfileContextValue {
  profile: UserProfileRow | null
  loading: boolean
  refreshProfile: () => Promise<void>
  applyLocalProfile: (patch: Partial<UserProfileRow>) => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfileRow | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, favorite_player, favorite_team, is_subscribed, plan')
      .eq('id', user.id)
      .maybeSingle()
    setProfile((data as UserProfileRow | null) ?? null)
    setLoading(false)
  }, [user])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile])

  const applyLocalProfile = useCallback((patch: Partial<UserProfileRow>) => {
    setProfile((prev: UserProfileRow | null) => {
      if (!prev && !patch.id) return prev
      const base: UserProfileRow = prev ?? {
        id: patch.id ?? '',
        username: null,
        avatar_url: null,
        favorite_player: null,
        favorite_team: null,
        is_subscribed: null,
        plan: null,
      }
      return { ...base, ...patch }
    })
  }, [])

  return (
    <ProfileContext.Provider value={{ profile, loading, refreshProfile, applyLocalProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
