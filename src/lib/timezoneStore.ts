import { DEFAULT_TIMEZONE, normalizeTimezone, TIMEZONE_STORAGE_KEY } from './timezones'

function readInitialTimezone(): string {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_TIMEZONE
    return normalizeTimezone(localStorage.getItem(TIMEZONE_STORAGE_KEY))
  } catch {
    return DEFAULT_TIMEZONE
  }
}

let activeTimezone = readInitialTimezone()

export function getTimezone(): string {
  return activeTimezone
}

export function setTimezoneStore(tz: string): void {
  activeTimezone = normalizeTimezone(tz)
}
