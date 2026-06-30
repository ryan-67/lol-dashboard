#!/usr/bin/env node
import path from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync, mkdirSync } from 'fs'
import { config } from 'dotenv'
import { CitoClient } from './client.ts'
import { requireEnv } from '../recap/db.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: path.join(ROOT, '.env') })

const MATCH = 'lol-match-116566603146123751'
const GAME = 'lol-game-116566603146451432'

const PATHS = [
  '/lol/schedule/today',
  '/lol/schedule/upcoming',
  `/lol/matches/${MATCH}`,
  `/lol/matches/${MATCH}/player-stats`,
  `/lol/analytics/drafts/${MATCH}`,
  `/lol/games/${GAME}/stats`,
  `/lol/games/${GAME}/player-stats`,
]

async function main() {
  const client = new CitoClient({ apiKey: requireEnv('CITO_API_KEY') })
  const samples: Record<string, unknown> = {}
  for (const p of PATHS) {
    try {
      const data = await client.paced(() => client.get(p))
      samples[p] = data
      console.log(`OK  ${p} → ${JSON.stringify(data).slice(0, 400)}`)
    } catch (e) {
      samples[p] = { error: e instanceof Error ? e.message : String(e) }
      console.log(`ERR ${p}: ${e instanceof Error ? e.message : e}`)
    }
  }
  const out = path.join(ROOT, 'docs', 'cito', 'live-samples2.json')
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(samples, null, 2))
  console.log(`\nWrote ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
