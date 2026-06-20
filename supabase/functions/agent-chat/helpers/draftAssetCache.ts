/**
 * In-memory template cache for draft screenshot matching.
 * Loads Data Dragon champion icons + LoL Esports team logos on first use.
 */

import ddragonManifest from "../data/ddragon-champions.json" with { type: "json" };
import esportsLogos from "../data/esports-logos.json" with { type: "json" };
import { decodePngAsync, rgbaToGrayTemplate } from "./draftImageDecode.ts";

export interface GrayTemplate {
  id: string;
  label: string;
  width: number;
  height: number;
  pixels: Uint8Array;
}

type DdragonManifest = {
  version: string;
  byName: Record<string, string>;
  byNormalizedName: Record<string, string>;
};

type EsportsManifest = {
  teamsByEsportsSlug: Record<string, string>;
  teamsAltByEsportsSlug?: Record<string, string>;
  nameToEsportsSlug?: Record<string, string>;
};

const CHAMPION_OVERRIDES: Record<string, string> = {
  Wukong: "MonkeyKing",
  "Renata Glasc": "Renata",
  "Nunu & Willump": "Nunu",
  Belveth: "Belveth",
  "Bel'Veth": "Belveth",
  "Dr. Mundo": "DrMundo",
  "Jarvan IV": "JarvanIV",
  "Lee Sin": "LeeSin",
  "Miss Fortune": "MissFortune",
  "Twisted Fate": "TwistedFate",
  "Xin Zhao": "XinZhao",
  "Master Yi": "MasterYi",
  "Aurelion Sol": "AurelionSol",
  "Cho'Gath": "Chogath",
  ChoGath: "Chogath",
  "Kog'Maw": "KogMaw",
  KogMaw: "KogMaw",
  "Kai'Sa": "Kaisa",
  "Rek'Sai": "RekSai",
};

const manifest = ddragonManifest as DdragonManifest;
const logos = esportsLogos as EsportsManifest;

let championTemplates: Map<string, GrayTemplate> | null = null;
let teamTemplates: Map<string, GrayTemplate> | null = null;
let cachePromise: Promise<void> | null = null;

const TEMPLATE_SIZE = 48;
const MAX_TEAM_LOGOS = 80;
const MAX_CONCURRENT_FETCH = 12;

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function ddragonKeyForChampion(name: string): string {
  if (CHAMPION_OVERRIDES[name]) return CHAMPION_OVERRIDES[name];
  if (manifest.byName[name]) return manifest.byName[name];
  const norm = normalizeName(name);
  if (manifest.byNormalizedName[norm]) return manifest.byNormalizedName[norm];
  return name.replace(/[^a-zA-Z0-9]/g, "");
}

export function championIconUrl(key: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${manifest.version}/img/champion/${key}.png`;
}

async function fetchImageTemplate(
  id: string,
  label: string,
  url: string,
): Promise<GrayTemplate | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    const { width, height, rgba } = await decodePngAsync(buf);
    return rgbaToGrayTemplate(id, label, rgba, width, height, TEMPLATE_SIZE);
  } catch {
    return null;
  }
}

async function fetchBatch(
  items: Array<{ id: string; label: string; url: string }>,
): Promise<Map<string, GrayTemplate>> {
  const out = new Map<string, GrayTemplate>();
  for (let i = 0; i < items.length; i += MAX_CONCURRENT_FETCH) {
    const batch = items.slice(i, i + MAX_CONCURRENT_FETCH);
    const results = await Promise.all(
      batch.map((item) => fetchImageTemplate(item.id, item.label, item.url)),
    );
    for (let j = 0; j < batch.length; j++) {
      const tpl = results[j];
      if (tpl) out.set(batch[j]!.id, tpl);
    }
  }
  return out;
}

async function buildChampionCache(): Promise<Map<string, GrayTemplate>> {
  const items: Array<{ id: string; label: string; url: string }> = [];
  const seen = new Set<string>();
  for (const [name, key] of Object.entries(manifest.byName)) {
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ id: key, label: name, url: championIconUrl(key) });
  }
  for (const [name, key] of Object.entries(CHAMPION_OVERRIDES)) {
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ id: key, label: name, url: championIconUrl(key) });
  }
  return fetchBatch(items);
}

async function buildTeamCache(): Promise<Map<string, GrayTemplate>> {
  const items: Array<{ id: string; label: string; url: string }> = [];
  const seen = new Set<string>();
  for (const [slug, url] of Object.entries(logos.teamsByEsportsSlug ?? {})) {
    if (seen.has(url) || items.length >= MAX_TEAM_LOGOS) continue;
    seen.add(url);
    items.push({ id: slug, label: slug, url });
    const alt = logos.teamsAltByEsportsSlug?.[slug];
    if (alt && !seen.has(alt) && items.length < MAX_TEAM_LOGOS) {
      seen.add(alt);
      items.push({ id: `${slug}-alt`, label: slug, url: alt });
    }
  }
  return fetchBatch(items);
}

export async function ensureDraftTemplateCache(): Promise<{
  champions: Map<string, GrayTemplate>;
  teams: Map<string, GrayTemplate>;
}> {
  if (championTemplates && teamTemplates) {
    return { champions: championTemplates, teams: teamTemplates };
  }
  if (!cachePromise) {
    cachePromise = (async () => {
      const [champs, teams] = await Promise.all([buildChampionCache(), buildTeamCache()]);
      championTemplates = champs;
      teamTemplates = teams;
    })();
  }
  await cachePromise;
  return { champions: championTemplates!, teams: teamTemplates! };
}

export function teamSlugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function resolveTeamFromSlug(slug: string): string {
  for (const [norm, esSlug] of Object.entries(logos.nameToEsportsSlug ?? {})) {
    if (esSlug === slug) return norm;
  }
  return teamSlugToDisplayName(slug.replace(/-alt$/, ""));
}
