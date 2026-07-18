import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getAppScrollScroller } from '../../theme/animations'

export interface SectionSubnavItem {
  id: string
  label: string
}

interface SectionSubnavProps {
  items: SectionSubnavItem[]
  /** Extra content rendered on the trailing edge of the bar (e.g. role filters). */
  extra?: ReactNode
  ariaLabel?: string
  className?: string
}

/**
 * Sticky in-page section nav — sticks below the dashboard filter strip inside the
 * app's nested scroll container, jumps to `id` sections on click, and (when the
 * IntersectionObserver API is available) highlights whichever section is in view.
 */
export default function SectionSubnav({
  items,
  extra,
  ariaLabel = 'Section navigation',
  className = '',
}: SectionSubnavProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '')
  const [offsetTop, setOffsetTop] = useState(0)
  const navRef = useRef<HTMLDivElement>(null)
  const clickLockRef = useRef(false)
  const unlockTimeoutRef = useRef<number | undefined>(undefined)

  // Measure the sticky filter strip above us so we stack below it instead of overlapping it,
  // and publish the combined offset as a CSS var so page sections can offset scroll-into-view.
  useEffect(() => {
    const filtersEl = document.querySelector('.dashboard-frame-filters')

    const update = () => {
      const filtersHeight = filtersEl?.getBoundingClientRect().height ?? 0
      const navHeight = navRef.current?.getBoundingClientRect().height ?? 0
      setOffsetTop(filtersHeight)
      document.documentElement.style.setProperty(
        '--section-subnav-offset',
        `${Math.round(filtersHeight + navHeight + 16)}px`,
      )
    }

    update()

    const observedEls = [filtersEl, navRef.current].filter((el): el is Element => Boolean(el))
    if (typeof ResizeObserver === 'undefined' || !observedEls.length) {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }

    const ro = new ResizeObserver(update)
    observedEls.forEach((el) => ro.observe(el))
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [items.length])

  // Track which section is currently in view, respecting the sticky offset above.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null)
    if (!sections.length) return

    const scroller = getAppScrollScroller()
    const root = scroller instanceof Element ? scroller : null

    const observer = new IntersectionObserver(
      (entries) => {
        if (clickLockRef.current) return
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const nextId = visible[0]?.target.id
        if (nextId) setActiveId(nextId)
      },
      {
        root,
        rootMargin: `-${offsetTop + (navRef.current?.getBoundingClientRect().height ?? 0) + 8}px 0px -55% 0px`,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    )

    sections.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items, offsetTop])

  useEffect(() => {
    return () => window.clearTimeout(unlockTimeoutRef.current)
  }, [])

  const handleClick = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return

    setActiveId(id)
    clickLockRef.current = true
    window.clearTimeout(unlockTimeoutRef.current)

    // scrollIntoView walks up through the nested app scroll pane (see getAppScrollScroller)
    // automatically; scroll-margin-top on the target section (via --section-subnav-offset,
    // published above) compensates for the sticky filter strip + this nav.
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })

    unlockTimeoutRef.current = window.setTimeout(() => {
      clickLockRef.current = false
    }, 700)
  }

  return (
    <div
      ref={navRef}
      className={`section-subnav ${className}`.trim()}
      style={{ top: offsetTop }}
    >
      <nav className="section-subnav-items" aria-label={ariaLabel}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`section-subnav-link${activeId === item.id ? ' is-active' : ''}`}
            aria-current={activeId === item.id ? 'true' : undefined}
            onClick={() => handleClick(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {extra ? <div className="section-subnav-extra">{extra}</div> : null}
    </div>
  )
}
