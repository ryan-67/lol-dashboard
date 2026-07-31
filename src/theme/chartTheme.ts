/**
 * Shared Recharts styling — Signal Instrument.
 * Turquoise is the signal channel: primary series / model output.
 * Cream is the comparison/context series.
 */
export const CHART = {
  /** Horizontal rules only — vertical gridlines are noise on time series. */
  grid: 'rgba(120, 200, 210, 0.09)',
  gridStrong: 'rgba(120, 200, 210, 0.16)',
  axis: 'rgba(140, 150, 155, 0.35)',
  tick: '#8a8880',
  /** Primary series / key metric line — the signal */
  accent: '#57c4cf',
  /** Secondary / comparison series — cream ink */
  accentDim: '#d8d4c8',
  series: '#57c4cf',
  seriesAlt: '#d8d4c8',
  /** Soft fill under signal lines/areas */
  accentFill: 'rgba(87, 196, 207, 0.14)',
  /** Crosshair drawn while hovering a data point */
  cursor: 'rgba(87, 196, 207, 0.4)',
  tooltip: {
    backgroundColor: 'rgba(9, 12, 13, 0.95)',
    border: '1px solid rgba(87, 196, 207, 0.32)',
    borderRadius: 4,
    color: '#f3f0e7',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.62)',
  },
  fontFamily: '"Noto Sans Mono", monospace',
  fontSize: 11,
} as const

/** Axis defaults — apply to every XAxis/YAxis so the chrome reads as one system. */
export const AXIS_PROPS = {
  stroke: CHART.axis,
  strokeWidth: 1,
  tickLine: false,
  axisLine: { stroke: CHART.axis },
  tick: {
    fill: CHART.tick,
    fontSize: 10,
    fontFamily: CHART.fontFamily,
    letterSpacing: '0.04em',
  },
} as const

/** Cartesian grid defaults — horizontal hairlines only. */
export const GRID_PROPS = {
  stroke: CHART.grid,
  strokeDasharray: '2 6',
  vertical: false,
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
    backdropFilter: 'blur(10px)',
  },
  itemStyle: { color: CHART.tooltip.color },
  labelStyle: { color: CHART.tooltip.color, fontWeight: 500 },
  cursor: { stroke: CHART.cursor, strokeWidth: 1, strokeDasharray: '3 3' },
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
