/**
 * Shared Recharts styling — Signal Instrument.
 * Turquoise is the signal channel: primary series / model output.
 * Cream is the comparison/context series.
 */
export const CHART = {
  grid: 'rgba(125, 122, 112, 0.1)',
  axis: '#8e8a80',
  tick: '#7e7a70',
  /** Primary series / key metric line — the signal */
  accent: '#57c4cf',
  /** Secondary / comparison series — cream ink */
  accentDim: '#d8d4c8',
  series: '#57c4cf',
  seriesAlt: '#d8d4c8',
  /** Soft fill under signal lines/areas */
  accentFill: 'rgba(87, 196, 207, 0.14)',
  tooltip: {
    backgroundColor: '#0c0e0f',
    border: '1px solid #3a4046',
    borderRadius: 4,
    color: '#f3f0e7',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
  },
  fontFamily: '"Noto Sans Mono", monospace',
  fontSize: 11,
} as const

/** Standard Recharts Tooltip props — cream text on near-black */
export const CHART_TOOLTIP_PROPS = {
  contentStyle: {
    backgroundColor: CHART.tooltip.backgroundColor,
    border: CHART.tooltip.border,
    borderRadius: CHART.tooltip.borderRadius,
    color: CHART.tooltip.color,
    fontFamily: CHART.fontFamily,
    fontSize: CHART.fontSize,
    boxShadow: CHART.tooltip.boxShadow,
  },
  itemStyle: { color: CHART.tooltip.color },
  labelStyle: { color: CHART.tooltip.color, fontWeight: 500 },
  cursor: { stroke: 'rgba(87, 196, 207, 0.35)', strokeWidth: 1 },
} as const

/** Shared W/L result colors — muted green win, muted red loss */
export const RESULT_COLORS = {
  win: '#5c9e5a',
  loss: '#c45c5c',
} as const

export const MATCHUP_COLORS = {
  teamA: '#57c4cf',
  teamB: '#d8d4c8',
} as const

export const MATCHUP_RADAR_STYLE = {
  teamA: { stroke: MATCHUP_COLORS.teamA, fill: MATCHUP_COLORS.teamA, fillOpacity: 0.14 },
  teamB: { stroke: MATCHUP_COLORS.teamB, fill: MATCHUP_COLORS.teamB, fillOpacity: 0.1 },
} as const

export const ROLE_COLORS: Record<string, string> = {
  top: '#c8c4b8',
  jungle: '#8a9a6a',
  mid: '#a8a49a',
  adc: '#7a8a9a',
  support: '#57c4cf',
}

export function roleColor(position: string): string {
  return ROLE_COLORS[position.toLowerCase()] ?? CHART.accent
}
