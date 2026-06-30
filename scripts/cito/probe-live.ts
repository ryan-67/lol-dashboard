#!/usr/bin/env node
/**
 * Probe CitoAPI live endpoints to capture real response shapes for the Live Match Hub.
 *
 * Usage: tsx scripts/cito/probe-live.ts
 * Writes captured samples to docs/cito/live-samples.json
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync, mkdirSync } from 'fs'
import { config } from 'dotenv'
import { CitoClient } from './client.ts'
import { requireEnv } from '../recap/db.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: path.join(ROOT, '.env') })

const CANDIDATE_LIST_PATHS = [
  '/lol/live',
  '/lol/tournaments/live',
  '/lol/games/live',
  '/lol/matches/live',
]

const PER_GAME_TEMPLATES = [
  '/lol/live/{gameId}/window',
  '/lol/live/{gameId}/stats',
  '/lol/live/{gameId}/events',
  '/lol/live/{gameId}/visual-state',
  '/lol/games/{gameId}/postgame',
  '/lol/games/{gameId}/gold',
]

const PER_MATCH_TEMPLATES = ['/lol/live/{matchId}/series', '/lol/matches/{matchId}/games']

function pluckIds(payload: unknown): { gameIds: string[]; matchIds: string[] } {
  const gameIds = new Set<string>()
  const matchIds = new Set<string>()
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        if (/gameId/i.test(key)) gameIds.add(value)
        if (/matchId/i.test(key)) matchIds.add(value)
      }
      walk(value)
    }
  }
  walk(payload)
  return { gameIds: [...gameIds], matchIds: [...matchIds] }
}

async function main() {
  const client = new CitoClient({ apiKey: requireEnv('CITO_API_KEY') })
  const samples: Record<string, unknown> = {}

  let liveList: unknown = null
  for (const p of CANDIDATE_LIST_PATHS) {
    try {
      const data = await client.paced(() => client.get(p))
      samples[p] = data
      if (!liveList) liveList = data
      console.log(`OK  ${p} → ${JSON.stringify(data).slice(0, 300)}`)
    } catch (e) {
      console.log(`ERR ${p}: ${e instanceof Error ? e.message : e}`)
    }
  }

  const { gameIds, matchIds } = pluckIds(liveList)
  console.log(`\nDiscovered gameIds=${gameIds.slice(0, 3)} matchIds=${matchIds.slice(0, 3)}\n`)

  const gameId = gameIds[0]
  const matchId = matchIds[0]

  if (gameId) {
    for (const tpl of PER_GAME_TEMPLATES) {
      const p = tpl.replace('{gameId}', gameId)
      try {
        const data = await client.paced(() => client.get(p))
        samples[tpl] = data
        console.log(`OK  ${p} → ${JSON.stringify(data).slice(0, 300)}`)
      } catch (e) {
        console.log(`ERR ${p}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }
  if (matchId) {
    for (const tpl of PER_MATCH_TEMPLATES) {
      const p = tpl.replace('{matchId}', matchId)
      try {
        const data = await client.paced(() => client.get(p))
        samples[tpl] = data
        console.log(`OK  ${p} → ${JSON.stringify(data).slice(0, 300)}`)
      } catch (e) {
        console.log(`ERR ${p}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  const out = path.join(ROOT, 'docs', 'cito', 'live-samples.json')
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(samples, null, 2))
  console.log(`\nWrote ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
