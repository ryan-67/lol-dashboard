# Database migrations (proprietary)

Full SQL migrations for the production Supabase project are **not** in the public repo.

## Public summary of main tables

| Table | Purpose |
|-------|---------|
| `oe_slices` | Oracle's Elixir aggregates per `(split, league)` as JSONB |
| `oe_sync_state` | OE Drive CSV metadata for CI refresh polling (apply `oe_sync_state.sql`) |
| `profiles` | User profile, favorites, subscription flag |
| `subscriptions` | Stripe-linked plan state |
| `conversations` / `messages` | nuckyAI chat history |
| `agent_usage_events` | Rate limiting |
| `documents` | pgvector RAG chunks |
| `esports_schedules` | Tier-1 match schedule rows |

RPCs include `match_documents` (vector search) and restricted `execute_sql` for the agent (private).

Apply migrations from your private backup or Supabase dashboard — not from this GitHub tree.
