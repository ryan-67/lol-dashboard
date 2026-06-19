import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchSliceBundle } from "./oeData.ts";

/** Curated facts the model must not contradict — supplement OE rosters. */
const ROSTER_FACTS_2026 = `
roster_facts_2026 (authoritative — do not contradict with training memory):
- Viper (Park Do-hyeon) is ADC for Bilibili Gaming (LPL) in 2026. He left Hanwha Life Esports after 2025. NEVER say Viper is on HLE in 2026.
- Hanwha Life Esports 2026 starters: Zeus (top), Kanavi (jungle), Zeka (mid), Gumayusi (adc), Delight (support).
- Bilibili Gaming 2026 includes Viper as adc (LPL Split 2 champions entering MSI).
- T1 2026 core: Zeus left for HLE; T1 roster includes Faker (mid) — verify other roles via current_rosters below.

series_wording_rules:
- LCK Road to MSI 2026 lower bracket final: T1 beat Gen.G 3-2. Gen.G did NOT qualify for MSI.
- This was NOT a reverse sweep. Do NOT use "reverse sweep" unless the trailing team was down 0-2 (or 1-2 in BO5 from behind) and came back — T1 vs Gen.G 3-2 is just a close BO5 win.
- Do not invent narrative details (specific champions, KDA, "griefing") unless in MATCH_STATS or EXTERNAL_CONTEXT.

odds_rules:
- Do NOT invent Kalshi or betting percentages. Only cite odds if EXTERNAL_CONTEXT contains kalshi source text with numbers.
`.trim();

const MSI_TEAM_NAMES = [
  "Bilibili Gaming",
  "Top Esports",
  "Hanwha Life Esports",
  "G2 Esports",
  "Team Secret Whales",
  "LYON",
  "FURIA",
  "T1",
  "Karmine Corp",
  "Deep Cross Gaming",
  "Team Liquid",
] as const;

const ROLE_ORDER = ["top", "jungle", "mid", "adc", "support"] as const;

function normalizeRole(position: string): string | null {
  const pos = position.toLowerCase();
  if (pos === "top") return "top";
  if (pos === "jungle" || pos === "jng") return "jungle";
  if (pos === "mid") return "mid";
  if (pos === "adc" || pos === "bot") return "adc";
  if (pos === "support" || pos === "sup") return "support";
  return null;
}

function teamMatches(name: string, target: string): boolean {
  const a = name.toLowerCase();
  const b = target.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

export function needsRosterContext(message: string): boolean {
  return /\b(msi|qualif|roster|favorite|favou?rite|prediction|who wins|viper|hanwha|hle|blg|lineup|starters?|playing for)\b/i.test(
    message,
  );
}

async function rosterForTeam(
  service: SupabaseClient,
  teamName: string,
  league: string,
  split: string,
): Promise<Record<string, string> | null> {
  try {
    const bundle = await fetchSliceBundle(service, league, split);
    const players = bundle.players.filter((p) => teamMatches(p.team, teamName));
    if (!players.length) return null;

    const byRole: Record<string, string> = {};
    for (const role of ROLE_ORDER) {
      const pick = players
        .filter((p) => normalizeRole(p.position) === role)
        .sort((a, b) => b.games - a.games)[0];
      if (pick) byRole[role] = pick.name;
    }
    return Object.keys(byRole).length ? byRole : null;
  } catch {
    return null;
  }
}

export async function buildRosterContext(
  service: SupabaseClient,
  split = "2026 Spring",
): Promise<string> {
  const lines: string[] = [ROSTER_FACTS_2026, "", "current_rosters_from_match_data:"];

  const leagueMap: Record<string, string> = {
    "Bilibili Gaming": "LPL",
    "Top Esports": "LPL",
    "Hanwha Life Esports": "LCK",
    "T1": "LCK",
    "G2 Esports": "LEC",
    "Karmine Corp": "LEC",
    "LYON": "LCS",
    "Team Liquid": "LCS",
  };

  for (const team of MSI_TEAM_NAMES) {
    const league = leagueMap[team];
    if (!league) continue;
    const roster = await rosterForTeam(service, team, league, split);
    if (roster) {
      const formatted = ROLE_ORDER.filter((r) => roster[r])
        .map((r) => `${r}: ${roster[r]}`)
        .join(", ");
      lines.push(`- ${team} (${league}, ${split}): ${formatted}`);
    }
  }

  return lines.join("\n");
}

export function appendRosterToWorldBlock(worldBlock: string, rosterBlock: string): string {
  return `${worldBlock}\n${rosterBlock}`;
}
