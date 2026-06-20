/** Structured draft extracted from a broadcast / champ-select screenshot. */
export interface DraftTeamSide {
  /** Resolved team name when logo match succeeds; otherwise "blue"|"red" side label. */
  team: string;
  side: "left" | "right";
  /** LoL Esports slug when logo matched. */
  esportsSlug?: string;
  logoMatchScore?: number;
  champions: DraftChampionPick[];
}

export interface DraftChampionPick {
  name: string;
  ddragonKey: string;
  confidence: number;
  slot: number;
}

export interface DraftExtraction {
  method: "template_match" | "llm_vision_fallback";
  confidence: number;
  teams: [DraftTeamSide, DraftTeamSide];
  /** ISO timestamp */
  extractedAt: string;
  notes?: string;
}

export function parseDraftExtractionBlock(text: string): DraftExtraction | null {
  const marker = "[DRAFT_EXTRACTED]";
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  const jsonStart = text.indexOf("{", idx);
  if (jsonStart < 0) return null;
  try {
    const parsed = JSON.parse(text.slice(jsonStart)) as DraftExtraction;
    if (!parsed?.teams || parsed.teams.length !== 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function formatDraftExtractionBlock(draft: DraftExtraction): string {
  return `[DRAFT_EXTRACTED]\n${JSON.stringify(draft)}`;
}

export function draftExtractionSummary(draft: DraftExtraction): string {
  const [left, right] = draft.teams;
  const fmt = (side: DraftTeamSide) =>
    `${side.team}: ${side.champions.map((c) => c.name).join(", ") || "unknown"}`;
  return `${fmt(left)} | ${fmt(right)}`;
}
