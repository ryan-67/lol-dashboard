import { completeOnce } from "./openrouter.ts";
import { MODEL_VISION } from "./models.ts";
import type { ImageAttachment } from "../pipeline/types.ts";

const EXTRACT_SYSTEM = `You analyze League of Legends esports draft or in-game screenshots.
Extract ONLY what is visible. Plain text, no JSON.

Include when visible:
- Blue/Red side and team names
- Champion picks and bans (in order if shown)
- Tournament, patch, game number, series score
- Any timer/objective state if clearly readable

If the image is NOT a LoL esports draft/game screen, reply exactly: not a league draft image.
Do not guess champions or teams you cannot read.`;

const MAX_ATTACHMENTS = 2;
/** ~3MB base64 cap per image to stay within edge payload limits. */
const MAX_B64_CHARS = 4_000_000;

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
    const dataUrl = `data:${mime};base64,${url}`;
    if (dataUrl.length > MAX_B64_CHARS) return null;
    return dataUrl;
  }
  return null;
}

/**
 * Use OpenRouter vision to read draft screenshots; returned text is appended to the
 * user message before Layer 1/2 so tools can analyze the extracted comp.
 */
export async function extractVisionContext(
  apiKey: string,
  attachments: ImageAttachment[],
): Promise<string> {
  const images = attachments
    .slice(0, MAX_ATTACHMENTS)
    .map(normalizeImageUrl)
    .filter((u): u is string => Boolean(u));

  if (!images.length) return "";

  try {
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      {
        type: "text",
        text: "Extract the draft/picks/bans and sides from this LoL esports screenshot.",
      },
    ];
    for (const url of images) {
      content.push({ type: "image_url", image_url: { url } });
    }

    const raw = await completeOnce(apiKey, {
      model: MODEL_VISION,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user", content },
      ],
      temperature: 0,
      max_tokens: 600,
    });

    const trimmed = raw.trim();
    if (!trimmed || /not a league draft image/i.test(trimmed)) return "";
    return `[VISION_DRAFT]\n${trimmed}`;
  } catch {
    return "";
  }
}
