import {
  formatLckTitleLong,
  isTeamLckTitleQuestion,
  TEAM_LCK_TITLES,
} from "./teamTitles.ts";
import {
  hasWeeklyWindowAsk,
  isDatedMatchupRecap,
  isWeeklyLeagueRecapQuestion,
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

export function formatWeeklyWarehouseAnswer(data: Record<string, unknown>): string {
  const completed = Array.isArray(data.completed) ? data.completed : [];
  const upcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
  const lines: string[] = [];
  if (completed.length) {
    lines.push("This week (warehouse):");
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
  if (!lines.length) return "No warehouse series for this week.";
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
  return out.replace(/\.\./g, ".").trim();
}

function toolData(t: ToolResultLike): Record<string, unknown> {
  return t.data && Object.keys(t.data).length ? t.data : (t as unknown as Record<string, unknown>);
}

export function tryDeterministicAnswer(
  message: string,
  tools: ToolResultLike[],
): string | null {
  const lower = message.toLowerCase();

  const titles = tools.find((t) => t.tool === "team_lck_titles");
  if (titles && isTeamLckTitleQuestion(message)) {
    return formatGengLckTitlesAnswer();
  }

  const series = tools.find((t) => t.tool === "warehouse_series_recap");
  const weekly = tools.find((t) => t.tool === "weekly_warehouse_recap");
  if (series && (isDatedMatchupRecap(message) || /\b(vs\.?|versus)\b/i.test(message))) {
    const data = toolData(series);
    const miss = data.missingAskedSeries === true || data.seriesScore === "0-0";
    if (miss && weekly && (hasWeeklyWindowAsk(message) || isWeeklyLeagueRecapQuestion(message))) {
      return `${formatWeeklyWarehouseAnswer(toolData(weekly))}\n\n${formatWarehouseSeriesAnswer(data)}`;
    }
    return formatWarehouseSeriesAnswer(data);
  }
  if (
    weekly &&
    (isWeeklyLeagueRecapQuestion(message) || hasWeeklyWindowAsk(message) || wantsWeekRecap(lower))
  ) {
    return formatWeeklyWarehouseAnswer(toolData(weekly));
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
