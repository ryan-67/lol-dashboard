# agent-chat (proprietary)

**nuckyAI** edge function — not included in the public repository.

Hosted on Supabase Edge Functions in production. Responsibilities:

- Authenticated SSE chat streaming
- Intent classification and model routing (OpenRouter)
- Deterministic analyst tools over `oe_slices` and `esports_schedules`
  - includes `team_roster` for "who's on DK / T1 roster" asks (no LLM SQL)
- pgvector RAG via `match_documents`
- Team/player compare with injected radar chart payloads
- Usage limits and conversation persistence

Source is maintained privately. See [docs/PRIVATE_COMPONENTS.md](../../../docs/PRIVATE_COMPONENTS.md).
