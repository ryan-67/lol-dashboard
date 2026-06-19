import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { OEFilterParams } from "./oeData.ts";
import { resolveCurrentRegionalSplit } from "./oeData.ts";
import { isHistoricalQuestion, widenFiltersForQuestion } from "./historicalAnalysis.ts";

const SEASON_WORDS = ["spring", "summer", "winter", "fall", "playoffs", "worlds", "msi"] as const;

function capitalizeSeason(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function hasExplicitTimeScope(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\b(20\d{2})\b/.test(message) ||
    SEASON_WORDS.some((s) => lower.includes(s)) ||
    /\b(this split|current split|right now|currently|this season|yesterday|last night)\b/i.test(message) ||
    isHistoricalQuestion(message)
  );
}

/** Infer league/year/split from the user message — nuckyAI has no dashboard filter bar. */
export function narrowFiltersFromMessage(
  message: string,
  base: OEFilterParams,
): OEFilterParams {
  const filters = { ...base };

  const leagueMatch = message.match(/\b(LCK|LPL|LEC|LCS)\b/i);
  if (leagueMatch) {
    filters.league = leagueMatch[1]!.toUpperCase();
    filters.selectedLeagues = [filters.league];
  }

  const yearMatches = [...message.matchAll(/\b(20\d{2})\b/g)].map((m) => m[1]!);
  if (yearMatches.length === 1) {
    filters.year = yearMatches[0];
    filters.selectedYears = [yearMatches[0]!];
  } else if (yearMatches.length > 1) {
    filters.year = "ALL";
    filters.selectedYears = [...new Set(yearMatches)];
  }

  const lower = message.toLowerCase();
  for (const season of SEASON_WORDS) {
    if (!lower.includes(season)) continue;
    const year =
      filters.selectedYears?.[0] && filters.selectedYears[0] !== "ALL"
        ? filters.selectedYears[0]!
        : message.match(/\b(20\d{2})\b/)?.[1] ?? String(new Date().getFullYear());
    if (season === "worlds" || season === "msi") {
      filters.split = capitalizeSeason(season);
      filters.selectedSplits = [filters.split];
    } else {
      filters.split = `${year} ${capitalizeSeason(season)}`;
      filters.selectedSplits = [filters.split];
      filters.year = year;
      filters.selectedYears = [year];
    }
    break;
  }

  return filters;
}

/** Build OE scope for nuckyAI from the question only — defaults to all tier-1 + latest split. */
export async function buildAgentOEFilters(
  service: SupabaseClient,
  message: string,
): Promise<OEFilterParams> {
  const base: OEFilterParams = {
    league: "All Tier 1",
    selectedLeagues: ["All Tier 1"],
  };

  let filters = narrowFiltersFromMessage(message, base);

  if (!isHistoricalQuestion(message)) {
    const latest = await resolveCurrentRegionalSplit(service);
    if (!hasExplicitTimeScope(message)) {
      filters.split = latest;
      filters.selectedSplits = [latest];
      const year = latest.match(/^(\d{4})\s/)?.[1];
      if (year) {
        filters.year = year;
        filters.selectedYears = [year];
      }
    } else if (!filters.split && !filters.selectedSplits?.length) {
      filters.split = latest;
      filters.selectedSplits = [latest];
    }
  }

  return widenFiltersForQuestion(message, filters);
}
