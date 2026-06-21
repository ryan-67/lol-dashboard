# Draft screenshot vision (OpenCV)

Local OpenCV template matcher for broadcast draft / in-game HUD screenshots.
Uses **adaptive grid scan** + parametric layout variants (not fixed to one league/year).
Mirrors the Deno matcher in `supabase/functions/agent-chat/helpers/draftVisionMatch.ts`.

Works across LCK, LPL, LEC, LCS, MSI, Worlds — UI layouts differ; vision JSON in production is the primary path for champion names.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

```bash
python matcher.py --image path/to/draft.png
python matcher.py --image draft.png --json
```

Output JSON schema matches `[DRAFT_EXTRACTED]` in agent-chat.

Templates loaded from:
- Data Dragon champion icons (`src/data/ddragon-champions.json`)
- LoL Esports team logos (`src/data/esports-logos.json` → `static.lolesports.com`)
