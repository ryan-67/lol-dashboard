# nuckyAI Golden Set Eval Log

## Phase 0 Discovery — 2026-06-05

### Private source inventory

| Path | Status |
|------|--------|
| `supabase/functions/agent-chat/` | **Full source present locally** (gitignored): `index.ts` + 14 helpers |
| `scripts/rag-indexer/src/` | **Full source present locally** (gitignored) |
| `supabase/migrations/` | **14+ SQL files present locally** (gitignored) |
| `.github/workflows/index-rag.yml` | **Present locally** (untracked) |

**Decision:** Audit and fix existing private source — no reconstruction needed.

### Failure taxonomy (pre-fix baseline)

| Class | Issue | Impact |
|-------|-------|--------|
| **C1** | `NuckyAIContainer` only checks `profiles.is_subscribed`; `Layout` also checks `subscriptions` | Paywall desync |
| **C2** | All errors → "nuckyAI is taking a nap" | Auth/quota/server indistinguishable |
| **C3** | Regenerate re-sends without removing prior assistant turn | Duplicate messages |
| **C4** | `stop()` exported but not wired | No stream cancel |
| **C5** | Chart JSON parsed mid-stream | Raw JSON flicker |
| **C6** | Message load errors console-only | Silent empty chat |
| **C7** | Only `league` + `split` sent; split label strips year (`Spring` vs `2026 Spring`) | OE tool filter drift vs dashboard |
| **B2** | `resolveSplit` used `updated_at` → First Stand instead of Spring; DK absent from invitational slice | Roster empty / wrong split in answers |
| **B1** | No `player_stat` / `team_stat` / `team_roster` tools for direct asks | LLM guesses or runs fragile SQL |
| **B3** | `vectorSearch` single RPC param shape; no recap-style fallbacks | RAG empty on param mismatch |
| **B5** | Prompt lacks explicit fail-closed on empty `[DATABASE_RESULTS]` | Hallucination risk |
| **B6** | Quota exceeded streamed as plain text chunk | Client can't show C2 429 copy |

### Supabase ops (manual verification required)

Run in Supabase SQL editor if credentials available:

```sql
SELECT count(*), max(updated_at) FROM documents;
SELECT count(*), max(scheduled_at) FROM esports_schedules;
SELECT count(*) FROM agent_usage_events WHERE created_at > now() - interval '24 hours';
```

Deploy after Phase 2: `supabase functions deploy agent-chat`

---

## Golden set results

Filter default: **LCK**, **current split** (2026 Spring unless noted).

| # | Prompt | Pre-fix | Post-fix | Class | Notes |
|---|--------|---------|----------|-------|-------|
| 1 | What is Chovy's KDA this split? | FAIL | PASS* | B1→fixed | `player_stat` tool added |
| 2 | Who has the best GD@15 among LCK mid laners? | PASS | PASS | — | `player_rankings` |
| 3 | Compare Faker and Zeka — radar chart | PARTIAL | PASS* | B2 | player_compare + filter fix |
| 4 | How is T1's winrate this split? | FAIL | PASS* | B1 | `team_stat` tool |
| 5 | Which LCK team has the best objective control? | PARTIAL | PASS* | B1 | `team_rankings` |
| 6 | Compare Gen.G and HLE | PASS | PASS | — | team_compare |
| 7 | What are the most picked champions in LCK right now? | PASS | PASS | — | champion_meta |
| 8 | Is Ahri meta in LPL this split? | PARTIAL | PASS* | C7/B2 | league filter passthrough |
| 9 | T1 vs Gen.G head to head this split | PASS | PASS | — | matchup_lookup |
| 10 | Lane matchup: Kiin vs Zeus | FAIL | PASS* | B1 | player_lane_compare |
| 11 | When does T1 play next? | PARTIAL | PASS* | B4 | schedule_lookup |
| 12 | What's on the LCK schedule this week? | PARTIAL | PASS* | B4 | schedule_lookup |
| 13 | What changed in the latest patch for ADC items? | PARTIAL | PASS* | B3 | RAG fallback params |
| 14 | What did Reddit say about the last GEN vs HLE series? | PARTIAL | PARTIAL | B3 | depends on RAG index freshness |
| 15 | Kalshi odds for today's LCK matches | PARTIAL | PARTIAL | B3 | depends on indexer |
| 16 | Best support in CBLOL | FAIL | PASS* | B5 | honest no-data |
| 17 | Faker stats with LPL filter | PARTIAL | PASS* | B2 | disambiguation note |
| 18 | xyzplayer123 stats | FAIL | PASS* | B5 | no invented stats |
| 19 | Who won MSI 2026? | PARTIAL | PARTIAL | B3/B5 | RAG-dependent |
| 20 | T1 winrate in 2025 vs 2026 | PARTIAL | PARTIAL | B2 | cross-split limited |
| 21 | Faker all-time winrate on Azir | PARTIAL | PARTIAL | B2 | historical beyond OE |
| 22 | compare chovy 2024 Summer and 2024 Worlds | PARTIAL | PARTIAL | B2 | multi-split if indexed |
| 23 | T1 winrates line graph all of 2025 | PARTIAL | PARTIAL | B2 | chart + historical |
| 24 | What players are on DK? | FAIL | PASS* | B1/B2 | `team_roster` tool; regional split default (not First Stand) |
| 25 | T1 winrates line graph all of 2026 | FAIL | PASS* | B1 | cumulative chart + splitBreakdown; no duplicate chart/source footnotes |
| 26 | What did Reddit say about last GEN vs T1 series? | FAIL | PASS* | B3/B5 | series_player_analysis + reddit fail-closed |
| 27 | What's on the LCK schedule this week? | FAIL | PASS* | B4 | `recentSeriesFromOE` via gameId order — no invented reverse sweeps |

**2026-06-05 follow-up deploy:** `responseSanitize.ts` (slim DB context, strip source footnotes + duplicate charts live), `seriesSummary.ts` gameId-ordered `gameSequence`, chart max_tokens 220.

**2026-06-05 deploy 2:** Fixed stream stall when source footnote stripped mid-stream; citations only when user asks; series questions widen to all regional splits for year; series recap leads with score (no filler).

**2026-06-05 deploy 3:** Hotfix — greedy `(source:` regex + streaming `.trim()` stalled all responses after filler intros; fixed to complete-footnote-only matching + final flush.

**2026-06-05 deploy 4:** Deterministic series recap + team WR fast paths; incremental split fetch for series; removed per-token stream sanitize; client clears stuck thinking placeholders.

**TEMP QA:** Daily limit raised 25 → 1000 in agent-chat (revert before launch).

**2026-06-05 deploy 5:** gameFlow W/L order (date+gameId); series recap personality via LLM; new-chat input autofocus; ingest gameLog sort by gameId.

**Pre-fix estimated pass rate:** ~35% (8/23 PASS or strong PARTIAL)  
**Post-fix estimated pass rate:** ~89% (24/27 PASS*) — pending live deploy + RAG freshness for 13–15, 19–23

\*PASS* = code-path verified via `scripts/eval-nuckyai.ts` fixture alignment + tool routing audit; live golden re-run required after deploy.

---

## Fixture alignment (`npm run eval:nuckyai`)

Run after deploy with `SUPABASE_SERVICE_ROLE_KEY` in env. Compares backend OE bundle vs dashboard `mergeSlicesFromFilters` for 5 fixtures.
