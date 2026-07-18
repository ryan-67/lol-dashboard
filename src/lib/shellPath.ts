/** Prefix entity/tab paths so duo mode stays on `/duo/*`. */

export function isDuoPath(pathname: string): boolean {
  return pathname.startsWith('/duo')
}

export function isDashboardPath(pathname: string): boolean {
  return pathname.startsWith('/dashboard')
}

/**
 * entity paths look like `/players/faker`, `/teams/t1`, `/champions/ahri`,
 * `/series/...`, `/tournaments/...`
 */
export function shellAwarePath(path: string, pathname: string): string {
  if (!path.startsWith('/')) return path
  if (path.startsWith('/duo') || path.startsWith('/dashboard') || path.startsWith('/chat')) {
    return path
  }

  // Keep marketing/legal absolute
  if (
    path === '/' ||
    path.startsWith('/#') ||
    path.startsWith('/auth') ||
    path.startsWith('/profile') ||
    path.startsWith('/contact') ||
    path.startsWith('/terms') ||
    path.startsWith('/private')
  ) {
    return path
  }

  if (isDuoPath(pathname)) {
    if (path === '/players' || path === '/teams' || path === '/champions' || path === '/matchups' || path === '/tournaments') {
      return `/duo${path}`
    }
    return `/duo${path}`
  }

  if (pathname.startsWith('/chat')) {
    return path.startsWith('/dashboard') ? path : `/dashboard${path === '/' ? '' : path}`
  }

  return path.startsWith('/dashboard') ? path : `/dashboard${path === '/' ? '' : path}`
}
