import { formatGengLckTitlesAnswer } from "./deterministicAnswers.ts";
import { isGengLineageLeak, isTeamLckTitleQuestion } from "./teamTitles.ts";
import { isDatedMatchupRecap } from "./warehouseFacts.ts";

/** Strip source keys from tool payloads before sending to the LLM. */
export function stripSourceFields(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(stripSourceFields);
  if (typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key === "source") continue;
    out[key] = stripSourceFields(val);
  }
  return out;
}

export function userWantsSources(message: string): boolean {
  return /\b(source|sources|citation|citations|where did you get|where do you get|what data|cite|provenance|show me the data|how do you know)\b/i
    .test(message);
}

/** Strip accidental data-source leaks from streamed assistant text. */
function stripDataSourceMentions(text: string): string {
  return text
    .replace(/\boracle'?s?\s+elixir\b/gi, "")
    .replace(/\boe_slices\b/gi, "")
    .replace(/\bnot\s+in\s+oe\b/gi, "don't have that indexed")
    .replace(/\bin\s+oe\b/gi, "")
    .replace(/\boe\s+has\b/gi, "stats have")
    .replace(/\bfrom\s+oe\b/gi, "")
    .replace(/\boe\s+(?:data|stats|game\s*log|slices)\b/gi, "indexed stats")
    .replace(/\bgol\.gg\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1");
}

function slimSeriesPayload(data: Record<string, unknown>): Record<string, unknown> {
  const players = Array.isArray(data.players) ? data.players : [];
  return {
    teamA: data.teamA,
    teamB: data.teamB,
    seriesScore: data.seriesScore,
    gameCount: data.gameCount,
    dates: data.dates,
    split: data.split,
    league: data.league,
    winner: data.winner,
    gameSequence: data.gameSequence,
    gameFlow: data.gameFlow,
    note: data.note,
    players: players.slice(0, 12).map((p) => {
      const row = p as Record<string, unknown>;
      return {
        name: row.name,
        team: row.team,
        position: row.position,
        games: row.games,
        wins: row.wins,
        avgKda: row.avgKda,
        avgGd15: row.avgGd15,
        champions: row.champions,
      };
    }),
  };
}

/** Chart/series/champion-pool questions get slim tool context so the model doesn't ramble or emit extra charts. */
export function slimDbResultsForPrompt(
  dbResults: unknown,
  opts: { chartInjected?: boolean; seriesQuestion?: boolean; championPoolQuestion?: boolean },
): unknown {
  const stripped = stripSourceFields(dbResults) as Record<string, unknown>;
  if (!stripped || typeof stripped !== "object") return stripped;

  if (opts.chartInjected && stripped.team_winrate_chart) {
    return { team_winrate_chart: stripped.team_winrate_chart };
  }

  if (opts.seriesQuestion) {
    const toolResults = Array.isArray(stripped.tool_results)
      ? stripped.tool_results as Array<Record<string, unknown>>
      : [];
    const series = toolResults.find((t) => t.tool === "series_player_analysis");
    if (series) {
      return {
        series_player_analysis: slimSeriesPayload(series),
      };
    }
  }

  if (opts.championPoolQuestion) {
    const toolResults = Array.isArray(stripped.tool_results)
      ? stripped.tool_results as Array<Record<string, unknown>>
      : [];
    const pool = toolResults.find((t) => t.tool === "champion_pool_compare");
    const slim: Record<string, unknown> = {};
    if (pool) slim.champion_pool_compare = pool;
    if (stripped.compare) slim.compare = stripped.compare;
    if (Object.keys(slim).length) return slim;
  }

  return stripped;
}

/** Complete footnotes only — never match unclosed parens (that ate the rest of the stream). */
function stripCompleteSourceFootnotes(text: string): string {
  return text
    .replace(/(?:\*\s*)?\(source:\s*[^)]+\)\s*\*?/gi, "")
    .replace(/\*\(source:[^)]+\)\*?/gi, "")
    .replace(/\[source:\s*[^\]]+\]/gi, "");
}

/** Strip a partial footnote only when it's still being typed at the end. */
function stripTrailingIncompleteSourceFootnote(text: string): string {
  return text
    .replace(/(?:\*\s*)?\(source:[^\n)]*$/gi, "")
    .replace(/\d+\s+games tracked\s*\*?\)?$/gi, "");
}

function stripSourceFootnotes(text: string): string {
  let out = stripCompleteSourceFootnotes(text);
  out = stripTrailingIncompleteSourceFootnote(out);
  return out.replace(/[ \t]+\n/g, "\n");
}

/** Pass-2 leftovers the model still emits even when warehouse/curated tools won. */
export function scrubLockedLeftovers(text: string, message: string): string {
  let out = text;
  const genTitleAsk = isTeamLckTitleQuestion(message) ||
    (/\bgen(?:\.?g)?\b/i.test(message) && /\b(titles?|championships?|title years?)\b/i.test(message));
  if (genTitleAsk && (isGengLineageLeak(out) || /won\s+6\b/i.test(out) || !/2023 Spring/i.test(out))) {
    return formatGengLckTitlesAnswer();
  }

  out = out.replace(
    /[^\n]*(?:fearx|bfx)[^\n]*(?:hanwha|\bhle\b)[^\n]*(?:aug(?:ust)?\s*19|2026-08-19)[^\n]*/gi,
    "",
  );
  out = out.replace(
    /[^\n]*(?:hanwha|\bhle\b)[^\n]*(?:fearx|bfx)[^\n]*(?:aug(?:ust)?\s*19|2026-08-19)[^\n]*/gi,
    "",
  );
  out = out.replace(
    /[^\n]*(?:\bdrx\b)[^\n]*(?:brion|\bbro\b)[^\n]*(?:aug(?:ust)?\s*20|2026-08-20)[^\n]*/gi,
    "",
  );
  out = out.replace(
    /[^\n]*(?:brion|\bbro\b)[^\n]*(?:\bdrx\b)[^\n]*(?:aug(?:ust)?\s*20|2026-08-20)[^\n]*/gi,
    "",
  );

  if (isDatedMatchupRecap(message) && /\bt1\b/i.test(message) && /\bkt\b/i.test(message)) {
    out = out
      .replace(/\b3-3\b/g, "")
      .replace(/\b1-6\b/g, "")
      .replace(/\b8-7\b/g, "")
      .replace(/\b6-13\b/g, "")
      .replace(/\b54\.5\s*%/g, "")
      .replace(/\b44\s*%/g, "")
      .replace(/\b44\s+games\b/gi, "");
  }

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Final persisted / returned text — sanitize once after stream completes, not per token. */
export function sanitizeAssistantText(
  text: string,
  opts: { stripCharts?: boolean; allowSources?: boolean; message?: string } = {},
): string {
  let out = opts.allowSources ? text : stripSourceFootnotes(text);
  out = stripDataSourceMentions(out);

  // Never leak prompt scaffolding / self-greets into the UI.
  out = out
    .replace(/^\s*hey\s+nucky[.!]?\s*/i, "")
    .replace(/^\s*hi\s+nucky[.!]?\s*/i, "")
    .replace(/\[MATCH_STATS\][\s\S]*?(?=\[|$)/gi, "")
    .replace(/\[WORLD_CONTEXT\][\s\S]*?(?=\[|$)/gi, "")
    .replace(/\[EXTERNAL_CONTEXT\][\s\S]*?(?=\[|$)/gi, "")
    .replace(/\[WEB_VERIFIED\][\s\S]*?(?=\[|$)/gi, "")
    .replace(/\[PREDICTION_PACKET\][\s\S]*?(?=\[|$)/gi, "");

  if (opts.stripCharts) {
    out = out.replace(/```chart[\s\S]*?```/gi, "");
  }

  if (opts.message) out = scrubLockedLeftovers(out, opts.message);

  out = out
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:matchId|gameId|gameNumber)\s*[:=]\s*\S+/gi, "")
    .replace(/(\b(?:MSI|EWC|Worlds|First Stand|international events)[,\s/]*){5,}/gi, "internationals ");

  return out.replace(/\n{3,}/g, "\n\n").trim();
}
