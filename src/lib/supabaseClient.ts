import { createClient } from '@supabase/supabase-js'

function readEnv(key: string): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const fromVite = (import.meta.env as Record<string, string | undefined>)[key]
    if (fromVite) return fromVite.trim()
  }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return (proc?.env?.[key] ?? '').trim()
}

const supabaseUrl = readEnv('VITE_SUPABASE_URL').replace(/\/$/, '') || readEnv('SUPABASE_URL').replace(/\/$/, '')
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY') || readEnv('SUPABASE_ANON_KEY')

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  const missing: string[] = []
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  console.error(
    `[lol-dashboard] Missing Supabase env: ${missing.join(', ')}. ` +
      'Add them to .env (see .env.example) and restart the dev server.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
  },
})
