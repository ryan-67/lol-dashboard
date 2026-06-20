import { completeOnce } from "./openrouter.ts";
import { MODEL_VISION } from "./models.ts";
import type { ImageAttachment } from "../pipeline/types.ts";
import type { DraftExtraction } from "./draftVisionTypes.ts";
import { ddragonKeyForChampion } from "./draftAssetCache.ts";
import { normalizeTeamDisplayName } from "./draftLayoutProfiles.ts";

const EXTRACT_JSON_SYSTEM = `You extract structured draft data from League of Legends esports broadcast screenshots.

Supported layouts:
1) DRAFT OVERLAY — bottom bar with 5 large champion portraits per team, player names below icons, team logos flanking center score (e.g. LCK "FINAL ROUND" screen).
2) IN-GAME HUD — live spectator view: team logos in top scoreboard, 5 circular champion icons stacked on left sidebar and right sidebar, player names beside icons. Bottom stats panel may also show champions.

Rules:
- Identify exactly 5 picked champions per team (10 total). Ignore ban icons unless no picks visible.
- Left side / blue side / first team in scoreboard = leftTeam. Right side / red side = rightTeam.
- Use official champion names: Kai'Sa, Cho'Gath, Dr. Mundo, Jarvan IV, Lee Sin, Miss Fortune, Twisted Fate, Xin Zhao, Wukong, etc.
- Team names: T1, Gen.G, GEN, HLE, DK — use broadcast spelling when visible.
- If a champion is unreadable use "unknown" — never guess.

Reply with ONLY valid JSON (no markdown):
{
  "layout": "draft_overlay" | "ingame_hud",
  "leftTeam": { "name": "string", "champions": ["5 names in slot order"] },
  "rightTeam": { "name": "string", "champions": ["5 names in slot order"] },
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

  const layout = parsed.layout === "ingame_hud" ? "ingame_hud" : "draft_overlay";

  return {
    method: "llm_vision_fallback",
    confidence: Math.round(
      ((leftPicks.length + rightPicks.length) / 10) * 0.85 * 1000,
    ) / 1000,
    teams: [
      {
        side: "left",
        team: normalizeTeamDisplayName(left.name ?? "Blue Side"),
        champions: leftPicks,
      },
      {
        side: "right",
        team: normalizeTeamDisplayName(right.name ?? "Red Side"),
        champions: rightPicks,
      },
    ],
    extractedAt: new Date().toISOString(),
    notes: `vision JSON (${layout}) — ${leftPicks.length + rightPicks.length}/10 champions`,
  };
}

/**
 * Structured vision extraction — primary path for broadcast draft + in-game HUD screenshots.
 */
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
          "Extract both teams' 5 picked champions and team names from this LoL esports screenshot. Return JSON only.",
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

/** Legacy prose vision block (fallback). */
export async function extractVisionContext(
  apiKey: string,
  attachments: ImageAttachment[],
): Promise<string> {
  const draft = await extractVisionDraftJson(apiKey, attachments);
  if (draft) {
    const [left, right] = draft.teams;
    return `[VISION_DRAFT]
layout: ${draft.notes}
left (${left.team}): ${left.champions.map((c) => c.name).join(", ")}
right (${right.team}): ${right.champions.map((c) => c.name).join(", ")}`;
  }
  return "";
}
