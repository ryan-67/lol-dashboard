/** Shared Recharts styling aligned with design tokens */
export const CHART = {
  grid: 'rgba(85, 96, 102, 0.18)',
  axis: '#8a9a9e',
  tick: '#8a9a9e',
  accent: '#4eb0ba',
  accentDim: '#2d8c95',
  tooltip: {
    backgroundColor: '#141414',
    border: '1px solid #262626',
    borderRadius: 0,
    color: '#e8eef0',
  },
  fontFamily: '"Noto Sans Mono", monospace',
  fontSize: 12,
} as const

/** Standard Recharts Tooltip props — cream text on charcoal, sharp corners */
export const CHART_TOOLTIP_PROPS = {
  contentStyle: {
    backgroundColor: CHART.tooltip.backgroundColor,
    border: CHART.tooltip.border,
    borderRadius: 0,
    color: CHART.tooltip.color,
    fontFamily: CHART.fontFamily,
    fontSize: CHART.fontSize,
  },
  itemStyle: { color: CHART.tooltip.color },
  labelStyle: { color: CHART.tooltip.color, fontWeight: 500 },
} as const

export const MATCHUP_COLORS = {
  teamA: '#f0ece2',
  teamB: '#5c8a8a',
} as const

export const MATCHUP_RADAR_STYLE = {
  teamA: { stroke: MATCHUP_COLORS.teamA, fill: MATCHUP_COLORS.teamA, fillOpacity: 0.12 },
  teamB: { stroke: MATCHUP_COLORS.teamB, fill: MATCHUP_COLORS.teamB, fillOpacity: 0.12 },
} as const

export const ROLE_COLORS: Record<string, string> = {
  top: '#4eb0ba',
  jungle: '#7a8c5a',
  mid: '#8a9a9e',
  adc: '#6a7a8c',
  support: '#2d8c95',
}

export function roleColor(position: string): string {
  return ROLE_COLORS[position.toLowerCase()] ?? CHART.accent
}
