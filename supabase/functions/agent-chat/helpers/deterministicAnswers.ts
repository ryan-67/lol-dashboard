import { formatNuckyTypoGreeting, isNuckyTypoGreeting } from "./agentIdentity.ts";
import {
  formatLckTitleLong,
  isTeamLckTitleQuestion,
  TEAM_LCK_TITLES,
} from "./teamTitles.ts";
import {
  extractAskedWorldsYear,
  formatWorldsYearAnswer,
  isPlayerWorldsTitleQuestion,
} from "./worldsHistory.ts";
import {
  hasWeeklyWindowAsk,
  isDatedMatchupRecap,
  isTeamLastSeriesQuestion,
  isWeeklyLeagueRecapQuestion,
  isWhoWinsPrediction,
  wantsWarehouseResults,
} from "./warehouseFacts.ts";

interface ToolResultLike {
  tool: string;
  data: Record<string, unknown>;
}

const LEFTOVER_FORM = new Set(["3-3", "1-6", "8-7", "6-13"]);

export function formatTeamStatAnswer(data: Record<string, unknown>): string {
  const nested = (data.team && typeof data.team === "object")
    ? data.team as Record<string, unknown>
    : data;
  const team = String(nested.name ?? data.team ?? "that team");
  const split = String(data.split ?? "this split");
  const games = Number(nested.games ?? data.games ?? 0);
  if (games <= 0) {
    return `no ${team} games indexed for ${split} yet.`;
  }
  const wins = Number(nested.wins ?? data.wins ?? 0);
  const losses = Number(nested.losses ?? data.losses ?? 0);
  const wr = Number(nested.winrate ?? data.winrate ?? 0);
  return `${team} at ${wr}% wr (${wins}-${losses}, ${games} games) in ${split}.`;
}

export function formatGengLckTitlesAnswer(): string {
  const row = TEAM_LCK_TITLES.geng!;
  const listed = row.titles.map(formatLckTitleLong).join(", ");
  return `Gen.G has ${row.count} modern LCK season titles: ${listed}.`;
}

export function isMsi2026WinnerQuestion(message: string): boolean {
  return (
    /\bmsi\b/i.test(message) &&
    /\b2026\b/.test(message) &&
    /\b(won|winner|champion|champ|title|fmvp|mvp)\b/i.test(message)
  );
}

export function formatMsi2026Answer(): string {
  return "Hanwha Life Esports won MSI 2026, beating Bilibili Gaming 3-2. Zeus was Finals MVP.";
}

export function formatWeeklyWarehouseAnswer(data: Record<string, unknown>): string {
  const completed = Array.isArray(data.completed) ? data.completed : [];
  const upcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
  const league = String(data.league ?? "").trim();
  const label = league || "tier-1";
  const lines: string[] = [];
  if (completed.length) {
    lines.push(`This week (warehouse, ${label}):`);
    for (const raw of completed) {
      const s = raw as Record<string, unknown>;
      const winner = s.winner ? ` — ${s.winner} won` : "";
      lines.push(`- ${s.date}: ${s.teamA} ${s.score} ${s.teamB}${winner}`);
    }
  }
  if (upcoming.length) {
    lines.push("Upcoming:");
    for (const raw of upcoming) {
      const s = raw as Record<string, unknown>;
      lines.push(`- ${s.date}: ${s.teamA} vs ${s.teamB}`);
    }
  }
  if (!lines.length) {
    return `No warehouse ${label} series in this window.`;
  }
  return lines.join("\n");
}

export function formatWarehouseSeriesAnswer(data: Record<string, unknown>): string {
  const teamA = String(data.teamA ?? "team A");
  const teamB = String(data.teamB ?? "team B");
  if (data.missingAskedSeries || data.seriesScore === "0-0") {
    const date = data.date ? ` on ${data.date}` : "";
    return `No warehouse series for ${teamA} vs ${teamB}${date}.`;
  }
  const score = String(data.seriesScore ?? "");
  const date = data.date ? ` on ${data.date}` : "";
  const winner = data.winner ? ` ${data.winner} won` : "";
  let out = `${teamA} ${score} ${teamB}${date}.${winner ? winner + "." : ""}`;
  const records = Array.isArray(data.seasonRecords) ? data.seasonRecords : [];
  const usable = records.filter((raw) => {
    const r = raw as { series?: string };
    const series = String(r.series ?? "");
    return series && !LEFTOVER_FORM.has(series);
  }) as Array<{ team: string; series: string; games?: string }>;
  if (usable.length) {
    out += " Season series W/L: " +
      usable.map((r) => `${r.team} ${r.series}`).join(", ") + ".";
  }
  const rosterA = (data.rosterA && typeof data.rosterA === "object")
    ? data.rosterA as Record<string, unknown>
    : null;
  const rosterB = (data.rosterB && typeof data.rosterB === "object")
    ? data.rosterB as Record<string, unknown>
    : null;
  const adcA = rosterA?.adc ? String(rosterA.adc) : "";
  const adcB = rosterB?.adc ? String(rosterB.adc) : "";
  if (adcA || adcB) {
    out += ` ADC: ${teamA} ${adcA || "n/a"}, ${teamB} ${adcB || "n/a"}.`;
  }
  return out.replace(/\.\./g, ".").trim();
}

export function isSimplePlayerStatAsk(message: string): boolean {
  return (
    /\b(gd@?15|gold diff(?:erential)?(?:\s+at\s+15)?|dpm|kda|csd@?15)\b/i.test(message) &&
    !/\b(compare|vs\.?|versus|chart|graph|best|worst)\b/i.test(message)
  );
}

export function formatPlayerStatAnswer(
  data: Record<string, unknown>,
  message: string,
): string {
  if (data.found === false) {
    return `no verified stats for ${String(data.player ?? "that player")} in this filter.`;
  }
  const nested = (data.player && typeof data.player === "object")
    ? data.player as Record<string, unknown>
    : data;
  const name = String(nested.name ?? data.player ?? "that player");
  const games = Number(nested.games ?? 0);
  const league = String(nested.league ?? data.league ?? "").trim();
  const scope = league ? ` in ${league}` : "";
  const gd15 = Number(nested.gd15);
  const wantsGd = /\b(gd@?15|gold diff)/i.test(message);
  if (wantsGd && Number.isFinite(gd15) && (Math.abs(gd15) > 0.05 || games < 8)) {
    const signed = gd15 > 0 ? `+${gd15}` : String(gd15);
    return `${name}'s GD@15 is ${signed} over ${games} games${scope}.`;
  }
  if (wantsGd && games >= 8 && (!Number.isFinite(gd15) || Math.abs(gd15) <= 0.05)) {
    return `${name} has ${games} games${scope} but GD@15 is not populated in this slice.`;
  }
  const dpm = Number(nested.dpm);
  if (/\bdpm\b/i.test(message) && Number.isFinite(dpm) && dpm > 0) {
    return `${name}'s DPM is ${dpm} over ${games} games${scope}.`;
  }
  const kda = Number(nested.kda);
  if (/\bkda\b/i.test(message) && Number.isFinite(kda)) {
    return `${name}'s KDA is ${kda} over ${games} games${scope}.`;
  }
  return `${name} — ${games} games${scope}.`;
}

export function formatEntityClarifyAnswer(data: Record<string, unknown>): string {
  const rows = Array.isArray(data.clarifications) ? data.clarifications : [];
  const first = (rows[0] ?? {}) as {
    query?: string;
    candidates?: Array<{ name?: string; team?: string; league?: string; position?: string }>;
  };
  const query = String(first.query ?? "player");
  const cands = Array.isArray(first.candidates) ? first.candidates : [];
  if (!cands.length) {
    return `Which ${query} — team and league? I won't pick a player from an empty roster slice.`;
  }
  const list = cands.slice(0, 6).map((c) =>
    `${c.name ?? query} · ${c.team ?? "?"} · ${c.league ?? "?"} · ${c.position ?? "?"}`
  ).join("; ");
  return `Which ${query}? ${list}`;
}

export function isPlayerIdentityAsk(message: string): boolean {
  return /\bwho is\b/i.test(message) && !/\b(best|worst|winning|going to)\b/i.test(message);
}

export function formatPlayerIdentityAnswer(data: Record<string, unknown>): string {
  const list = Array.isArray(data.players) ? data.players : [];
  const nested = (data.player && typeof data.player === "object")
    ? data.player as Record<string, unknown>
    : (list[0] as Record<string, unknown> | undefined);
  if (!nested) return "";
  const name = String(nested.name ?? "that player");
  const team = String(nested.team ?? "an unknown team");
  const position = String(nested.position ?? "player");
  const league = String(nested.league ?? "");
  const games = Number(nested.games ?? 0);
  const lg = league ? ` in ${league}` : "";
  const g = games > 0 ? ` (${games} games in this filter)` : "";
  return `${name} is ${team}'s ${position}${lg}${g}.`;
}

function toolData(t: ToolResultLike): Record<string, unknown> {
  return t.data && Object.keys(t.data).length ? t.data : (t as unknown as Record<string, unknown>);
}

export function tryDeterministicAnswer(
  message: string,
  tools: ToolResultLike[],
): string | null {
  const lower = message.toLowerCase();

  if (isNuckyTypoGreeting(message)) {
    return formatNuckyTypoGreeting(message);
  }

  if (isMsi2026WinnerQuestion(message)) {
    return formatMsi2026Answer();
  }

  const worldsYear = extractAskedWorldsYear(message);
  if (worldsYear != null && !isPlayerWorldsTitleQuestion(message)) {
    const lockedWorlds = formatWorldsYearAnswer(worldsYear);
    if (lockedWorlds) return lockedWorlds;
  }

  const titles = tools.find((t) => t.tool === "team_lck_titles");
  if (titles && isTeamLckTitleQuestion(message)) {
    return formatGengLckTitlesAnswer();
  }

  const series = tools.find((t) => t.tool === "warehouse_series_recap");
  const weekly = tools.find((t) => t.tool === "weekly_warehouse_recap");
  if (
    series &&
    !isWhoWinsPrediction(message) &&
    (
      isDatedMatchupRecap(message) ||
      isTeamLastSeriesQuestion(message) ||
      /\b(vs\.?|versus)\b/i.test(message)
    )
  ) {
    const data = toolData(series);
    const miss = data.missingAskedSeries === true || data.seriesScore === "0-0";
    if (miss && weekly && (hasWeeklyWindowAsk(message) || isWeeklyLeagueRecapQuestion(message))) {
      return `${formatWeeklyWarehouseAnswer(toolData(weekly))}\n\n${formatWarehouseSeriesAnswer(data)}`;
    }
    return formatWarehouseSeriesAnswer(data);
  }
  if (
    weekly &&
    (
      isWeeklyLeagueRecapQuestion(message) ||
      hasWeeklyWindowAsk(message) ||
      wantsWeekRecap(lower) ||
      wantsWarehouseResults(message)
    )
  ) {
    return formatWeeklyWarehouseAnswer(toolData(weekly));
  }

  const clarify = tools.find((t) => t.tool === "entity_clarify");
  if (clarify) return formatEntityClarifyAnswer(toolData(clarify));

  if (isPlayerIdentityAsk(message)) {
    const mentioned = tools.find((t) => t.tool === "mentioned_players");
    const stat = tools.find((t) => t.tool === "player_stat");
    const ident = mentioned ?? stat;
    if (ident) {
      const text = formatPlayerIdentityAnswer(toolData(ident));
      if (text) return text;
    }
  }

  if (isSimplePlayerStatAsk(message)) {
    const stat = tools.find((t) => t.tool === "player_stat");
    const mentioned = tools.find((t) => t.tool === "mentioned_players");
    if (stat) return formatPlayerStatAnswer(toolData(stat), message);
    if (mentioned) {
      const data = toolData(mentioned);
      const players = Array.isArray(data.players) ? data.players : [];
      const first = players[0] as Record<string, unknown> | undefined;
      if (first) return formatPlayerStatAnswer({ player: first }, message);
    }
  }

  if (isSimpleTeamStatAsk(lower)) {
    const stat = tools.find((t) => t.tool === "team_stat");
    if (stat) return formatTeamStatAnswer(toolData(stat));
  }

  return null;
}

function wantsWeekRecap(lower: string): boolean {
  return /\b(this week|past week|last week|this weekend|week \d+)\b/.test(lower);
}

function isSimpleTeamStatAsk(lower: string): boolean {
  return (
    /\b(win\s*rate|winrate|record)\b/i.test(lower) &&
    !/\b(chart|graph|line|plot|compare|vs\.?|versus)\b/i.test(lower)
  );
}

/** Flatten MATCH_STATS.tools ({ tool, ...data }) into ToolResultLike rows. */
export function toolsFromMatchStats(matchStats: Record<string, unknown> | undefined): ToolResultLike[] {
  const tools = matchStats?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return { tool: String(row.tool ?? ""), data: row };
  });
}
