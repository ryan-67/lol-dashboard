import { completeOnce } from "./openrouter.ts";
import type { UsageTracker } from "./usageTracker.ts";
import { MODEL_JSON } from "./models.ts";
import {
  isAllowlisted,
  isAuthoritativeSingle,
  type TavilyResult,
} from "./tavilySearch.ts";

export interface CandidateFact {
  fact: string;
  entityType: "player" | "team" | "other";
  entityId: string;
  factKind: "career" | "roster" | "fact";
}

export interface VerifiedFact {
  verified: boolean;
  fact: string;
  entityType: CandidateFact["entityType"];
  entityId: string;
  factKind: CandidateFact["factKind"];
  sources: string[];
  confidence: number;
}

const EXTRACT_SYSTEM = `You extract atomic, checkable factual claims from web snippets to answer a LoL esports question.
Return ONLY compact JSON: {"facts":[{"fact": "...", "entityType": "player"|"team"|"other", "entityId": "lowercase canonical name", "factKind": "career"|"roster"|"fact"}]}
Rules:
- Each fact must be a single verifiable statement (e.g. "Faker has won 4 League of Legends World Championships").
- Only include facts directly supported by the snippets. Do not infer or add outside knowledge.
- factKind "career" = titles/championships/awards; "roster" = current team/role/sub; "fact" = other hard facts.
- Max 4 facts. If nothing checkable, return {"facts":[]}.`;

/** Pull candidate facts from web snippets via a small JSON model call. */
export async function extractCandidateFacts(
  apiKey: string,
  snippets: TavilyResult[],
  question: string,
  usageTracker?: UsageTracker,
): Promise<CandidateFact[]> {
  if (!snippets.length) return [];

  const context = snippets
    .map((s, i) => `[${i + 1}] (${s.url})\n${s.content.slice(0, 600)}`)
    .join("\n\n");

  try {
    const raw = await completeOnce(apiKey, {
      model: MODEL_JSON,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user", content: `Question: ${question}\n\nSnippets:\n${context}` },
      ],
      temperature: 0,
      max_tokens: 400,
    }, usageTracker);
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return [];
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const facts = Array.isArray(parsed.facts) ? parsed.facts : [];
    return facts
      .filter((f: Record<string, unknown>) => typeof f.fact === "string" && f.fact.trim())
      .slice(0, 4)
      .map((f: Record<string, unknown>) => ({
        fact: String(f.fact).trim(),
        entityType: ["player", "team"].includes(String(f.entityType))
          ? (String(f.entityType) as CandidateFact["entityType"])
          : "other",
        entityId: String(f.entityId ?? "").toLowerCase().trim(),
        factKind: ["career", "roster"].includes(String(f.factKind))
          ? (String(f.factKind) as CandidateFact["factKind"])
          : "fact",
      }));
  } catch {
    return [];
  }
}

/** A snippet "supports" a fact if it shares the load-bearing numbers and a key name. */
function snippetSupports(fact: string, snippet: TavilyResult): boolean {
  const content = snippet.content.toLowerCase();
  const numbers = fact.match(/\d+/g) ?? [];
  const names = (fact.match(/\b[A-Z][a-zA-Z.]+\b/g) ?? []).map((n) => n.toLowerCase());

  const nameHit = names.some((n) => n.length > 2 && content.includes(n));
  const numberHit = numbers.length === 0 || numbers.every((n) => content.includes(n));
  return nameHit && numberHit;
}

/**
 * Verify a candidate fact against the snippets.
 * PASS if 2+ allowlisted sources agree, OR one Liquipedia/Fandom source matches.
 */
export function verifyFact(fact: CandidateFact, snippets: TavilyResult[]): VerifiedFact {
  const supporting = snippets.filter(
    (s) => isAllowlisted(s.url) && snippetSupports(fact.fact, s),
  );
  const uniqueDomains = new Set(
    supporting.map((s) => {
      try {
        return new URL(s.url).hostname.replace(/^www\./, "");
      } catch {
        return s.url;
      }
    }),
  );
  const sources = supporting.map((s) => s.url);

  const crossVerified = uniqueDomains.size >= 2;
  const authoritativeSingle = supporting.some((s) => isAuthoritativeSingle(s.url));

  // Conflict check: a competing snippet that shares the SAME metric noun (titles /
  // championships / worlds / etc.) but states a different number. We require a metric
  // overlap — not just any shared word like the player name — otherwise a snippet about
  // a different achievement (e.g. Worlds wins) would falsely "conflict" with an LCK count.
  const factNumbers = fact.fact.match(/\d+/g) ?? [];
  const metricNouns = (fact.fact.toLowerCase().match(
    /\b(titles?|championships?|trophy|trophies|worlds?|msi|mvp|splits?)\b/g,
  ) ?? []) as string[];
  let conflict = false;
  if (factNumbers.length && metricNouns.length) {
    for (const s of snippets.filter((x) => isAllowlisted(x.url))) {
      if (snippetSupports(fact.fact, s)) continue;
      const content = s.content.toLowerCase();
      const sharesMetric = metricNouns.some((m) => content.includes(m));
      const hasSomeNumber = /\d/.test(content);
      // shares the metric noun AND has numbers, but none of the fact's numbers appear
      if (sharesMetric && hasSomeNumber && factNumbers.every((n) => !content.includes(n))) {
        conflict = true;
        break;
      }
    }
  }

  // A single authoritative Liquipedia/Leaguepedia match is trusted even if the noisy
  // conflict heuristic fires; cross-verified (2+ sources) still must be conflict-free.
  const verified = authoritativeSingle || (crossVerified && !conflict);
  const confidence = authoritativeSingle ? 0.85 : crossVerified ? (conflict ? 0 : 0.9) : 0.3;

  return {
    verified,
    fact: fact.fact,
    entityType: fact.entityType,
    entityId: fact.entityId,
    factKind: fact.factKind,
    sources: [...new Set(sources)],
    confidence,
  };
}
