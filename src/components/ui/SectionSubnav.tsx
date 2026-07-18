import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
 * Sticky in-page section nav. On entity pages it portals into `#entity-section-slot`
 * inside the sticky filter strip so OVERVIEW/SIDES/… never scroll away. Elsewhere it
 * uses position:sticky below the filter strip.
 */
export default function SectionSubnav({
  items,
  extra,
  ariaLabel = 'Section navigation',
  className = '',
}: SectionSubnavProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '')
  const [offsetTop, setOffsetTop] = useState(0)
  const [portalSlot, setPortalSlot] = useState<HTMLElement | null>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const clickLockRef = useRef(false)
  const unlockTimeoutRef = useRef<number | undefined>(undefined)
  const portaled = Boolean(portalSlot)

  useEffect(() => {
    setPortalSlot(document.getElementById('entity-section-slot'))
  }, [])

  // Measure sticky offsets and publish --section-subnav-offset for scroll-margin.
  useEffect(() => {
    const filtersEl = document.querySelector('.dashboard-frame-filters')

    const update = () => {
      const filtersHeight = filtersEl?.getBoundingClientRect().height ?? 0
      const navHeight = navRef.current?.getBoundingClientRect().height ?? 0
      // When portaled into the filter strip, sticky top is 0 (we're already in it).
      setOffsetTop(portaled ? 0 : filtersHeight)
      document.documentElement.style.setProperty(
        '--section-subnav-offset',
        `${Math.round(filtersHeight + (portaled ? 0 : navHeight) + 16)}px`,
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
  }, [items.length, portaled])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null)
    if (!sections.length) return

    const scroller = getAppScrollScroller()
    const root = scroller instanceof Element ? scroller : null
    const filtersHeight =
      document.querySelector('.dashboard-frame-filters')?.getBoundingClientRect().height ?? offsetTop

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
        rootMargin: `-${Math.round(filtersHeight + 8)}px 0px -55% 0px`,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    )

    sections.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items, offsetTop, portaled])

  useEffect(() => {
    return () => window.clearTimeout(unlockTimeoutRef.current)
  }, [])

  const handleClick = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return

    setActiveId(id)
    clickLockRef.current = true
    window.clearTimeout(unlockTimeoutRef.current)
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    unlockTimeoutRef.current = window.setTimeout(() => {
      clickLockRef.current = false
    }, 700)
  }

  const bar = (
    <div
      ref={navRef}
      className={`section-subnav${portaled ? ' section-subnav--portaled' : ''} ${className}`.trim()}
      style={portaled ? undefined : { top: offsetTop }}
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

  if (portalSlot) return createPortal(bar, portalSlot)
  return bar
}
