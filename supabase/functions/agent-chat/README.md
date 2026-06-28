# agent-chat (nuckyAI)

**nucky** edge function — Supabase Edge Function powering nuckyAI on nucky.gg.

## Architecture — 3-layer pipeline (`pipeline/`)

`index.ts` is a thin orchestrator. The request flows through three strictly-bounded layers, each a typed module under `supabase/functions/agent-chat/pipeline/` (contracts in `pipeline/types.ts`). Conversation history threads through all three so follow-ups stay coherent.

1. **Guardrail Router** (`pipeline/guardrail.ts`) — fast, lightweight cost firewall. A hard off-topic denylist (coding/homework/recipes/math/etc.) refuses non-LoL prompts in ~one regex test, before any LLM/tool/RAG spend. Ambiguous cases fall through to the nuanced `scope.ts` classifier (which itself only spends an LLM call on in-thread ambiguity). Returns `allowed:false` + an in-character refusal, or the resolved scope/thread for the next layer.
2. **Tool Decider** (`pipeline/toolDecider.ts`) — OE → RAG → **Tavily** (wiki / gol.gg stats / u.gg+leagueofgraphs meta / reddit sentiment) → **Kalshi** live odds. Subjective debates (GOAT/clutch/greatest) force OE stats + community sentiment search. Text draft comps (`team: champ1 champ2 ...`) are parsed in `index.ts` before Layer 1 and enriched via OE + pgvector RAG.
3. **Synthesis** (`pipeline/synthesis.ts`) — cross-verifies factual snippets (excludes reddit from write-back), injects `DEEP_ANALYSIS`, `SUBJECTIVE_SYNTHESIS`, and `[KALSHI_ODDS]` blocks, streams answer, upserts verified facts to pgvector.

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
- **Tiered knowledge** OE → RAG → **Tavily wiki-first fallback** (`tavilySearch.ts` → `searchTavilyWikiFirst`): career, roster swaps, patch notes, and tournament-format questions trigger Leaguepedia/Liquipedia-targeted queries; secondary domains backfill only when wiki results are thin. Snippets are wiki-ranked before verification.
- **Deep analysis synthesis** (`prompts.ts` → `deepAnalysisBlock`): matchup/draft/macro/game-theory questions get structured synthesis instructions — OE stats as proof points woven into kit/macro/win-condition analysis, never raw stat dumps.
- **Career routing is deterministic** (`scope.ts`): a titles/championships question (`isCareerQuestion`) short-circuits to `lolesports_general` / `needs_tools:false` / `needs_rag:true` **before** the LLM classifier, so mid-conversation career questions never get re-routed to stat tools. `index.ts` gates stat tools off entirely for career (`runTools = needs_tools && !careerIntent`) — titles answers never dump current-split KDA/GD@15.
- **Career web trigger**: career questions web-search unless an existing `web_verified` chunk already covers the entity (not just "any RAG chunk exists"). Multi-entity questions ("chovy and faker") resolve each named entity and search/verify per entity; the Tavily query is career-targeted (derived championship terms + liquipedia/leaguepedia) rather than the raw chat message.
- **Fact verification** (`factVerifier.ts`): web facts PASS with 2+ allowlisted sources agreeing or **1 authoritative Liquipedia/Leaguepedia match** (authoritative-single is trusted even if the noisy number-conflict heuristic fires). Conflict detection now requires a shared *metric noun* (titles/worlds/msi/…) with a different number, not just a shared player name. Fail-closed — unverified → nucky says it can't confirm (no hallucination).
- **Anti-fabrication grounding** (`prompts.ts`, `stream.ts`): top-of-prompt HARD RULES forbid stating ANY number or named result (KDA/GD@15/%, series score, per-game champ, title/game count, roster, team, seed, date, venue, qualification) unless it's verbatim in MATCH_STATS/WORLD_CONTEXT/EXTERNAL_CONTEXT/WEB_VERIFIED. On correction with no verified data, nucky acknowledges and stops — never bluffs a new/third "corrected" version. Predictions/odds and series recaps fail-closed when the data isn't present. Synthesis temperature lowered (0.4 complex / 0.3 simple) to curb confident confabulation.
- **Deterministic routing** (`scope.ts`, `threadIntent.ts`): series recaps ("what happened in T1 vs Gen.G series?") route to `lolesports_series` (no radar) before the LLM and before the compare heuristic, so "vs" no longer triggers a chart; career/history regex also catches "who won worlds 2020 / winner of …". Self-contained new questions (own topic + entity) are classified fresh instead of inheriting the prior turn's scope, fixing follow-ups that pulled the wrong tool/chart. `[NO_SERIES_DATA]` / `[NO_VERIFIED_SOURCE]` blocks force refusals when data is absent.
- **Verified RAG write-back** (`ragWriteback.ts` → `writeBackVerifiedFacts`): cross-verified facts embedded (1536-dim, retried) and **upserted** into `documents` on `fact_hash` after the response streams. TTL 30d roster / 90d career. Failures logged to function logs; never break the chat stream.
- **Chart gating** (`index.ts`): compare radar only on explicit compare/vs/radar intent (message or inherited topic) or `lolesports_compare` scope — never on roster/sub/career follow-ups.
- Temporal/world context (`client_now`, MSI 2026 calendar)
- Deterministic analyst tools over `oe_slices` and `esports_schedules`
- pgvector RAG via `match_documents` (multi-param RPC fallback); career/roster intents always vector-search, preferring `source=liquipedia`
- Team/player compare with injected radar chart payloads
- Usage limits and conversation persistence (**15/day, 200/month** per user+IP — see `src/lib/nuckyAiBilling.ts`; enforced when `USAGE_LIMITS_ENABLED = true` in `index.ts`)

Persona: **nucky** — blunt lolesports fan who knows lane states, macro, draft win conditions. Never exposes OE/RAG/Tavily plumbing.

## Secrets

| Secret | Where | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Supabase | LLM classification, embeddings, synthesis |
| `TAVILY_API_KEY` | Supabase (required for web fallback) | agent-time web search (server-only, never `VITE_`) |
| `KALSHI_API_KEY` | Supabase (optional) | Kalshi trade API auth; public `/markets` + orderbook work without it |

```bash
npx supabase secrets set OPENROUTER_API_KEY=...
npx supabase secrets set TAVILY_API_KEY=...
npx supabase secrets set KALSHI_API_KEY=...   # optional — improves rate limits
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
