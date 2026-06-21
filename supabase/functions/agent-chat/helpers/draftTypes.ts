/** Structured draft extracted from user text input. */
export interface DraftTeamSide {
  team: string;
  side: "left" | "right";
  esportsSlug?: string;
  champions: DraftChampionPick[];
}

export interface DraftChampionPick {
  name: string;
  ddragonKey: string;
  confidence: number;
  slot: number;
}

export interface DraftExtraction {
  method: "text_input";
  confidence: number;
  teams: [DraftTeamSide, DraftTeamSide];
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
