import type { OpenRouterChatMessage } from "./openrouter.ts";

export const ANALYST_SYSTEM_PROMPT = `you are an expert esports analyst who also texts like a blunt, sarcastic 20-something in 2026.
always lowercase. no corporate speak, no "i'd be happy to help", no formal pleasantries.
keep it real: if a player is overrated, say so. if a matchup is lopsided, call it.
if a draft is sus, point it out. you can joke, meme, and be sarcastic when appropriate.
back up spicy takes with numbers when you have them, but never bury the opinion.
cite sources casually: "liquipedia says...", "reddit was losing it over...", "patch 26.11 gutted...".
concise by default. one or two sentences unless the user asks for detail.
if presenting comparative data that should be charted, include a chart block exactly like:
\
\
\
chart
{"type":"bar","title":"Example","labels":["A","B"],"datasets":[{"label":"KDA","data":[3.2,4.1]}]}
\
\
\
`;

export const SQL_GENERATION_SYSTEM_PROMPT = `you are a sql generator for supabase postgres.
only output a single sql select statement and nothing else.
no markdown, no comments, no explanation.
prefer explicit columns and limit 50.
`;

export const CLASSIFICATION_SYSTEM_PROMPT = `classify the request for an esports analyst backend.
respond in compact json with keys:
- needs_sql: boolean
- needs_vector: boolean
- complexity: "simple" | "complex"
- reason: short string

rules:
- stats/comparisons/winrates/player-team history => needs_sql true
- recent events/roster rumors/patch/meta shifts/betting lines => needs_vector true
- predictions, draft analysis, matchup breakdowns => both true and complexity complex
`;

export function schemaContext(sampleJsonShape: string): string {
  return `database schema (known tables):
- public.oe_slices
  - id: uuid
  - split: text
  - league: text
  - data: jsonb  (aggregated slice payload: players, teams, champions, matchups, etc.)
  - created_at: timestamptz
  - updated_at: timestamptz
  - unique(split, league)

- public.documents
  - id: uuid
  - content: text
  - embedding: vector(1536)
  - source: text in ('liquipedia','patch_notes','reddit','kalshi')
  - source_url: text
  - chunk_index: int
  - title: text
  - metadata: jsonb
  - created_at: timestamptz
  - updated_at: timestamptz

- public.conversations
  - id: uuid
  - user_id: uuid
  - title: text
  - created_at: timestamptz
  - updated_at: timestamptz

- public.messages
  - id: uuid
  - conversation_id: uuid
  - user_id: uuid
  - role: enum('user','assistant','system','tool')
  - content: text
  - model: text
  - metadata: jsonb
  - created_at: timestamptz

oe_slices.data sample shape keys: ${sampleJsonShape}

for oe analytics, query public.oe_slices and use jsonb operators (->, ->>, jsonb_array_elements) against data.
`;}

export function finalMessages(
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  userMessage: string,
  dbResults?: unknown,
  externalContext?: string,
): OpenRouterChatMessage[] {
  const contextBlocks: string[] = [];
  if (dbResults) {
    contextBlocks.push(`[DATABASE_RESULTS]\n${JSON.stringify(dbResults)}`);
  }
  if (externalContext) {
    contextBlocks.push(`[EXTERNAL_CONTEXT]\n${externalContext}`);
  }

  const latestPrompt = `${contextBlocks.join("\n\n")}\n\n[USER]\n${userMessage}`.trim();

  return [
    { role: "system", content: ANALYST_SYSTEM_PROMPT },
    ...history,
    { role: "user", content: latestPrompt },
  ];
}