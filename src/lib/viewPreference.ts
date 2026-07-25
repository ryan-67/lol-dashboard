export type DefaultView = 'duo' | 'chat' | 'dashboard'

export const VIEW_PREF_STORAGE_KEY = 'nucky-default-view'
/** Guests / free users land on dashboard; duo/chat are subscriber surfaces. */
export const DEFAULT_VIEW: DefaultView = 'dashboard'

export function isDefaultView(value: unknown): value is DefaultView {
  return value === 'duo' || value === 'chat' || value === 'dashboard'
}

export function pathForView(view: DefaultView): string {
  if (view === 'chat') return '/chat'
  if (view === 'dashboard') return '/dashboard'
  return '/duo'
}

/** Duo and full-chat modes require an active subscription. */
export function viewRequiresSubscription(view: DefaultView): boolean {
  return view === 'duo' || view === 'chat'
}

/**
 * Resolve the effective home view: free users cannot default to duo/chat.
 * Subscribers keep their saved preference.
 */
export function effectiveHomeView(
  preferred: DefaultView,
  isSubscribed: boolean,
): DefaultView {
  if (isSubscribed) return preferred
  if (viewRequiresSubscription(preferred)) return 'dashboard'
  return preferred
}

export function readLocalViewPreference(): DefaultView {
  if (typeof localStorage === 'undefined') return DEFAULT_VIEW
  const raw = localStorage.getItem(VIEW_PREF_STORAGE_KEY)
  return isDefaultView(raw) ? raw : DEFAULT_VIEW
}

export function writeLocalViewPreference(view: DefaultView): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(VIEW_PREF_STORAGE_KEY, view)
}
