/** Deno mirror of src/lib/advancedStats.ts for nuckyAI backend. */

export type RoleKey = "top" | "jungle" | "mid" | "adc" | "support";

export type AdvancedMetricKey =
  | "turretPlates"
  | "dmgGoldRatio"
  | "dmgPerGold"
  | "kaPerMin"
  | "objectivesStolen"
  | "wardsDestroyed";

export type RadarMetricKey =
  | "csd15"
  | "gd15"
  | "xpd15"
  | "dpm"
  | "kda"
  | "dmgShare"
  | "firstBloodRate"
  | "kp"
  | "objControl"
  | "goldShare"
  | "visionScore"
  | AdvancedMetricKey;

export interface GameLogRow {
  result?: number;
  dmgShare?: number;
  goldShare?: number;
  soloKills?: number;
  turretPlates?: number;
  objectivesStolen?: number;
  wardsDestroyed?: number;
  kaPerMin?: number;
  dmgGoldRatio?: number;
  dmgPerGold?: number;
  dpm?: number;
  gpm?: number;
}

export interface PlayerAdvancedRow {
  name: string;
  team: string;
  league: string;
  position: string;
  games: number;
  kda: number;
  kp: number;
  dmgShare: number;
  gd15: number;
  csd15: number;
  xpd15: number;
  dpm: number;
  visionScore: number;
  goldShare: number;
  firstBloodRate: number;
  objControl: number;
  soloKills?: number;
  turretPlates?: number;
  objectivesStolen?: number;
  wardsDestroyed?: number;
  kaPerMin?: number;
  dmgGoldRatio?: number;
  dmgPerGold?: number;
  gameLog?: GameLogRow[];
}

export function playerToolPayload(player: PlayerAdvancedRow): Record<string, unknown> {
  const enriched = enrichPlayerAdvanced(player);
  return {
    name: enriched.name,
    team: enriched.team,
    league: enriched.league,
    position: enriched.position,
    games: enriched.games,
    kda: enriched.kda,
    gd15: enriched.gd15,
    csd15: enriched.csd15,
    dpm: enriched.dpm,
    kp: enriched.kp,
    dmgShare: enriched.dmgShare,
    goldShare: enriched.goldShare,
    turretPlates: enriched.turretPlates,
    objectivesStolen: enriched.objectivesStolen,
    wardsDestroyed: enriched.wardsDestroyed,
    kaPerMin: enriched.kaPerMin,
    dmgGoldRatio: enriched.dmgGoldRatio,
    dmgPerGold: enriched.dmgPerGold,
  };
}

export const ROLE_METRICS: Record<RoleKey, Array<{ key: RadarMetricKey; label: string }>> = {
  top: [
    { key: "csd15", label: "CS Diff@15" },
    { key: "gd15", label: "Gold Diff@15" },
    { key: "xpd15", label: "XP Diff@15" },
    { key: "dpm", label: "DPM" },
    { key: "kda", label: "KDA" },
    { key: "dmgShare", label: "Damage %" },
    { key: "turretPlates", label: "Plates" },
    { key: "dmgGoldRatio", label: "DMG%/G%" },
  ],
  jungle: [
    { key: "csd15", label: "CS Diff@15" },
    { key: "gd15", label: "Gold Diff@15" },
    { key: "xpd15", label: "XP Diff@15" },
    { key: "firstBloodRate", label: "First Blood %" },
    { key: "kp", label: "Kill Participation" },
    { key: "objControl", label: "Objective Control %" },
    { key: "kaPerMin", label: "K+A/m" },
    { key: "objectivesStolen", label: "Obj Steal" },
  ],
  mid: [
    { key: "csd15", label: "CS Diff@15" },
    { key: "gd15", label: "Gold Diff@15" },
    { key: "xpd15", label: "XP Diff@15" },
    { key: "dpm", label: "DPM" },
    { key: "dmgShare", label: "Damage %" },
    { key: "kda", label: "KDA" },
    { key: "dmgGoldRatio", label: "DMG%/G%" },
    { key: "dmgPerGold", label: "DMG/G" },
  ],
  adc: [
    { key: "csd15", label: "CS Diff@15" },
    { key: "gd15", label: "Gold Diff@15" },
    { key: "dpm", label: "DPM" },
    { key: "dmgShare", label: "Damage %" },
    { key: "goldShare", label: "Gold %" },
    { key: "kda", label: "KDA" },
    { key: "dmgGoldRatio", label: "DMG%/G%" },
    { key: "dmgPerGold", label: "DMG/G" },
  ],
  support: [
    { key: "gd15", label: "Gold Diff@15" },
    { key: "firstBloodRate", label: "First Blood %" },
    { key: "kp", label: "Kill Participation" },
    { key: "visionScore", label: "Vision Score" },
    { key: "kda", label: "KDA" },
    { key: "dmgShare", label: "Damage %" },
    { key: "kaPerMin", label: "K+A / min" },
    { key: "wardsDestroyed", label: "Wards Cleared / game" },
  ],
};

export function normalizePosition(position: string | undefined): RoleKey | null {
  const pos = (position ?? "").toLowerCase();
  if (pos === "top") return "top";
  if (pos === "jungle" || pos === "jng") return "jungle";
  if (pos === "mid") return "mid";
  if (pos === "adc" || pos === "bot") return "adc";
  if (pos === "support" || pos === "sup") return "support";
  return null;
}

export function dmgGoldRatioFromGame(game: GameLogRow): number | null {
  const gold = game.goldShare ?? 0;
  if (gold <= 0) return null;
  if (game.dmgGoldRatio && game.dmgGoldRatio > 0) return game.dmgGoldRatio;
  return (game.dmgShare ?? 0) / gold;
}

export function dmgPerGoldFromGame(game: GameLogRow): number {
  if (game.dmgPerGold && game.dmgPerGold > 0) return game.dmgPerGold;
  if (game.dpm && game.gpm && game.gpm > 0) return game.dpm / game.gpm;
  return 0;
}

export function isAdvancedMetricAvailable(
  metric: AdvancedMetricKey,
  cohort: PlayerAdvancedRow[],
): boolean {
  if (metric === "objectivesStolen") {
    return cohort.some((p) => getMetricValue(p, metric) > 0);
  }
  if (metric === "turretPlates") {
    return cohort.some((p) => getMetricValue(p, metric) > 0);
  }
  if (metric === "dmgPerGold") {
    return cohort.some((p) => getMetricValue(p, metric) > 0);
  }
  return true;
}

export function aggregateAdvancedFromGameLog(logs: GameLogRow[]): Partial<
  Record<AdvancedMetricKey, number>
> {
  if (!logs.length) return {};
  const dmgRatios = logs
    .map((g) => dmgGoldRatioFromGame(g) ?? 0)
    .filter((v) => v > 0);
  const dmgPerGold = logs.map((g) => dmgPerGoldFromGame(g)).filter((v) => v > 0);
  return {
    turretPlates: logs.reduce((s, g) => s + (g.turretPlates ?? 0), 0) / logs.length,
    objectivesStolen: logs.reduce((s, g) => s + (g.objectivesStolen ?? 0), 0),
    wardsDestroyed: logs.reduce((s, g) => s + (g.wardsDestroyed ?? 0), 0) / logs.length,
    kaPerMin: logs.reduce((s, g) => s + (g.kaPerMin ?? 0), 0) / logs.length,
    dmgGoldRatio: dmgRatios.length
      ? dmgRatios.reduce((a, b) => a + b, 0) / dmgRatios.length
      : 0,
    dmgPerGold: dmgPerGold.length
      ? dmgPerGold.reduce((a, b) => a + b, 0) / dmgPerGold.length
      : 0,
  };
}

export function enrichPlayerAdvanced<T extends PlayerAdvancedRow>(player: T): T {
  const fromLog = aggregateAdvancedFromGameLog(player.gameLog ?? []);
  return {
    ...player,
    turretPlates: player.turretPlates ?? fromLog.turretPlates,
    objectivesStolen: player.objectivesStolen ?? fromLog.objectivesStolen,
    wardsDestroyed: player.wardsDestroyed ?? fromLog.wardsDestroyed,
    kaPerMin: player.kaPerMin ?? fromLog.kaPerMin,
    dmgGoldRatio: player.dmgGoldRatio ?? fromLog.dmgGoldRatio,
    dmgPerGold: player.dmgPerGold ?? fromLog.dmgPerGold,
  };
}

export function getMetricValue(player: PlayerAdvancedRow, key: RadarMetricKey): number {
  const enriched = enrichPlayerAdvanced(player);
  const advanced: AdvancedMetricKey[] = [
    "turretPlates",
    "dmgGoldRatio",
    "dmgPerGold",
    "kaPerMin",
    "objectivesStolen",
    "wardsDestroyed",
  ];
  if (advanced.includes(key as AdvancedMetricKey)) {
    const raw = enriched[key as AdvancedMetricKey];
    return typeof raw === "number" && !Number.isNaN(raw) ? raw : 0;
  }
  const raw = enriched[key as keyof PlayerAdvancedRow];
  return typeof raw === "number" && !Number.isNaN(raw) ? raw : 0;
}

export function formatMetric(key: RadarMetricKey, value: number): string {
  switch (key) {
    case "csd15":
    case "gd15":
    case "xpd15":
      return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
    case "dpm":
      return value.toFixed(0);
    case "kda":
      return value.toFixed(2);
    case "dmgShare":
    case "goldShare":
    case "firstBloodRate":
    case "kp":
      return `${value.toFixed(1)}%`;
    case "objControl":
      return value.toFixed(2);
    case "visionScore":
      return value.toFixed(1);
    case "turretPlates":
      return value.toFixed(2);
    case "dmgGoldRatio":
      return value.toFixed(2);
    case "dmgPerGold":
      return value.toFixed(3);
    case "kaPerMin":
      return value.toFixed(2);
    case "objectivesStolen":
      return String(Math.round(value));
    case "wardsDestroyed":
      return value.toFixed(1);
    default:
      return value.toFixed(2);
  }
}

const OUTLIER_Z = 1.5;

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

function zScore(value: number, values: number[]): number {
  const sd = stdDev(values);
  if (!sd) return 0;
  return (value - mean(values)) / sd;
}

export interface AdvancedOutlier {
  metric: AdvancedMetricKey;
  label: string;
  value: number;
  formatted: string;
  zScore: number;
  direction: "high" | "low";
  playerName: string;
  role: RoleKey;
}

export function findAdvancedOutliers(
  player: PlayerAdvancedRow,
  role: RoleKey,
  cohort: PlayerAdvancedRow[],
  games?: GameLogRow[],
): AdvancedOutlier[] {
  const defs = ROLE_METRICS[role].filter((d) =>
    ["turretPlates", "dmgGoldRatio", "dmgPerGold", "kaPerMin", "objectivesStolen", "wardsDestroyed"]
      .includes(d.key)
  );
  const enriched = enrichPlayerAdvanced(player);
  const gameWindow = games ?? player.gameLog ?? [];
  const outliers: AdvancedOutlier[] = [];

  for (const def of defs) {
    const key = def.key as AdvancedMetricKey;
    if (!isAdvancedMetricAvailable(key, cohort)) continue;

    const cohortValues = cohort
      .map((p) => getMetricValue(p, key))
      .filter((v) => v > 0 || key === "objectivesStolen" || key === "turretPlates");
    if (cohortValues.length < 3) continue;

    const value = getMetricValue(enriched, key);
    if (value === 0 && (key === "objectivesStolen" || key === "turretPlates")) continue;

    const z = zScore(value, cohortValues);
    const isHigh = z >= OUTLIER_Z;
    const isLow = z <= -OUTLIER_Z;
    if (!isHigh && !isLow) continue;

    if (
      isLow &&
      (key === "dmgGoldRatio" || key === "dmgPerGold") &&
      gameWindow.length &&
      gameWindow.filter((g) => g.result === 1).length / gameWindow.length < 0.5
    ) {
      continue;
    }

    outliers.push({
      metric: key,
      label: def.label,
      value,
      formatted: formatMetric(key, value),
      zScore: z,
      direction: isHigh ? "high" : "low",
      playerName: player.name,
      role,
    });
  }

  return outliers.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

export function formatAdvancedOutlierLine(o: AdvancedOutlier): string {
  const name = o.playerName;
  switch (o.metric) {
    case "turretPlates":
      return o.direction === "high"
        ? `${name} was shredding plates — ${o.formatted}/game`
        : `${name} wasn't securing plates (${o.formatted}/game)`;
    case "dmgGoldRatio":
      return o.direction === "high"
        ? `${name} punched above gold weight (${o.formatted} dmg%/gold%)`
        : `${name} ate gold without matching damage (${o.formatted} dmg%/gold%)`;
    case "dmgPerGold":
      return o.direction === "high"
        ? `${name} elite dmg/gold (${o.formatted})`
        : `${name} weak dmg/gold (${o.formatted}) despite resources`;
    case "kaPerMin":
      return o.direction === "high"
        ? `${name} was everywhere (${o.formatted} K+A/min)`
        : `${name} was pretty inactive (${o.formatted} K+A/min)`;
    case "objectivesStolen":
      return `${name} stole ${o.formatted} objective(s) — swing play`;
    case "wardsDestroyed":
      return o.direction === "high"
        ? `${name} denied vision (${o.formatted} wards cleared/game)`
        : `${name} barely cleared wards (${o.formatted}/game)`;
    default:
      return `${name}: ${o.label} ${o.formatted}`;
  }
}
