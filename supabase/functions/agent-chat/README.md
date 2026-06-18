# agent-chat (proprietary)

**nucky** edge function — not included in the public repository.

Hosted on Supabase Edge Functions in production. Responsibilities:

- Authenticated SSE chat streaming
- **Conversational agent** — mini-Folk for LoL esports: casual voice, game theory from baseline knowledge, stats only when needed
- Scope routing: off-topic refusal (in-character, one line), chat/theory, stats, compare, series, general esports
- **Intent-based tool calling** — Supabase/OE tools + RAG only when scope requires verified stats, schedules, or external context; game theory (e.g. "why is azir good into corki?") skips DB/RAG
- **Synthesis** — stats woven into natural prose; no markdown stat dumps
- **20-message context window** — `historyWindow.ts` trims last ~20 turns for multi-turn follow-ups
- **Thread intent** (`threadIntent.ts`): follow-ups inherit prior question; never off-topic mid-conversation
- **Top team semantics**: "top team" = top 4–5 by standings winrate; ADC fraud → dmg%/gold%
- Always-on roster context when stats/RAG/roster questions need it; lightweight temporal-only block for pure theory chat
- Temporal/world context (`client_now`, MSI 2026 calendar, known 2026 roster moves)
- Deterministic analyst tools over `oe_slices` and `esports_schedules`
- pgvector RAG via `match_documents` (multi-param RPC fallback)
- Team/player compare with injected radar chart payloads
- Usage limits and conversation persistence

Persona: **nucky** — blunt lolesports fan who knows lane states, macro, draft win conditions. Never exposes OE/RAG plumbing.

Deploy after changes:

```bash
npx supabase functions deploy agent-chat
```

See [docs/PRIVATE_COMPONENTS.md](../../../docs/PRIVATE_COMPONENTS.md).
