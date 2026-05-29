import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { scrollEntrance, scrollEntranceStagger } from '../theme/animations'

export function useScrollReveal(staggerSelector?: string, dependencies: unknown[] = []) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (staggerSelector) {
        scrollEntranceStagger(ref.current, staggerSelector)
      } else {
        scrollEntrance(ref.current)
      }
    },
    { scope: ref, dependencies },
  )

  return ref
}
