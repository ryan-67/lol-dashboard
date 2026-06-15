# agent-chat (proprietary)

**nuckyAI** edge function — not included in the public repository.

Hosted on Supabase Edge Functions in production. Responsibilities:

- Authenticated SSE chat streaming
- Intent classification and model routing (OpenRouter)
- Deterministic analyst tools over `oe_slices` and `esports_schedules`
  - includes `team_roster` for "who's on DK / T1 roster" asks (no LLM SQL)
  - default split = latest regional season (Spring/Summer), not First Stand
  - `team_winrate_chart` builds cumulative WR from Winter+Spring gameLog (excludes First Stand/MSI/Worlds); fixes `winrates` plural intent
  - chart prefix uses `streamChunk` (no premature SSE DONE)
  - schedule_lookup adds `recentSeriesFromOE` — scores from oe only, no reverse-sweep hallucination
- pgvector RAG via `match_documents`
- Team/player compare with injected radar chart payloads
- Usage limits and conversation persistence

Source is maintained privately. See [docs/PRIVATE_COMPONENTS.md](../../../docs/PRIVATE_COMPONENTS.md).
