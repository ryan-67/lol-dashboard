export interface RawObjectiveEvent {
  timestamp?: number
  eventType?: string
  side?: string
  objectiveType?: string
  playerName?: string
}

export interface NormalizedObjectiveEvent {
  minute: number
  objectiveType: string
  side: string
  eventType?: string
  playerName?: string
}

/** Cito objective timestamps are ms from game start (same as goldGraph). */
export function normalizeCitoObjectives(events: unknown): NormalizedObjectiveEvent[] {
  if (!Array.isArray(events)) return []
  const out: NormalizedObjectiveEvent[] = []
  for (const raw of events) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as RawObjectiveEvent
    const ts = e.timestamp
    if (typeof ts !== 'number' || Number.isNaN(ts)) continue
    const minute = Math.max(0, Math.round(ts / 60_000))
    const objectiveType = String(e.objectiveType ?? e.eventType ?? 'objective')
    const side = String(e.side ?? '')
    if (!side) continue
    out.push({
      minute,
      objectiveType,
      side,
      eventType: e.eventType,
      playerName: e.playerName,
    })
  }
  return out.sort((a, b) => a.minute - b.minute)
}
