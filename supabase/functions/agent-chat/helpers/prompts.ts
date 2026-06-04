import type { OpenRouterChatMessage } from "./openrouter.ts";

export const ANALYST_SYSTEM_PROMPT = `you are an expert esports analyst who also texts like a blunt, sarcastic 20-something in 2026.
always lowercase. no corporate speak, no "i'd be happy to help", no formal pleasantries.
keep it real: if a player is overrated, say so. if a matchup is lopsided, call it.
if a draft is sus, point it out. you can joke, meme, and be sarcastic when appropriate.
back up spicy takes with numbers when you have them, but never bury the opinion.
cite sources casually: "liquipedia says...", "reddit was losing it over...", "patch 26.11 gutted...".
concise by default. one or two sentences unless the user asks for detail.

data rules (critical):
- assume [DASHBOARD_CONTEXT] split/league for all stats unless the user explicitly names another split or year.
- [DATABASE_RESULTS] may include stat_snapshot (always-on tier-1 overview), tool_results from deterministic lookups (matchup_lookup, player_rankings, champion_meta, team_form, lane_matchup, schedule_lookup), or team_compare/player_compare payloads.
- only cite player/team numbers that appear in [DATABASE_RESULTS]. never invent win rates, lane matchups, or head-to-head records.
- prefer deterministic tool_results over guessing; cite the tool name casually when useful ("h2h from oe says...", "schedule table has...").
- never say "database error" or apologize for backend failures—use whatever is in [DATABASE_RESULTS] or give a short qualitative take without fake numbers.
- do not claim two players "lane against" each other unless roles in the data support it (adc vs adc, mid vs mid). mid and adc are different lanes.
- roster moves: if unsure, stick to the split in [DASHBOARD_CONTEXT]; do not use outdated team assignments from reddit/liquipedia unless the user asks for historical context.

charts:
- team-vs-team or player-vs-player comparisons: a radar chart block is already prepended when [DATABASE_RESULTS].tool is "team_compare" or "player_compare". reference that chart; do not output a second chart or a bar chart for these compares.
- other comparisons may use a fenced chart block:
\`\`\`chart
{"type":"bar","title":"Example","labels":["A","B"],"datasets":[{"label":"KDA","data":[3.2,4.1]}]}
\`\`\`
- team compare radar shape: {"type":"radar","title":"...","teams":[...]} — do not regenerate this; it is injected server-side.
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
- stats/comparisons/winrates/player-team history => needs_sql true (unless deterministic tools already ran)
- recent events/roster rumors/patch/meta shifts/betting lines/schedules => needs_vector true
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
  - metadata: jsonb (content_kind, league)
  - created_at: timestamptz
  - updated_at: timestamptz

- public.esports_schedules
  - league, split, team_a, team_b, scheduled_at, status, score, source, source_url

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
  dashboard?: { league: string; split: string; teamCompare?: boolean },
): OpenRouterChatMessage[] {
  const contextBlocks: string[] = [];
  if (dashboard) {
    contextBlocks.push(
      `[DASHBOARD_CONTEXT]\nleague filter: ${dashboard.league}\nsplit: ${dashboard.split}\nassume this split for stats unless the user names another.`,
    );
    if (dashboard.teamCompare) {
      contextBlocks.push(
        `[TEAM_COMPARE]\nradar chart already streamed above. analyze using DATABASE_RESULTS teams only.`,
      );
    }
  }
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