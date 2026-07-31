import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * Smooth scroll for the app shell.
 *
 * The dashboard does not scroll the document — it scrolls a nested pane
 * (`.dashboard-frame--scroll` standalone, `.duo-dashboard` in duo). Lenis is
 * therefore attached to that element as its `wrapper`, not to `window`.
 * Lenis drives real `scrollTop` on the wrapper (no transform), so `position:
 * sticky` filter strips and ScrollTrigger's native `scroller` support both
 * keep working — no scrollerProxy needed, only a `scroll` → `ScrollTrigger.update`
 * bridge so pinned/scrubbed triggers stay in sync with the interpolated value.
 */

let lenis: Lenis | null = null
let scroller: HTMLElement | null = null
let tickerBound = false

const SCROLLER_CHANGE_EVENT = 'nucky:app-scroller-change'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function raf(time: number) {
  lenis?.raf(time * 1000)
}

function bindTicker() {
  if (tickerBound) return
  gsap.ticker.add(raf)
  gsap.ticker.lagSmoothing(0)
  tickerBound = true
}

function unbindTicker() {
  if (!tickerBound) return
  gsap.ticker.remove(raf)
  tickerBound = false
}

/** The element ScrollTrigger should treat as the scroll container, if any. */
export function getAppScroller(): HTMLElement | null {
  return scroller
}

export function getAppLenis(): Lenis | null {
  return lenis
}

/**
 * Attach smooth scroll to a dashboard pane. Returns a teardown that detaches
 * only if the pane is still the registered scroller (safe across route swaps).
 */
export function registerAppScroller(
  wrapper: HTMLElement | null,
  content: HTMLElement | null,
): () => void {
  if (!wrapper || !content) return () => {}

  destroyAppScroller()
  scroller = wrapper

  if (!prefersReducedMotion()) {
    lenis = new Lenis({
      wrapper,
      content,
      lerp: 0.11,
      duration: 1.05,
      smoothWheel: true,
      // Native momentum on touch beats a JS approximation on mobile panes.
      syncTouch: false,
      overscroll: false,
    })
    lenis.on('scroll', ScrollTrigger.update)
    bindTicker()
  }

  window.dispatchEvent(new CustomEvent(SCROLLER_CHANGE_EVENT))
  ScrollTrigger.refresh()

  return () => {
    if (scroller !== wrapper) return
    destroyAppScroller()
  }
}

export function destroyAppScroller() {
  unbindTicker()
  lenis?.destroy()
  lenis = null
  scroller = null
}

/** Jump the app pane to the top — used on every tab / route change. */
export function scrollAppToTop() {
  if (lenis) {
    lenis.scrollTo(0, { immediate: true, force: true })
    return
  }
  if (scroller) {
    scroller.scrollTop = 0
    return
  }
  window.scrollTo(0, 0)
}

/** Smooth scroll to an element inside the app pane (section subnav jumps). */
export function scrollAppToElement(target: HTMLElement, offset = 0) {
  if (lenis) {
    lenis.scrollTo(target, { offset: -offset, duration: 0.9 })
    return
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Pause smoothing while a nested pane / overlay owns the wheel. */
export function setAppScrollLocked(locked: boolean) {
  if (!lenis) return
  if (locked) lenis.stop()
  else lenis.start()
}

export function onAppScrollerChange(handler: () => void): () => void {
  window.addEventListener(SCROLLER_CHANGE_EVENT, handler)
  return () => window.removeEventListener(SCROLLER_CHANGE_EVENT, handler)
}
