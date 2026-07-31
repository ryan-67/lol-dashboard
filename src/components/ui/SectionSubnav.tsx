import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getAppScrollScroller } from '../../theme/animations'
import { scrollAppToElement } from '../../lib/appScroll'

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
 * Sticky in-page section nav.
 *
 * - Entity pages: portals into `#entity-section-slot` inside the sticky filter strip.
 * - List pages (Overview, Players, …): sticks under the sticky league/year/split strip.
 */
export default function SectionSubnav({
  items,
  extra,
  ariaLabel = 'Section navigation',
  className = '',
}: SectionSubnavProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '')
  const [portalSlot, setPortalSlot] = useState<HTMLElement | null>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const clickLockRef = useRef(false)
  const unlockTimeoutRef = useRef<number | undefined>(undefined)
  const portaled = Boolean(portalSlot)

  useEffect(() => {
    setPortalSlot(document.getElementById('entity-section-slot'))
  }, [])

  // Publish sticky offsets for section scroll-margin / nested sticky subnav.
  useEffect(() => {
    const filtersEl = document.querySelector('.dashboard-frame-filters')

    const update = () => {
      const filtersHeight = filtersEl ? filtersEl.getBoundingClientRect().height : 0
      const navHeight = navRef.current?.getBoundingClientRect().height ?? 0
      document.documentElement.style.setProperty(
        '--dashboard-filters-sticky-top',
        portaled ? '0px' : `${Math.round(filtersHeight)}px`,
      )
      // Portaled: already inside sticky strip. List pages: filters + subnav stack.
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
      document.documentElement.style.removeProperty('--dashboard-filters-sticky-top')
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
    const stickyOffset =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--section-subnav-offset'),
      ) || 48

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
        rootMargin: `-${Math.round(stickyOffset)}px 0px -55% 0px`,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    )

    sections.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items, portaled])

  useEffect(() => {
    return () => window.clearTimeout(unlockTimeoutRef.current)
  }, [])

  const handleClick = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return

    setActiveId(id)
    clickLockRef.current = true
    window.clearTimeout(unlockTimeoutRef.current)
    const offset =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--section-subnav-offset'),
      ) || 0
    scrollAppToElement(el, offset)
    unlockTimeoutRef.current = window.setTimeout(() => {
      clickLockRef.current = false
    }, 700)
  }

  const bar = (
    <div
      ref={navRef}
      className={`section-subnav${portaled ? ' section-subnav--portaled' : ''} ${className}`.trim()}
      style={portaled ? undefined : { top: 0 }}
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
