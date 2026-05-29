interface RoleLegendItem {
  key: string
  label: string
  color: string
}

interface RoleToggleLegendProps {
  items: RoleLegendItem[]
  hiddenKeys: Set<string>
  onToggle: (key: string) => void
  onReset: () => void
  resetLabel?: string
}

export default function RoleToggleLegend({
  items,
  hiddenKeys,
  onToggle,
  onReset,
  resetLabel = 'Reset',
}: RoleToggleLegendProps) {
  return (
    <div className="scatter-legend">
      {items.map((item) => {
        const isHidden = hiddenKeys.has(item.key)
        return (
          <button
            key={item.key}
            type="button"
            className={`scatter-legend-item${isHidden ? ' is-hidden' : ''}`}
            onClick={() => onToggle(item.key)}
          >
            <span className="scatter-legend-swatch" style={{ background: item.color }} />
            {item.label}
          </button>
        )
      })}
      <button type="button" className="btn scatter-legend-reset" onClick={onReset}>
        {resetLabel}
      </button>
    </div>
  )
}
