export const DEFAULT_TIMEZONE = 'America/Los_Angeles'

export const TIMEZONE_STORAGE_KEY = 'nucky_timezone'

export interface TimezoneOption {
  value: string
  label: string
}

/** Curated IANA zones for the profile dropdown. */
export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'America/Los_Angeles', label: 'Pacific (PST/PDT)' },
  { value: 'America/Denver', label: 'Mountain (MST/MDT)' },
  { value: 'America/Chicago', label: 'Central (CST/CDT)' },
  { value: 'America/New_York', label: 'Eastern (EST/EDT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKST/AKDT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)' },
  { value: 'Asia/Shanghai', label: 'China (CST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
]

export function isValidTimezone(tz: string): boolean {
  return TIMEZONE_OPTIONS.some((opt) => opt.value === tz)
}

export function normalizeTimezone(tz: string | null | undefined): string {
  if (tz && isValidTimezone(tz)) return tz
  return DEFAULT_TIMEZONE
}
