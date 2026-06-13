import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  EntityFilterStripControls,
  EntityFilterStripShell,
  type EntityFilterStripValues,
} from '../EntityFilterStrip'

interface EntityFilterBarProps extends EntityFilterStripValues {
  fallbackNotice?: string | null
  showAllSplit?: boolean
}

export default function EntityFilterBar({
  fallbackNotice,
  showAllSplit = true,
  ...controls
}: EntityFilterBarProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setSlot(document.getElementById('entity-filter-slot'))
  }, [])

  const strip = (
    <EntityFilterStripShell
      trailing={
        fallbackNotice ? (
          <span className="text-xs text-tertiary max-w-md lg:text-right">{fallbackNotice}</span>
        ) : undefined
      }
    >
      <EntityFilterStripControls {...controls} showAllSplit={showAllSplit} />
    </EntityFilterStripShell>
  )

  if (slot) return createPortal(strip, slot)
  return strip
}
