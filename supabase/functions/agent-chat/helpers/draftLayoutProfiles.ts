/**
 * League-agnostic broadcast layout helpers.
 * Base families (draft bar vs in-game HUD) with parametric variants — not tied to one league/year.
 */

export type DraftLayoutFamily = "draft_overlay" | "ingame_hud";

export interface SlotRoi {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LogoZone {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LayoutVariant {
  family: DraftLayoutFamily;
  variantId: string;
  leftChampionSlots: SlotRoi[];
  rightChampionSlots: SlotRoi[];
}

/** Regions where team logos commonly appear across LCK/LPL/LEC/LCS/MSI/Worlds broadcasts. */
export const LOGO_SCAN_ZONES: LogoZone[] = [
  { id: "top_left", x0: 0, y0: 0, x1: 0.38, y1: 0.14 },
  { id: "top_right", x0: 0.62, y0: 0, x1: 1, y1: 0.14 },
  { id: "top_center", x0: 0.28, y0: 0, x1: 0.72, y1: 0.12 },
  { id: "bottom_center", x0: 0.22, y0: 0.62, x1: 0.78, y1: 0.96 },
  { id: "bottom_left", x0: 0, y0: 0.58, x1: 0.38, y1: 0.96 },
  { id: "bottom_right", x0: 0.62, y0: 0.58, x1: 1, y1: 0.96 },
];

/** Adaptive champion scan bands (left/right screen halves). */
export const CHAMPION_SCAN_REGIONS = {
  left: { x0: 0, y0: 0.06, x1: 0.48, y1: 0.94 },
  right: { x0: 0.52, y0: 0.06, x1: 1, y1: 0.94 },
} as const;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function horizontalPickRow(
  xStart: number,
  xEnd: number,
  y0: number,
  y1: number,
  count = 5,
  inset = 0.02,
): SlotRoi[] {
  const width = xEnd - xStart;
  const slotW = (width - inset * 2) / count;
  const slots: SlotRoi[] = [];
  for (let i = 0; i < count; i++) {
    slots.push({
      x0: clamp01(xStart + inset + i * slotW),
      y0: clamp01(y0),
      x1: clamp01(xStart + inset + (i + 1) * slotW),
      y1: clamp01(y1),
    });
  }
  return slots;
}

function verticalPickColumn(
  x0: number,
  x1: number,
  yStart: number,
  yEnd: number,
  count = 5,
  inset = 0.02,
): SlotRoi[] {
  const height = yEnd - yStart;
  const slotH = (height - inset * 2) / count;
  const slots: SlotRoi[] = [];
  for (let i = 0; i < count; i++) {
    slots.push({
      x0: clamp01(x0),
      y0: clamp01(yStart + inset + i * slotH),
      x1: clamp01(x1),
      y1: clamp01(yStart + inset + (i + 1) * slotH),
    });
  }
  return slots;
}

/** Generate draft-bar variants (bottom/mid bar, horizontal portraits). */
export function generateDraftOverlayVariants(): LayoutVariant[] {
  const variants: LayoutVariant[] = [];
  // Y band sweeps — leagues place pick bar at different heights
  const yBands: Array<[number, number]> = [
    [0.52, 0.72],
    [0.58, 0.78],
    [0.64, 0.84],
    [0.68, 0.88],
    [0.72, 0.92],
  ];
  // Center gap varies (scoreboard / series info width)
  const splits: Array<[number, number]> = [
    [0, 0.38, 0.62, 1],
    [0, 0.4, 0.6, 1],
    [0, 0.42, 0.58, 1],
    [0.02, 0.36, 0.64, 0.98],
  ];

  let idx = 0;
  for (const [y0, y1] of yBands) {
    for (const [lx0, lx1, rx0, rx1] of splits) {
      variants.push({
        family: "draft_overlay",
        variantId: `draft_y${idx}`,
        leftChampionSlots: horizontalPickRow(lx0, lx1, y0, y1),
        rightChampionSlots: horizontalPickRow(rx0, rx1, y0, y1),
      });
      idx++;
    }
  }
  return variants;
}

/** Generate in-game HUD variants (sidebars, vertical stacks, wider/narrower rails). */
export function generateIngameHudVariants(): LayoutVariant[] {
  const variants: LayoutVariant[] = [];
  const xBands: Array<[number, number]> = [
    [0, 0.09],
    [0, 0.11],
    [0, 0.13],
    [0.87, 1],
    [0.85, 1],
    [0.83, 1],
  ];
  const yRanges: Array<[number, number]> = [
    [0.08, 0.58],
    [0.1, 0.6],
    [0.12, 0.62],
    [0.06, 0.52],
  ];

  let idx = 0;
  for (const [y0, y1] of yRanges) {
    variants.push({
      family: "ingame_hud",
      variantId: `hud_v${idx}_narrow`,
      leftChampionSlots: verticalPickColumn(0, 0.09, y0, y1),
      rightChampionSlots: verticalPickColumn(0.91, 1, y0, y1),
    });
    idx++;
    variants.push({
      family: "ingame_hud",
      variantId: `hud_v${idx}_wide`,
      leftChampionSlots: verticalPickColumn(0, 0.13, y0, y1),
      rightChampionSlots: verticalPickColumn(0.87, 1, y0, y1),
    });
    idx++;
  }

  // Bottom stats strip (some broadcasts / observer UI)
  for (const [y0, y1] of [[0.82, 0.96], [0.86, 0.98], [0.78, 0.94]] as Array<[number, number]>) {
    variants.push({
      family: "ingame_hud",
      variantId: `hud_bottom_${idx}`,
      leftChampionSlots: horizontalPickRow(0.12, 0.48, y0, y1),
      rightChampionSlots: horizontalPickRow(0.52, 0.88, y0, y1),
    });
    idx++;
  }

  return variants;
}

export function allLayoutVariants(): LayoutVariant[] {
  return [...generateDraftOverlayVariants(), ...generateIngameHudVariants()];
}

/** Coarse layout family hint — not a hard selector. */
export function detectLikelyFamily(
  gray: Uint8Array,
  width: number,
  height: number,
): DraftLayoutFamily {
  const bottomVar = regionVariance(gray, width, height, 0, 0.6, 1, 0.98);
  const leftVar = regionVariance(gray, width, height, 0, 0.05, 0.14, 0.58);
  const topVar = regionVariance(gray, width, height, 0, 0, 1, 0.12);
  if (bottomVar > leftVar * 1.12 && bottomVar > topVar * 0.9) return "draft_overlay";
  if (leftVar > bottomVar * 0.75) return "ingame_hud";
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

/** Resolve broadcast team label using esports manifest when available. */
export function normalizeTeamDisplayName(
  raw: string,
  nameToSlug?: Record<string, string>,
): string {
  const trimmed = raw.trim();
  if (!trimmed || /^(blue|red)\s*side$/i.test(trimmed)) return trimmed;

  const norm = trimmed.toLowerCase().replace(/[^a-z0-9.]/g, "");
  const normSpaced = trimmed.toLowerCase().replace(/\s+/g, "");

  // Common abbreviations across tier-1 (not league-specific)
  const abbrev: Record<string, string> = {
    gen: "Gen.G",
    geng: "Gen.G",
    gengg: "Gen.G",
    t1: "T1",
    dk: "Dplus KIA",
    dpluskia: "Dplus KIA",
    hle: "Hanwha Life Esports",
    kt: "KT Rolster",
    g2: "G2 Esports",
    c9: "Cloud9",
    tl: "Team Liquid",
    fly: "FlyQuest",
    100t: "100 Thieves",
    lgd: "LGD Gaming",
    blg: "Bilibili Gaming",
    jdg: "JD Gaming",
    tes: "Top Esports",
    wbg: "Weibo Gaming",
    lng: "LNG Esports",
    fnc: "Fnatic",
    mad: "MAD Lions",
    koi: "Movistar KOI",
    vit: "Team Vitality",
    bds: "Team BDS",
    sk: "SK Gaming",
  };

  if (abbrev[norm] || abbrev[normSpaced]) return abbrev[norm] ?? abbrev[normSpaced]!;

  if (nameToSlug) {
    if (nameToSlug[norm]) return formatSlugAsName(nameToSlug[norm]!);
    if (nameToSlug[normSpaced]) return formatSlugAsName(nameToSlug[normSpaced]!);
    const trimmedLower = trimmed.toLowerCase();
    if (nameToSlug[trimmedLower]) return formatSlugAsName(nameToSlug[trimmedLower]!);
  }

  return trimmed;
}

function formatSlugAsName(slug: string): string {
  const special: Record<string, string> = {
    t1: "T1",
    geng: "Gen.G",
    "gen-g": "Gen.G",
    "dwg-kia": "Dplus KIA",
    "hanwha-life-esports": "Hanwha Life Esports",
    "kt-rolster": "KT Rolster",
    "g2-esports": "G2 Esports",
    cloud9: "Cloud9",
    "team-liquid": "Team Liquid",
  };
  if (special[slug]) return special[slug]!;
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
