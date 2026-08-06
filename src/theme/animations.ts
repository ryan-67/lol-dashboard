import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { getAppScroller } from '../lib/appScroll'

gsap.registerPlugin(ScrollTrigger)

/**
 * Product motion language — "the instrument is powered on".
 *
 * Three registers, deliberately kept apart:
 *   ingest  — one-shot reveals + draws that measure data into place (200–700ms)
 *   respond — hover / press feedback bound to pointer events (120–220ms)
 *   carrier — always-on ambient loops, owned by CSS, never by this module
 *
 * Everything scroll-driven runs against the app pane (see lib/appScroll), not
 * the document, because the dashboard scrolls a nested container.
 */

export const EASE = {
  out: 'power3.out',
  soft: 'power2.out',
  inOut: 'power2.inOut',
  draw: 'power1.inOut',
} as const

export const DUR: Record<'micro' | 'fast' | 'base' | 'draw' | 'slow', number> = {
  micro: 0.16,
  fast: 0.28,
  base: 0.45,
  draw: 0.7,
  slow: 0.95,
}

export const ENTRANCE_FROM = {
  opacity: 0,
  y: 22,
}

export const ENTRANCE_TO = {
  opacity: 1,
  y: 0,
  duration: 0.55,
  ease: EASE.out,
}

const REVEAL_START = 'top 88%'

/** Nested app-shell panes scroll; document does not. */
export function getAppScrollScroller(): Element | Window {
  const el = getAppScroller()
  if (el) return el
  if (typeof document === 'undefined') return window
  return (
    document.querySelector('.duo-dashboard') ||
    document.querySelector('.dashboard-frame--scroll') ||
    window
  )
}

function scrollerVars(trigger: Element, start = REVEAL_START): ScrollTrigger.Vars {
  const scroller = getAppScrollScroller()
  return {
    trigger,
    start,
    once: true,
    ...(scroller instanceof Element ? { scroller } : {}),
  }
}

export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Safety: never leave opacity stuck at 0 if ScrollTrigger never fires. */
function ensureVisible(targets: gsap.TweenTarget, delayMs = 1200) {
  window.setTimeout(() => {
    gsap.set(targets, { opacity: 1, y: 0, clearProps: 'transform' })
  }, delayMs)
}

export function scrollEntrance(element: Element | null, overrides?: gsap.TweenVars) {
  if (!element) return
  if (reducedMotion()) {
    gsap.set(element, { opacity: 1, y: 0 })
    return
  }

  gsap.fromTo(
    element,
    { ...ENTRANCE_FROM },
    {
      ...ENTRANCE_TO,
      ...overrides,
      clearProps: 'transform',
      scrollTrigger: {
        ...scrollerVars(element),
        ...(overrides?.scrollTrigger as ScrollTrigger.Vars | undefined),
      },
    },
  )
  ensureVisible(element)
}

export function scrollEntranceStagger(
  parent: Element | null,
  childSelector: string,
  overrides?: gsap.TweenVars,
) {
  if (!parent) return

  const children = parent.querySelectorAll(childSelector)
  if (!children.length) return

  if (reducedMotion()) {
    gsap.set(children, { opacity: 1, y: 0 })
    return
  }

  gsap.fromTo(
    children,
    { ...ENTRANCE_FROM },
    {
      ...ENTRANCE_TO,
      stagger: 0.06,
      ...overrides,
      clearProps: 'transform',
      scrollTrigger: {
        ...scrollerVars(parent),
        ...(overrides?.scrollTrigger as ScrollTrigger.Vars | undefined),
      },
    },
  )
  ensureVisible(children)
}

export function animateCounter(
  element: Element | null,
  finalValue: number,
  options?: {
    decimals?: number
    suffix?: string
    prefix?: string
    duration?: number
  },
) {
  if (!element) return

  const { decimals = 1, suffix = '', prefix = '', duration = 1.1 } = options ?? {}
  const write = (v: number) => {
    element.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`
  }

  if (reducedMotion()) {
    write(finalValue)
    return
  }

  const obj = { val: 0 }
  gsap.to(obj, {
    val: finalValue,
    duration,
    ease: 'power2.out',
    scrollTrigger: scrollerVars(element, 'top 95%'),
    onUpdate: () => write(obj.val),
    onComplete: () => write(finalValue),
  })
  window.setTimeout(() => {
    if (element.textContent === `${prefix}${(0).toFixed(decimals)}${suffix}`) write(finalValue)
  }, 1800)
}

/**
 * Radar draw — the mesh scales up from centre while each series polygon is
 * swept in by a rotating dash offset, so the shape is measured, not popped.
 */
export function animateRadarDraw(container: Element | null, duration = DUR.draw) {
  if (!container) return
  if (reducedMotion()) return

  const svg = container.querySelector('svg')
  if (!svg) return

  const trigger = scrollerVars(container, 'top 92%')
  const grid = container.querySelectorAll(
    '.recharts-polar-grid-angle line, .recharts-polar-grid-concentric path, .recharts-polar-grid-concentric polygon',
  )
  const shapes = container.querySelectorAll<SVGPathElement>('.recharts-radar-polygon')
  const dots = container.querySelectorAll('.recharts-radar-dot')
  const labels = container.querySelectorAll('.recharts-polar-angle-axis-tick')

  const tl = gsap.timeline({ scrollTrigger: trigger })

  tl.fromTo(
    svg,
    { scale: 0.9, opacity: 0.2, transformOrigin: '50% 50%' },
    { scale: 1, opacity: 1, duration: duration * 0.9, ease: EASE.out },
    0,
  )

  if (grid.length) {
    tl.fromTo(
      grid,
      { opacity: 0 },
      { opacity: 1, duration: duration * 0.5, stagger: 0.02, ease: EASE.soft },
      0.05,
    )
  }

  shapes.forEach((path, i) => {
    let len = 0
    try {
      len = path.getTotalLength?.() ?? 0
    } catch {
      len = 0
    }
    if (len > 0) {
      tl.fromTo(
        path,
        { strokeDasharray: len, strokeDashoffset: len, fillOpacity: 0 },
        {
          strokeDashoffset: 0,
          fillOpacity: (_i: number, target: Element) =>
            Number(target.getAttribute('fill-opacity')) || 0.12,
          duration: duration * 1.1,
          ease: EASE.draw,
          clearProps: 'strokeDasharray,strokeDashoffset',
        },
        0.12 + i * 0.08,
      )
    } else {
      tl.fromTo(path, { opacity: 0 }, { opacity: 1, duration: duration * 0.6 }, 0.12)
    }
  })

  if (dots.length) {
    tl.fromTo(
      dots,
      { scale: 0, transformOrigin: '50% 50%' },
      { scale: 1, duration: 0.28, stagger: 0.025, ease: 'back.out(2)' },
      duration * 0.6,
    )
  }

  if (labels.length) {
    tl.fromTo(labels, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.02 }, 0.1)
  }

  ensureVisible(svg, 1800)
  if (shapes.length) ensureVisible(shapes, 1800)
}

/** Line / area / bar series draw (Recharts) — strokes trace, bars grow, dots pop. */
export function animateChartDraw(container: Element | null, duration = DUR.draw) {
  if (!container) return
  if (reducedMotion()) return

  const curves = container.querySelectorAll<SVGPathElement>(
    '.recharts-line-curve, .recharts-area-curve',
  )
  const areas = container.querySelectorAll('.recharts-area-area')
  const bars = container.querySelectorAll('.recharts-bar-rectangle, .recharts-rectangle')
  const dots = container.querySelectorAll('.recharts-line-dot, .recharts-dot')
  const cartesianGrid = container.querySelectorAll('.recharts-cartesian-grid-horizontal line')

  if (!curves.length && !areas.length && !bars.length) {
    scrollEntrance(container)
    return
  }

  const tl = gsap.timeline({ scrollTrigger: scrollerVars(container, 'top 92%') })

  if (cartesianGrid.length) {
    tl.fromTo(
      cartesianGrid,
      { scaleX: 0, transformOrigin: '0% 50%' },
      { scaleX: 1, duration: 0.5, stagger: 0.03, ease: EASE.out },
      0,
    )
  }

  if (bars.length) {
    tl.fromTo(
      bars,
      { scaleY: 0, transformOrigin: '50% 100%' },
      { scaleY: 1, duration: duration * 0.8, stagger: 0.025, ease: 'power2.out' },
      0.08,
    )
  }

  curves.forEach((path, i) => {
    let len = 0
    try {
      len = path.getTotalLength?.() ?? 0
    } catch {
      len = 0
    }
    if (len > 0) {
      tl.fromTo(
        path,
        { strokeDasharray: len, strokeDashoffset: len },
        {
          strokeDashoffset: 0,
          duration: duration * 1.4,
          ease: EASE.draw,
          clearProps: 'strokeDasharray,strokeDashoffset',
        },
        0.06 + i * 0.06,
      )
    } else {
      tl.fromTo(path, { opacity: 0 }, { opacity: 1, duration: duration * 0.6 }, 0.06)
    }
  })

  if (areas.length) {
    tl.fromTo(
      areas,
      { opacity: 0, scaleY: 0.86, transformOrigin: '50% 100%' },
      { opacity: 1, scaleY: 1, duration: duration, ease: EASE.out },
      0.1,
    )
  }

  if (dots.length) {
    tl.fromTo(
      dots,
      { scale: 0, transformOrigin: '50% 50%' },
      { scale: 1, duration: 0.24, stagger: 0.015, ease: 'back.out(2)' },
      duration * 0.75,
    )
  }

  const all = container.querySelectorAll(
    '.recharts-line-curve, .recharts-area-area, .recharts-area-curve, .recharts-bar-rectangle',
  )
  if (all.length) ensureVisible(all, 1900)
}

/** Horizontal bar fills grow from their CSS transform-origin on scroll into view. */
export function animateBarGrow(
  container: Element | null,
  selector: string,
  overrides?: gsap.TweenVars,
) {
  if (!container) return
  const fills = container.querySelectorAll(selector)
  if (!fills.length) return

  if (reducedMotion()) {
    gsap.set(fills, { scaleX: 1 })
    return
  }

  gsap.fromTo(
    fills,
    { scaleX: 0 },
    {
      scaleX: 1,
      duration: 0.75,
      ease: EASE.out,
      stagger: 0.05,
      ...overrides,
      scrollTrigger: {
        ...scrollerVars(container, 'top 94%'),
        ...(overrides?.scrollTrigger as ScrollTrigger.Vars | undefined),
      },
    },
  )

  window.setTimeout(() => {
    gsap.set(fills, { scaleX: 1 })
  }, 1800)
}

/** Trace any SVG stroke (sparklines, custom paths) once it scrolls into view. */
export function animateStrokeDraw(
  container: Element | null,
  selector: string,
  duration = DUR.draw,
) {
  if (!container) return
  const paths = Array.from(container.querySelectorAll<SVGPathElement>(selector))
  if (!paths.length) return
  if (reducedMotion()) return

  paths.forEach((path, i) => {
    let len = 0
    try {
      len = path.getTotalLength?.() ?? 0
    } catch {
      len = 0
    }
    if (!len) return
    gsap.fromTo(
      path,
      { strokeDasharray: len, strokeDashoffset: len },
      {
        strokeDashoffset: 0,
        duration,
        delay: i * 0.06,
        ease: EASE.draw,
        clearProps: 'strokeDasharray,strokeDashoffset',
        scrollTrigger: scrollerVars(container, 'top 95%'),
      },
    )
  })
}

/**
 * Meter fills that grow to a per-element target read from the `--fill` custom
 * property, so bars keep their relative length instead of all landing at 100%.
 */
export function animateMeterFill(
  container: Element | null,
  selector: string,
  overrides?: gsap.TweenVars,
) {
  if (!container) return
  const fills = Array.from(container.querySelectorAll<HTMLElement>(selector))
  if (!fills.length) return

  const target = (el: HTMLElement) =>
    Number.parseFloat(getComputedStyle(el).getPropertyValue('--fill')) || 0

  if (reducedMotion()) {
    fills.forEach((el) => gsap.set(el, { scaleX: target(el) }))
    return
  }

  gsap.fromTo(
    fills,
    { scaleX: 0 },
    {
      scaleX: (_i: number, el: Element) => target(el as HTMLElement),
      duration: 0.85,
      ease: EASE.out,
      stagger: 0.05,
      ...overrides,
      scrollTrigger: {
        ...scrollerVars(container, 'top 94%'),
        ...(overrides?.scrollTrigger as ScrollTrigger.Vars | undefined),
      },
    },
  )

  window.setTimeout(() => {
    fills.forEach((el) => gsap.set(el, { scaleX: target(el) }))
  }, 1900)
}

export function tabTransitionOut(element: Element | null): gsap.core.Tween {
  if (!element) return gsap.to({}, { duration: 0 })
  if (reducedMotion()) {
    gsap.set(element, { opacity: 0, y: 0, filter: 'none' })
    return gsap.to({}, { duration: 0 })
  }
  return gsap.to(element, {
    opacity: 0,
    y: -14,
    filter: 'blur(4px)',
    duration: 0.22,
    ease: 'power2.in',
  })
}

export function tabTransitionIn(element: Element | null): gsap.core.Tween {
  if (!element) return gsap.to({}, { duration: 0 })
  if (reducedMotion()) {
    gsap.set(element, { opacity: 1, y: 0, filter: 'none' })
    return gsap.to({}, { duration: 0 })
  }
  return gsap.fromTo(
    element,
    { opacity: 0, y: 22, filter: 'blur(5px)' },
    {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 0.48,
      ease: EASE.out,
      clearProps: 'filter,transform',
    },
  )
}

export function refreshScrollTrigger() {
  ScrollTrigger.refresh()
}

/** Soft press feedback for instrument buttons (returns cleanup). */
export function bindPressScale(
  elements: NodeListOf<Element> | Element[],
  scale = 0.97,
) {
  if (reducedMotion()) return () => {}

  const cleanups: Array<() => void> = []
  elements.forEach((el) => {
    const down = () => {
      gsap.to(el, { scale, duration: 0.12, ease: EASE.soft, overwrite: 'auto' })
    }
    const up = () => {
      gsap.to(el, { scale: 1, duration: 0.22, ease: 'back.out(1.6)', overwrite: 'auto' })
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointerleave', up)
    el.addEventListener('pointercancel', up)
    cleanups.push(() => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointerleave', up)
      el.removeEventListener('pointercancel', up)
    })
  })
  return () => cleanups.forEach((fn) => fn())
}

/** One-shot opacity/y entrance for chat/duo surfaces (no scroll trigger). */
export function mountSurfaceEntrance(root: Element | null, childSelector: string) {
  if (!root) return
  const children = root.querySelectorAll(childSelector)
  if (!children.length) return
  if (reducedMotion()) {
    gsap.set(children, { opacity: 1, y: 0 })
    return
  }
  gsap.fromTo(
    children,
    { opacity: 0, y: 14 },
    {
      opacity: 1,
      y: 0,
      duration: 0.46,
      stagger: 0.055,
      ease: EASE.out,
      clearProps: 'transform',
    },
  )
}

/** Compact list/row stagger for dense dashboard surfaces (power rankings, tables). */
export function staggerListReveal(
  parent: Element | null,
  childSelector: string,
  overrides?: gsap.TweenVars,
) {
  if (!parent) return
  const children = parent.querySelectorAll(childSelector)
  if (!children.length) return

  if (reducedMotion()) {
    gsap.set(children, { opacity: 1, y: 0, x: 0 })
    return
  }

  gsap.fromTo(
    children,
    { opacity: 0, x: -14 },
    {
      opacity: 1,
      x: 0,
      duration: 0.42,
      ease: EASE.out,
      stagger: 0.045,
      clearProps: 'transform',
      ...overrides,
      scrollTrigger: {
        ...scrollerVars(parent, 'top 94%'),
        ...(overrides?.scrollTrigger as ScrollTrigger.Vars | undefined),
      },
    },
  )
  ensureVisible(children, 1500)
}

/** Soft elevate on hover for interactive ranking/table rows (returns cleanup). */
export function bindRowHoverLift(rows: NodeListOf<Element> | Element[]) {
  if (reducedMotion()) return () => {}

  const cleanups: Array<() => void> = []
  rows.forEach((row) => {
    const enter = () => {
      gsap.to(row, { x: 3, duration: 0.22, ease: EASE.out, overwrite: 'auto' })
    }
    const leave = () => {
      gsap.to(row, { x: 0, duration: 0.28, ease: EASE.out, overwrite: 'auto' })
    }
    row.addEventListener('pointerenter', enter)
    row.addEventListener('pointerleave', leave)
    cleanups.push(() => {
      row.removeEventListener('pointerenter', enter)
      row.removeEventListener('pointerleave', leave)
    })
  })

  return () => cleanups.forEach((fn) => fn())
}

/** Tab content swap with a slightly longer, silkier curve for dashboard panes. */
export function tabContentSwap(
  outEl: Element | null,
  onSwapped: () => void,
  inEl: () => Element | null,
) {
  if (reducedMotion()) {
    onSwapped()
    return
  }

  const out = tabTransitionOut(outEl)
  out.eventCallback('onComplete', () => {
    onSwapped()
    requestAnimationFrame(() => {
      tabTransitionIn(inEl())
    })
  })
}

const REVEAL_SELECTOR = [
  '.card',
  '.page-section',
  '.radar-card',
  '.player-chart-card',
  '.dash-kpi',
  '.chart-frame',
  '.overview-hub-card',
  '.overview-totw-card',
  '.power-rankings-panel',
  '.entity-hero',
  '.page-header',
  '[data-reveal]',
]
  .map((s) => `${s}:not([data-revealed])`)
  .join(', ')

/**
 * One-shot reveal for dashboard cards/sections/charts in the nested scroll pane.
 * Skips elements already revealed; safe to call after route changes.
 */
export function revealDashboardSections(root: Element | null) {
  if (!root) return
  if (reducedMotion()) return

  const targets = Array.from(root.querySelectorAll(REVEAL_SELECTOR)).filter(
    // Nested cards inherit the parent's reveal — don't double-animate.
    (el) => !el.parentElement?.closest('[data-revealed]'),
  )

  if (targets.length) {
    targets.forEach((el, i) => {
      el.setAttribute('data-revealed', '1')
      gsap.set(el, { opacity: 0, y: 26 })
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.62,
        delay: Math.min(i * 0.055, 0.3),
        ease: EASE.out,
        clearProps: 'transform',
        scrollTrigger: scrollerVars(el, 'top 94%'),
      })
    })
    ensureVisible(targets, 2200)
  }

  window.setTimeout(() => refreshScrollTrigger(), 90)

  // Chart/radar draw for visible viz wrappers
  root.querySelectorAll('.recharts-wrapper').forEach((wrap) => {
    const host = wrap.closest(
      '.chart-frame, .card, .radar-card, .player-chart-card, .page-section',
    )
    if (!host || host.getAttribute('data-chart-drawn') === '1') return
    host.setAttribute('data-chart-drawn', '1')
    if (host.querySelector('.recharts-radar, .recharts-polar-grid')) {
      animateRadarDraw(host)
    } else {
      animateChartDraw(host)
    }
  })
}

/** Route-level fade — short enough that tab switches do not feel like a network wait. */
export function routeSweepIn(element: Element | null) {
  if (!element) return
  if (reducedMotion()) {
    gsap.set(element, { opacity: 1, y: 0, clipPath: 'none' })
    return
  }

  const tl = gsap.timeline()
  tl.fromTo(
    element,
    {
      opacity: 0.35,
      y: 8,
    },
    {
      opacity: 1,
      y: 0,
      duration: 0.22,
      ease: 'power2.out',
      clearProps: 'transform',
    },
  )
  return tl
}
