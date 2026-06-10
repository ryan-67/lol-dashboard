import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FilterStripControls, FilterStripShell, type FilterStripValues } from '../FilterStrip'

interface EntityFilterBarProps extends FilterStripValues {
  fallbackNotice?: string | null
}

export default function EntityFilterBar({
  fallbackNotice,
  ...controls
}: EntityFilterBarProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setSlot(document.getElementById('entity-filter-slot'))
  }, [])

  const strip = (
    <FilterStripShell
      trailing={
        fallbackNotice ? (
          <span className="text-xs text-tertiary max-w-md lg:text-right">{fallbackNotice}</span>
        ) : undefined
      }
    >
      <FilterStripControls {...controls} />
    </FilterStripShell>
  )

  if (slot) return createPortal(strip, slot)
  return strip
}
