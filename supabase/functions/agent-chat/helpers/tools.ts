import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MODEL_JSON } from "./models.ts";
import { embedText, completeOnce } from "./openrouter.ts";
import { SQL_GENERATION_SYSTEM_PROMPT, schemaContext } from "./prompts.ts";

const SQL_BLOCKLIST = [
  "drop", "delete", "update", "insert", "alter", "truncate", "grant", "revoke",
  "--", "/*", "union", "exec", "xp_", "sp_", "information_schema", "pg_catalog",
];

export interface VectorChunk {
  content: string;
  source: string;
  metadata: unknown;
  similarity: number;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export function validateSelectSql(sql: string): { ok: boolean; reason?: string } {
  const candidate = sql.trim().toLowerCase();
  if (!candidate.startsWith("select")) {
    return { ok: false, reason: "sql must start with SELECT" };
  }
  for (const bad of SQL_BLOCKLIST) {
    if (candidate.includes(bad)) {
      return { ok: false, reason: `sql contains blocked token: ${bad}` };
    }
  }
  return { ok: true };
}

async function inferOeDataShape(service: SupabaseClient): Promise<string> {
  const { data } = await service
    .from("oe_slices")
    .select("data")
    .limit(1)
    .maybeSingle();

  if (!data || typeof data !== "object") return "unknown";
  const keys = Object.keys((data as Record<string, unknown>).data as Record<string, unknown> ?? {});
  return keys.length ? keys.join(", ") : "unknown";
}

export async function vectorSearch(
  service: SupabaseClient,
  apiKey: string,
  query: string,
): Promise<ToolResult> {
  try {
    const embedding = await embedText(apiKey, query);
    const { data, error } = await service.rpc("match_documents", {
      query_embedding: embedding,
      match_count: 5,
      filter_source: null,
    });

    if (error) {
      return { ok: false, error: `vector search rpc failed: ${error.message}` };
    }

    const chunks = (data ?? []).map((row: any) => ({
      content: row.content,
      source: row.source,
      metadata: row.metadata,
      similarity: row.similarity,
    })) as VectorChunk[];

    return { ok: true, data: chunks };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function generateSql(
  apiKey: string,
  question: string,
  schema: string,
): Promise<string> {
  const response = await completeOnce(apiKey, {
    model: MODEL_JSON,
    messages: [
      { role: "system", content: SQL_GENERATION_SYSTEM_PROMPT },
      { role: "user", content: `${schema}\n\nQuestion: ${question}` },
    ],
    temperature: 0,
    max_tokens: 300,
  });
  return response.replace(/^```sql\s*/i, "").replace(/```$/i, "").trim();
}

export async function sqlQuery(
  service: SupabaseClient,
  apiKey: string,
  naturalLanguageQuestion: string,
): Promise<ToolResult> {
  try {
    const schema = schemaContext(await inferOeDataShape(service));
    const sql = await generateSql(apiKey, naturalLanguageQuestion, schema);

    const check = validateSelectSql(sql);
    if (!check.ok) {
      return { ok: false, error: `sql rejected: ${check.reason}. generated_sql=${sql}` };
    }

    // Requires a DB helper RPC in the project. If missing, return descriptive error.
    const { data, error } = await service.rpc("execute_sql", { query: sql, row_limit: 50 });
    if (error) {
      return {
        ok: false,
        error: `sql execution failed (${error.message}). Ensure rpc execute_sql(query text, row_limit int) exists for service_role. generated_sql=${sql}`,
      };
    }

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}