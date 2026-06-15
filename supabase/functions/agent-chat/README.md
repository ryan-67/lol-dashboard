# agent-chat (proprietary)

**nuckyAI** edge function — not included in the public repository.

Hosted on Supabase Edge Functions in production. Responsibilities:

- Authenticated SSE chat streaming
- Intent classification and model routing (OpenRouter)
- Deterministic analyst tools over `oe_slices` and `esports_schedules`
  - includes `team_roster` for "who's on DK / T1 roster" asks (no LLM SQL)
  - default split = latest regional season (Spring/Summer), not First Stand
  - `team_winrate_chart` builds cumulative WR from Winter+Spring gameLog (excludes First Stand/MSI/Worlds); fixes `winrates` plural intent
  - chart prefix uses `streamChunk` (no premature SSE DONE); LLM prose sanitized live (strip duplicate ```chart blocks + source footnotes)
  - `splitBreakdown` in chart payload for winter/spring WR commentary without a second chart
  - deterministic fast paths for series recap + team winrate (no LLM round-trip)
  - series bundle loads splits newest-first until matchup found (avoids multi-split timeout)
  - source footnotes stripped once after stream completes (not per-token)
  - `seriesSummary.ts` groups series by date+gameId order; exposes `gameSequence` + `winner` (never infer reverse sweeps)
  - schedule_lookup adds `recentSeriesFromOE` — scores from oe only, no reverse-sweep hallucination
- pgvector RAG via `match_documents`
- Team/player compare with injected radar chart payloads
- Usage limits and conversation persistence (TEMP: daily limit 1000 for QA — revert to 25 at launch)

Source is maintained privately. See [docs/PRIVATE_COMPONENTS.md](../../../docs/PRIVATE_COMPONENTS.md).
