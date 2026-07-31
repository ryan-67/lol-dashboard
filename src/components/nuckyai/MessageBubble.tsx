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
import { isCompareChartPayload, isRadarChartPayload } from './types'
import NuckyRadarChart from './NuckyRadarChart'
import NuckyCompareChart from './NuckyCompareChart'
import ShareableChart from '../ui/ShareableChart'
import ClipboardToast from '../ui/ClipboardToast'
import { extractPlainTextFromAssistantMessage } from '../../lib/extractPlainTextFromMessage'
import { formatMessageTimestamp } from '../../lib/formatMessageTimestamp'
import { CHART, CHART_TOOLTIP_PROPS } from '../../theme/chartTheme'

interface MessageBubbleProps {
  message: MessageRow
  isAssistant: boolean
  onRegenerate?: () => void
  onRetry?: () => void
  /** When true, incomplete chart JSON is shown as plain text until stream completes. */
  deferCharts?: boolean
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

function isCompleteChartJson(json: string): boolean {
  try {
    JSON.parse(json)
    return true
  } catch {
    return false
  }
}

function parseBlocks(content: string, deferCharts: boolean): TextBlock[] {
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
      const chartJson = match[2].trim()
      if (deferCharts && !isCompleteChartJson(chartJson)) {
        blocks.push({ type: 'text', content: `\`\`\`chart\n${chartJson}` })
      } else {
        blocks.push({ type: 'chart', content: chartJson })
      }
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

function renderText(content: string, opts: { isAssistant?: boolean } = {}) {
  // Hide leaked tool dumps / match-stats blocks if the model echoes them.
  // Only strip self-greets from assistant text — never mutate the user's typed message
  // ("hey nucky analyze…" must stay intact in the bubble).
  let cleaned = content.replace(/\[MATCH_STATS\][\s\S]*?(?=\[[A-Z_]+\]|```|$)/gi, '')
  if (opts.isAssistant) {
    cleaned = cleaned
      .replace(/^\s*hey\s+nucky[.!]?\s*/i, '')
      .replace(/^\s*hi\s+nucky[.!]?\s*/i, '')
  }
  cleaned = cleaned.trim()
  const lines = cleaned.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Section headers like "Verdict:" or "**Verdict**"
    if (/^\s*(\*\*)?(Verdict|TL;DR|Take|Summary)(\*\*)?\s*:?\s*$/i.test(line.trim())) {
      nodes.push(
        <p
          key={`h-${i}`}
          className="text-xs uppercase tracking-wide text-[var(--accent)] mt-3 mb-1 font-medium"
        >
          {line.replace(/\*\*/g, '').replace(/:$/, '').trim()}
        </p>,
      )
      i += 1
      continue
    }
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

  if (isCompareChartPayload(payload)) {
    return <NuckyCompareChart payload={payload} />
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

  const colors = [CHART.series, CHART.seriesAlt, '#a8a49a', '#7a8a9a']

  return (
    <ShareableChart className="border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 my-2 rounded-[var(--radius-sm)]">
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
    </ShareableChart>
  )
}

function relativeTime(value?: string) {
  return formatMessageTimestamp(value)
}

export default function MessageBubble({
  message,
  isAssistant,
  onRegenerate,
  onRetry,
  deferCharts = false,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const blocks = useMemo(
    () => parseBlocks(message.content, deferCharts),
    [message.content, deferCharts],
  )

  const copy = async () => {
    await navigator.clipboard.writeText(extractPlainTextFromAssistantMessage(message.content))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 500)
  }

  const isThinking = Boolean(message.thinking)
  const isError = Boolean(message.retryable) || /^failed to fetch/i.test(message.content.trim())
  const roleLabel = isAssistant ? 'nucky' : 'you'

  return (
    <div className={`nuckyai-turn${isAssistant ? '' : ' nuckyai-turn--user'}`}>
      <div
        className={[
          'nuckyai-bubble',
          isAssistant ? 'nuckyai-bubble--assistant' : 'nuckyai-bubble--user',
          isError ? 'nuckyai-bubble--error' : '',
          isThinking ? 'nuckyai-bubble--thinking' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="nuckyai-bubble-meta">
          <span className="nuckyai-bubble-role">{roleLabel}</span>
          {!isThinking && relativeTime(message.created_at) ? (
            <span className="nuckyai-bubble-time">{relativeTime(message.created_at)}</span>
          ) : null}
        </div>
        {isThinking ? (
          <p className="nuckyai-bubble-thinking">{message.content}</p>
        ) : (
          <>
            {blocks.map((block, idx) => {
              if (block.type === 'text') {
                return (
                  <div key={`t-${idx}`} className="nuckyai-bubble-body">
                    {renderText(block.content, { isAssistant })}
                  </div>
                )
              }
              if (block.type === 'chart') {
                return <ChartBlock key={`c-${idx}`} json={block.content} />
              }
              return (
                <div key={`code-${idx}`} className="nuckyai-code-block">
                  <div className="nuckyai-code-toolbar">
                    <button
                      type="button"
                      className="nuckyai-action"
                      onClick={() => navigator.clipboard.writeText(block.content)}
                    >
                      copy
                    </button>
                  </div>
                  <pre className="nuckyai-code-pre">{block.content}</pre>
                </div>
              )
            })}

            {isAssistant ? (
              <div className="nuckyai-copy-row">
                <button type="button" className="nuckyai-action" onClick={() => void copy()}>
                  copy
                </button>
                <ClipboardToast visible={copied} />
                <button type="button" className="nuckyai-action" onClick={onRegenerate}>
                  regenerate
                </button>
                {message.retryable ? (
                  <button type="button" className="nuckyai-action" onClick={onRetry}>
                    retry
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
