/**
 * Template-match + vision JSON draft extraction for tier-1 esports broadcasts.
 * Uses adaptive region scanning + parametric layout variants (not one fixed UI map).
 */

import type { ImageAttachment } from "../pipeline/types.ts";
import type { DraftChampionPick, DraftExtraction, DraftTeamSide } from "./draftVisionTypes.ts";
import {
  ensureDraftTemplateCache,
  getEsportsNameIndex,
  resolveTeamFromSlug,
  type GrayTemplate,
} from "./draftAssetCache.ts";
import {
  allLayoutVariants,
  detectLikelyFamily,
  normalizeTeamDisplayName,
  type LayoutVariant,
} from "./draftLayoutProfiles.ts";
import {
  adaptiveScanChampions,
  adaptiveScanLogos,
  matchFixedSlots,
} from "./draftVisionScan.ts";
import { extractVisionDraftJson } from "./visionExtract.ts";

const MAX_VARIANTS_TO_TRY = 12;

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

function buildTeamSide(
  side: "left" | "right",
  champions: DraftChampionPick[],
  logo: { slug: string; score: number } | null,
  nameIndex: Record<string, string>,
): DraftTeamSide {
  const fromLogo = logo ? resolveTeamFromSlug(logo.slug) : null;
  return {
    side,
    team: normalizeTeamDisplayName(
      fromLogo ?? (side === "left" ? "Blue Side" : "Red Side"),
      nameIndex,
    ),
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
  const namedTeams = draft.teams.every((t) => !/blue side|red side/i.test(t.team));
  // Vision JSON generalizes better across leagues — slight preference
  const visionBoost = draft.method === "llm_vision_fallback" ? 6 : 0;
  return count * 10 + avg * 5 + (namedTeams ? 8 : 0) + visionBoost;
}

function matchWithVariant(
  gray: Uint8Array,
  width: number,
  height: number,
  variant: LayoutVariant,
  champTpl: Map<string, GrayTemplate>,
  teamTpl: Map<string, GrayTemplate>,
  nameIndex: Record<string, string>,
): DraftExtraction {
  const leftChamps = matchFixedSlots(gray, width, height, variant.leftChampionSlots, champTpl);
  const rightChamps = matchFixedSlots(gray, width, height, variant.rightChampionSlots, champTpl);
  const logos = adaptiveScanLogos(gray, width, height, teamTpl);
  const allPicks = [...leftChamps, ...rightChamps];
  const avgConf = allPicks.length
    ? allPicks.reduce((s, p) => s + p.confidence, 0) / allPicks.length
    : 0;

  return {
    method: "template_match",
    confidence: Math.round(avgConf * 1000) / 1000,
    teams: [
      buildTeamSide("left", leftChamps, logos.left, nameIndex),
      buildTeamSide("right", rightChamps, logos.right, nameIndex),
    ],
    extractedAt: new Date().toISOString(),
    notes: `${variant.family}/${variant.variantId} — ${allPicks.length}/10 champions`,
  };
}

function matchAdaptive(
  gray: Uint8Array,
  width: number,
  height: number,
  champTpl: Map<string, GrayTemplate>,
  teamTpl: Map<string, GrayTemplate>,
  nameIndex: Record<string, string>,
): DraftExtraction {
  const scanned = adaptiveScanChampions(gray, width, height, champTpl);
  const logos = adaptiveScanLogos(gray, width, height, teamTpl);
  const allPicks = [...scanned.left, ...scanned.right];
  const avgConf = allPicks.length
    ? allPicks.reduce((s, p) => s + p.confidence, 0) / allPicks.length
    : 0;

  return {
    method: "template_match",
    confidence: Math.round(avgConf * 1000) / 1000,
    teams: [
      buildTeamSide("left", scanned.left, logos.left, nameIndex),
      buildTeamSide("right", scanned.right, logos.right, nameIndex),
    ],
    extractedAt: new Date().toISOString(),
    notes: `adaptive_scan — ${allPicks.length}/10 champions`,
  };
}

function mergeExtractions(a: DraftExtraction, b: DraftExtraction): DraftExtraction {
  if (extractionScore(b) > extractionScore(a)) [a, b] = [b, a];
  const primary = a;
  const secondary = b;
  const nameIndex = getEsportsNameIndex();

  const mergeSide = (pri: DraftTeamSide, sec: DraftTeamSide): DraftTeamSide => {
    const champs = pri.champions.length >= sec.champions.length ? pri.champions : sec.champions;
    const team = /blue side|red side/i.test(pri.team) && !/blue side|red side/i.test(sec.team)
      ? sec.team
      : pri.team;
    return {
      ...pri,
      team: normalizeTeamDisplayName(team, nameIndex),
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

function pickVariantSample(family: ReturnType<typeof detectLikelyFamily>): LayoutVariant[] {
  const all = allLayoutVariants();
  const preferred = all.filter((v) => v.family === family);
  const other = all.filter((v) => v.family !== family);
  return [...preferred, ...other].slice(0, MAX_VARIANTS_TO_TRY);
}

export async function extractDraftFromScreenshot(
  attachments: ImageAttachment[],
  openrouterApiKey?: string,
): Promise<DraftExtraction | null> {
  const url = attachments.map(normalizeImageUrl).find(Boolean);
  if (!url) return null;

  const nameIndex = getEsportsNameIndex();
  let templateBest: DraftExtraction | null = null;

  try {
    const { champions: champTpl, teams: teamTpl } = await ensureDraftTemplateCache();
    if (champTpl.size >= 20) {
      const { pixels, width, height } = await loadScreenshotGray(url);
      const family = detectLikelyFamily(pixels, width, height);

      const adaptive = matchAdaptive(pixels, width, height, champTpl, teamTpl, nameIndex);
      templateBest = adaptive;

      for (const variant of pickVariantSample(family)) {
        const result = matchWithVariant(
          pixels,
          width,
          height,
          variant,
          champTpl,
          teamTpl,
          nameIndex,
        );
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
