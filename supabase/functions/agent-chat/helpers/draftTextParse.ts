/**
 * Parse user draft text like:
 * (geng: ambessa wukong annie senna alistar, t1: olaf xinzhao anivia jhin karma)
 * Fuzzy-match teams/champions against Data Dragon + esports name catalogs.
 */

import Fuse from "https://esm.sh/fuse.js@7.0.0";
import ddragonManifest from "../data/ddragon-champions.json" with { type: "json" };
import esportsLogos from "../data/esports-logos.json" with { type: "json" };
import type { DraftChampionPick, DraftExtraction, DraftTeamSide } from "./draftTypes.ts";

type DdragonManifest = {
  version: string;
  byName: Record<string, string>;
  byNormalizedName: Record<string, string>;
};

type EsportsManifest = {
  nameToEsportsSlug?: Record<string, string>;
};

const manifest = ddragonManifest as DdragonManifest;
const esports = esportsLogos as EsportsManifest;

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
  "Kog'Maw": "KogMaw",
  "Kai'Sa": "Kaisa",
  "Rek'Sai": "RekSai",
};

const TEAM_CANONICAL: Record<string, string> = {
  t1: "T1",
  geng: "Gen.G",
  "gen-g": "Gen.G",
  "gen-g-esports": "Gen.G",
  "dwg-kia": "Dplus KIA",
  "dplus-kia": "Dplus KIA",
  "hanwha-life-esports": "Hanwha Life Esports",
  "kt-rolster": "KT Rolster",
  drx: "DRX",
  "bilibili-gaming": "Bilibili Gaming",
  "jd-gaming": "JD Gaming",
  "top-esports": "Top Esports",
  "weibo-gaming": "Weibo Gaming",
  "lng-esports": "LNG Esports",
  "g2-esports": "G2 Esports",
  fnatic: "Fnatic",
  "mad-lions": "MAD Lions",
  cloud9: "Cloud9",
  "team-liquid": "Team Liquid",
  flyquest: "Flyquest",
  "100-thieves": "100 Thieves",
};

interface CatalogEntry {
  label: string;
  slug?: string;
  ddragonKey?: string;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function ddragonKeyForChampion(name: string): string {
  if (CHAMPION_OVERRIDES[name]) return CHAMPION_OVERRIDES[name];
  if (manifest.byName[name]) return manifest.byName[name];
  const norm = normalizeToken(name);
  if (manifest.byNormalizedName[norm]) return manifest.byNormalizedName[norm];
  return name.replace(/[^a-zA-Z0-9]/g, "");
}

function keyToDisplayName(key: string): string {
  for (const [name, k] of Object.entries(manifest.byName)) {
    if (k === key) return name;
  }
  return key;
}

function buildChampionCatalog(): CatalogEntry[] {
  const seen = new Set<string>();
  const out: CatalogEntry[] = [];

  const add = (label: string, ddragonKey: string) => {
    const token = normalizeToken(label);
    if (seen.has(token)) return;
    seen.add(token);
    out.push({ label, ddragonKey });
  };

  for (const [name, key] of Object.entries(manifest.byName)) {
    add(name, key);
  }
  for (const [norm, key] of Object.entries(manifest.byNormalizedName)) {
    add(keyToDisplayName(key), key);
    add(norm, key);
  }
  return out;
}

function slugToDisplay(slug: string): string {
  if (TEAM_CANONICAL[slug]) return TEAM_CANONICAL[slug]!;
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function buildTeamCatalog(): CatalogEntry[] {
  const seen = new Set<string>();
  const out: CatalogEntry[] = [];

  const add = (label: string, slug: string) => {
    const token = normalizeToken(label);
    if (seen.has(token)) return;
    seen.add(token);
    out.push({ label, slug });
  };

  const slugSet = new Set<string>();
  for (const slug of Object.values(esports.nameToEsportsSlug ?? {})) {
    slugSet.add(slug);
  }

  for (const slug of slugSet) {
    add(slugToDisplay(slug), slug);
  }
  for (const [alias, slug] of Object.entries(esports.nameToEsportsSlug ?? {})) {
    add(alias, slug);
    add(slugToDisplay(slug), slug);
  }
  for (const [slug, display] of Object.entries(TEAM_CANONICAL)) {
    add(display, slug);
  }

  return out;
}

let championFuse: Fuse<CatalogEntry> | null = null;
let teamFuse: Fuse<CatalogEntry> | null = null;

function getChampionFuse(): Fuse<CatalogEntry> {
  if (!championFuse) {
    championFuse = new Fuse(buildChampionCatalog(), {
      keys: ["label"],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }
  return championFuse;
}

function getTeamFuse(): Fuse<CatalogEntry> {
  if (!teamFuse) {
    teamFuse = new Fuse(buildTeamCatalog(), {
      keys: ["label"],
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }
  return teamFuse;
}

function fuzzyChampion(raw: string): DraftChampionPick | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const exactNorm = normalizeToken(trimmed);
  if (manifest.byNormalizedName[exactNorm]) {
    const key = manifest.byNormalizedName[exactNorm]!;
    return {
      name: keyToDisplayName(key),
      ddragonKey: key,
      confidence: 1,
      slot: 0,
    };
  }
  if (manifest.byName[trimmed]) {
    return {
      name: trimmed,
      ddragonKey: manifest.byName[trimmed]!,
      confidence: 1,
      slot: 0,
    };
  }

  const hit = getChampionFuse().search(trimmed, { limit: 1 })[0];
  if (!hit || (hit.score ?? 1) > 0.45) return null;

  const key = hit.item.ddragonKey ?? ddragonKeyForChampion(hit.item.label);
  return {
    name: keyToDisplayName(key),
    ddragonKey: key,
    confidence: Math.round((1 - (hit.score ?? 0)) * 1000) / 1000,
    slot: 0,
  };
}

function fuzzyTeam(raw: string): { team: string; slug?: string; confidence: number } {
  const trimmed = raw.trim();
  const norm = normalizeToken(trimmed);

  const slugFromAlias = esports.nameToEsportsSlug?.[norm] ??
    esports.nameToEsportsSlug?.[trimmed.toLowerCase()];
  if (slugFromAlias) {
    return { team: slugToDisplay(slugFromAlias), slug: slugFromAlias, confidence: 1 };
  }
  if (TEAM_CANONICAL[norm]) {
    return { team: TEAM_CANONICAL[norm]!, slug: norm, confidence: 1 };
  }

  const hit = getTeamFuse().search(trimmed, { limit: 1 })[0];
  if (hit && (hit.score ?? 1) <= 0.5) {
    return {
      team: hit.item.label,
      slug: hit.item.slug,
      confidence: Math.round((1 - (hit.score ?? 0)) * 1000) / 1000,
    };
  }

  return { team: trimmed, confidence: 0.5 };
}

interface RawSide {
  teamRaw: string;
  champsRaw: string[];
}

/** Detect user draft text format anywhere in the message. */
export function looksLikeDraftTextInput(message: string): boolean {
  return /[^:(),\s]+\s*:\s*\S+(?:\s+\S+){2,}\s*,\s*[^:(),\s]+\s*:\s*\S+/i.test(message);
}

function parseRawSides(message: string): [RawSide, RawSide] | null {
  const paren = message.match(/\(([^()]+:\s*[^,]+,\s*[^()]+:\s*[^)]+)\)/i);
  const segment = paren?.[1] ?? message;

  const match = segment.match(
    /^\s*([^:,()]+?)\s*:\s*(.+?)\s*,\s*([^:,()]+?)\s*:\s*(.+?)\s*$/is,
  );
  if (!match) return null;

  const champs1 = match[2]!.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const champs2 = match[4]!.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (champs1.length < 3 || champs2.length < 3) return null;

  return [
    { teamRaw: match[1]!.trim(), champsRaw: champs1 },
    { teamRaw: match[3]!.trim(), champsRaw: champs2 },
  ];
}

function buildSide(
  side: "left" | "right",
  raw: RawSide,
): DraftTeamSide {
  const teamMatch = fuzzyTeam(raw.teamRaw);
  const champions: DraftChampionPick[] = [];

  for (let i = 0; i < raw.champsRaw.length; i++) {
    const pick = fuzzyChampion(raw.champsRaw[i]!);
    if (pick) {
      champions.push({ ...pick, slot: i + 1 });
    }
  }

  return {
    side,
    team: teamMatch.team,
    esportsSlug: teamMatch.slug,
    champions,
  };
}

export function extractDraftFromText(message: string): DraftExtraction | null {
  if (!looksLikeDraftTextInput(message)) return null;

  const raw = parseRawSides(message);
  if (!raw) return null;

  const left = buildSide("left", raw[0]);
  const right = buildSide("right", raw[1]);
  const total = left.champions.length + right.champions.length;
  if (total < 6) return null;

  const avgConf = [...left.champions, ...right.champions].reduce(
    (s, c) => s + c.confidence,
    0,
  ) / total;

  return {
    method: "text_input",
    confidence: Math.round(avgConf * 1000) / 1000,
    teams: [left, right],
    extractedAt: new Date().toISOString(),
    notes: `text draft input — ${total}/10 champions matched`,
  };
}
