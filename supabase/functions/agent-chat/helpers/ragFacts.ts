/**
 * Entity + factKind is the first-class key for verified career facts.
 * A newer verified "Faker worlds = 6" MUST replace / beat a stale "4 titles"
 * chunk on the next ask — vector similarity alone cannot keep the old hash.
 */

export interface RagFactChunk {
  content: string;
  source?: string;
  title?: string | null;
  source_url?: string | null;
  entity_id?: string | null;
  entity_type?: string | null;
  fact_hash?: string | null;
  metadata?: Record<string, unknown> | null;
  similarity?: number;
  expires_at?: string | null;
}

export type CareerFactKind = "career" | "roster" | "fact";

const VERIFIED_SOURCES = new Set(["web_verified", "cito_verified"]);

export function normalizeEntityId(raw: string | null | undefined): string {
  return (raw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

/** Stable key: entity + factKind. Split is NOT part of the career key. */
export function careerFactKey(entityId: string, factKind: string): string {
  return `${normalizeEntityId(entityId)}|${String(factKind || "fact").toLowerCase()}`;
}

export function chunkFactKind(chunk: RagFactChunk): string {
  const meta = chunk.metadata ?? {};
  const kind = meta.kind ?? meta.factKind ?? meta.fact_kind;
  if (typeof kind === "string" && kind.trim()) return kind.toLowerCase();
  return "fact";
}

export function chunkWrittenAt(chunk: RagFactChunk): number {
  const meta = chunk.metadata ?? {};
  const raw = meta.written_at ?? meta.writtenAt ?? meta.updated_at;
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) return ms;
  }
  if (typeof chunk.expires_at === "string") {
    const ms = Date.parse(chunk.expires_at);
    if (!Number.isNaN(ms)) return ms;
  }
  return 0;
}

export function chunkEntityId(chunk: RagFactChunk): string {
  const fromField = normalizeEntityId(chunk.entity_id);
  if (fromField) return fromField;
  const fromTitle = normalizeEntityId(chunk.title ?? "");
  if (fromTitle) return fromTitle;
  const meta = chunk.metadata ?? {};
  if (typeof meta.entityId === "string") return normalizeEntityId(meta.entityId);
  if (typeof meta.entity_id === "string") return normalizeEntityId(meta.entity_id);
  return "";
}

/** Years cited in a career-title sentence (2013–2025 Worlds, etc.). */
export function extractTitleYears(text: string): number[] {
  const years = (text.match(/\b(20[0-2]\d|201[0-9])\b/g) ?? [])
    .map((y) => Number(y))
    .filter((y) => y >= 2011 && y <= 2025);
  return [...new Set(years)].sort((a, b) => a - b);
}

/** "won 6 World Championships" / "4 titles" — load-bearing count. */
export function extractTitleCount(text: string): number | null {
  const patterns = [
    /\bwon\s+(\d+)\b/i,
    /\b(\d+)\s+(?:world\s+)?(?:championships?|titles?|cups?|trophies|trophy)\b/i,
    /\b(?:championships?|titles?|cups?)\s*[:=]\s*(\d+)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return Number(m[1]);
  }
  const years = extractTitleYears(text);
  return years.length ? years.length : null;
}

export function isVerifiedSource(source: string | undefined): boolean {
  return VERIFIED_SOURCES.has(String(source ?? ""));
}

export function mentionsCareerEntity(text: string, entityId: string): boolean {
  const ent = normalizeEntityId(entityId);
  if (!ent) return false;
  const blob = normalizeEntityId(text);
  return blob.includes(ent);
}

function titleRichness(chunk: RagFactChunk): number {
  const years = extractTitleYears(chunk.content);
  const count = extractTitleCount(chunk.content) ?? 0;
  return years.length * 10 + count;
}

function isGengLckChunk(chunk: RagFactChunk): boolean {
  const blob = `${chunk.content} ${chunk.title ?? ""} ${chunk.entity_id ?? ""}`;
  return /gen\.?g|\bgeng\b/i.test(blob) && /\blck\b/i.test(blob);
}

function gengPredecessorHit(text: string): boolean {
  return /\b2017\b/.test(text) || /\b2018\b/.test(text) || /\b2020\b/.test(text);
}

function gengHasBoth2023s(text: string): boolean {
  return /2023/.test(text) && /spring/i.test(text) && /summer/i.test(text);
}

/** Newer / richer verified career fact wins. Stale "4 titles" cannot veto 6. */
export function compareCareerChunks(a: RagFactChunk, b: RagFactChunk): number {
  const yearsA = extractTitleYears(a.content);
  const yearsB = extractTitleYears(b.content);
  // Modern Gen.G LCK: a KOO/SSG year-list cannot beat the 5-title 2022–2025 set
  // even when the stale list has a higher raw count.
  if (isGengLckChunk(a) && isGengLckChunk(b)) {
    const predA = gengPredecessorHit(a.content);
    const predB = gengPredecessorHit(b.content);
    if (predA !== predB) return predA ? 1 : -1;
    const both2023A = gengHasBoth2023s(a.content);
    const both2023B = gengHasBoth2023s(b.content);
    if (both2023A !== both2023B) return both2023A ? -1 : 1;
  }

  const has2024or2025A = yearsA.includes(2024) || yearsA.includes(2025);
  const has2024or2025B = yearsB.includes(2024) || yearsB.includes(2025);
  if (has2024or2025A !== has2024or2025B) return has2024or2025A ? -1 : 1;

  const countA = extractTitleCount(a.content) ?? 0;
  const countB = extractTitleCount(b.content) ?? 0;
  if (countA !== countB) {
    if (isGengLckChunk(a) || isGengLckChunk(b)) {
      // Higher count that includes 2017–2020 is the stale list — do not prefer it.
      if (gengPredecessorHit(a.content) !== gengPredecessorHit(b.content)) {
        return gengPredecessorHit(a.content) ? 1 : -1;
      }
    }
    return countB - countA;
  }

  const rich = titleRichness(b) - titleRichness(a);
  if (rich) return rich;

  const written = chunkWrittenAt(b) - chunkWrittenAt(a);
  if (written) return written;

  return (b.similarity ?? 0) - (a.similarity ?? 0);
}

function groupKey(chunk: RagFactChunk): string | null {
  const entity = chunkEntityId(chunk);
  if (!entity) return null;
  return careerFactKey(entity, chunkFactKind(chunk));
}

/**
 * Keep one winning verified fact per entity+factKind.
 * Drop stale siblings (same key, fewer years / lower count / older write).
 * Also drop unkeyed indexer leftovers that contradict the winner
 * (e.g. "Faker has 4 world titles" vs winning "6 … 2024, 2025").
 */
export function selectWinningRagChunks(chunks: RagFactChunk[]): RagFactChunk[] {
  const winners = new Map<string, RagFactChunk>();
  const unkeyed: RagFactChunk[] = [];

  for (const chunk of chunks) {
    const key = groupKey(chunk);
    if (!key || !isVerifiedSource(chunk.source)) {
      unkeyed.push(chunk);
      continue;
    }
    const prev = winners.get(key);
    if (!prev || compareCareerChunks(chunk, prev) < 0) {
      winners.set(key, chunk);
    }
  }

  const kept: RagFactChunk[] = [...winners.values()];
  for (const chunk of unkeyed) {
    if (isStaleRelativeToWinners(chunk, winners)) continue;
    kept.push(chunk);
  }
  return kept;
}

export function isStaleRelativeToWinners(
  chunk: RagFactChunk,
  winners: Map<string, RagFactChunk>,
): boolean {
  const text = chunk.content.toLowerCase();
  const years = extractTitleYears(chunk.content);
  const count = extractTitleCount(chunk.content);

  for (const [key, winner] of winners) {
    const [entity] = key.split("|");
    if (!entity || !mentionsCareerEntity(`${chunk.content} ${chunk.title ?? ""}`, entity)) {
      continue;
    }
    const winYears = extractTitleYears(winner.content);
    const winCount = extractTitleCount(winner.content);
    const staleCount = count != null && winCount != null && count < winCount;
    const missingRecent =
      (winYears.includes(2024) || winYears.includes(2025)) &&
      !years.includes(2024) &&
      !years.includes(2025);
    const fourTitlesVeto =
      /\b4\b/.test(text) &&
      /\b(titles?|championships?|worlds?)\b/.test(text) &&
      (winCount ?? 0) >= 6;
    const gengKooVeto =
      /gen\.?g|\bgeng\b/i.test(`${chunk.content} ${chunk.title ?? ""} ${entity}`) &&
      /\blck\b/i.test(winner.content) &&
      gengPredecessorHit(chunk.content) &&
      (gengHasBoth2023s(winner.content) || (winCount ?? 0) === 5);
    if (staleCount || missingRecent || fourTitlesVeto || gengKooVeto) return true;
  }
  return false;
}

export function hasFreshCareerFact(
  chunks: RagFactChunk[],
  entityId: string,
  factKind = "career",
): boolean {
  const key = careerFactKey(entityId, factKind);
  const winner = selectWinningRagChunks(chunks).find((c) => groupKey(c) === key);
  if (!winner) return false;
  const years = extractTitleYears(winner.content);
  const count = extractTitleCount(winner.content) ?? 0;
  // A GEN LCK list that still credits 2017–2020 is not fresh — look up again.
  if (
    /geng|gen\.?g/i.test(entityId) &&
    gengPredecessorHit(winner.content)
  ) {
    return false;
  }
  return years.includes(2024) || years.includes(2025) || count >= 5;
}

/** True when a stale "4 titles" snippet must not block a 6-title wiki fact. */
/** Drop leftover "Faker has 4 titles" RAG when MATCH_STATS already has 6 cups. */
export function dropChunksContradictingTools(
  chunks: RagFactChunk[],
  matchStats: Record<string, unknown>,
): RagFactChunk[] {
  const blob = JSON.stringify(matchStats ?? {});
  const faker6 = /player_worlds_titles/.test(blob) &&
    /"worldsTitles":\s*6/.test(blob) &&
    /2024/.test(blob) &&
    /2025/.test(blob);
  const geng5 = /team_lck_titles/.test(blob) &&
    /"lckTitles":\s*5/.test(blob) &&
    /2023/.test(blob);
  if (!faker6 && !geng5) return chunks;
  return chunks.filter((c) => {
    if (faker6 && /faker/i.test(`${c.content} ${c.title ?? ""}`)) {
      const years = extractTitleYears(c.content);
      const count = extractTitleCount(c.content);
      if (count != null && count <= 4) return false;
      if (years.length && !years.includes(2024) && !years.includes(2025)) return false;
    }
    if (
      geng5 &&
      /gen\.?g|\bgeng\b/i.test(`${c.content} ${c.title ?? ""}`) &&
      gengPredecessorHit(c.content)
    ) {
      return false;
    }
    return true;
  });
}

export function staleTitleChunkCannotVeto(winnerText: string, staleText: string): boolean {
  const winYears = extractTitleYears(winnerText);
  const winCount = extractTitleCount(winnerText) ?? 0;
  const staleCount = extractTitleCount(staleText) ?? 0;
  const staleYears = extractTitleYears(staleText);
  if (winYears.includes(2024) && winYears.includes(2025) && winCount >= 6) {
    return staleCount <= 4 || (!staleYears.includes(2024) && !staleYears.includes(2025));
  }
  // GEN LCK: stale 6-title 2017/18/20 list cannot veto modern 5 with both 2023s.
  if (
    /gen\.?g/i.test(winnerText) &&
    /\blck\b/i.test(winnerText) &&
    (gengHasBoth2023s(winnerText) || winCount === 5) &&
    (gengPredecessorHit(staleText) || !staleYears.includes(2023))
  ) {
    return true;
  }
  return winCount > staleCount;
}
