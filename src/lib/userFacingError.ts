/** Map internal load failures to a safe user-facing message. */
export function sanitizeUserFacingError(_err: unknown): string {
  return 'Failed to load data — please contact nuckyaigg@gmail.com to report this issue.'
}

export const DATA_UNAVAILABLE = 'Data unavailable'
export const DATA_LOADING = 'Loading…'
