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
- **Career routing is deterministic** (`scope.ts`): a titles/championships question (`isCareerQuestion`) short-circuits to `lolesports_general` / `needs_tools:false` / `needs_rag:true` **before** the LLM classifier, so mid-conversation career questions never get re-routed to stat tools. `index.ts` gates stat tools off entirely for career (`runTools = needs_tools && !careerIntent`) — titles answers never dump current-split KDA/GD@15.
- **Career web trigger**: career questions web-search unless an existing `web_verified` chunk already covers the entity (not just "any RAG chunk exists"). Multi-entity questions ("chovy and faker") resolve each named entity and search/verify per entity; the Tavily query is career-targeted (derived championship terms + liquipedia/leaguepedia) rather than the raw chat message.
- **Fact verification** (`factVerifier.ts`): web facts PASS with 2+ allowlisted sources agreeing or **1 authoritative Liquipedia/Leaguepedia match** (authoritative-single is trusted even if the noisy number-conflict heuristic fires). Conflict detection now requires a shared *metric noun* (titles/worlds/msi/…) with a different number, not just a shared player name. Fail-closed — unverified → nucky says it can't confirm (no hallucination).
- **Anti-fabrication grounding** (`prompts.ts`, `stream.ts`): top-of-prompt HARD RULES forbid stating ANY number or named result (KDA/GD@15/%, series score, per-game champ, title/game count, roster, team, seed, date, venue, qualification) unless it's verbatim in MATCH_STATS/WORLD_CONTEXT/EXTERNAL_CONTEXT/WEB_VERIFIED. On correction with no verified data, nucky acknowledges and stops — never bluffs a new/third "corrected" version. Predictions/odds and series recaps fail-closed when the data isn't present. Synthesis temperature lowered (0.4 complex / 0.3 simple) to curb confident confabulation.
- **Deterministic routing** (`scope.ts`, `threadIntent.ts`): series recaps ("what happened in T1 vs Gen.G series?") route to `lolesports_series` (no radar) before the LLM and before the compare heuristic, so "vs" no longer triggers a chart; career/history regex also catches "who won worlds 2020 / winner of …". Self-contained new questions (own topic + entity) are classified fresh instead of inheriting the prior turn's scope, fixing follow-ups that pulled the wrong tool/chart. `[NO_SERIES_DATA]` / `[NO_VERIFIED_SOURCE]` blocks force refusals when data is absent.
- **Verified RAG write-back** (`ragWriteback.ts`): cross-verified **facts** (not opinions) embedded + inserted into `documents` (`source='web_verified'`, `content_kind='fact'`), TTL 30d roster / 90d career, deduped by fact hash. Reddit/community chunks stay tagged as opinion.
- **Chart gating** (`index.ts`): compare radar only on explicit compare/vs/radar intent (message or inherited topic) or `lolesports_compare` scope — never on roster/sub/career follow-ups.
- Temporal/world context (`client_now`, MSI 2026 calendar)
- Deterministic analyst tools over `oe_slices` and `esports_schedules`
- pgvector RAG via `match_documents` (multi-param RPC fallback); career/roster intents always vector-search, preferring `source=liquipedia`
- Team/player compare with injected radar chart payloads
- Usage limits and conversation persistence (limits **disabled for QA** — `USAGE_LIMITS_ENABLED = false` in `index.ts`; re-enable before production launch: 25/day, 750/month per user+IP)

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
