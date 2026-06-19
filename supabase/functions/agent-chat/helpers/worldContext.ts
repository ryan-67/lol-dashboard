/** Curated esports calendar + facts nucky can cite without inventing stats. Updated for 2026 season. */

export interface TemporalContext {
  clientNow: string;
  clientDate: string;
  block: string;
}

const MSI_2026 = {
  name: "2026 Mid-Season Invitational (MSI)",
  location: "Daejeon, South Korea",
  start: "2026-06-28",
  end: "2026-07-12",
  statusBeforeStart: "not_started",
  bracketStage: [
    { region: "LPL", team: "Bilibili Gaming", seed: 1 },
    { region: "LPL", team: "Top Esports", seed: 2 },
    { region: "LCK", team: "Hanwha Life Esports", seed: 1 },
    { region: "LEC", team: "G2 Esports", seed: 1 },
    { region: "LCP", team: "Team Secret Whales", seed: 1 },
    { region: "LCS", team: "LYON", seed: 1 },
    { region: "CBLOL", team: "FURIA", seed: 1 },
  ],
  playIn: [
    { region: "LCK", team: "T1", note: "LCK Road to MSI runner-up (beat Gen.G 3-2 in lower bracket final)" },
    { region: "LEC", team: "Karmine Corp", note: "LEC Spring runner-up" },
    { region: "LCP", team: "Deep Cross Gaming", note: "LCP 2nd seed" },
    { region: "LCS", team: "Team Liquid", note: "LCS Spring runner-up" },
  ],
  lckQualifiers: "Hanwha Life Esports (1st seed, bracket) and T1 (2nd seed, play-in). Gen.G did not qualify for MSI 2026.",
  lckRoadToMsi2026:
    "LCK Road to MSI (June 2026): Hanwha Life Esports won the upper bracket for 1st seed. T1 beat Gen.G 3-2 in the lower bracket final for 2nd seed. Gen.G failed to qualify. This was a close 3-2 — NOT a reverse sweep (do not use that term for this series).",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function msiStatus(now: Date): string {
  const start = new Date(`${MSI_2026.start}T00:00:00Z`);
  const end = new Date(`${MSI_2026.end}T23:59:59Z`);
  if (now < start) {
    const days = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return `MSI 2026 has NOT started yet. It begins ${formatDate(MSI_2026.start)} (${days} day(s) from user's current date). Do NOT claim MSI is over or that summer splits are halfway through unless client_now is after ${MSI_2026.end}.`;
  }
  if (now > end) {
    return "MSI 2026 concluded. Check EXTERNAL_CONTEXT or match stats for results — do not invent the winner.";
  }
  return "MSI 2026 is currently in progress. Use EXTERNAL_CONTEXT for live results; do not invent scores.";
}

export function buildTemporalContext(clientNow?: string): TemporalContext {
  const nowIso = clientNow?.trim() || new Date().toISOString();
  const now = new Date(nowIso);
  const clientDate = nowIso.slice(0, 10);

  const bracketList = MSI_2026.bracketStage.map((t) => `${t.team} (${t.region})`).join(", ");
  const playInList = MSI_2026.playIn.map((t) => `${t.team} (${t.region})`).join(", ");

  const block = `[WORLD_CONTEXT]
current_datetime_utc: ${nowIso}
current_date: ${clientDate}
temporal_rules: ${msiStatus(now)}
msi_2026: ${MSI_2026.name} in ${MSI_2026.location}, ${MSI_2026.start} to ${MSI_2026.end}.
msi_2026_bracket_stage_teams: ${bracketList}
msi_2026_play_in_teams: ${playInList}
lck_msi_2026: ${MSI_2026.lckQualifiers}
lck_road_to_msi_2026: ${MSI_2026.lckRoadToMsi2026}
series_terminology: never call T1 vs Gen.G Road to MSI "reverse sweep" — it was a 3-2 T1 win, not a comeback from 0-2 down.
roster_2026_note: Viper is on Bilibili Gaming (LPL) in 2026, NOT Hanwha Life Esports. HLE adc is Gumayusi.
kalshi_odds: do not invent betting lines or percentages — only cite odds present in EXTERNAL_CONTEXT from kalshi source.
tier1_regions: LCK, LPL, LEC, LCS (+ international events MSI, Worlds, First Stand)
data_limits: match stats in MATCH_STATS are from completed pro games in oe_slices — not live in-game telemetry (GRID not connected yet).
`;

  return { clientNow: nowIso, clientDate, block };
}
