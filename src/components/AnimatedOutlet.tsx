import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { tabContentSwap, tabTransitionIn } from '../theme/animations'

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
        const duo = document.querySelector('.duo-dashboard')
        const frame = document.querySelector('.dashboard-frame--scroll')
        if (duo instanceof HTMLElement) duo.scrollTop = 0
        else if (frame instanceof HTMLElement) frame.scrollTop = 0
        else window.scrollTo(0, 0)
      },
      () => ref.current,
    )
  }, [location.pathname])

  return (
    <div ref={ref} className="tab-content">
      {displayed}
    </div>
  )
}
