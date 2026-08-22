export interface ProfileRow {
  id: string
  username: string | null
  avatar_url: string | null
  is_subscribed: boolean
  plan: string
}

export interface ConversationRow {
  id: string
  title: string
  updated_at: string
  created_at: string
}

export type ChatErrorKind = 'quota' | 'auth' | 'forbidden' | 'server' | 'unknown'

export interface AgentChatError {
  kind: ChatErrorKind
  message: string
  retryable: boolean
  code?: string
}

export interface MessageRow {
  id?: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  created_at?: string
  retryable?: boolean
  /** True while waiting for first streamed token — shows thinking copy, hides actions */
  thinking?: boolean
  /** Client id pairing a user prompt to the assistant turn it produced. */
  requestId?: string
  kind?: 'text' | 'error'
  errorKind?: ChatErrorKind
}

export interface ChartDataset {
  label: string
  data: number[]
}

export interface ChartPayload {
  type: 'bar' | 'line'
  title: string
  labels: string[]
  datasets: ChartDataset[]
}

export interface RadarChartTeamSeries {
  metric: string
  label?: string
  valueNorm: number
  avgNorm: number
  formatted: string
  formattedAvg: string
}

export interface RadarChartPayload {
  type: 'radar'
  title: string
  split?: string
  league?: string
  teams: Array<{
    name: string
    league: string
    winrate?: number
    games?: number
    series: RadarChartTeamSeries[]
  }>
}

export interface CompareChartPayload {
  type: 'compare'
  title: string
  subtitle?: string
  left: { name: string; meta?: string }
  right: { name: string; meta?: string }
  metrics: Array<{
    label: string
    left: number
    right: number
    higherIsBetter?: boolean
  }>
}

export type AnyChartPayload = ChartPayload | RadarChartPayload | CompareChartPayload

export function isRadarChartPayload(payload: AnyChartPayload): payload is RadarChartPayload {
  return payload.type === 'radar' && Array.isArray((payload as RadarChartPayload).teams)
}

export function isCompareChartPayload(payload: AnyChartPayload): payload is CompareChartPayload {
  return (
    payload.type === 'compare' &&
    Array.isArray((payload as CompareChartPayload).metrics) &&
    Boolean((payload as CompareChartPayload).left?.name) &&
    Boolean((payload as CompareChartPayload).right?.name)
  )
}
