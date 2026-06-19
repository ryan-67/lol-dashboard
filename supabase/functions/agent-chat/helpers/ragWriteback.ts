import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { embedText } from "./openrouter.ts";
import type { VerifiedFact } from "./factVerifier.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMBEDDING_DIM = 1536;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 400;

export interface WritebackResult {
  ok: boolean;
  factHash?: string;
  skipped?: boolean;
  error?: string;
}

export interface WritebackBatchResult {
  succeeded: number;
  failed: number;
  skipped: number;
  results: WritebackResult[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stable dedupe hash for (entity + fact kind + split). */
async function factHash(entityId: string, factKind: string, split: string): Promise<string> {
  const input = `${entityId}|${factKind}|${split}`.toLowerCase();
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function embedWithRetry(apiKey: string, text: string): Promise<number[]> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const vector = await embedText(apiKey, text);
      if (vector.length !== EMBEDDING_DIM) {
        throw new Error(`unexpected embedding dim ${vector.length}, expected ${EMBEDDING_DIM}`);
      }
      return vector;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_MS * (attempt + 1));
      }
    }
  }
  throw lastErr ?? new Error("embedding failed");
}

export interface WritebackInput {
  fact: VerifiedFact;
  apiKey: string;
  split: string;
}

/**
 * Persist a cross-verified FACT into documents (pgvector) so the RAG knowledge base grows.
 * Uses upsert on fact_hash for idempotency. Retries embedding + DB on transient failures.
 */
export async function upsertVerifiedFact(
  service: SupabaseClient,
  { fact, apiKey, split }: WritebackInput,
): Promise<WritebackResult> {
  if (!fact.verified) {
    return { ok: false, skipped: true, error: "not verified" };
  }
  if (fact.factKind !== "career" && fact.factKind !== "roster" && fact.factKind !== "fact") {
    return { ok: false, skipped: true, error: "unsupported fact kind" };
  }

  const hash = await factHash(fact.entityId || fact.fact, fact.factKind, split);

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const embedding = await embedWithRetry(apiKey, fact.fact);

      // Roster/tournament facts go stale fast (30d); career milestones are durable (90d).
      const ttlDays = fact.factKind === "roster" ? 30 : 90;
      const expiresAt = new Date(Date.now() + ttlDays * DAY_MS).toISOString();

      const row = {
        content: fact.fact,
        embedding,
        source: "web_verified" as const,
        source_url: fact.sources[0] ?? "https://liquipedia.net/leagueoflegends/Main_Page",
        chunk_index: 0,
        title: fact.entityId || null,
        content_kind: "fact" as const,
        verification: fact.confidence >= 0.9 ? "cross_verified" as const : "authoritative_single" as const,
        source_urls: fact.sources,
        expires_at: expiresAt,
        entity_type: fact.entityType,
        entity_id: fact.entityId || null,
        fact_hash: hash,
        metadata: {
          kind: fact.factKind,
          confidence: fact.confidence,
          split,
          written_by: "nuckyai_writeback",
          written_at: new Date().toISOString(),
        },
      };

      const { error } = await service.from("documents").upsert(row, {
        onConflict: "fact_hash",
        ignoreDuplicates: false,
      });

      if (error) {
        throw new Error(error.message);
      }

      return { ok: true, factHash: hash };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_MS * (attempt + 1));
      }
    }
  }

  return { ok: false, factHash: hash, error: lastErr?.message ?? "write-back failed" };
}

/**
 * Batch write-back for verified facts discovered during synthesis.
 * Runs sequentially to avoid embedding rate spikes; logs failures for ops visibility.
 */
export async function writeBackVerifiedFacts(
  service: SupabaseClient,
  apiKey: string,
  split: string,
  facts: VerifiedFact[],
): Promise<WritebackBatchResult> {
  const results: WritebackResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const fact of facts) {
    const result = await upsertVerifiedFact(service, { fact, apiKey, split });
    results.push(result);
    if (result.skipped) skipped++;
    else if (result.ok) succeeded++;
    else failed++;
  }

  if (failed > 0) {
    console.error(
      `[nuckyAI write-back] ${failed}/${facts.length} failed`,
      results.filter((r) => !r.ok && !r.skipped),
    );
  } else if (succeeded > 0) {
    console.log(`[nuckyAI write-back] stored ${succeeded} verified fact(s) in pgvector`);
  }

  return { succeeded, failed, skipped, results };
}
