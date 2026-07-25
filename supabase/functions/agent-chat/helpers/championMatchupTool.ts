/**
 * Deterministic champion-vs-champion H2H from champ_matchups.json for chat.
 */

import {
  chartMarkdownBlock,
  type CompareChartPayload,
} from "./teamCompare.ts";
import { directChampionMatchup } from "./mlArtifacts.ts";

const ROLE_HINTS: Array<{ re: RegExp; role: string }> = [
  { re: /\b(mid|middle)\b/i, role: "mid" },
  { re: /\b(jungle|jng)\b/i, role: "jungle" },
  { re: /\b(top|topside)\b/i, role: "top" },
  { re: /\b(adc|bot(?:\s*lane)?|marksman)\b/i, role: "adc" },
  { re: /\b(support|sup)\b/i, role: "support" },
];

/** Common pro champions — keep in sync with scope PRO_CHAMPION loosely. */
const CHAMPIONS: Array<{ key: string; name: string }> = [
  "Sylas", "Akali", "Azir", "Corki", "Orianna", "Syndra", "Ahri", "Yone", "Viktor",
  "Taliyah", "Annie", "Ryze", "Aurora", "Hwei", "Galio", "Zoe", "Vex", "Neeko",
  "K'Sante", "Rumble", "Gnar", "Jayce", "Aatrox", "Camille", "Gwen", "Fiora",
  "Ambessa", "Sion", "Ornn", "Lee Sin", "Vi", "Viego", "Graves", "Jarvan IV",
  "Sejuani", "Maokai", "Nocturne", "Xin Zhao", "Varus", "Ezreal", "Jinx", "Kai'Sa",
  "Xayah", "Aphelios", "Zeri", "Lucian", "Caitlyn", "Jhin", "Kalista", "Ashe",
  "Thresh", "Nautilus", "Rell", "Leona", "Rakan", "Lulu", "Nami", "Braum",
].map((name) => ({ key: name.toLowerCase().replace(/['.]/g, ""), name }));

function normalizeChampToken(s: string): string {
  return s.toLowerCase().replace(/['.\s]/g, "");
}

export function extractChampionsFromMessage(message: string): string[] {
  const lower = normalizeChampToken(message);
  const found: string[] = [];
  for (const c of CHAMPIONS) {
    const token = normalizeChampToken(c.name);
    if (token.length >= 3 && lower.includes(token)) {
      if (!found.includes(c.name)) found.push(c.name);
    }
  }
  // aliases
  if (/\bksante\b/i.test(message) && !found.includes("K'Sante")) found.push("K'Sante");
  if (/\bkaisa\b/i.test(message) && !found.includes("Kai'Sa")) found.push("Kai'Sa");
  if (/\bjarvan\b/i.test(message) && !found.includes("Jarvan IV")) found.push("Jarvan IV");
  return found.slice(0, 4);
}

function inferRole(message: string, a: string, b: string): string {
  for (const h of ROLE_HINTS) {
    if (h.re.test(message)) return h.role;
  }
  // Prefer mid for classic mage/assassin pairs
  const midBias = new Set(["Sylas", "Akali", "Azir", "Corki", "Orianna", "Ahri", "Yone", "Viktor"]);
  if (midBias.has(a) && midBias.has(b)) return "mid";
  return "mid";
}

export function isChampionMatchupAsk(message: string): boolean {
  const champs = extractChampionsFromMessage(message);
  if (champs.length < 2) return false;
  return /\b(vs\.?|versus|matchup|h2h|head.?to.?head|into|against|lane)\b/i.test(message) ||
    /\b(winrate|gd@?15|csd@?15|stats?|all-?time)\b/i.test(message);
}

export function runChampionMatchupLookup(message: string): {
  tool: string;
  data: Record<string, unknown>;
  chart: CompareChartPayload | null;
  chartMarkdown: string;
} | null {
  if (!isChampionMatchupAsk(message)) return null;
  const champs = extractChampionsFromMessage(message);
  if (champs.length < 2) return null;
  const [a, b] = champs;
  const role = inferRole(message, a, b);

  const ab = directChampionMatchup(role, a, b);
  const ba = directChampionMatchup(role, b, a);

  const games = ab?.games ?? ba?.games ?? 0;
  const wrA = ab ? ab.winrate : ba ? 100 - ba.winrate : null;
  const gdA = ab?.avgGd15Delta ?? (ba?.avgGd15Delta != null ? -ba.avgGd15Delta : null);

  const data: Record<string, unknown> = {
    tool: "champion_matchup_h2h",
    role,
    championA: a,
    championB: b,
    games,
    winrateA: wrA,
    winrateB: wrA != null ? Math.round((100 - wrA) * 10) / 10 : null,
    avgGd15DeltaA: gdA,
    avgGd15DeltaB: gdA != null ? Math.round(-gdA * 10) / 10 : null,
    sampleNote: games < 8
      ? `Small sample (n=${games}) — treat cautiously; still cite these numbers when present.`
      : `Pro same-role H2H from nucky champ matchup artifact.`,
    note: "Winrate/GD@15 are for championA when played into championB in the same role in indexed pro games. Do NOT invent all-time numbers beyond this block.",
  };

  let chart: CompareChartPayload | null = null;
  let chartMarkdown = "";
  if (games > 0 && wrA != null && gdA != null) {
    chart = {
      type: "compare",
      title: `${a} vs ${b}`,
      subtitle: `${role} · pro H2H · ${games} games`,
      left: { name: a, meta: role },
      right: { name: b, meta: role },
      metrics: [
        { label: "Games", left: games, right: games, higherIsBetter: true },
        { label: "Winrate", left: wrA, right: Math.round((100 - wrA) * 10) / 10, higherIsBetter: true },
        { label: "GD@15", left: Math.round(gdA * 10) / 10, right: Math.round(-gdA * 10) / 10, higherIsBetter: true },
      ],
    };
    chartMarkdown = chartMarkdownBlock(chart);
  }

  return { tool: "champion_matchup_h2h", data, chart, chartMarkdown };
}
