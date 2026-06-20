export interface ChatAttachment {
  url: string
  mimeType?: string
  name?: string
}

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

export interface MessageRow {
  id?: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  created_at?: string
  retryable?: boolean
  /** True while waiting for first streamed token — shows thinking copy, hides actions */
  thinking?: boolean
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

export type AnyChartPayload = ChartPayload | RadarChartPayload

export function isRadarChartPayload(payload: AnyChartPayload): payload is RadarChartPayload {
  return payload.type === 'radar' && Array.isArray((payload as RadarChartPayload).teams)
}
