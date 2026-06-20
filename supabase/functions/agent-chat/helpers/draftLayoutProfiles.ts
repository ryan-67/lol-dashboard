/**
 * Broadcast layout ROI profiles for LCK/esports draft screenshots.
 * Supports: (1) final-round draft overlay, (2) in-game spectator HUD.
 */

export type DraftLayoutId = "draft_overlay" | "ingame_hud";

export interface SlotRoi {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LogoRoiSet {
  left: SlotRoi[];
  right: SlotRoi[];
}

export interface LayoutProfile {
  id: DraftLayoutId;
  /** Five champion pick slots per side (left = blue/broadcast left). */
  leftChampionSlots: SlotRoi[];
  rightChampionSlots: SlotRoi[];
  logoRois: LogoRoiSet;
}

/** Final-round / champ-select overlay — large portraits in bottom bar. */
export const DRAFT_OVERLAY: LayoutProfile = {
  id: "draft_overlay",
  leftChampionSlots: [
    { x0: 0.01, y0: 0.68, x1: 0.09, y1: 0.84 },
    { x0: 0.085, y0: 0.68, x1: 0.165, y1: 0.84 },
    { x0: 0.16, y0: 0.68, x1: 0.24, y1: 0.84 },
    { x0: 0.235, y0: 0.68, x1: 0.315, y1: 0.84 },
    { x0: 0.31, y0: 0.68, x1: 0.39, y1: 0.84 },
  ],
  rightChampionSlots: [
    { x0: 0.61, y0: 0.68, x1: 0.69, y1: 0.84 },
    { x0: 0.685, y0: 0.68, x1: 0.765, y1: 0.84 },
    { x0: 0.76, y0: 0.68, x1: 0.84, y1: 0.84 },
    { x0: 0.835, y0: 0.68, x1: 0.915, y1: 0.84 },
    { x0: 0.91, y0: 0.68, x1: 0.99, y1: 0.84 },
  ],
  logoRois: {
    left: [
      { x0: 0.38, y0: 0.72, x1: 0.46, y1: 0.88 },
      { x0: 0.02, y0: 0.02, x1: 0.14, y1: 0.12 },
    ],
    right: [
      { x0: 0.54, y0: 0.72, x1: 0.62, y1: 0.88 },
      { x0: 0.86, y0: 0.02, x1: 0.98, y1: 0.12 },
    ],
  },
};

/** Live game spectator HUD — circular icons on left/right sidebars + top scoreboard logos. */
export const INGAME_HUD: LayoutProfile = {
  id: "ingame_hud",
  leftChampionSlots: [
    { x0: 0.0, y0: 0.1, x1: 0.095, y1: 0.19 },
    { x0: 0.0, y0: 0.19, x1: 0.095, y1: 0.28 },
    { x0: 0.0, y0: 0.28, x1: 0.095, y1: 0.37 },
    { x0: 0.0, y0: 0.37, x1: 0.095, y1: 0.46 },
    { x0: 0.0, y0: 0.46, x1: 0.095, y1: 0.55 },
  ],
  rightChampionSlots: [
    { x0: 0.905, y0: 0.1, x1: 1.0, y1: 0.19 },
    { x0: 0.905, y0: 0.19, x1: 1.0, y1: 0.28 },
    { x0: 0.905, y0: 0.28, x1: 1.0, y1: 0.37 },
    { x0: 0.905, y0: 0.37, x1: 1.0, y1: 0.46 },
    { x0: 0.905, y0: 0.46, x1: 1.0, y1: 0.55 },
  ],
  logoRois: {
    left: [
      { x0: 0.06, y0: 0.0, x1: 0.16, y1: 0.09 },
      { x0: 0.0, y0: 0.0, x1: 0.12, y1: 0.08 },
    ],
    right: [
      { x0: 0.84, y0: 0.0, x1: 0.94, y1: 0.09 },
      { x0: 0.88, y0: 0.0, x1: 0.99, y1: 0.08 },
    ],
  },
};

/** Bottom stats panel rows (supplement for in-game HUD). */
export const INGAME_HUD_BOTTOM_SLOTS = {
  left: [
    { x0: 0.18, y0: 0.875, x1: 0.26, y1: 0.96 },
    { x0: 0.26, y0: 0.875, x1: 0.34, y1: 0.96 },
    { x0: 0.34, y0: 0.875, x1: 0.42, y1: 0.96 },
    { x0: 0.42, y0: 0.875, x1: 0.5, y1: 0.96 },
    { x0: 0.14, y0: 0.875, x1: 0.22, y1: 0.96 },
  ],
  right: [
    { x0: 0.5, y0: 0.875, x1: 0.58, y1: 0.96 },
    { x0: 0.58, y0: 0.875, x1: 0.66, y1: 0.96 },
    { x0: 0.66, y0: 0.875, x1: 0.74, y1: 0.96 },
    { x0: 0.74, y0: 0.875, x1: 0.82, y1: 0.96 },
    { x0: 0.82, y0: 0.875, x1: 0.9, y1: 0.96 },
  ],
};

export const ALL_LAYOUTS: LayoutProfile[] = [DRAFT_OVERLAY, INGAME_HUD];

/** Heuristic: bottom bar density vs sidebar density. */
export function detectLikelyLayout(
  gray: Uint8Array,
  width: number,
  height: number,
): DraftLayoutId {
  const bottomVar = regionVariance(gray, width, height, 0, 0.65, 1, 0.95);
  const leftVar = regionVariance(gray, width, height, 0, 0.08, 0.12, 0.55);
  const topVar = regionVariance(gray, width, height, 0, 0, 1, 0.1);

  if (bottomVar > leftVar * 1.15 && bottomVar > topVar) return "draft_overlay";
  if (leftVar > bottomVar * 0.8) return "ingame_hud";
  return bottomVar >= leftVar ? "draft_overlay" : "ingame_hud";
}

function regionVariance(
  gray: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const left = Math.floor(x0 * w);
  const top = Math.floor(y0 * h);
  const right = Math.ceil(x1 * w);
  const bottom = Math.ceil(y1 * h);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const v = gray[y * w + x] ?? 0;
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export const TEAM_DISPLAY_ALIASES: Record<string, string> = {
  gen: "Gen.G",
  geng: "Gen.G",
  "gen.g": "Gen.G",
  t1: "T1",
  dk: "Dplus KIA",
  "dplus kia": "Dplus KIA",
  hle: "Hanwha Life Esports",
  kt: "KT Rolster",
};

export function normalizeTeamDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const key = trimmed.toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (TEAM_DISPLAY_ALIASES[key]) return TEAM_DISPLAY_ALIASES[key]!;
  if (TEAM_DISPLAY_ALIASES[trimmed.toLowerCase()]) {
    return TEAM_DISPLAY_ALIASES[trimmed.toLowerCase()]!;
  }
  return trimmed;
}
