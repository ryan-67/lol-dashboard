# agent-chat (proprietary)

**nucky** edge function — not included in the public repository.

Hosted on Supabase Edge Functions in production. Responsibilities:

- Authenticated SSE chat streaming
- Scope routing: off-topic refusal, casual chat, stats, compare, series, general esports
- **Thread intent** (`threadIntent.ts`): follow-ups and clarifications inherit prior question; never off-topic mid-conversation
- **Top team semantics**: "top team" = top 4–5 by standings winrate; `player_rankings` filters pool + emits `top_teams_standings`
- **ADC fraud scoring** (`playerScoring.ts`): dmg% + gold% carry impact, not just KDA/GD@15
- Always-on `currentContext.ts`: full tier-1 rosters + player_team_index from oe_slices for current split
- Temporal/world context (`client_now`, MSI 2026 calendar, known 2026 roster moves)
- Intent classification and model routing (OpenRouter)
- Deterministic analyst tools over `oe_slices` and `esports_schedules`
  - `player_stat`, `team_stat`, `team_rankings`, `team_roster`, `series_recap`
  - `matchup_lookup`, `player_rankings`, `champion_meta`, `champion_pool_compare`
  - `team_form`, `lane_matchup`, `schedule_lookup`
  - default split = latest regional season (Spring/Summer), not First Stand
  - explicit split scope stays narrow; series questions can widen split fetch
- pgvector RAG via `match_documents` (multi-param RPC fallback)
- Team/player compare with injected radar chart payloads
- Usage limits and conversation persistence

Persona: refers to itself as **nucky** — blunt 20-something lolesports fan. Never exposes OE/RAG plumbing to users.

Deploy after changes:

```bash
npx supabase functions deploy agent-chat
```

See [docs/PRIVATE_COMPONENTS.md](../../../docs/PRIVATE_COMPONENTS.md).
