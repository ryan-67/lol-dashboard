const PRODUCTION_ORIGIN = 'https://nucky.gg'

export function getAuthRedirectUrl(path: string): string {
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}${path}`
  }
  return `${PRODUCTION_ORIGIN}${path}`
}
