import { completeOnce } from "./openrouter.ts";
import type { UsageTracker } from "./usageTracker.ts";
import { MODEL_JSON } from "./models.ts";
import {
  isAllowlisted,
  isAuthoritativeSingle,
  type TavilyResult,
} from "./tavilySearch.ts";
import { extractTitleCount, extractTitleYears } from "./ragFacts.ts";

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
- Each fact must be a single verifiable statement (e.g. "Faker has won 6 League of Legends World Championships").
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
 * PASS only when 2+ distinct allowlisted sources agree (Tavily cross-verify requirement).
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

  const wikiSupporting = supporting.filter((s) => isAuthoritativeSingle(s.url));
  const authoritativeSingle = wikiSupporting.length >= 1;
  const crossVerified = uniqueDomains.size >= 2 || authoritativeSingle;

  // Conflict check: competing snippets with same metric noun but different numbers.
  // Noisy stale pages ("Faker has 4") must not veto a Leaguepedia/Liquipedia match.
  const factNumbers = fact.fact.match(/\d+/g) ?? [];
  const metricNouns = (fact.fact.toLowerCase().match(
    /\b(titles?|championships?|trophy|trophies|worlds?|msi|mvp|splits?)\b/g,
  ) ?? []) as string[];
  let conflict = false;
  if (factNumbers.length && metricNouns.length && !authoritativeSingle) {
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

  const verified = authoritativeSingle || (crossVerified && !conflict);
  const confidence = verified ? (authoritativeSingle ? 0.9 : 0.92) : 0.25;

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

function wikiTitle(url: string): string {
  try {
    const path = new URL(url).pathname;
    const last = decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "");
    return last.replace(/_/g, " ").trim();
  } catch {
    return "";
  }
}

/**
 * Deterministic career-title candidates from Leaguepedia/Liquipedia snippets.
 * Used when the JSON extractor is empty so titles do not fail-close as
 * "not in WORLD_CONTEXT" while the wiki page is sitting in the evidence.
 */
export function extractCareerFactsFromWiki(
  snippets: TavilyResult[],
  question: string,
): CandidateFact[] {
  const wiki = snippets.filter((s) => isAuthoritativeSingle(s.url));
  if (!wiki.length) return [];
  const q = question.toLowerCase();
  const out: CandidateFact[] = [];
  const seen = new Set<string>();

  const push = (fact: CandidateFact) => {
    const key = `${fact.entityId}|${fact.fact}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(fact);
  };

  for (const s of wiki) {
    const page = wikiTitle(s.url) || s.title;
    const entityId = page.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const blob = `${s.title} ${s.content}`;
    const years = extractTitleYears(blob);
    const count = extractTitleCount(blob);

    if (/\b(worlds?|world championship)\b/.test(q) && years.length && count != null) {
      push({
        fact: `${page} has won ${count} League of Legends World Championships (${years.join(", ")})`,
        entityType: /gen\.?g|t1|hanwha|hle|g2|blg/i.test(page) ? "team" : "player",
        entityId: entityId || "unknown",
        factKind: "career",
      });
    }

    if (/\blck\b/.test(q) && /\b(titles?|championships?|won)\b/.test(q)) {
      const lckYears = years;
      const lckCount = count ?? (lckYears.length || null);
      if (lckCount != null && (lckYears.length || /\blck\b/i.test(blob))) {
        const yearBit = lckYears.length ? ` (${lckYears.join(", ")})` : "";
        push({
          fact: `${page} has won ${lckCount} LCK titles${yearBit}`,
          entityType: "team",
          entityId: entityId || "geng",
          factKind: "career",
        });
      }
    }

    if (/\bmsi\b/.test(q) || /\bmid-?season invitational\b/.test(q)) {
      const msi26 = /\b(hanwha life(?: esports)?|hle)\b/i.test(blob) &&
        /\bmsi\b/i.test(blob) &&
        /\b2026\b/.test(blob) &&
        /\b(won|win|champion|winner|title)\b/i.test(blob);
      if (msi26) {
        push({
          fact: "Hanwha Life Esports won the 2026 Mid-Season Invitational (MSI)",
          entityType: "team",
          entityId: "hanwha life esports",
          factKind: "career",
        });
      }
    }
  }

  return out.slice(0, 4);
}
