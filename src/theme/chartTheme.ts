/** Shared Recharts styling — cream primary series, turquoise used sparingly */
export const CHART = {
  grid: 'rgba(125, 122, 112, 0.14)',
  axis: '#b8b4a8',
  tick: '#7e7a70',
  /** Primary series / key metric line */
  accent: '#f3f0e7',
  /** Sparse turquoise highlight series */
  accentDim: '#4eb0ba',
  series: '#f3f0e7',
  seriesAlt: '#4eb0ba',
  tooltip: {
    backgroundColor: '#101214',
    border: '1px solid #2a2e32',
    borderRadius: 4,
    color: '#f3f0e7',
  },
  fontFamily: '"Noto Sans Mono", monospace',
  fontSize: 11,
} as const

/** Standard Recharts Tooltip props — cream text on charcoal */
export const CHART_TOOLTIP_PROPS = {
  contentStyle: {
    backgroundColor: CHART.tooltip.backgroundColor,
    border: CHART.tooltip.border,
    borderRadius: CHART.tooltip.borderRadius,
    color: CHART.tooltip.color,
    fontFamily: CHART.fontFamily,
    fontSize: CHART.fontSize,
  },
  itemStyle: { color: CHART.tooltip.color },
  labelStyle: { color: CHART.tooltip.color, fontWeight: 500 },
} as const

/** Shared W/L result colors — muted green win, muted red loss */
export const RESULT_COLORS = {
  win: '#5c9e5a',
  loss: '#c45c5c',
} as const

export const MATCHUP_COLORS = {
  teamA: '#f3f0e7',
  teamB: '#4eb0ba',
} as const

export const MATCHUP_RADAR_STYLE = {
  teamA: { stroke: MATCHUP_COLORS.teamA, fill: MATCHUP_COLORS.teamA, fillOpacity: 0.12 },
  teamB: { stroke: MATCHUP_COLORS.teamB, fill: MATCHUP_COLORS.teamB, fillOpacity: 0.12 },
} as const

export const ROLE_COLORS: Record<string, string> = {
  top: '#c8c4b8',
  jungle: '#8a9a6a',
  mid: '#a8a49a',
  adc: '#7a8a9a',
  support: '#4eb0ba',
}

export function roleColor(position: string): string {
  return ROLE_COLORS[position.toLowerCase()] ?? CHART.accent
}
