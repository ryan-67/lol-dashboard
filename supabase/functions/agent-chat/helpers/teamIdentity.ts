/**
 * Canonical team names + case-insensitive slug dedupe.
 * "KT Rolster" and "kt Rolster" must never become two compare entities.
 */

import { getTeamAliases } from "./mlArtifacts.ts";

const EXTRA_ALIASES: Record<string, string> = {
  t1: "T1",
  "skt t1": "T1",
  skt: "T1",
  "gen.g": "Gen.G",
  geng: "Gen.G",
  "gen g": "Gen.G",
  "gen g esports": "Gen.G",
  hle: "Hanwha Life Esports",
  "hanwha life": "Hanwha Life Esports",
  "hanwha life esports": "Hanwha Life Esports",
  kt: "KT Rolster",
  "kt rolster": "KT Rolster",
  ktr: "KT Rolster",
  dk: "Dplus Kia",
  "dplus kia": "Dplus Kia",
  dplus: "Dplus Kia",
  damwon: "Dplus Kia",
  drx: "DRX",
  ns: "Nongshim RedForce",
  "nongshim": "Nongshim RedForce",
  "nongshim redforce": "Nongshim RedForce",
  "nongshim red force": "Nongshim RedForce",
  bro: "OKSavingsBank BRION",
  brion: "OKSavingsBank BRION",
  "ok brion": "OKSavingsBank BRION",
  "oksavingsbank brion": "OKSavingsBank BRION",
  "hanjin brion": "OKSavingsBank BRION",
  hanjin: "OKSavingsBank BRION",
  bfx: "FearX",
  fearx: "FearX",
  "bnk fearx": "FearX",
  "bnk-fearx": "FearX",
  dns: "DN Freecs",
  "dn soop": "DN Freecs",
  "dn freecs": "DN Freecs",
  "dnsoop": "DN Freecs",
  "dn soopers": "DN Freecs",
  dnsoopers: "DN Freecs",
};

export function teamIdentityKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function canonicalTeamName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  if (EXTRA_ALIASES[lower]) return EXTRA_ALIASES[lower]!;
  const fromFile = getTeamAliases()[lower];
  if (fromFile) return fromFile;
  return trimmed;
}

export function teamsAreSame(a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return false;
  if (teamIdentityKey(a) === teamIdentityKey(b)) return true;
  return teamIdentityKey(canonicalTeamName(a)) === teamIdentityKey(canonicalTeamName(b));
}

/** Collapse KT Rolster / kt Rolster (and alias variants) to one row. */
export function dedupeByTeamIdentity<T>(
  items: T[],
  getName: (item: T) => string,
  merge?: (kept: T, extra: T) => T,
): T[] {
  const acc = new Map<string, T>();
  const display = new Map<string, string>();
  for (const item of items) {
    const raw = getName(item);
    const canon = canonicalTeamName(raw);
    const key = teamIdentityKey(canon);
    if (!key) continue;
    display.set(key, canon);
    const prev = acc.get(key);
    if (!prev) acc.set(key, item);
    else if (merge) acc.set(key, merge(prev, item));
  }
  return [...acc.entries()].map(([key, item]) => {
    const name = display.get(key) ?? getName(item);
    if (name && typeof item === "object" && item !== null && "name" in item) {
      return { ...item, name };
    }
    return item;
  });
}

export function preferCanonicalName<T extends { name: string }>(row: T): T {
  return { ...row, name: canonicalTeamName(row.name) };
}
