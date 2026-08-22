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

const EWC_2026 = {
  name: "League of Legends at Esports World Cup 2026",
  location: "Paris, France",
  // OE also carries earlier EWC qualifier windows (Apr–Jun); main stage is mid-July.
  mainStart: "2026-07-15",
  mainEnd: "2026-07-19",
};

/** Typical LCK Summer open — treat as not started until MATCH_STATS proves otherwise. */
const LCK_SUMMER_2026_HINT_START = "2026-07-20";

function msiStatus(now: Date): string {
  const start = new Date(`${MSI_2026.start}T00:00:00Z`);
  const end = new Date(`${MSI_2026.end}T23:59:59Z`);
  if (now < start) {
    const days = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return `MSI 2026 has NOT started yet. It begins ${formatDate(MSI_2026.start)} (${days} day(s) from user's current date). Do NOT claim MSI is over or that summer splits are underway unless MATCH_STATS has games.`;
  }
  if (now > end) {
    return "MSI 2026 concluded. Champion: Hanwha Life Esports. Cite that winner; do not invent a different champion.";
  }
  return "MSI 2026 is currently in progress. Use EXTERNAL_CONTEXT for live results; do not invent scores.";
}

function ewcStatus(now: Date): string {
  const start = new Date(`${EWC_2026.mainStart}T00:00:00Z`);
  const end = new Date(`${EWC_2026.mainEnd}T23:59:59Z`);
  if (now < start) {
    return `EWC 2026 LoL main stage begins ${formatDate(EWC_2026.mainStart)}. Qualifier/OE EWC rows may exist earlier — only cite games present in MATCH_STATS.`;
  }
  if (now > end) {
    return "EWC 2026 LoL main stage has concluded. Cite MATCH_STATS / EXTERNAL_CONTEXT only — do not invent the champion.";
  }
  return "EWC 2026 LoL is in progress (Paris). Use MATCH_STATS and EXTERNAL_CONTEXT for results; do not invent scores.";
}

function summerSplitStatus(now: Date): string {
  const hint = new Date(`${LCK_SUMMER_2026_HINT_START}T00:00:00Z`);
  if (now < hint) {
    return "LCK/LPL/LCS 2026 Summer has NOT started yet (post-MSI/EWC window; LEC may have early games). NEVER invent Summer win rates, game counts, or draft tendencies for empty regions. DEFAULT CURRENT FORM = latest adequate split in MATCH_STATS (often 2026 EWC and/or 2026 Spring / Spring Playoffs) — not an empty Summer. If MATCH_STATS lacks Summer games, say so and answer from EWC/MSI/Spring data that IS present.";
  }
  return "Regional 2026 Summer may be underway — still only cite splits/games present in MATCH_STATS. Empty Summer for a region → fall back to EWC/MSI/Spring for that region's current form.";
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
temporal_rules: ${msiStatus(now)} ${ewcStatus(now)} ${summerSplitStatus(now)}
msi_2026: ${MSI_2026.name} in ${MSI_2026.location}, ${MSI_2026.start} to ${MSI_2026.end}.
msi_2026_bracket_stage_teams: ${bracketList}
msi_2026_play_in_teams: ${playInList}
ewc_2026: ${EWC_2026.name} in ${EWC_2026.location}, main stage ${EWC_2026.mainStart} to ${EWC_2026.mainEnd} (after MSI, before regional Summer).
lck_msi_2026: ${MSI_2026.lckQualifiers}
msi_2026_champion: Hanwha Life Esports (HLE) won MSI 2026.
lck_road_to_msi_2026: ${MSI_2026.lckRoadToMsi2026}
series_terminology: never call T1 vs Gen.G Road to MSI "reverse sweep" — it was a 3-2 T1 win, not a comeback from 0-2 down.
roster_2026_note: Viper is on Bilibili Gaming (LPL) in 2026, NOT Hanwha Life Esports. HLE adc is Gumayusi.
kalshi_odds: do not invent betting lines or percentages — only cite odds present in EXTERNAL_CONTEXT from kalshi source.
tier1_regions: LCK, LPL, LEC, LCS (+ international events First Stand, MSI, EWC, Worlds)
data_limits: match stats in MATCH_STATS are from completed pro games in oe_slices — not live in-game telemetry (GRID not connected yet).
`;

  return { clientNow: nowIso, clientDate, block };
}

/** WORLD_CONTEXT already answers this career ask — do not fail-close as "not in data". */
export function worldContextCoversAsk(message: string, worldBlock: string): boolean {
  const q = message.toLowerCase();
  const block = worldBlock.toLowerCase();
  if (
    /\bmsi\b/.test(q) &&
    /\b2026\b/.test(q) &&
    /\b(won|winner|champion|champ|title)\b/.test(q) &&
    /msi_2026_champion/.test(block) &&
    /hanwha life esports/.test(block)
  ) {
    return true;
  }
  return false;
}
