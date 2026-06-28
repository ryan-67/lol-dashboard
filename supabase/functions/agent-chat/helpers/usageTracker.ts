export interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/** Accumulates OpenRouter token usage across all LLM/embedding calls in one chat turn. */
export class UsageTracker {
  totalTokens = 0;

  add(json: unknown): void {
    const usage = (json as { usage?: OpenRouterUsage })?.usage;
    if (!usage) return;
    const total =
      usage.total_tokens ??
      (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
    if (total > 0) this.totalTokens += total;
  }
}
