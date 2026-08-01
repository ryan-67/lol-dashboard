/**
 * Load a draft-complete snapshot from cito_match_drafts (synced by CI).
 * Converts to DraftExtraction so buildPredictionPacket can run full/draft mode.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { DraftExtraction, DraftTeamSide } from "./draftTypes.ts";
import { extractTeamsFromMessage } from "./predictionPacket.ts";

type PickRow = { championName?: string; role?: string | null };

function sideFromPicks(
  team: string,
  side: "left" | "right",
  picks: PickRow[],
): DraftTeamSide {
  return {
    team,
    side,
    champions: (picks ?? [])
      .map((p, i) => {
        const name = String(p.championName ?? "").trim();
        if (!name) return null;
        return {
          name,
          ddragonKey: name.toLowerCase().replace(/[^a-z0-9]/g, ""),
          confidence: 0.95,
          slot: i,
        };
      })
      .filter((c): c is NonNullable<typeof c> => Boolean(c)),
  };
}

/** Resolve live draft for the matchup mentioned in the user message, if locked. */
export async function loadCitoMatchDraftForMessage(
  client: SupabaseClient,
  message: string,
): Promise<DraftExtraction | null> {
  const teams = extractTeamsFromMessage(message);
  if (!teams) return null;
  const [teamA, teamB] = teams;

  const { data, error } = await client
    .from("cito_match_drafts")
    .select(
      "match_id, team_a, team_b, blue_team, red_team, blue_picks, red_picks, blue_bans, red_bans, draft_complete, game_number, fetched_at",
    )
    .eq("draft_complete", true)
    .order("fetched_at", { ascending: false })
    .limit(40);

  if (error || !data?.length) return null;

  const a = teamA.toLowerCase();
  const b = teamB.toLowerCase();
  const row = data.find((r) => {
    const ta = String(r.team_a ?? "").toLowerCase();
    const tb = String(r.team_b ?? "").toLowerCase();
    const blue = String(r.blue_team ?? "").toLowerCase();
    const red = String(r.red_team ?? "").toLowerCase();
    const names = [ta, tb, blue, red];
    const hitA = names.some((n) => n && (n.includes(a) || a.includes(n)));
    const hitB = names.some((n) => n && (n.includes(b) || b.includes(n)));
    return hitA && hitB;
  });
  if (!row) return null;

  const bluePicks = (row.blue_picks ?? []) as PickRow[];
  const redPicks = (row.red_picks ?? []) as PickRow[];
  if (bluePicks.length < 5 || redPicks.length < 5) return null;

  const left = sideFromPicks(
    String(row.blue_team || row.team_a || teamA),
    "left",
    bluePicks,
  );
  const right = sideFromPicks(
    String(row.red_team || row.team_b || teamB),
    "right",
    redPicks,
  );

  return {
    method: "text_input",
    confidence: 0.9,
    teams: [left, right],
    extractedAt: String(row.fetched_at ?? new Date().toISOString()),
    notes: `cito live draft ${row.match_id}${
      row.game_number != null ? ` g${row.game_number}` : ""
    }`,
  };
}
