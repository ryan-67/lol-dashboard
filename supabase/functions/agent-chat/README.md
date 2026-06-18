# agent-chat (proprietary)

**nucky** edge function — not included in the public repository.

Hosted on Supabase Edge Functions in production. Responsibilities:

- Authenticated SSE chat streaming
- **Conversational agent** — mini-Folk for LoL esports: casual voice, game theory from baseline knowledge, stats only when needed
- Scope routing: off-topic refusal (in-character, one line), chat/theory, stats, compare, series, general esports
- **Intent-based tool calling** — Supabase/OE tools + RAG only when scope requires verified stats, schedules, or external context; game theory (e.g. "why is azir good into corki?") skips DB/RAG
- **Synthesis** — stats woven into natural prose; no markdown stat dumps
- **20-message context window** — `historyWindow.ts` trims last ~20 turns for multi-turn follow-ups
- **Thread intent v2** (`threadIntent.ts`): three follow-up types —
  - `clarification` ("I meant standings", "that's wrong") → refine prior answer
  - `parallel` ("how about faker?", "what about ruler?") → same topic, new entity; inherits prior scope (career→career, roster→roster)
  - `roster_follow_up` ("who was the sub jungler?") → role-depth tool, **never a radar chart**
- **Top team semantics**: "top team" = top 4–5 by standings winrate; ADC fraud → dmg%/gold%
- **Full roster depth (incl. subs)** from `oe_slices.rosterDepth` (games >= 1). `team_role_depth` tool + always-on `current_rosters`/`player_team_index` list subs labeled `(sub, Ng)`. Mentioned-player roster block injected every turn.
- **Tiered knowledge** OE → RAG → **Tavily web fallback** (`tavilySearch.ts`): career/titles, roster gaps, factual general questions that OE/RAG can't answer trigger an allowlisted web search (liquipedia, lol/leaguepedia fandom, gol.gg, lolesports.com).
- **Fact verification** (`factVerifier.ts`): web facts PASS only with 2+ allowlisted sources agreeing or 1 Liquipedia/Fandom match. Fail-closed — unverified → nucky says it can't confirm (no hallucination).
- **Verified RAG write-back** (`ragWriteback.ts`): cross-verified **facts** (not opinions) embedded + inserted into `documents` (`source='web_verified'`, `content_kind='fact'`), TTL 30d roster / 90d career, deduped by fact hash. Reddit/community chunks stay tagged as opinion.
- **Chart gating** (`index.ts`): compare radar only on explicit compare/vs/radar intent (message or inherited topic) or `lolesports_compare` scope — never on roster/sub/career follow-ups.
- Temporal/world context (`client_now`, MSI 2026 calendar)
- Deterministic analyst tools over `oe_slices` and `esports_schedules`
- pgvector RAG via `match_documents` (multi-param RPC fallback); career/roster intents always vector-search, preferring `source=liquipedia`
- Team/player compare with injected radar chart payloads
- Usage limits and conversation persistence

Persona: **nucky** — blunt lolesports fan who knows lane states, macro, draft win conditions. Never exposes OE/RAG/Tavily plumbing.

## Secrets

| Secret | Where | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Supabase | LLM classification, embeddings, synthesis |
| `TAVILY_API_KEY` | Supabase (required for web fallback) | agent-time web search (server-only, never `VITE_`) |

```bash
npx supabase secrets set OPENROUTER_API_KEY=...
npx supabase secrets set TAVILY_API_KEY=...
```

Deploy after changes:

```bash
npx supabase functions deploy agent-chat
```

Run the write-back migration before first web-verified insert:

```bash
npx supabase db push   # applies supabase/migrations/20260618000000_documents_verified_writeback.sql
```

See [docs/PRIVATE_COMPONENTS.md](../../../docs/PRIVATE_COMPONENTS.md).
