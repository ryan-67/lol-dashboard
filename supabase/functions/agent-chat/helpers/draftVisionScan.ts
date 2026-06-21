/**
 * Adaptive grid scan for champion icons and team logos.
 * Works across league/year UI variations by searching regions, not fixed pixel maps.
 */

import type { DraftChampionPick } from "./draftVisionTypes.ts";
import type { GrayTemplate } from "./draftAssetCache.ts";
import {
  CHAMPION_SCAN_REGIONS,
  LOGO_SCAN_ZONES,
  type LogoZone,
  type SlotRoi,
} from "./draftLayoutProfiles.ts";

export interface ScanHit {
  id: string;
  label: string;
  score: number;
  cx: number;
  cy: number;
  side: "left" | "right";
}

const TEMPLATE_SIZE = 48;
const MIN_CHAMP_SCORE = 0.34;
const MIN_LOGO_SCORE = 0.34;
const GRID_STEP = 0.055;
const PATCH_SIZE = 0.072;
const MAX_CELLS_PER_REGION = 48;

function cropGray(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  roi: SlotRoi,
  targetSize: number,
): Uint8Array {
  const left = Math.max(0, Math.floor(roi.x0 * srcW));
  const top = Math.max(0, Math.floor(roi.y0 * srcH));
  const right = Math.min(srcW, Math.ceil(roi.x1 * srcW));
  const bottom = Math.min(srcH, Math.ceil(roi.y1 * srcH));
  const cw = Math.max(1, right - left);
  const ch = Math.max(1, bottom - top);
  const out = new Uint8Array(targetSize * targetSize);
  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const sx = left + Math.floor((x / targetSize) * cw);
      const sy = top + Math.floor((y / targetSize) * ch);
      out[y * targetSize + x] = src[sy * srcW + sx] ?? 0;
    }
  }
  return out;
}

function normalizedCorrelation(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let sum = 0;
  let sumA = 0;
  let sumB = 0;
  let sumAA = 0;
  let sumBB = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[i]! / 255;
    const bi = b[i]! / 255;
    sum += ai * bi;
    sumA += ai;
    sumB += bi;
    sumAA += ai * ai;
    sumBB += bi * bi;
  }
  const denom = Math.sqrt((n * sumAA - sumA * sumA) * (n * sumBB - sumB * sumB));
  return denom > 1e-6 ? (n * sum - sumA * sumB) / denom : 0;
}

function bestTemplateMatch(
  roi: Uint8Array,
  templates: Map<string, GrayTemplate>,
): { id: string; label: string; score: number } {
  let best = { id: "", label: "", score: -1 };
  for (const tpl of templates.values()) {
    if (tpl.width !== TEMPLATE_SIZE || tpl.height !== TEMPLATE_SIZE) continue;
    const score = normalizedCorrelation(roi, tpl.pixels);
    if (score > best.score) {
      const baseId = tpl.id.replace(/-loading$/, "");
      best = { id: baseId, label: tpl.label, score };
    }
  }
  return best;
}

function* gridCells(region: SlotRoi): Generator<SlotRoi> {
  let count = 0;
  for (let y = region.y0; y + PATCH_SIZE <= region.y1 && count < MAX_CELLS_PER_REGION; y += GRID_STEP) {
    for (let x = region.x0; x + PATCH_SIZE <= region.x1 && count < MAX_CELLS_PER_REGION; x += GRID_STEP) {
      yield { x0: x, y0: y, x1: x + PATCH_SIZE, y1: y + PATCH_SIZE };
      count++;
    }
  }
}

function clusterToPicks(hits: ScanHit[], maxPicks = 5): DraftChampionPick[] {
  const sorted = [...hits].sort((a, b) => b.score - a.score);
  const chosen: ScanHit[] = [];
  const minDist = 0.06;

  for (const hit of sorted) {
    if (chosen.some((c) => c.id === hit.id)) continue;
    if (chosen.some((c) => Math.hypot(c.cx - hit.cx, c.cy - hit.cy) < minDist)) continue;
    chosen.push(hit);
    if (chosen.length >= maxPicks) break;
  }

  // Order picks: horizontal rows by x, vertical columns by y
  const xSpread = chosen.length > 1
    ? Math.max(...chosen.map((h) => h.cx)) - Math.min(...chosen.map((h) => h.cx))
    : 0;
  const ySpread = chosen.length > 1
    ? Math.max(...chosen.map((h) => h.cy)) - Math.min(...chosen.map((h) => h.cy))
    : 0;
  const horizontal = xSpread >= ySpread;
  chosen.sort((a, b) => (horizontal ? a.cx - b.cx : a.cy - b.cy));

  return chosen.map((h, i) => ({
    name: h.label,
    ddragonKey: h.id,
    confidence: Math.round(h.score * 1000) / 1000,
    slot: i + 1,
  }));
}

export function adaptiveScanChampions(
  gray: Uint8Array,
  width: number,
  height: number,
  templates: Map<string, GrayTemplate>,
): { left: DraftChampionPick[]; right: DraftChampionPick[] } {
  const hits: ScanHit[] = [];

  for (const [side, region] of Object.entries(CHAMPION_SCAN_REGIONS) as Array<
    ["left" | "right", SlotRoi]
  >) {
    for (const cell of gridCells(region)) {
      const roi = cropGray(gray, width, height, cell, TEMPLATE_SIZE);
      const match = bestTemplateMatch(roi, templates);
      if (match.score >= MIN_CHAMP_SCORE) {
        hits.push({
          id: match.id,
          label: match.label,
          score: match.score,
          cx: (cell.x0 + cell.x1) / 2,
          cy: (cell.y0 + cell.y1) / 2,
          side,
        });
      }
    }
  }

  const leftHits = hits.filter((h) => h.side === "left");
  const rightHits = hits.filter((h) => h.side === "right");
  return {
    left: clusterToPicks(leftHits),
    right: clusterToPicks(rightHits),
  };
}

export function adaptiveScanLogos(
  gray: Uint8Array,
  width: number,
  height: number,
  templates: Map<string, GrayTemplate>,
): { left: { slug: string; score: number } | null; right: { slug: string; score: number } | null } {
  type LogoHit = { slug: string; score: number; cx: number };
  const hits: LogoHit[] = [];

  for (const zone of LOGO_SCAN_ZONES) {
    for (const cell of gridCells(zone)) {
      const roi = cropGray(gray, width, height, cell, TEMPLATE_SIZE);
      const match = bestTemplateMatch(roi, templates);
      if (match.score >= MIN_LOGO_SCORE) {
        hits.push({
          slug: match.id.replace(/-alt$/, ""),
          score: match.score,
          cx: (cell.x0 + cell.x1) / 2,
        });
      }
    }
  }

  if (!hits.length) return { left: null, right: null };

  hits.sort((a, b) => b.score - a.score);
  const leftCandidates = hits.filter((h) => h.cx < 0.5);
  const rightCandidates = hits.filter((h) => h.cx >= 0.5);

  const pickBest = (arr: LogoHit[]) =>
    arr.length ? { slug: arr[0]!.slug, score: arr[0]!.score } : null;

  return { left: pickBest(leftCandidates), right: pickBest(rightCandidates) };
}

export function matchFixedSlots(
  gray: Uint8Array,
  width: number,
  height: number,
  slots: SlotRoi[],
  templates: Map<string, GrayTemplate>,
): DraftChampionPick[] {
  const picks: DraftChampionPick[] = [];
  const used = new Set<string>();
  for (let i = 0; i < slots.length; i++) {
    const roi = cropGray(gray, width, height, slots[i]!, TEMPLATE_SIZE);
    const hit = bestTemplateMatch(roi, templates);
    if (hit.score >= MIN_CHAMP_SCORE && !used.has(hit.id)) {
      used.add(hit.id);
      picks.push({
        name: hit.label,
        ddragonKey: hit.id,
        confidence: Math.round(hit.score * 1000) / 1000,
        slot: i + 1,
      });
    }
  }
  return picks;
}

export function logoZoneSide(zone: LogoZone): "left" | "right" | "center" {
  const cx = (zone.x0 + zone.x1) / 2;
  if (cx < 0.45) return "left";
  if (cx > 0.55) return "right";
  return "center";
}
