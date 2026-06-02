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
