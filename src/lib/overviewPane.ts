/** Overview Hub | Board preference (v3 IA). */

export type OverviewPane = 'hub' | 'board'

export const OVERVIEW_PANE_STORAGE_KEY = 'nucky-overview-pane'
export const DEFAULT_OVERVIEW_PANE: OverviewPane = 'hub'

export const isOverviewPane = (value: unknown): value is OverviewPane =>
  value === 'hub' || value === 'board'

export const readLocalOverviewPane = (): OverviewPane => {
  if (typeof localStorage === 'undefined') return DEFAULT_OVERVIEW_PANE
  const raw = localStorage.getItem(OVERVIEW_PANE_STORAGE_KEY)
  return isOverviewPane(raw) ? raw : DEFAULT_OVERVIEW_PANE
}

export const writeLocalOverviewPane = (pane: OverviewPane): void => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(OVERVIEW_PANE_STORAGE_KEY, pane)
}
