import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export const ENTRANCE_FROM = {
  opacity: 0,
  y: 18,
}

export const ENTRANCE_TO = {
  opacity: 1,
  y: 0,
  duration: 0.45,
  ease: 'power2.out',
}

const DEFAULT_SCROLL_TRIGGER = {
  start: 'top 92%',
  once: true,
}

/** Nested app-shell panes scroll; document does not. */
export function getAppScrollScroller(): Element | Window {
  if (typeof document === 'undefined') return window
  return (
    document.querySelector('.duo-dashboard') ||
    document.querySelector('.dashboard-frame--scroll') ||
    window
  )
}

function scrollerVars(trigger: Element): ScrollTrigger.Vars {
  const scroller = getAppScrollScroller()
  return {
    trigger,
    start: DEFAULT_SCROLL_TRIGGER.start,
    once: true,
    ...(scroller instanceof Element ? { scroller } : {}),
  }
}

function reducedMotion(): boolean {
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

  const { decimals = 1, suffix = '', prefix = '', duration = 0.4 } = options ?? {}
  if (reducedMotion()) {
    element.textContent = `${prefix}${finalValue.toFixed(decimals)}${suffix}`
    return
  }

  const obj = { val: 0 }
  gsap.to(obj, {
    val: finalValue,
    duration,
    ease: 'power2.out',
    scrollTrigger: scrollerVars(element),
    onUpdate: () => {
      element.textContent = `${prefix}${obj.val.toFixed(decimals)}${suffix}`
    },
    onComplete: () => {
      element.textContent = `${prefix}${finalValue.toFixed(decimals)}${suffix}`
    },
  })
}

/** Radar expand + draw when container enters the nested scroll pane */
export function animateRadarDraw(container: Element | null, duration = 0.75) {
  if (!container) return
  if (reducedMotion()) return

  const svg = container.querySelector('svg')
  const segments = container.querySelectorAll(
    '.recharts-radar-polygon, .recharts-polar-grid-angle line, .recharts-polar-grid-concentric path, path, polygon',
  )

  if (svg) {
    gsap.fromTo(
      svg,
      { scale: 0.82, opacity: 0.35, transformOrigin: '50% 50%' },
      {
        scale: 1,
        opacity: 1,
        duration: duration * 0.85,
        ease: 'power2.out',
        scrollTrigger: scrollerVars(container),
      },
    )
  }

  if (segments.length) {
    gsap.fromTo(
      segments,
      { opacity: 0 },
      {
        opacity: 1,
        duration: duration * 0.5,
        stagger: duration / Math.max(segments.length, 1),
        ease: 'power2.out',
        scrollTrigger: scrollerVars(container),
      },
    )
    ensureVisible(segments, 1500)
  }

  if (svg) ensureVisible(svg, 1500)
}

/** Line / area series draw (Recharts) — opacity + slight x reveal of the chart wrap */
export function animateChartDraw(container: Element | null, duration = 0.7) {
  if (!container) return
  if (reducedMotion()) return

  const lines = container.querySelectorAll(
    '.recharts-line-curve, .recharts-area-area, .recharts-area-curve, .recharts-bar-rectangle',
  )
  if (!lines.length) {
    scrollEntrance(container)
    return
  }

  // Bars: grow from bottom via scaleY
  const bars = container.querySelectorAll('.recharts-bar-rectangle')
  if (bars.length) {
    gsap.fromTo(
      bars,
      { scaleY: 0, transformOrigin: '50% 100%' },
      {
        scaleY: 1,
        duration,
        stagger: 0.03,
        ease: 'power2.out',
        scrollTrigger: scrollerVars(container),
      },
    )
  }

  const curves = container.querySelectorAll(
    '.recharts-line-curve, .recharts-area-area, .recharts-area-curve',
  )
  if (curves.length) {
    curves.forEach((el) => {
      const path = el as SVGPathElement
      try {
        const len = path.getTotalLength?.() ?? 0
        if (len > 0) {
          gsap.fromTo(
            path,
            { strokeDasharray: len, strokeDashoffset: len, opacity: 0.2 },
            {
              strokeDashoffset: 0,
              opacity: 1,
              duration,
              ease: 'power2.out',
              scrollTrigger: scrollerVars(container),
            },
          )
        } else {
          gsap.fromTo(
            path,
            { opacity: 0 },
            {
              opacity: 1,
              duration,
              ease: 'power2.out',
              scrollTrigger: scrollerVars(container),
            },
          )
        }
      } catch {
        gsap.fromTo(
          path,
          { opacity: 0 },
          {
            opacity: 1,
            duration,
            scrollTrigger: scrollerVars(container),
          },
        )
      }
    })
  }

  ensureVisible(lines, 1600)
}

export function tabTransitionOut(element: Element | null): gsap.core.Tween {
  if (!element) return gsap.to({}, { duration: 0 })
  return gsap.to(element, { opacity: 0, duration: 0.15, ease: 'power1.inOut' })
}

export function tabTransitionIn(element: Element | null): gsap.core.Tween {
  if (!element) return gsap.to({}, { duration: 0 })
  return gsap.fromTo(
    element,
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' },
  )
}

export function refreshScrollTrigger() {
  ScrollTrigger.refresh()
}
