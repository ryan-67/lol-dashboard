import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { tabTransitionIn, tabTransitionOut } from '../theme/animations'

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

    tabTransitionOut(el).eventCallback('onComplete', () => {
      setDisplayed(childrenRef.current)
      requestAnimationFrame(() => {
        tabTransitionIn(el)
      })
    })
  }, [location.pathname])

  return (
    <div ref={ref} className="tab-content">
      {displayed}
    </div>
  )
}
