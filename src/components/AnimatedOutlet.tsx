import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { tabContentSwap, tabTransitionIn } from '../theme/animations'
import { scrollAppToTop } from '../lib/appScroll'

export default function AnimatedOutlet({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const ref = useRef<HTMLDivElement>(null)
  const childrenRef = useRef(children)
  const [displayed, setDisplayed] = useState(children)
  const isFirst = useRef(true)

  childrenRef.current = children

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (isFirst.current) {
      isFirst.current = false
      tabTransitionIn(el)
      return
    }

    tabContentSwap(
      el,
      () => {
        setDisplayed(childrenRef.current)
        scrollAppToTop()
      },
      () => ref.current,
    )
  }, [location.pathname])

  return (
    <div ref={ref} className="tab-content">
      <span className="tab-content-scanline" aria-hidden="true" />
      {displayed}
    </div>
  )
}
