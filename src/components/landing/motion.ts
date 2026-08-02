import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

/* Shared motion language for the landing surface.
 * Tokens follow the cinematic-gsap-lenis-motion-system skill:
 * eases power3/power4/expo out, scrub 0.8–1.4, word stagger 0.035–0.07s.
 * Reveals fire when content reaches the middle band of the viewport
 * ("top 60%") so every section animates at page center, not on entry.
 */

export const MOTION = {
  easeOut: 'power4.out',
  easeSoft: 'power3.out',
  easeExpo: 'expo.out',
  revealStart: 'top 60%',
  scrub: 1.1,
  wordStagger: 0.05,
  lineStagger: 0.11,
  cardStagger: 0.08,
} as const

export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const coarsePointer = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/* ---------- Lenis smooth scroll (landing surface) ---------- */

let landingLenis: Lenis | null = null

export const getLandingLenis = (): Lenis | null => landingLenis

/**
 * Silky document-level smooth scroll for the marketing surface, driven
 * through the GSAP ticker so ScrollTrigger pins/scrubs stay phase-locked
 * (cinematic-gsap-lenis-motion-system skill wiring).
 */
export function initLandingLenis(): () => void {
  if (reducedMotion()) return () => {}

  const lenis = new Lenis({
    lerp: 0.085,
    smoothWheel: true,
    wheelMultiplier: 0.92,
    syncTouch: false,
  })
  landingLenis = lenis
  lenis.on('scroll', ScrollTrigger.update)

  const raf = (time: number) => {
    lenis.raf(time * 1000)
  }
  gsap.ticker.add(raf)
  gsap.ticker.lagSmoothing(0)

  return () => {
    gsap.ticker.remove(raf)
    lenis.destroy()
    if (landingLenis === lenis) landingLenis = null
  }
}

/* ---------- rotating accent atmosphere ---------- */

/**
 * Alche-like accent color switches: sections declare `data-accent-hue` and
 * the page's `--la-h` custom property glides between them as they take the
 * viewport. Turquoise (195) stays the home signature.
 */
export function initAccentDrift(root: HTMLElement): () => void {
  const state = { hue: 195 }
  const apply = () => {
    root.style.setProperty('--la-h', state.hue.toFixed(2))
  }
  apply()

  if (reducedMotion()) return () => {}

  const triggers: ScrollTrigger[] = []
  gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-accent-hue]')).forEach((el) => {
    const hue = Number(el.dataset.accentHue || 195)
    const glide = (target: number) => {
      gsap.to(state, {
        hue: target,
        duration: 1.4,
        ease: 'power2.inOut',
        overwrite: 'auto',
        onUpdate: apply,
      })
    }
    triggers.push(
      ScrollTrigger.create({
        trigger: el,
        start: 'top 55%',
        end: 'bottom 45%',
        onEnter: () => glide(hue),
        onEnterBack: () => glide(hue),
        onLeaveBack: () => glide(195),
      }),
    )
  })

  return () => {
    triggers.forEach((trigger) => trigger.kill())
    gsap.killTweensOf(state)
  }
}

/* ---------- physical tilt hover ---------- */

/** Material-feeling card tilt (rotateX/Y under 4deg) for [data-tilt]. */
export function initTiltHover(root: HTMLElement): () => void {
  if (reducedMotion() || coarsePointer()) return () => {}

  const cleanups: Array<() => void> = []

  gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-tilt]')).forEach((element) => {
    const strength = Number(element.dataset.tilt || 3.4)
    const rxTo = gsap.quickTo(element, 'rotationX', { duration: 0.55, ease: 'power3.out' })
    const ryTo = gsap.quickTo(element, 'rotationY', { duration: 0.55, ease: 'power3.out' })
    const yTo = gsap.quickTo(element, 'y', { duration: 0.55, ease: 'power3.out' })
    gsap.set(element, { transformPerspective: 900 })

    const handleMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      const px = (event.clientX - rect.left) / rect.width - 0.5
      const py = (event.clientY - rect.top) / rect.height - 0.5
      rxTo(-py * strength)
      ryTo(px * strength)
      yTo(-3)
    }
    const handleLeave = () => {
      rxTo(0)
      ryTo(0)
      yTo(0)
    }

    element.addEventListener('pointermove', handleMove)
    element.addEventListener('pointerleave', handleLeave)
    cleanups.push(() => {
      element.removeEventListener('pointermove', handleMove)
      element.removeEventListener('pointerleave', handleLeave)
    })
  })

  return () => cleanups.forEach((fn) => fn())
}

/** Wrap each word in a masked span pair for kinetic reveals. */
export function splitWords(element: HTMLElement): void {
  if (element.dataset.splitReady === 'true') return

  const text = element.textContent || ''
  const parts = text.split(/(\s+)/)
  element.textContent = ''
  element.setAttribute('aria-label', text.trim())

  parts.forEach((part) => {
    if (!part.trim()) {
      element.appendChild(document.createTextNode(part))
      return
    }
    const mask = document.createElement('span')
    const word = document.createElement('span')
    mask.className = 'lw-mask'
    mask.setAttribute('aria-hidden', 'true')
    word.className = 'lw-word'
    word.textContent = part
    mask.appendChild(word)
    element.appendChild(mask)
  })

  element.dataset.splitReady = 'true'
}

/** Masked word-by-word blur-in reveal for every [data-motion-text] inside root. */
export function initTextReveals(root: HTMLElement): void {
  const targets = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-motion-text]'))

  if (reducedMotion()) {
    gsap.set(targets, { autoAlpha: 1 })
    return
  }

  targets.forEach((element) => {
    splitWords(element)
    const words = element.querySelectorAll('.lw-word')
    if (!words.length) return

    gsap.set(element, { autoAlpha: 1 })
    gsap.fromTo(
      words,
      { yPercent: 112, autoAlpha: 0, filter: 'blur(8px)' },
      {
        yPercent: 0,
        autoAlpha: 1,
        filter: 'blur(0px)',
        duration: 0.95,
        ease: MOTION.easeOut,
        stagger: MOTION.wordStagger,
        scrollTrigger: {
          trigger: element,
          start: MOTION.revealStart,
          once: true,
        },
      },
    )
  })
}

const REVEAL_PRESETS: Record<string, { from: gsap.TweenVars; to: gsap.TweenVars }> = {
  'fade-up': { from: { y: 34, autoAlpha: 0 }, to: { y: 0, autoAlpha: 1 } },
  'blur-in': {
    from: { y: 18, autoAlpha: 0, filter: 'blur(10px)' },
    to: { y: 0, autoAlpha: 1, filter: 'blur(0px)' },
  },
  scale: { from: { scale: 0.95, autoAlpha: 0 }, to: { scale: 1, autoAlpha: 1 } },
  'slide-left': { from: { x: 48, autoAlpha: 0 }, to: { x: 0, autoAlpha: 1 } },
  'slide-right': { from: { x: -48, autoAlpha: 0 }, to: { x: 0, autoAlpha: 1 } },
  'clip-up': {
    from: { clipPath: 'inset(0 0 100% 0)', y: 12 },
    to: { clipPath: 'inset(0 0 0% 0)', y: 0 },
  },
}

/** Preset-based single reveals ([data-reveal]) and grouped staggers ([data-reveal-group]). */
export function initScrollReveals(root: HTMLElement): void {
  const singles = gsap.utils.toArray<HTMLElement>(
    root.querySelectorAll('[data-reveal]:not([data-reveal-item])'),
  )
  const groups = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-reveal-group]'))

  if (reducedMotion()) {
    gsap.set(singles, { autoAlpha: 1, clearProps: 'transform,filter,clipPath' })
    groups.forEach((group) => {
      gsap.set(group.querySelectorAll('[data-reveal-item]'), {
        autoAlpha: 1,
        clearProps: 'transform,filter',
      })
    })
    return
  }

  groups.forEach((group) => {
    const items = group.querySelectorAll('[data-reveal-item]')
    if (!items.length) return
    gsap.fromTo(
      items,
      { y: 38, autoAlpha: 0, filter: 'blur(8px)' },
      {
        y: 0,
        autoAlpha: 1,
        filter: 'blur(0px)',
        duration: 0.95,
        ease: MOTION.easeOut,
        stagger: MOTION.cardStagger,
        clearProps: 'filter',
        scrollTrigger: {
          trigger: group,
          start: MOTION.revealStart,
          once: true,
        },
      },
    )
  })

  singles.forEach((element) => {
    const preset = REVEAL_PRESETS[element.dataset.reveal || 'fade-up'] || REVEAL_PRESETS['fade-up']
    gsap.fromTo(element, preset.from, {
      ...preset.to,
      duration: 0.9,
      ease: MOTION.easeOut,
      delay: Number(element.dataset.revealDelay || 0),
      clearProps: 'filter',
      scrollTrigger: {
        trigger: element,
        start: MOTION.revealStart,
        once: true,
      },
    })
  })
}

/** Slow parallax drift for [data-parallax-layer] elements (data-speed = viewport fraction). */
export function initParallaxLayers(root: HTMLElement): void {
  if (reducedMotion()) return

  gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-parallax-layer]')).forEach((layer) => {
    const speed = Number(layer.dataset.speed || -0.14)
    const section = layer.closest<HTMLElement>('[data-parallax-section]') || layer
    gsap.to(layer, {
      y: () => window.innerHeight * speed,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        scrub: MOTION.scrub,
        invalidateOnRefresh: true,
      },
    })
  })
}

/** Magnetic hover for [data-magnetic] (desktop, fine pointers only). */
export function initMagnetic(root: HTMLElement): (() => void) | undefined {
  if (reducedMotion() || coarsePointer()) return undefined

  const cleanups: Array<() => void> = []

  gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-magnetic]')).forEach((element) => {
    const strength = Number(element.dataset.magnetic || 0.16)
    const xTo = gsap.quickTo(element, 'x', { duration: 0.45, ease: MOTION.easeSoft })
    const yTo = gsap.quickTo(element, 'y', { duration: 0.45, ease: MOTION.easeSoft })

    const handleMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      xTo((event.clientX - rect.left - rect.width / 2) * strength)
      yTo((event.clientY - rect.top - rect.height / 2) * strength)
    }
    const handleLeave = () => {
      xTo(0)
      yTo(0)
    }

    element.addEventListener('pointermove', handleMove)
    element.addEventListener('pointerleave', handleLeave)
    cleanups.push(() => {
      element.removeEventListener('pointermove', handleMove)
      element.removeEventListener('pointerleave', handleLeave)
    })
  })

  return () => cleanups.forEach((fn) => fn())
}

/** Scroll-triggered numeric counter. */
export function animateStatCounter(
  element: Element | null,
  finalValue: number,
  options?: { decimals?: number; suffix?: string; prefix?: string; duration?: number },
): void {
  if (!element) return
  const { decimals = 1, suffix = '', prefix = '', duration = 1.6 } = options ?? {}

  if (reducedMotion()) {
    element.textContent = `${prefix}${finalValue.toFixed(decimals)}${suffix}`
    return
  }

  const state = { val: 0 }
  gsap.to(state, {
    val: finalValue,
    duration,
    ease: 'power2.out',
    scrollTrigger: {
      trigger: element,
      start: MOTION.revealStart,
      once: true,
    },
    onUpdate: () => {
      element.textContent = `${prefix}${state.val.toFixed(decimals)}${suffix}`
    },
    onComplete: () => {
      element.textContent = `${prefix}${finalValue.toFixed(decimals)}${suffix}`
    },
  })
}

/* ---------- hyper-text hover (magicui-style letter scramble) ---------- */

const HYPER_CHARS = 'abcdefghijklmnopqrstuvwxyz'

/**
 * Letter-scramble-on-hover for [data-hyper] links: each character spins
 * through random glyphs then locks left-to-right (magicui HyperText feel).
 * Layout-safe — the element keeps its own width via ch-locked spans.
 */
export function initHyperText(root: ParentNode = document): () => void {
  if (reducedMotion()) return () => {}

  const cleanups: Array<() => void> = []

  gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-hyper]')).forEach((element) => {
    const original = element.textContent || ''
    if (!original.trim()) return
    let raf = 0

    const play = () => {
      window.cancelAnimationFrame(raf)
      const started = performance.now()
      const perChar = 46
      const spins = 2.6

      const frame = (now: number) => {
        const elapsed = now - started
        const locked = Math.floor(elapsed / perChar)
        let out = ''
        for (let i = 0; i < original.length; i++) {
          const char = original[i]!
          if (char === ' ' || i < locked - spins) {
            out += char
          } else {
            out += HYPER_CHARS[Math.floor(Math.random() * HYPER_CHARS.length)]
          }
        }
        element.textContent = out
        if (locked - spins < original.length) {
          raf = window.requestAnimationFrame(frame)
        } else {
          element.textContent = original
        }
      }
      raf = window.requestAnimationFrame(frame)
    }

    const stop = () => {
      window.cancelAnimationFrame(raf)
      element.textContent = original
    }

    element.addEventListener('mouseenter', play)
    element.addEventListener('focus', play)
    element.addEventListener('mouseleave', stop)
    element.addEventListener('blur', stop)
    cleanups.push(() => {
      window.cancelAnimationFrame(raf)
      element.removeEventListener('mouseenter', play)
      element.removeEventListener('focus', play)
      element.removeEventListener('mouseleave', stop)
      element.removeEventListener('blur', stop)
      element.textContent = original
    })
  })

  return () => cleanups.forEach((fn) => fn())
}

/* ---------- type / delete / retype word cycle ---------- */

/**
 * ReactBits TextType-style rotation: the word is typed out, holds, deletes,
 * and the next candidate types in. Returns a cleanup. The element should sit
 * next to a CSS caret (see .type-caret).
 */
export function initTypeCycle(
  element: HTMLElement | null,
  words: readonly string[],
  opts?: { typeMs?: number; deleteMs?: number; holdMs?: number },
): () => void {
  if (!element || !words.length) return () => {}

  if (reducedMotion()) {
    element.textContent = words[0]!
    return () => {}
  }

  const { typeMs = 62, deleteMs = 34, holdMs = 2100 } = opts ?? {}
  let wordIndex = 0
  let timer = 0

  const schedule = (fn: () => void, ms: number) => {
    timer = window.setTimeout(fn, ms)
  }

  const typeWord = (word: string, at: number) => {
    element.textContent = word.slice(0, at)
    if (at < word.length) {
      schedule(() => typeWord(word, at + 1), typeMs + Math.random() * 34)
      return
    }
    schedule(() => deleteWord(word, word.length), holdMs)
  }

  const deleteWord = (word: string, at: number) => {
    element.textContent = word.slice(0, at)
    if (at > 0) {
      schedule(() => deleteWord(word, at - 1), deleteMs)
      return
    }
    wordIndex = (wordIndex + 1) % words.length
    schedule(() => typeWord(words[wordIndex]!, 0), 260)
  }

  typeWord(words[0]!, 0)

  return () => window.clearTimeout(timer)
}

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/\\|+=~'

/** Left-to-right scramble reveal (per the animmaster_slider_5 reference). */
export function scrambleText(
  element: Element | null,
  finalString: string,
  duration = 1.2,
): gsap.core.Tween | null {
  if (!element) return null

  if (reducedMotion()) {
    element.textContent = finalString
    return null
  }

  const state = { p: 0 }
  return gsap.to(state, {
    duration,
    p: 1,
    ease: 'power2.inOut',
    onUpdate: () => {
      const len = finalString.length
      const revealCount = Math.floor(state.p * len)
      let result = ''
      for (let i = 0; i < len; i++) {
        const char = finalString[i]!
        result +=
          i < revealCount || char === ' '
            ? char
            : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
      }
      element.textContent = result
    },
    onComplete: () => {
      element.textContent = finalString
    },
  })
}

/**
 * Convert a matte-black-plate render into a truly transparent PNG.
 * Luminance becomes alpha (max channel), colors are un-premultiplied so the
 * composite over any dark background matches the original screen-blend look.
 * Returns a blob URL for use as an <img> src.
 */
export async function blackToAlpha(src: string): Promise<string> {
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  await img.decode()

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return src
  ctx.drawImage(img, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  applyBlackToAlpha(imageData.data)
  ctx.putImageData(imageData, 0, 0)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : src)
    }, 'image/png')
  })
}

/** In-place max-channel → alpha conversion for RGBA pixel buffers. */
export function applyBlackToAlpha(px: Uint8ClampedArray): void {
  for (let i = 0; i < px.length; i += 4) {
    const max = Math.max(px[i]!, px[i + 1]!, px[i + 2]!)
    if (max === 0) {
      px[i + 3] = 0
      continue
    }
    const scale = 255 / max
    px[i] = Math.min(255, px[i]! * scale)
    px[i + 1] = Math.min(255, px[i + 1]! * scale)
    px[i + 2] = Math.min(255, px[i + 2]! * scale)
    px[i + 3] = max
  }
}

/**
 * Convert logo plate backgrounds (near-white or near-black) to transparent.
 * Used for team/tournament logos that ship on solid plates.
 */
export async function plateToAlpha(src: string): Promise<string> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'
  img.src = src
  try {
    await img.decode()
  } catch {
    return src
  }

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return src

  try {
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    applyPlateToAlpha(imageData.data)
    ctx.putImageData(imageData, 0, 0)
  } catch {
    /* CORS-tainted canvas — keep the original asset. */
    return src
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : src)
    }, 'image/png')
  })
}

/** Punch out near-white and near-black plate pixels; soften edges via alpha. */
export function applyPlateToAlpha(px: Uint8ClampedArray): void {
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]!
    const g = px[i + 1]!
    const b = px[i + 2]!
    const a = px[i + 3]!
    if (a === 0) continue

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const chroma = max - min

    /* Near-white / light-gray plate (low chroma). */
    if (min > 210 && chroma < 28) {
      px[i + 3] = 0
      continue
    }
    if (min > 175 && chroma < 18) {
      const t = (min - 175) / 35
      px[i + 3] = Math.round(a * (1 - t))
      continue
    }

    /* Near-black plate. */
    if (max < 18) {
      px[i + 3] = 0
      continue
    }
    if (max < 42 && chroma < 14) {
      const t = 1 - max / 42
      px[i + 3] = Math.round(a * (1 - t))
    }
  }
}
