import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export const ENTRANCE_FROM = {
  opacity: 0,
  y: 24,
}

export const ENTRANCE_TO = {
  opacity: 1,
  y: 0,
  duration: 0.6,
  ease: 'power2.out',
}

const DEFAULT_SCROLL_TRIGGER = {
  start: 'top 85%',
  once: true,
}

export function scrollEntrance(element: Element | null, overrides?: gsap.TweenVars) {
  if (!element) return

  gsap.from(element, {
    ...ENTRANCE_FROM,
    ...ENTRANCE_TO,
    ...overrides,
    scrollTrigger: {
      trigger: element,
      ...DEFAULT_SCROLL_TRIGGER,
      ...(overrides?.scrollTrigger as ScrollTrigger.Vars | undefined),
    },
  })
}

export function scrollEntranceStagger(
  parent: Element | null,
  childSelector: string,
  overrides?: gsap.TweenVars,
) {
  if (!parent) return

  const children = parent.querySelectorAll(childSelector)
  if (!children.length) return

  gsap.from(children, {
    ...ENTRANCE_FROM,
    ...ENTRANCE_TO,
    stagger: 0.08,
    ...overrides,
    scrollTrigger: {
      trigger: parent,
      ...DEFAULT_SCROLL_TRIGGER,
      ...(overrides?.scrollTrigger as ScrollTrigger.Vars | undefined),
    },
  })
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
  const obj = { val: 0 }

  gsap.to(obj, {
    val: finalValue,
    duration,
    ease: 'power2.out',
    scrollTrigger: {
      trigger: element,
      ...DEFAULT_SCROLL_TRIGGER,
    },
    onUpdate: () => {
      element.textContent = `${prefix}${obj.val.toFixed(decimals)}${suffix}`
    },
  })
}

/** Animate radar / mesh chart lines on scroll into view */
export function animateRadarDraw(container: Element | null, duration = 0.8) {
  if (!container) return

  const segments = container.querySelectorAll('path, line, polygon, circle')
  if (!segments.length) {
    scrollEntrance(container)
    return
  }

  gsap.from(segments, {
    opacity: 0,
    duration: duration / Math.max(segments.length, 1),
    stagger: duration / Math.max(segments.length, 1),
    ease: 'power2.out',
    scrollTrigger: {
      trigger: container,
      ...DEFAULT_SCROLL_TRIGGER,
    },
  })
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
