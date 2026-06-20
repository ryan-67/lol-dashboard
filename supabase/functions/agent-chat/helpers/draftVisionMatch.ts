/**
 * Template-match draft screenshots against cached champion icons + team logos.
 * Left/right screen halves map picks to teams; falls back to LLM vision when confidence is low.
 */

import type { ImageAttachment } from "../pipeline/types.ts";
import type { DraftChampionPick, DraftExtraction, DraftTeamSide } from "./draftVisionTypes.ts";
import {
  ddragonKeyForChampion,
  ensureDraftTemplateCache,
  resolveTeamFromSlug,
  type GrayTemplate,
} from "./draftAssetCache.ts";
import { extractVisionContext } from "./visionExtract.ts";

const CHAMPION_SLOT_X = [0.06, 0.18, 0.30, 0.42, 0.54];
const CHAMPION_ROW_Y = [0.52, 0.62, 0.72];
const LOGO_ROIS = {
  left: { x0: 0.02, y0: 0.02, x1: 0.22, y1: 0.18 },
  right: { x0: 0.78, y0: 0.02, x1: 0.98, y1: 0.18 },
} as const;

const MIN_CHAMP_SCORE = 0.42;
const MIN_LOGO_SCORE = 0.38;
const MIN_AVG_CONFIDENCE = 0.48;

function normalizeImageUrl(att: ImageAttachment): string | null {
  const url = att.url?.trim();
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("data:image/")) return url;
  return null;
}

async function loadScreenshotGray(url: string): Promise<{ pixels: Uint8Array; width: number; height: number }> {
  let bytes: Uint8Array;
  if (url.startsWith("data:")) {
    const b64 = url.split(",", 2)[1] ?? "";
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } else {
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error("screenshot fetch failed");
    bytes = new Uint8Array(await resp.arrayBuffer());
  }
  const { decodePngAsync, rgbaToGrayFull } = await import("./draftImageDecode.ts");
  const { width, height, rgba } = await decodePngAsync(bytes);
  return { pixels: rgbaToGrayFull(rgba, width, height), width, height };
}

function cropGray(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  targetSize: number,
): Uint8Array {
  const left = Math.max(0, Math.floor(x0 * srcW));
  const top = Math.max(0, Math.floor(y0 * srcH));
  const right = Math.min(srcW, Math.ceil(x1 * srcW));
  const bottom = Math.min(srcH, Math.ceil(y1 * srcH));
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
    if (score > best.score) best = { id: tpl.id, label: tpl.label, score };
  }
  return best;
}

function matchChampionsInHalf(
  gray: Uint8Array,
  width: number,
  height: number,
  side: "left" | "right",
  templates: Map<string, GrayTemplate>,
): DraftChampionPick[] {
  const xBase = side === "left" ? 0 : 0.5;
  const xScale = 0.48;
  const size = 48;
  const picks: DraftChampionPick[] = [];
  const used = new Set<string>();

  for (let slot = 0; slot < 5; slot++) {
    const slotX = xBase + CHAMPION_SLOT_X[slot]! * xScale;
    let bestPick: DraftChampionPick | null = null;

    for (const rowY of CHAMPION_ROW_Y) {
      const roi = cropGray(
        gray,
        width,
        height,
        slotX,
        rowY,
        slotX + 0.11,
        rowY + 0.14,
        size,
      );
      const hit = bestTemplateMatch(roi, size, templates);
      if (hit.score >= MIN_CHAMP_SCORE && (!bestPick || hit.score > bestPick.confidence)) {
        bestPick = {
          name: hit.label,
          ddragonKey: hit.id,
          confidence: Math.round(hit.score * 1000) / 1000,
          slot: slot + 1,
        };
      }
    }

    if (bestPick && !used.has(bestPick.ddragonKey)) {
      used.add(bestPick.ddragonKey);
      picks.push(bestPick);
    }
  }
  return picks;
}

function matchTeamLogo(
  gray: Uint8Array,
  width: number,
  height: number,
  side: "left" | "right",
  templates: Map<string, GrayTemplate>,
): { slug: string; score: number } | null {
  const roiDef = side === "left" ? LOGO_ROIS.left : LOGO_ROIS.right;
  const roi = cropGray(gray, width, height, roiDef.x0, roiDef.y0, roiDef.x1, roiDef.y1, 48);
  const hit = bestTemplateMatch(roi, 48, templates);
  if (hit.score < MIN_LOGO_SCORE) return null;
  const slug = hit.id.replace(/-alt$/, "");
  return { slug, score: hit.score };
}

function buildTeamSide(
  side: "left" | "right",
  champions: DraftChampionPick[],
  logo: { slug: string; score: number } | null,
): DraftTeamSide {
  return {
    side,
    team: logo ? resolveTeamFromSlug(logo.slug) : side === "left" ? "Blue Side" : "Red Side",
    esportsSlug: logo?.slug,
    logoMatchScore: logo ? Math.round(logo.score * 1000) / 1000 : undefined,
    champions,
  };
}

export async function extractDraftFromScreenshot(
  attachments: ImageAttachment[],
  openrouterApiKey?: string,
): Promise<DraftExtraction | null> {
  const url = attachments.map(normalizeImageUrl).find(Boolean);
  if (!url) return null;

  try {
    const { champions: champTpl, teams: teamTpl } = await ensureDraftTemplateCache();
    if (champTpl.size < 20) throw new Error("champion template cache empty");

    const { pixels, width, height } = await loadScreenshotGray(url);
    const leftChamps = matchChampionsInHalf(pixels, width, height, "left", champTpl);
    const rightChamps = matchChampionsInHalf(pixels, width, height, "right", champTpl);
    const leftLogo = matchTeamLogo(pixels, width, height, "left", teamTpl);
    const rightLogo = matchTeamLogo(pixels, width, height, "right", teamTpl);

    const allPicks = [...leftChamps, ...rightChamps];
    const avgConf = allPicks.length
      ? allPicks.reduce((s, p) => s + p.confidence, 0) / allPicks.length
      : 0;

    if (allPicks.length >= 6 && avgConf >= MIN_AVG_CONFIDENCE) {
      return {
        method: "template_match",
        confidence: Math.round(avgConf * 1000) / 1000,
        teams: [
          buildTeamSide("left", leftChamps, leftLogo),
          buildTeamSide("right", rightChamps, rightLogo),
        ],
        extractedAt: new Date().toISOString(),
        notes: `matched ${allPicks.length}/10 champions via template correlation`,
      };
    }
  } catch {
    // fall through to LLM vision
  }

  if (!openrouterApiKey) return null;
  const visionText = await extractVisionContext(openrouterApiKey, attachments);
  const parsed = parseVisionTextToDraft(visionText);
  if (parsed) return parsed;
  return null;
}

/** Best-effort parse of LLM vision prose into structured draft. */
function parseVisionTextToDraft(visionBlock: string): DraftExtraction | null {
  if (!visionBlock || /not a league draft/i.test(visionBlock)) return null;
  const text = visionBlock.replace(/^\[VISION_DRAFT\]\n?/, "");
  const champPattern =
    /\b(Aatrox|Ahri|Akali|Akshan|Alistar|Ambessa|Amumu|Anivia|Annie|Aphelios|Ashe|Aurelion Sol|Aurora|Azir|Bard|Bel'Veth|Blitzcrank|Brand|Braum|Briar|Caitlyn|Camille|Cassiopeia|Cho'Gath|Corki|Darius|Diana|Dr\. Mundo|Draven|Ekko|Elise|Evelynn|Ezreal|Fiddlesticks|Fiora|Fizz|Galio|Gangplank|Garen|Gnar|Gragas|Graves|Gwen|Hecarim|Heimerdinger|Hwei|Illaoi|Irelia|Ivern|Janna|Jarvan IV|Jax|Jayce|Jhin|Jinx|K'Sante|Kai'Sa|Kalista|Karma|Karthus|Kassadin|Katarina|Kayle|Kayn|Kennen|Kha'Zix|Kindred|Kled|Kog'Maw|LeBlanc|Lee Sin|Leona|Lillia|Lissandra|Lucian|Lulu|Lux|Malphite|Malzahar|Maokai|Master Yi|Milio|Miss Fortune|Mordekaiser|Morgana|Naafiri|Nami|Nasus|Nautilus|Neeko|Nidalee|Nilah|Nocturne|Nunu|Olaf|Orianna|Ornn|Pantheon|Poppy|Pyke|Qiyana|Quinn|Rakan|Rammus|Rek'Sai|Rell|Renata Glasc|Renekton|Rengar|Riven|Rumble|Ryze|Samira|Sejuani|Senna|Seraphine|Sett|Shaco|Shen|Shyvana|Singed|Sion|Sivir|Skarner|Smolder|Sona|Soraka|Swain|Sylas|Syndra|Tahm Kench|Taliyah|Talon|Taric|Teemo|Thresh|Tristana|Trundle|Tryndamere|Twisted Fate|Twitch|Udyr|Urgot|Varus|Vayne|Veigar|Vel'Koz|Vex|Vi|Viego|Viktor|Vladimir|Volibear|Warwick|Wukong|Xayah|Xerath|Xin Zhao|Yasuo|Yone|Yorick|Yuumi|Zaahen|Zac|Zed|Zeri|Ziggs|Zilean|Zoe|Zyra|MonkeyKing|Renata|Belveth|Chogath|DrMundo|JarvanIV|LeeSin|MissFortune|TwistedFate|XinZhao|MasterYi|AurelionSol|Kaisa|RekSai|KogMaw)\b/gi;

  const found: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = champPattern.exec(text)) !== null) {
    const raw = m[1]!;
    const key = ddragonKeyForChampion(raw);
    if (!seen.has(key)) {
      seen.add(key);
      found.push(raw);
    }
  }
  if (found.length < 4) return null;

  const left = found.slice(0, Math.ceil(found.length / 2));
  const right = found.slice(Math.ceil(found.length / 2));

  const teamLine = text.match(/(?:blue|left)[:\s]+([^\n|]+)/i);
  const teamLineR = text.match(/(?:red|right)[:\s]+([^\n|]+)/i);

  const toPicks = (names: string[]): DraftChampionPick[] =>
    names.map((name, i) => ({
      name,
      ddragonKey: ddragonKeyForChampion(name),
      confidence: 0.5,
      slot: i + 1,
    }));

  return {
    method: "llm_vision_fallback",
    confidence: 0.5,
    teams: [
      {
        side: "left",
        team: teamLine?.[1]?.trim() ?? "Blue Side",
        champions: toPicks(left.slice(0, 5)),
      },
      {
        side: "right",
        team: teamLineR?.[1]?.trim() ?? "Red Side",
        champions: toPicks(right.slice(0, 5)),
      },
    ],
    extractedAt: new Date().toISOString(),
    notes: "structured from LLM vision fallback",
  };
}

export { formatDraftExtractionBlock } from "./draftVisionTypes.ts";
