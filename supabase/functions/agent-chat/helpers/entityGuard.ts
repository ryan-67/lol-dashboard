/**
 * Detect non-LoL game entities (Dota, Valorant, etc.) that must not receive
 * invented League stats or analysis.
 */

export interface ForeignEntityHit {
  term: string;
  game: string;
}

/** Terms that are NOT League of Legends champions/items — common cross-game confusion. */
const FOREIGN_ENTITIES: Array<{ pattern: RegExp; term: string; game: string }> = [
  { pattern: /\binvoker\b/i, term: "Invoker", game: "Dota 2" },
  { pattern: /\banti-?mage\b/i, term: "Anti-Mage", game: "Dota 2" },
  { pattern: /\bpudge\b/i, term: "Pudge", game: "Dota 2" },
  { pattern: /\bshadow fiend\b|\bnevermore\b/i, term: "Shadow Fiend", game: "Dota 2" },
  { pattern: /\bphantom assassin\b|\bpa\b(?!\s*(?:score|rate|cs|farm))/i, term: "Phantom Assassin", game: "Dota 2" },
  { pattern: /\bdota\s*(?:2)?\b/i, term: "Dota", game: "Dota 2" },
  { pattern: /\bcsgo\b|\bcounter-?strike\b/i, term: "Counter-Strike", game: "CS" },
  { pattern: /\bvalorant\b/i, term: "Valorant", game: "Valorant" },
  { pattern: /\boverwatch\b/i, term: "Overwatch", game: "Overwatch" },
];

/** User explicitly discusses another game — allow brief mention, still refuse analysis. */
const EXPLICIT_OTHER_GAME =
  /\b(in dota|from dota|dota player|not league|not lol|wrong game|different game)\b/i;

const LOL_ESPORTS_SIGNAL =
  /\b(lol|league of legends|lolesports|lck|lpl|lec|lcs|msi|worlds|pro play|esports)\b/i;

const STAT_OR_ANALYSIS_ASK =
  /\b(stats?|winrate|win rate|kda|gd@?15|matchup|build|pick rate|ban rate|how is|how's|how good|analyze|analysis|compare|vs\.?|versus|meta|draft|roster)\b/i;

export function detectForeignGameEntities(message: string): ForeignEntityHit[] {
  const hits: ForeignEntityHit[] = [];
  const seen = new Set<string>();
  for (const { pattern, term, game } of FOREIGN_ENTITIES) {
    if (pattern.test(message)) {
      const key = `${term}|${game}`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.push({ term, game });
      }
    }
  }
  return hits;
}

/** True when the message centers on a non-LoL entity and expects LoL-style analysis. */
export function shouldRefuseForeignEntity(message: string): ForeignEntityHit | null {
  if (EXPLICIT_OTHER_GAME.test(message)) return null;

  const hits = detectForeignGameEntities(message);
  if (!hits.length) return null;

  // Named foreign champ/hero in an analysis/stats ask → refuse.
  if (STAT_OR_ANALYSIS_ASK.test(message)) return hits[0]!;

  // Foreign entity without LoL esports framing → refuse.
  if (!LOL_ESPORTS_SIGNAL.test(message)) return hits[0]!;

  // In a LoL thread but asking about Invoker etc. as if it's LoL.
  const primary = hits[0]!;
  if (/\b(champion|pick|ban|mid|top|jungle|adc|support|lane|pro)\b/i.test(message)) {
    return primary;
  }

  return null;
}

export function foreignEntityRefusal(hit: ForeignEntityHit): string {
  return `${hit.term}'s ${hit.game} bro — i only break down league esports. hit me with a tier-1 draft or pro play question.`;
}
