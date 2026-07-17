# nucky.gg Product Landing Page — Design Spec

**Date:** 2026-07-17  
**Status:** Approved for implementation  
**Register:** Brand (marketing)

## Design read

Terminal Editorial SaaS landing for LoL esports fans and analysts. Matte black + matte gold, Noto Sans Mono (existing brand), folk.com-style ghost wordmark, data-forward accuracy motifs. Not broadcast-cinematic, not generic Framer-clean.

**Dials:** VARIANCE 7 / MOTION 6 / DENSITY 4

## Routing

| Path | Surface |
|------|---------|
| `/` | Marketing landing |
| `/features` | Features |
| `/pricing` | Pricing |
| `/faq` | FAQ (marketing shell) |
| `/private-policy` | Privacy (footer only) |
| `/terms` | Terms (footer only) |
| `/dashboard` | Former Overview (app shell) |

App shell logo/nav Overview → `/dashboard`. Marketing logo → `/`.

**Deferred (Phase 2 IA):** `/chat`, `/duo`, default-page preference redirect for logged-in users. Landing remains public for all visitors until preference settings ship.

## Marketing chrome

**Header (top + mirrors in footer nav):** Features, FAQ, Pricing + Sign in / Create account. Signed-in users also get Open dashboard.

**Footer only:** Privacy, Terms, copyright, contact. Giant faint `nucky` ghost wordmark (folk.com).

## Landing sections (`/`)

1. Hero — accurate copy (ingests match data; surfaces stats/trends; forms analyses/predictions). No “watches every series.”
2. What nucky is — ingest → rate → explain/predict
3. Not another raw-stat mirror — proprietary ratings vs OE-style mirrors
4. How to use / use cases
5. Model accuracy — live `public/data/accuracy_scorecard.json`
6. CTA band

## Motion

Lenis + GSAP ScrollTrigger: section reveals, counter count-ups, staggered rows. Hover: link underline/gold shift, CTA press scale, feature row highlight. Respect `prefers-reduced-motion`.

## Auth

Reuse `AuthModal` with `initialView: 'signin' | 'signup'`. Session already persists via Supabase `persistSession`.

## Pricing (current truth)

- Dashboard analytics: free
- nuckyAI beta: $3.99/mo (Stripe); planned full launch $5/mo
- Usage caps during beta
