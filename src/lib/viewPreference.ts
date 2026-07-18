export type DefaultView = 'duo' | 'chat' | 'dashboard'

export const VIEW_PREF_STORAGE_KEY = 'nucky-default-view'
export const DEFAULT_VIEW: DefaultView = 'duo'

export function isDefaultView(value: unknown): value is DefaultView {
  return value === 'duo' || value === 'chat' || value === 'dashboard'
}

export function pathForView(view: DefaultView): string {
  if (view === 'chat') return '/chat'
  if (view === 'dashboard') return '/dashboard'
  return '/duo'
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
