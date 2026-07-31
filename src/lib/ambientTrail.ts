/** Opt-in ambient cursor trail preference for the app shell (desktop fine pointers only). */

const STORAGE_KEY = 'nucky-ambient-trail'
export const AMBIENT_TRAIL_EVENT = 'nucky:ambient-trail-change'

export function ambientTrailSupported(): boolean {
  if (typeof window === 'undefined') return false
  const fine = window.matchMedia('(pointer: fine)').matches
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return fine && !reduced
}

export function ambientTrailEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1' && ambientTrailSupported()
  } catch {
    return false
  }
}

export function setAmbientTrailEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // storage unavailable — preference stays session-only via the event below
  }
  window.dispatchEvent(new CustomEvent(AMBIENT_TRAIL_EVENT, { detail: enabled }))
}
