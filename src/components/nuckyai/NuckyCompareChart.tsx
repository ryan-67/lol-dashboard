import type { CompareChartPayload } from './types'
import ShareableChart from '../ui/ShareableChart'
import { CHART } from '../../theme/chartTheme'

function formatValue(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 100) return String(Math.round(n))
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 100) / 100)
}

export default function NuckyCompareChart({ payload }: { payload: CompareChartPayload }) {
  const rows = payload.metrics.map((m) => {
    const max = Math.max(Math.abs(m.left), Math.abs(m.right), 0.0001)
    return {
      ...m,
      leftPct: (Math.abs(m.left) / max) * 100,
      rightPct: (Math.abs(m.right) / max) * 100,
      leftWins: m.higherIsBetter === false ? m.left < m.right : m.left > m.right,
      rightWins: m.higherIsBetter === false ? m.right < m.left : m.right > m.left,
    }
  })

  return (
    <ShareableChart bare className="nucky-compare-chart border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 my-2 rounded-[var(--radius-sm)]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">Comparison</div>
          <div className="text-sm text-[var(--text-primary)] font-medium">{payload.title}</div>
        </div>
        {payload.subtitle ? (
          <div className="text-[11px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)] shrink-0">
            {payload.subtitle}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-2 items-center text-xs">
        <div className="text-right text-[var(--accent)] font-medium truncate" title={payload.left.name}>
          {payload.left.name}
          {payload.left.meta ? (
            <span className="block text-[10px] text-[var(--text-tertiary)] font-normal">{payload.left.meta}</span>
          ) : null}
        </div>
        <div className="text-center text-[var(--text-tertiary)] text-[10px]">vs</div>
        <div
          className="text-left font-medium truncate"
          style={{ color: CHART.seriesAlt }}
          title={payload.right.name}
        >
          {payload.right.name}
          {payload.right.meta ? (
            <span className="block text-[10px] text-[var(--text-tertiary)] font-normal">{payload.right.meta}</span>
          ) : null}
        </div>

        {rows.map((row) => (
          <div key={row.label} className="contents">
            <div className="flex items-center justify-end gap-2 min-w-0">
              <span
                className={`font-[family-name:var(--font-mono)] tabular-nums ${
                  row.leftWins ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                {formatValue(row.left)}
              </span>
              <div className="h-1.5 w-[min(100%,7rem)] rounded-full bg-[var(--bg-surface)] overflow-hidden flex justify-end">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${row.leftPct}%`, opacity: row.leftWins ? 1 : 0.55 }}
                />
              </div>
            </div>
            <div className="text-center text-[10px] text-[var(--text-tertiary)] px-1 whitespace-nowrap">
              {row.label}
            </div>
            <div className="flex items-center justify-start gap-2 min-w-0">
              <div className="h-1.5 w-[min(100%,7rem)] rounded-full bg-[var(--bg-surface)] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${row.rightPct}%`,
                    opacity: row.rightWins ? 1 : 0.55,
                    background: CHART.seriesAlt,
                  }}
                />
              </div>
              <span
                className={`font-[family-name:var(--font-mono)] tabular-nums ${
                  row.rightWins ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                {formatValue(row.right)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ShareableChart>
  )
}
