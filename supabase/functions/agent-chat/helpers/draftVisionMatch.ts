/**
 * Template-match + vision JSON draft extraction for LCK broadcast screenshots.
 * Layouts: draft overlay (final round bar) and in-game spectator HUD.
 */

import type { ImageAttachment } from "../pipeline/types.ts";
import type { DraftChampionPick, DraftExtraction, DraftTeamSide } from "./draftVisionTypes.ts";
import {
  ddragonKeyForChampion,
  ensureDraftTemplateCache,
  resolveTeamFromSlug,
  type GrayTemplate,
} from "./draftAssetCache.ts";
import {
  ALL_LAYOUTS,
  detectLikelyLayout,
  INGAME_HUD_BOTTOM_SLOTS,
  normalizeTeamDisplayName,
  type LayoutProfile,
  type SlotRoi,
} from "./draftLayoutProfiles.ts";
import { extractVisionDraftJson } from "./visionExtract.ts";

const MIN_CHAMP_SCORE = 0.32;
const MIN_LOGO_SCORE = 0.32;
const TEMPLATE_SIZE = 48;

function normalizeImageUrl(att: ImageAttachment): string | null {
  const url = att.url?.trim();
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("data:image/")) return url;
  return null;
}

async function loadScreenshotGray(
  url: string,
): Promise<{ pixels: Uint8Array; width: number; height: number }> {
  let bytes: Uint8Array;
  if (url.startsWith("data:")) {
    const b64 = url.split(",", 2)[1] ?? "";
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } else {
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error("screenshot fetch failed");
    bytes = new Uint8Array(await resp.arrayBuffer());
  }
  const { decodeImageToRgba, rgbaToGrayFull } = await import("./draftImageDecode.ts");
  const { width, height, rgba } = await decodeImageToRgba(bytes);
  return { pixels: rgbaToGrayFull(rgba, width, height), width, height };
}

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
  size: number,
  templates: Map<string, GrayTemplate>,
): { id: string; label: string; score: number } {
  let best = { id: "", label: "", score: -1 };
  for (const tpl of templates.values()) {
    if (tpl.width !== size || tpl.height !== size) continue;
    const score = normalizedCorrelation(roi, tpl.pixels);
    if (score > best.score) {
      const baseId = tpl.id.replace(/-loading$/, "");
      best = { id: baseId, label: tpl.label, score };
    }
  }
  return best;
}

function matchSlots(
  gray: Uint8Array,
  width: number,
  height: number,
  slots: SlotRoi[],
  templates: Map<string, GrayTemplate>,
): DraftChampionPick[] {
  const picks: DraftChampionPick[] = [];
  const used = new Set<string>();

  for (let slot = 0; slot < slots.length; slot++) {
    const roi = cropGray(gray, width, height, slots[slot]!, TEMPLATE_SIZE);
    const hit = bestTemplateMatch(roi, TEMPLATE_SIZE, templates);
    if (hit.score >= MIN_CHAMP_SCORE && !used.has(hit.id)) {
      used.add(hit.id);
      picks.push({
        name: hit.label,
        ddragonKey: hit.id,
        confidence: Math.round(hit.score * 1000) / 1000,
        slot: slot + 1,
      });
    }
  }
  return picks;
}

function matchTeamLogo(
  gray: Uint8Array,
  width: number,
  height: number,
  rois: SlotRoi[],
  templates: Map<string, GrayTemplate>,
): { slug: string; score: number } | null {
  let best: { slug: string; score: number } | null = null;
  for (const roi of rois) {
    const patch = cropGray(gray, width, height, roi, TEMPLATE_SIZE);
    const hit = bestTemplateMatch(patch, TEMPLATE_SIZE, templates);
    if (hit.score >= MIN_LOGO_SCORE) {
      const slug = hit.id.replace(/-alt$/, "");
      if (!best || hit.score > best.score) best = { slug, score: hit.score };
    }
  }
  return best;
}

function buildTeamSide(
  side: "left" | "right",
  champions: DraftChampionPick[],
  logo: { slug: string; score: number } | null,
): DraftTeamSide {
  const fromLogo = logo ? resolveTeamFromSlug(logo.slug) : null;
  return {
    side,
    team: normalizeTeamDisplayName(fromLogo ?? (side === "left" ? "Blue Side" : "Red Side")),
    esportsSlug: logo?.slug,
    logoMatchScore: logo ? Math.round(logo.score * 1000) / 1000 : undefined,
    champions,
  };
}

function extractionScore(draft: DraftExtraction): number {
  const count = draft.teams[0]!.champions.length + draft.teams[1]!.champions.length;
  const avg =
    count > 0
      ? [...draft.teams[0]!.champions, ...draft.teams[1]!.champions].reduce(
        (s, c) => s + c.confidence,
        0,
      ) / count
      : 0;
  const namedTeams = draft.teams.every(
    (t) => !/blue side|red side/i.test(t.team),
  );
  return count * 10 + avg * 5 + (namedTeams ? 8 : 0) + (draft.method === "llm_vision_fallback" ? 3 : 0);
}

function matchWithLayout(
  gray: Uint8Array,
  width: number,
  height: number,
  layout: LayoutProfile,
  champTpl: Map<string, GrayTemplate>,
  teamTpl: Map<string, GrayTemplate>,
): DraftExtraction {
  let leftChamps = matchSlots(gray, width, height, layout.leftChampionSlots, champTpl);
  let rightChamps = matchSlots(gray, width, height, layout.rightChampionSlots, champTpl);

  if (layout.id === "ingame_hud" && leftChamps.length + rightChamps.length < 8) {
    const bottomLeft = matchSlots(gray, width, height, INGAME_HUD_BOTTOM_SLOTS.left, champTpl);
    const bottomRight = matchSlots(gray, width, height, INGAME_HUD_BOTTOM_SLOTS.right, champTpl);
    if (bottomLeft.length > leftChamps.length) leftChamps = bottomLeft;
    if (bottomRight.length > rightChamps.length) rightChamps = bottomRight;
  }

  const leftLogo = matchTeamLogo(gray, width, height, layout.logoRois.left, teamTpl);
  const rightLogo = matchTeamLogo(gray, width, height, layout.logoRois.right, teamTpl);
  const allPicks = [...leftChamps, ...rightChamps];
  const avgConf = allPicks.length
    ? allPicks.reduce((s, p) => s + p.confidence, 0) / allPicks.length
    : 0;

  return {
    method: "template_match",
    confidence: Math.round(avgConf * 1000) / 1000,
    teams: [
      buildTeamSide("left", leftChamps, leftLogo),
      buildTeamSide("right", rightChamps, rightLogo),
    ],
    extractedAt: new Date().toISOString(),
    notes: `${layout.id} template — ${allPicks.length}/10 champions`,
  };
}

function mergeExtractions(a: DraftExtraction, b: DraftExtraction): DraftExtraction {
  if (extractionScore(b) > extractionScore(a)) [a, b] = [b, a];
  const primary = a;
  const secondary = b;

  const mergeSide = (
    pri: DraftTeamSide,
    sec: DraftTeamSide,
  ): DraftTeamSide => {
    const champs = pri.champions.length >= sec.champions.length ? pri.champions : sec.champions;
    const team = /blue side|red side/i.test(pri.team) && !/blue side|red side/i.test(sec.team)
      ? sec.team
      : pri.team;
    return {
      ...pri,
      team: normalizeTeamDisplayName(team),
      champions: champs.slice(0, 5),
      esportsSlug: pri.esportsSlug ?? sec.esportsSlug,
    };
  };

  return {
    ...primary,
    confidence: Math.max(primary.confidence, secondary.confidence),
    teams: [
      mergeSide(primary.teams[0]!, secondary.teams[0]!),
      mergeSide(primary.teams[1]!, secondary.teams[1]!),
    ],
    notes: `${primary.notes ?? ""}; merged with ${secondary.method}`,
  };
}

export async function extractDraftFromScreenshot(
  attachments: ImageAttachment[],
  openrouterApiKey?: string,
): Promise<DraftExtraction | null> {
  const url = attachments.map(normalizeImageUrl).find(Boolean);
  if (!url) return null;

  let templateBest: DraftExtraction | null = null;

  try {
    const { champions: champTpl, teams: teamTpl } = await ensureDraftTemplateCache();
    if (champTpl.size >= 20) {
      const { pixels, width, height } = await loadScreenshotGray(url);
      const likely = detectLikelyLayout(pixels, width, height);
      const ordered = ALL_LAYOUTS.sort((a, b) =>
        a.id === likely ? -1 : b.id === likely ? 1 : 0
      );

      for (const layout of ordered) {
        const result = matchWithLayout(pixels, width, height, layout, champTpl, teamTpl);
        if (!templateBest || extractionScore(result) > extractionScore(templateBest)) {
          templateBest = result;
        }
      }
    }
  } catch {
    // template path optional
  }

  let visionResult: DraftExtraction | null = null;
  if (openrouterApiKey) {
    visionResult = await extractVisionDraftJson(openrouterApiKey, attachments);
  }

  if (visionResult && templateBest) {
    const merged = mergeExtractions(visionResult, templateBest);
    if (merged.teams[0]!.champions.length + merged.teams[1]!.champions.length >= 6) {
      return merged;
    }
  }

  if (visionResult) {
    const count = visionResult.teams[0]!.champions.length + visionResult.teams[1]!.champions.length;
    if (count >= 6) return visionResult;
  }

  if (templateBest) {
    const count = templateBest.teams[0]!.champions.length + templateBest.teams[1]!.champions.length;
    if (count >= 6) return templateBest;
  }

  return visionResult ?? templateBest;
}

export { formatDraftExtractionBlock } from "./draftVisionTypes.ts";
