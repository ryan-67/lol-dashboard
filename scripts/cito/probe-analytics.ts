#!/usr/bin/env node
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { CitoClient } from './client.ts'
import { requireEnv } from '../recap/db.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: path.join(ROOT, '.env') })

const PATHS = [
  '/lol/analytics/teams/t1/trend',
  '/lol/analytics/teams/gen-g/trend',
  '/lol/teams/t1/objectives',
  '/lol/teams/bilibili-gaming/objectives',
  '/lol/analytics/drafts/lol-match-115548128963037587',
  '/lol/matches/lol-match-115548128963037587/player-stats',
  '/lol/matches/lol-match-115548128963037587/timeline',
  '/lol/transfers?league=lpl&limit=5',
]

async function main() {
  const client = new CitoClient({ apiKey: requireEnv('CITO_API_KEY') })
  for (const p of PATHS) {
    try {
      const data = await client.paced(() => client.get(p))
      console.log(`\n=== ${p} ===\n${JSON.stringify(data, null, 2)?.slice(0, 3500)}`)
    } catch (e) {
      console.log(`\n=== ${p} === ERROR:`, e instanceof Error ? e.message : e)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
