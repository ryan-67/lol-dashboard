import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnyChartPayload, ChartPayload, MessageRow } from './types'
import { isRadarChartPayload } from './types'
import NuckyRadarChart from './NuckyRadarChart'
import { CHART, CHART_TOOLTIP_PROPS } from '../../theme/chartTheme'

interface MessageBubbleProps {
  message: MessageRow
  isAssistant: boolean
  onRegenerate?: () => void
  onRetry?: () => void
}

interface TextBlock {
  type: 'text' | 'code' | 'chart'
  content: string
}

function splitBareCharts(text: string): TextBlock[] {
  const blocks: TextBlock[] = []
  const bareChart = /(?:^|\n)chart\s*\n(\{[\s\S]*?\})(?=\n\n|\n(?![\s"{\[])|$)/gi
  let last = 0
  let match: RegExpExecArray | null

  while ((match = bareChart.exec(text)) !== null) {
    const start = match.index + (match[0].startsWith('\n') ? 1 : 0)
    if (start > last) {
      blocks.push({ type: 'text', content: text.slice(last, start) })
    }
    blocks.push({ type: 'chart', content: match[1].trim() })
    last = match.index + match[0].length
  }

  if (last < text.length) {
    blocks.push({ type: 'text', content: text.slice(last) })
  }

  return blocks.length ? blocks : [{ type: 'text', content: text }]
}

function parseBlocks(content: string): TextBlock[] {
  const blocks: TextBlock[] = []
  const chartOrCode = /```(chart|[\w-]+)?\n([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = chartOrCode.exec(content)) !== null) {
    if (match.index > last) {
      for (const split of splitBareCharts(content.slice(last, match.index))) {
        blocks.push(split)
      }
    }
    const lang = (match[1] ?? '').toLowerCase()
    if (lang === 'chart') {
      blocks.push({ type: 'chart', content: match[2].trim() })
    } else {
      blocks.push({ type: 'code', content: match[2].trim() })
    }
    last = match.index + match[0].length
  }

  if (last < content.length) {
    for (const split of splitBareCharts(content.slice(last))) {
      blocks.push(split)
    }
  }

  return blocks.filter((b) => b.content.trim().length > 0)
}

function inlineBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${part}-${idx}`}>{part.slice(2, -2)}</strong>
    }
    return <span key={`${part}-${idx}`}>{part}</span>
  })
}

function renderText(content: string) {
  const lines = content.trim().split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i += 1
      }
      nodes.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 my-2 text-sm text-[var(--text-primary)] space-y-1">
          {items.map((item, idx) => (
            <li key={`${item}-${idx}`}>{inlineBold(item)}</li>
          ))}
        </ul>,
      )
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i += 1
      }
      nodes.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 my-2 text-sm text-[var(--text-primary)] space-y-1">
          {items.map((item, idx) => (
            <li key={`${item}-${idx}`}>{inlineBold(item)}</li>
          ))}
        </ol>,
      )
      continue
    }

    if (line.trim()) {
      nodes.push(
        <p key={`p-${i}`} className="text-sm text-[var(--text-primary)] leading-6 mb-2">
          {inlineBold(line)}
        </p>,
      )
    } else {
      nodes.push(<div key={`sp-${i}`} className="h-2" />)
    }
    i += 1
  }
  return nodes
}

function ChartBlock({ json }: { json: string }) {
  const payload = useMemo(() => {
    try {
      return JSON.parse(json) as AnyChartPayload
    } catch {
      return null
    }
  }, [json])

  if (!payload) {
    return (
      <pre className="border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 text-xs text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
        {json}
      </pre>
    )
  }

  if (isRadarChartPayload(payload)) {
    return <NuckyRadarChart payload={payload} />
  }

  const barPayload = payload as ChartPayload
  if (!barPayload.labels?.length || !barPayload.datasets?.length) {
    return (
      <pre className="border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 text-xs text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
        {json}
      </pre>
    )
  }

  const data = barPayload.labels.map((label, idx) => {
    const row: Record<string, string | number> = { label }
    barPayload.datasets.forEach((set) => {
      row[set.label] = Number(set.data[idx] ?? 0)
    })
    return row
  })

  const colors = ['#c5a059', '#8c7340', '#9e8c7a', '#6a7a8c']

  return (
    <div className="border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 my-2">
      <div className="text-xs text-[var(--text-secondary)] mb-2">{barPayload.title}</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {barPayload.type === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                stroke={CHART.axis}
                tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              />
              <YAxis
                stroke={CHART.axis}
                tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              />
              <Tooltip {...CHART_TOOLTIP_PROPS} />
              <Legend />
              {barPayload.datasets.map((set, idx) => (
                <Line
                  key={set.label}
                  type="monotone"
                  dataKey={set.label}
                  stroke={colors[idx % colors.length]}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                stroke={CHART.axis}
                tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              />
              <YAxis
                stroke={CHART.axis}
                tick={{ fill: CHART.tick, fontSize: CHART.fontSize, fontFamily: CHART.fontFamily }}
              />
              <Tooltip {...CHART_TOOLTIP_PROPS} />
              <Legend />
              {barPayload.datasets.map((set, idx) => (
                <Bar
                  key={set.label}
                  dataKey={set.label}
                  fill={colors[idx % colors.length]}
                  stroke={colors[idx % colors.length]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function relativeTime(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const delta = Date.now() - d.getTime()
  if (delta < 60_000) return 'now'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  return `${Math.floor(delta / 86_400_000)}d ago`
}

export default function MessageBubble({ message, isAssistant, onRegenerate, onRetry }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const blocks = useMemo(() => parseBlocks(message.content), [message.content])

  const copy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className={`w-full ${isAssistant ? '' : 'flex justify-end'}`}>
      <div
        className={`border px-3 py-2 max-w-[95%] md:max-w-[85%] ${
          isAssistant
            ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
            : 'border-[var(--accent)] bg-[var(--accent-bg)]'
        } group`}
      >
        {blocks.map((block, idx) => {
          if (block.type === 'text') {
            return <div key={`t-${idx}`}>{renderText(block.content)}</div>
          }
          if (block.type === 'chart') {
            return <ChartBlock key={`c-${idx}`} json={block.content} />
          }
          return (
            <div key={`code-${idx}`} className="my-2 border border-[var(--border-subtle)] bg-[var(--bg-base)]">
              <div className="flex justify-end border-b border-[var(--border-subtle)] px-2 py-1">
                <button
                  type="button"
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)]"
                  onClick={() => navigator.clipboard.writeText(block.content)}
                >
                  copy
                </button>
              </div>
              <pre className="p-3 overflow-x-auto text-xs text-[var(--text-primary)] whitespace-pre-wrap">
                {block.content}
              </pre>
            </div>
          )
        })}

        {isAssistant && (
          <div className="mt-2 flex items-center gap-3 text-xs">
            <button
              type="button"
              className="text-[var(--text-secondary)] hover:text-[var(--accent)]"
              onClick={copy}
            >
              {copied ? 'copied' : 'copy'}
            </button>
            <button
              type="button"
              className="text-[var(--text-secondary)] hover:text-[var(--accent)]"
              onClick={onRegenerate}
            >
              regenerate
            </button>
            {message.retryable && (
              <button
                type="button"
                className="text-[var(--text-secondary)] hover:text-[var(--accent)]"
                onClick={onRetry}
              >
                retry
              </button>
            )}
          </div>
        )}
        {isAssistant && (
          <div className="mt-1 text-[11px] text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity">
            {relativeTime(message.created_at)}
          </div>
        )}
      </div>
    </div>
  )
}
