import { completeOnce } from "./openrouter.ts";
import { MODEL_VISION } from "./models.ts";
import type { ImageAttachment } from "../pipeline/types.ts";
import type { DraftExtraction } from "./draftVisionTypes.ts";
import { ddragonKeyForChampion, getEsportsNameIndex } from "./draftAssetCache.ts";
import { normalizeTeamDisplayName } from "./draftLayoutProfiles.ts";

const EXTRACT_JSON_SYSTEM = `You extract structured draft data from League of Legends esports broadcast screenshots.

IMPORTANT: Broadcast UIs vary by league (LCK, LPL, LEC, LCS), tournament (MSI, Worlds, regional playoffs), and year. Do NOT assume one fixed layout. Adapt to what you see.

Two common families (implementations differ):
1) DRAFT / CHAMP-SELECT OVERLAY — post-draft or pick screen: usually 5 champion portraits per team, often in a bottom or lower-third bar; team logos may be center-bottom, corners, or flanking a score. Player names may appear under icons.
2) IN-GAME SPECTATOR HUD — live game: team logos typically in top scoreboard; 5 champion icons often stacked on left/right edges and/or repeated in a bottom stats panel. Icons may be circular or square.

Extraction rules:
- Find exactly 5 PICKED champions per team (10 total). Ignore ban icons unless picks are not visible.
- Assign champions to leftTeam vs rightTeam by screen position (broadcast left vs broadcast right), not by guessing colors.
- Read team names from visible logos/text/scoreboard — any tier-1 org (T1, Gen.G, BLG, G2, C9, etc.).
- Use official champion names exactly (Kai'Sa, Cho'Gath, Jarvan IV, Wukong, etc.).
- If unreadable, use "unknown" — never invent.
- Order champions in slot order as shown (left-to-right for horizontal rows, top-to-bottom for vertical stacks).

Reply with ONLY valid JSON (no markdown):
{
  "layout": "draft_overlay" | "ingame_hud" | "other",
  "league": "string or null (e.g. LCK, LPL, LEC, LCS, MSI, Worlds)",
  "leftTeam": { "name": "string", "champions": ["5 names"] },
  "rightTeam": { "name": "string", "champions": ["5 names"] },
  "patch": "string or null",
  "tournament": "string or null"
}

If NOT a LoL esports draft/game screen: {"error":"not a league draft image"}`;

const MAX_ATTACHMENTS = 2;
const MAX_B64_CHARS = 5_000_000;

function normalizeImageUrl(att: ImageAttachment): string | null {
  const url = att.url?.trim();
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("data:image/")) {
    if (url.length > MAX_B64_CHARS) return null;
    return url;
  }
  if (/^[A-Za-z0-9+/=]+$/.test(url.slice(0, 64))) {
    const mime = att.mimeType?.startsWith("image/") ? att.mimeType : "image/png";
    return `data:${mime};base64,${url}`;
  }
  return null;
}

function parseVisionJson(raw: string): DraftExtraction | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  if (parsed.error || /not a league draft/i.test(String(parsed.error ?? ""))) return null;

  const left = parsed.leftTeam as { name?: string; champions?: string[] } | undefined;
  const right = parsed.rightTeam as { name?: string; champions?: string[] } | undefined;
  if (!left?.champions?.length || !right?.champions?.length) return null;

  const nameIndex = getEsportsNameIndex();
  const toPicks = (names: string[]) =>
    names
      .filter((n) => n && n.toLowerCase() !== "unknown")
      .slice(0, 5)
      .map((name, i) => ({
        name: name.trim(),
        ddragonKey: ddragonKeyForChampion(name.trim()),
        confidence: 0.85,
        slot: i + 1,
      }));

  const leftPicks = toPicks(left.champions);
  const rightPicks = toPicks(right.champions);
  if (leftPicks.length + rightPicks.length < 6) return null;

  const layout = String(parsed.layout ?? "other");
  const league = parsed.league ? String(parsed.league) : null;

  return {
    method: "llm_vision_fallback",
    confidence: Math.round(
      ((leftPicks.length + rightPicks.length) / 10) * 0.85 * 1000,
    ) / 1000,
    teams: [
      {
        side: "left",
        team: normalizeTeamDisplayName(left.name ?? "Blue Side", nameIndex),
        champions: leftPicks,
      },
      {
        side: "right",
        team: normalizeTeamDisplayName(right.name ?? "Red Side", nameIndex),
        champions: rightPicks,
      },
    ],
    extractedAt: new Date().toISOString(),
    notes: `vision JSON (${layout}${league ? `, ${league}` : ""}) — ${leftPicks.length + rightPicks.length}/10 champions`,
  };
}

export async function extractVisionDraftJson(
  apiKey: string,
  attachments: ImageAttachment[],
): Promise<DraftExtraction | null> {
  const images = attachments
    .slice(0, MAX_ATTACHMENTS)
    .map(normalizeImageUrl)
    .filter((u): u is string => Boolean(u));

  if (!images.length) return null;

  try {
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      {
        type: "text",
        text:
          "Identify both teams and their 5 picked champions from this LoL esports screenshot. UI may be any tier-1 league or tournament — adapt to the layout you see. JSON only.",
      },
    ];
    for (const url of images) {
      content.push({ type: "image_url", image_url: { url } });
    }

    const raw = await completeOnce(apiKey, {
      model: MODEL_VISION,
      messages: [
        { role: "system", content: EXTRACT_JSON_SYSTEM },
        { role: "user", content },
      ],
      temperature: 0,
      max_tokens: 900,
    });

    return parseVisionJson(raw);
  } catch {
    return null;
  }
}

export async function extractVisionContext(
  apiKey: string,
  attachments: ImageAttachment[],
): Promise<string> {
  const draft = await extractVisionDraftJson(apiKey, attachments);
  if (draft) {
    const [left, right] = draft.teams;
    return `[VISION_DRAFT]
${draft.notes}
left (${left.team}): ${left.champions.map((c) => c.name).join(", ")}
right (${right.team}): ${right.champions.map((c) => c.name).join(", ")}`;
  }
  return "";
}
