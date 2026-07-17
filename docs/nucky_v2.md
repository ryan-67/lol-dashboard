# nucky.gg v2 — Reconstruction Scope

> Status: Phase 1 (model quality) **substantially complete** — proprietary ratings, live-input removal, Deno consumption, scorecard, and archetype validation shipped. Remaining deferred: player outcome-regression layer; Kalshi closing-line archive. Phases 2-4 still planning-only.
> Last updated: 2026-07-16 (Phase 1 build log through Components 1–5 + Deno consumption + scorecard + Component 4 archetype validation)

## Phase 1 build log — self-contained rating system

Replacing live GPR/Kalshi as prediction inputs with a proprietary rating system derived
entirely from OE history (research + architecture: see the
`nucky-model-v2-redesign-proposal` canvas from 2026-07-16). GPR/Kalshi are demoted to
**offline comparison benchmarks only** — never a live input again once the full system
ships. Building in sequenced, independently-testable components; checking in after each.

| # | Component | Status |
| --- | --- | --- |
| 1 | Team Power Rating + Region/League Strength (self-contained series-grain Elo) | **Shipped 2026-07-16** |
| 2 | Champion matchup matrix (same-role + cross-role) + draft-order counter-pick features | **Shipped 2026-07-16** — exported as inference artifact (`champ_matchups.json`); pre-series feature-mart wiring intentionally deferred (draft unknown pre-series) |
| 3 | Role-normalized Player Rating (box-score prior → outcome-regression layer) | v0.6; **wired into pipeline 2026-07-16** — walk-forward roster-strength feature in the mart + `player_ratings.json` artifact + CI |
| 4 | Champion archetype data-validation | **Shipped 2026-07-16** — `validate_champion_archetypes.py` (roles 88% agree; scaling tags reported as weak empirical proxies; cross-role lifts validated) |
| 5 | Rip out live GPR/Kalshi from production blend; formal offline backtest/eval script | **Live blend removed 2026-07-16**; **scorecard shipped** (`build_accuracy_scorecard.py` / `docs/nucky_accuracy_scorecard.md`). Kalshi CLV still blocked on historical archive |
| — | Deno consumption of `champ_matchups.json` / `player_ratings.json` in `predictionPacket.ts` / nuckyAI | **Shipped 2026-07-16** |

### Component 1 — Team Power Rating (2026-07-16)

`scripts/ml/region_elo.py` rewritten: series-grain (not per-game) Elo, K-factor scaled by
context of play (domestic regular 16 / playoffs 24 / international group 24 /
international playoffs 40) and series margin, modeled on Riot's own published GPR
methodology (Elo-based, Team Elo blended 80/20 with League Elo). League/region strength
is now a **live aggregate of member teams' current Elo** (Massey/Colley-style implicit
propagation through cross-region games) instead of a hardcoded region-priors table — no
external signal anywhere in the computation. Added Glicko-2-lite `ratingDeviation`
(widens after 45+ day inactivity).

**Results:**
- Retrained series model on the new strength features: **69.2% holdout accuracy** (vs
  60.3% naive baseline), log-loss 0.590, Brier 0.202 — improved from the prior
  documented baseline (66.0% / 0.616 / 0.212). `diff_strength_elo` remains the dominant
  SHAP feature (0.608 importance, unchanged from before the rewrite).
- Region strength ranked sensibly with **zero hardcoded priors**: LCK 1536 > LPL 1504 >
  LCS 1491 ≈ LEC 1489 — separation emerged purely from cross-region game connectivity.
- Benchmarked against official GPR (`scripts/ml/compare_power_rating_vs_gpr.py`, offline
  only): top 5 teams identical (Gen.G/BLG/T1/HLE/G2, minor order differences), Spearman
  rank correlation 0.645 across all 36 shared teams, 100% top-36 set overlap.
- **Known follow-up:** a handful of lower/mid-tier LEC/LCS orgs (Natus Vincere, Vivo Keyd
  Stars, paiN Gaming, Shifters) rank 16-21 spots higher in our system than GPR — likely
  under-anchored by cross-region games. Target for Component 5's formal backtest
  calibration, not fixed blindly now.
- **Investigated but not fixed (2026-07-16):** Ryan flagged T1 ranking marginally above
  Hanwha Life Esports despite HLE's stronger 2026 Spring/playoffs/MSI form, and Cloud9
  ranking above Lyon Gaming/Team Liquid/Karmine Corp despite GPR ranking all three above
  C9 (C9 isn't even in GPR's top 50). Checked: GPR agrees with Ryan on HLE > T1 (GPR rank
  2 vs 4), so this is a real ordering disagreement, not just a subjective read. Ruled out
  the obvious mechanical explanation — C9's `ratingDeviation` inactivity widening only
  triggers after 45 days and C9 sits at 33 days, so the existing Glicko-lite mechanism
  isn't (yet) the cause. Most likely explanation is a genuine methodology difference in
  how much weight recent-vs-historical results get, not a specific bug — deferred to
  Component 5's formal backtest/calibration pass rather than an ad-hoc tweak now, since
  the fix here should be evidence-driven (backtest against realized series outcomes)
  rather than tuned to match GPR on a handful of anecdotal cases.

**Update (2026-07-16):** `predictionPacket.ts` and `linearScorer.ts` now use nucky's
walk-forward team/region Elo as the only strength-rating source. GPR is retained as a
clearly labeled comparison with **0% model weight**, and Kalshi is display-only market
comparison; neither can change the model probability. `region_strength.json`'s schema gained new
fields (`teamEloOnly`, `ratingDeviation`, `daysSinceLastSeries`) alongside the existing
`rating`/`regionRating`/`homeRegion` (no breaking changes to `RegionStrengthSnapshot`
consumers) — `rating` now means the blended Team Power Score (was raw team-only Elo
before this rewrite).

### Data-quality fix — `LPLOL` league-code contamination (2026-07-16)

Found while eyeballing preliminary team/player rankings against real lolesports
knowledge (see Component 3 preview below): `scripts/ml/oe_leagues.py` had
`"LPL": {"LPL", "LPLOL"}`, treating OE's `LPLOL` tag as an alt-spelling of China's LPL.
It is not — confirmed against oracleselixir.com that `LPLOL` is **"Liga Portuguesa"**, an
unrelated Portuguese minor regional league (team names like "Otter Side", "Odivelas
Sports Club", "Leões Porto Salvo Esports" confirm this). This silently mixed ~40+ amateur
Portuguese teams into the LPL region bucket for region-strength averaging, home-region
inference, and team-profile stats since `region_elo.py`'s rewrite (and likely before).

Fixed by removing `LPLOL` from the region map (with a comment warning against re-adding
without verification) and rebuilding the full pipeline (feature mart → series model →
draft model → trend insights → team profiles → export). Team count in the mart dropped
from 123 to 82 (feature mart) and 90 to 63 (team profiles) — exactly the contaminated
teams being purged. Effects:
- Series model holdout accuracy improved again, **66.0% → 69.2% → 70.1%** across the
  Component 1 rewrite and this fix combined (log-loss 0.616 → 0.590 → 0.576).
- GPR comparison for the real top-36 tier-1 teams was essentially unchanged (they were
  never the contaminated teams) — Spearman correlation still 0.645, confirming the
  legitimate tier-1 ratings were sound all along; the bug only polluted the
  wildcard/lower-tier tail.
- Player/champion preview rankings (Component 3 v0 / champ meta) went from listing
  unrecognizable amateur names in the top 10 to real, correct pro players (Zeus, TheShy,
  Chovy, Caps, Knight, Kanavi, Tarzan, Peyz, Upset, Keria, Meiko, etc.) — see
  `docs/nucky_power_rankings_preview.md`.

**Takeaway for future OE league-code additions:** never merge a new OE league tag into an
existing region bucket by string-similarity alone — verify team names/rosters against
Leaguepedia or oracleselixir.com first.

### Component 2 — Champion matchup matrix + draft-order features (2026-07-16)

`scripts/ml/build_champion_matchups.py` (new): three self-contained pieces, all derived
from OE history, exported to `champ_matchups.json`.

1. **Same-role (direct lane) matchup matrix** — champ-vs-champ win rate + avg GD@15 delta
   per role, gated at 6+ meetings. 37 top / 27 jungle / 31 mid / 23 adc / 25 support
   champs have at least one gated matchup. Spot-checked against real lane knowledge:
   Lee Sin vs Jarvan IV 56.7% WR (+422 GD@15 — matches the "Lee Sin punishes Jarvan early"
   read), Braum vs Nautilus 54.4% WR (+107 GD@15 — matches "Braum wins the poke war").
   Vayne-vs-Sion and Kindred-vs-Trundle came back empty/thin — not a bug, those are
   genuinely rare picks in the 2025-2026 pro meta window (Vayne is essentially never
   played top lane; Kindred has been out of the jungle meta).
2. **Draft-order reconstruction** — OE only gives each team's picks/bans in
   *team-relative* order (`pick1..pick5`) plus a `firstPick` flag, not the true
   interleaved global sequence. Rebuilt the actual reveal order from the standard
   competitive ban/pick slot pattern (unaffected by 2026's First Selection side/order
   decoupling — that only changes *who* drafts first, not the phase shape) so we know
   exactly what the enemy had revealed before each pick. From that: a "counter-pick edge"
   signal — teams landing at least one matrix-defined favorable response (>=55% WR pick
   vs the most-recently-revealed enemy champ in the same role) won **54.6%** of those
   games vs **48.0%** for teams landing zero (point-biserial r=0.064, n=6,888 games) —
   modest but real and correctly signed.
3. **Cross-role archetype interaction lift** — validated hand-curated tag interactions
   (`champion_archetypes.json`) against realized win rates instead of assuming them.
   Results were mixed/weak on this simple univariate pass: `mobility_high` vs `engage`
   showed a genuine +6.1pp lift (n=4,933 vs 268), but several others (`mobility_high` vs
   `cc_heavy`, `split_push` vs `engage`) came back slightly negative or noisy, likely
   confounded by team-quality selection effects (teams that draft an unusual comp for a
   given matchup aren't a random sample). **Not treated as validated rules** — flagged as
   candidate model features instead, since the trained model can control for confounders
   a two-bucket comparison can't.

**Update (2026-07-16, see "Pipeline integration" below):** the same-role matchup matrix
is now exported as an inference artifact (`champ_matchups.json`) rather than forced into
the series feature mart — it's only meaningful once champions are known, which pre-series
prediction isn't. The walk-forward-safe player-quality signal *did* get wired into the
mart (`roster_box_z`), which is the leakage-safe piece that made sense to add. The
original leakage caveat below still stands as the reason the matchup matrix is not a
pre-series training feature:

**Not (pre-series) wired:** using the full-history matrix to score the same historical
games that built it would leak future information into training, the same discipline
`region_elo.py` already enforces for Elo lookups. A walk-forward matchup matrix belongs
to draft-mode/inference scoring, not the pre-draft series model.

### Component 3 v0.2 — Player Rating fixes (2026-07-16)

The v0.1 box-score-composite preview (shown to Ryan for an eye-test review) had real
methodological gaps. Rewritten as `scripts/ml/build_player_ratings.py`, replacing the
player-rating logic in `preview_top_rankings.py`:

1. **Region-bucketing bug** — v0.1 checked a player's region with a hardcoded
   `{LCK,LPL,LEC,LCS}` string set instead of calling `region_for_league_code()`, so any
   player whose games were tagged `LTA`/`LTA N` (2025's LCS rebrand) fell into a
   meaningless "OTHER" bucket even though they're legitimately LCS (e.g. Bwipo/FlyQuest,
   Srtty/Dignitas, Castle/Disguised, Bvoy/Shopify Rebellion all got miscategorized this
   way). Fixed by using the real region mapping everywhere.
2. **Tier-1 scope was already structurally correct** — `ALL_ALLOWED_LEAGUE_CODES`
   already excludes pure non-tier-1 domestic leagues, and any non-tier-1 org that shows
   up at all only got in via an international row (MSI/Worlds/First Stand within the
   2025-2026 load window — an implicit "played international in the last ~2 years"
   gate). Traced every "OTHER"-region player from the v0.1 output back to its raw OE
   league tags to confirm this — e.g. Doggo (CTBC Flying Oyster) and Hizto (Team Secret
   Whales) are LCP (non-tier-1) orgs but both played First Stand/MSI/EWC, so they
   correctly stay in the pool; a genuinely domestic-only non-tier-1 player never enters
   the dataset in the first place.
3. **Champion-context normalization (new)** — v0.1 z-scored stats against the role+region
   median, which rewards playing carry/lane-bully champions and penalizes utility picks
   regardless of skill. Now z-scores against a *global champion+role* baseline (min 8
   games; falls back to role-global for thin champ samples), so a Karma support and a
   Nautilus support are judged against what THAT champion is expected to produce.
4. **Explicit region-strength shift (new)** — box-score stats alone can't reveal that a
   league is tougher (a dominant player crushing weak opposition can post better raw
   numbers than an elite player fighting elite opposition to a narrow lead). Added an
   additive shift = `(regionRating - meanRegionRating) / 100`, using the already-shipped
   Component 1 region Elo (LCK 1536 / LPL 1512 / LEC 1489 / LCS 1491 as of this build) —
   LCK gets +0.287, LPL +0.054, LEC -0.180, LCS -0.160. Individually exceptional
   performances can still overcome it (see validation below).
5. **Recency** — half-life shortened from 120 days to 50 days (matches the codebase's
   existing "current form" convention) so the current/most-recent split dominates, since
   this rating is meant to feed live matchup predictions, not summarize a career.

**Validation against eye-test (jungle, Ryan's stated expectation: Kanavi, Canyon, Xun,
Tarzan, Oner, Lucid, Inspired, SkewMond, Monki, Cuzz):** rebuilt top 10 is Lucid, Croco,
Raptor, Kanavi, Willer, Canyon, Sponge, Oner, Cuzz, Tarzan — 6 of the 10 named players
land exactly in the rebuilt top 10 (Kanavi, Canyon, Tarzan, Oner, Lucid, Cuzz), Xun/Monki
rank just outside (#12/#15), and Croco/Raptor/Willer/Sponge (all legit LCK junglers) fill
the rest. **Inspired scored negatively** on pure box-score (-0.191) — a known, accepted
limitation: Inspired is a well-documented case of a player whose vision/tracking/
shotcalling value doesn't show up in gd15/damage/KP box-score stats, exactly the kind of
"good without stats reflecting it" case flagged as an accepted limitation of a
box-score-only layer (the outcome-regression layer, once built, is the intended fix for
this — it credits win contribution net of teammates/opponents, not raw box-score output).
**SkewMond** does break positive (+0.03, an LEC player beating the region-shift penalty
on individual merit) but lands just outside the top-15 cutoff shown.

Preview written to `docs/nucky_player_ratings_preview.md`. Not yet done: outcome-
regression layer (the harder half of Component 3, deferred per the original sequencing).

### Component 3 v0.3 + dashboard scope fixes (2026-07-16)

Eye-test pass on v0.2 surfaced: outdated team labels (Peyz→JDG not T1), inactive
players still ranked (369, Lehends), Bin missing from top-15 tops, and dashboard
defaulting to Summer / showing TSW+FURIA in Teams/Players tabs.

**Dashboard — Summer default:** live `oe_slices` had a leftover `2026 Summer|INT`
slice containing only FURIA (3 mis-bucketed games). `splitHasGameData` /
`pickDefaultDashboardSplit` / agent `resolveSplit` treated INT-only data as enough
to pick Summer. Fixed: catalog + default-split logic now require tier-1 league
rows; INT-only regional seasons are ignored. Combined Spring (incl. MSI) is the
correct default until domestic Summer starts.

**Dashboard — guest orgs in tabs:** Teams / Players / Matchups now filter to
tier-1 leagues only (`isTier1Team` / `isTier1Player`). Guest orgs (TSW, FURIA)
still get identity pages via entity routes + INT merge; they no longer appear in
the main tabs.

**Player ratings v0.3:**
- Current team = most recent game (Peyz→T1, Berserker→LYON, Gumayusi→HLE,
  Viper→BLG, Kanavi→HLE, Quid→TL).
- Active = appeared in current team's last 8 games within 35 days (drops 369 /
  Lehends; NS last played May 31 so whole roster correctly falls out of the
  "currently competing" window during MSI).
- Region shift scaled down to 0.30; box-score blends 45% champ-context + 55%
  role-global — Bin now #7 top (was missing from top 15).
- Only players whose current team is tier-1 are ranked.

### Component 3 v0.4 — contextual match scoring + activity-gate rework (2026-07-16)

Eye-test pass on v0.3 (mostly-right names, disagreed-with orderings) plus explicit
follow-up requests: score every match with champion/matchup context, strength-of-opponent,
and team-result context; fix the day-windowed activity gate; decide global-vs-league
baselines.

**1. Matchup-pair-specific baseline for laning stats.** `gd15`/`csd15` (OE's own
gold/CS diff at 15 — already direct-opponent-relative) are now compared against a
`(role, champion, opp_champion)` baseline (min 6 meetings, same gate as
`build_champion_matchups.py`), not just a champion-level baseline. Blend when a matchup
baseline exists: 40% matchup-pair + 25% champion-context + 35% role-global. This is what
makes a Sion who beats his Jayce's expected early lead score far above a "merely average
Sion game" — the *baseline itself* already encodes that Sion is expected to lose the lane,
so beating it is what gets rewarded, not the raw (still-probably-negative) gd15 number.
Non-laning stats (`dmg_share`, `dpm`, `kp15`) stay at the existing 45/55 champ/role-global
blend — they reflect a champion's team-wide win condition, not a specific opponent
matchup, so a matchup-pair baseline wouldn't be meaningful for them.

**2. Two-pass opponent-quality adjustment.** Pass 1 computes an unadjusted, recency+SOS-
weighted skill reference per `(role, player)` from *all* history (not gated by
activity/tier-1 — even a since-retired direct opponent needs a defensible reference).
Pass 2 looks up the direct opposing laner's pass-1 reference for every game and applies
an **asymmetric** multiplier (`exp(opp_z / 1.2)`, clipped to [0.75, 1.35]): a positive
performance is scaled *up* against a strong opponent (reward for punching up); a negative
performance is scaled *down in magnitude* against a strong opponent (dampened, not
amplified — losing to a better player is expected) and scaled up in magnitude against a
weak one (losing to someone worse is worse than expected). Validated: Zeus's pass-1 top
reference is `+0.233` (top-9 of all tops), so a strong game from a lower-reference
opponent (e.g. Doran, `-0.149`) into Zeus would get boosted ~21% — matches the exact
"Doran playing well into Zeus should be rewarded significantly" ask.

**3. Small team-result adjustment.** `+0.05` for a win / `-0.05` for a loss, plus a
"clutch" bonus (`0.5 * (adjusted_z - 0.30)`) when the opponent-adjusted performance is a
standout (>0.30) despite a loss — rewarding not being the reason for the team's loss.
Deliberately small relative to the box-score signal (±0.05 vs. a typical composite_z
range of roughly ±0.3-0.5) — the user asked for "slightly rewarded/penalized," not a
result-dominated score.

**4. Global vs. league baselines — kept global, on purpose.** All three baseline layers
(role-global, champion+role, matchup-pair) stay pooled across regions rather than
splitting by league. Matchup-pair samples are already thin (min 6 meetings); splitting
further by region would starve most pairs of any usable signal, and defeats the actual
goal of these rankings (comparing players *across* regions, who rarely play each other).
Region-level meta/skill differences are instead handled by two mechanisms that are kept
deliberately separate from the per-stat baselines so each is independently tunable: (a)
the existing aggregate-level `REGION_SHIFT_SCALE` nudge, and (b) the new opponent-quality
adjustment above, which already picks up regional strength implicitly (LCK/LPL direct
opponents generally carry a higher pass-1 reference) without smearing every stat's
baseline by region first.

**5. Activity gate: games-count majority, not a day window.** `ACTIVE_WINDOW_DAYS` is
gone. A `(player, team)` pair is now active if the player appeared in a **majority**
(>=50%) of that team's **last 8 games, by count** — no day cutoff. This fixes the case
the day-window couldn't handle: a team on a month+ break after an early elimination
(failed to qualify for MSI, out in Spring playoffs) still has a well-defined "last 8
games" roster, whenever they were played. Majority (not "any appearance") also stops a
one-off substitute appearance from counting as the current starter. Live bio/roster
cross-checking (Leaguepedia Cargo API, CitoAPI) was evaluated and deliberately **not**
wired into the ETL pipeline — it adds a network dependency and rate-limit risk to a
pipeline that needs to run unattended in CI, for a problem the games-count fix already
solves for the general case. The one remaining gap the games-count heuristic can't see —
a retirement/step-down with no newer OE game yet to reflect it — is handled the same way
`rosterContext.ts` already handles curated live facts: a small manually-maintained
`data/ml/roster_overrides.json` force-exclude list, seeded with `369` and `Lehends`.

**Known limitation surfaced by this pass, reported transparently rather than tuned
away:** Bin (LPL top, Bilibili Gaming) sits at #15/top, not top-3, under v0.4. Diagnosis:
his `gd15`/`csd15` z-scores are strongly positive (+0.28 / +0.48 avg, elite laning), but
his `dmg_share` and `kp15` are consistently *below* the champion-level baseline across
every champion he plays (e.g. Renekton 19.3 vs. a 20.2 baseline, Rumble 24.0 vs. 26.1) —
a real, verified characteristic of his play (BLG's damage comes from Knight/Elk), not a
normalization bug. Under the current holistic weighting (`gd15` 30% / `dmg_share` 25% /
`kp15` 15% / `dpm` 20% / `csd15` 10%), that drags his composite back toward neutral
despite elite laning. This is exactly the gap flagged going into this pass — "a great
player's stats don't always live up to their actual skill" — and box-score-only scoring
has a real ceiling on solving it. Deferred rather than hand-tuned per-player: the planned
outcome-regression layer (Component 3's second half, still not started) can *learn* which
stats actually predict wins per role instead of using hand-set `ROLE_STAT_WEIGHTS`, which
is the principled fix. Re-preview and re-validate against eye-test after that ships.

Preview regenerated at `docs/nucky_player_ratings_preview.md` (v0.4 header).

### Component 3 v0.5 — role-aligned stat weights, symmetric standout bonus, phase-transition, playstyle context (2026-07-16)

Four follow-up asks after the v0.4 eye-test: role-specific stat weighting matching
the dashboard's own radar-chart philosophy; a standout-performance bonus for wins too
(not just losses); a quantified early/mid-game phase-transition signal; and
contextualizing playmaking/roam playstyles (Faker-style wave-sacrifice-to-roam) so
they aren't just read as bad laning.

**1. Role-specific weights now mirror `src/lib/playerRadar.ts`'s
`ROLE_PERFORMANCE_SCORE_WEIGHTS`.** That's the dashboard's own existing answer to "which
stats matter for this role" (used for radar charts + in-game Champion OP Score), and it
already de-emphasizes raw damage share for top/mid in favor of efficiency
(`dmg%/gold%`, `dmg/gold`) and kda/laning — exactly because a role like top has too much
carry-vs-tank variance for a flat damage number to mean much. The ML pipeline's weights
were NOT aligned with this (top was weighting `dmg_share`+`dpm` at 0.45 combined) — that
mismatch is the real root cause of Bin ranking #15 in v0.4 despite elite laning. Rebuilt
the stat set to add OE-derivable equivalents of the radar's stats: `kda`, `kp_full`
(full-game kill participation, from the `teamkills` column — more robust than the old
@15-only `kp15`, which is now removed), `dmg_gold_ratio` (`damageshare/earnedgoldshare`),
`dmg_per_gold` (`dpm/earned gpm`), `ka_per_min`, `wards_destroyed` (`wardskilled`),
`vision_score`, `first_blood`. `turretPlates` (used on the radar) has zero populated
rows in this OE dataset (checked: 0/61,290 player rows) so it's not usable here; its
weight is folded into laning stats instead. New weights per role (all sum to 1.0):

- top: `gd15` .27 / `csd15` .21 / `xpd15` .10 / `kda` .20 / `dmg_gold_ratio` .12 /
  `gd_trajectory` .10 — **no raw damage weight at all**, matching the radar.
- jungle: `kda` .18 / `ka_per_min` .22 / `kp_full` .18 / `dmg_gold_ratio` .12 / `gd15` .10
  / `first_blood` .10 / `gd_trajectory` .10.
- mid: `kda` .18 / `gd15` .18 / `csd15` .12 / `dmg_gold_ratio` .18 / `dmg_per_gold` .14 /
  `xpd15` .10 / `gd_trajectory` .10.
- adc: `kda` .18 / `gd15` .18 / `dmg_gold_ratio` .18 / `dmg_per_gold` .14 / `dpm` .12 /
  `csd15` .10 / `gd_trajectory` .10.
- support: `kda` .22 / `ka_per_min` .22 / `wards_destroyed` .18 / `kp_full` .13 /
  `vision_score` .10 / `gd15` .05 / `gd_trajectory` .10.

Result: **Bin #15 → #4 top**, **Viper #20 (outside top-15) → #4 adc** — both now land
where the eye test expects, without hand-tuning either player individually. All other
role top-15s stayed sane on re-check (Kanavi/Canyon/Xun top-3 jungle, Chovy/Zeka/Knight
top-3 mid, Peyz #1 adc, Duro/Delight/ON top-3 support).

**2. Standout-performance bonus, now symmetric across win AND loss.** Added a
role-specific "carry stat" subset (`EXCEPTIONAL_STATS_BY_ROLE` — e.g. adc:
`dpm`/`dmg_gold_ratio`/`dmg_per_gold`; jungle/support: `kp_full`/`ka_per_min`/
`first_blood` or `wards_destroyed`) distinct from the main composite (avoids
double-counting). When that subset's average z clears a threshold (1.25), a bonus
applies regardless of result — the old loss-only "clutch" bonus is now a special case
of this (losses get a 1.3x multiplier on the same bonus, since standing out in a loss
also answers "were you the reason your team lost", but wins are no longer excluded).
Validated: 1,645/34,450 rows (4.8%) clear the threshold, split 941 wins / 704 losses,
with comparable average total adjustment magnitude between the two (+0.103 win /
+0.101 loss) — the mechanism fires roughly symmetrically as intended.

**3. Phase-transition signal via OE's @10/@15/@20/@25 checkpoints.** OE actually
carries `golddiffat10/15/20/25` (+ xp/cs/kills/assists/deaths at each), not just @15 —
missed in v0.3/v0.4. Added `gd_trajectory = golddiffat25 - golddiffat15`: did the player
extend an early lead into mid-game, or let it evaporate (or claw one back). Gets the same
matchup-pair baseline treatment as gd15/csd15/xpd15 (e.g. "this exact matchup typically
swings back toward the scaling champion by 25" becomes the expectation, not a flat
number). A genuine **late**-game (post-25) signal needs real minute-by-minute timeline
data, which OE doesn't have and Cito's gold-timeline supplement only partially covers
(see `cito_supplement.py`'s own doc comment — it's explicitly never attached to
historical training rows for exactly this reliability reason). Scraping gol.gg/tabesports
for their timeline charts was considered and rejected as a data dependency — fragile,
liable to break silently, and a last resort rather than a real fix. Revisit if a
reliable full-timeline source shows up (GRID/Bayes/PandaScore Enterprise are already
tracked as a stretch-goal live-data source elsewhere in this doc).

**4. Playmaking/roam-context dampening (jungle/mid/support only).** Added
`playmaking15` (kills+assists@15) purely as a context signal (not a scored stat — that
would double-count with `ka_per_min`/`kp_full`). When it's well above baseline (z > 0.5)
for jungle/mid/support, the penalty on a *negative* `gd15`/`csd15`/`xpd15` z in that same
game is dampened by up to 40% — never erased, never flipped into a bonus, and a positive
laning z is untouched either way. Rationale matches the ask directly: a Faker-style roam
that sacrifices CS/gold/XP for a successful gank already self-corrects part of the
deficit via the kill itself (which is why the dampening is bounded, not full), and the
full-game `ka_per_min`/`kp_full` weight already gives roaming credit separately — this
piece specifically stops the *laning* stats from double-punishing the same decision.
Validated: 3,517 (role, stat) cells across the dataset had their penalty softened.

Preview regenerated at `docs/nucky_player_ratings_preview.md` (v0.5 header).

### Component 3 v0.6 — support duo-partner credit; team-dependency ("impact") signal tested and rejected (2026-07-16)

Follow-up ask after the v0.5 eye-test: Kingen/DuDu missing from top-lane top-15,
Inspired missing from jungle top-15, ShowMaker low / Faker absent from mid top-15, and
Keria only #6 in support despite being widely regarded as the best in the world. The
underlying ask for the last three: find a way to quantify "eye-test" players whose
individual box score doesn't reflect their real impact — team-wide macro, shotcalling,
duo-lane playmaking that shows up in a teammate's stat line, not their own.

**1. Kingen/DuDu — diagnosed, not a bug.** Both have solid laning z's (Kingen `gd15`
+0.003/`csd15` -0.038, DuDu `gd15` +0.125/`csd15` +0.215 — DuDu's is genuinely good). What
drags them down: negative `kda` z for both (-0.19/-0.23) and negative `gd_trajectory`
(-0.12/-0.21, leads evaporating by 25), plus their teams' recent form is brutal — DN
SOOPers won **3% of DuDu's last 30 games**, Nongshim RedForce 23% of Kingen's. Recency
weighting (50-day half-life) and the small win/loss result adjustment both correctly
pick this up. This is a genuinely different situation from Inspired/Faker/ShowMaker:
individually-fine players whose *team* is in a recent nosedive, not stats failing to see
individual quality. Flagging the tension rather than unilaterally acting on it: the
result-adjustment term was explicitly requested in an earlier pass ("team result still
matters... slightly rewarded for winning, slightly penalized for losing") and removing
or shrinking it to rescue cases like this would cut against that ask — left as-is for now.

**2. Duo-lane partner credit for support — shipped.** Support's own box-score stats
under-represent a role that's fundamentally about creating advantage for a teammate.
Added `z_partner_gd15`: the bot-lane ADC partner's own `z_gd15` (already role-correctly
computed) joined onto the support's row for the same game/team, weighted at 0.10 in
support's composite (other weights rescaled down proportionally: `kda` .20/`ka_per_min`
.20/`wards_destroyed` .16/`kp_full` .12/`vision_score` .09/`gd15` .04/`gd_trajectory`
.09/`partner_gd15` .10). Result: **Keria #6 → #4** — his own ADC partner (Peyz)'s laning
is mildly positive, giving a small, honest bump. Doesn't fully close the gap to
Delight/Duro/ON (#1-3): that gap (~0.15 in box-score terms) is driven by Keria's own
`kda`/`ka_per_min`/`wards_destroyed`/`vision_score` numbers being comparatively lower,
not by a lack of partner credit — reported plainly rather than force-closed.

**3. Team-dependency ("impact") regression — tested, deliberately NOT shipped.** Built
exactly what was asked: per (player, current team), fit `team_won ~ own composite_z +
teammates_avg_composite_z` (linear probability model) across that player's games on
their current roster, z-score the coefficient on their own `composite_z` against role
peers (the `teammates_avg_composite_z` term is what isolates "does the team swing with
THIS player specifically" from "the whole team had a good game" — a shared confound that
would otherwise make every player look falsely "load-bearing"). Applied one-sided
(bonus only, per the explicit ask not to punish players on stacked rosters where several
stars can each carry a game) with Empirical-Bayes shrinkage toward the role mean
(weight = games / (games + 40)) to tame small samples.

Honest result: **it does not work for the intended cases.** Inspired/Faker/ShowMaker/
Keria all land within ~±0.4 SD of their role's *average* dependency coefficient — the
data does not show their teams' win rates swinging harder with their box score than a
role-typical player's. Read charitably, this itself is informative: their real impact —
if it's real, and the eye test is a reasonable prior that it is — most likely lives in
things that don't correlate with their *own stat-line variance* game to game
(shotcalling, review, decision quality), which a box-score-driven regression structurally
cannot see regardless of how the regression is specified. Worse, even after shrinkage the
signal visibly **injected noise elsewhere**: players with clearly below-average box
scores got pushed up double digits in rank on thin samples (`Zdz`, box-score z of
**-0.072**, into top-lane #7; `Burdol`, 31 games, into #5), and it pushed Kingen/DuDu
*further* down by inserting those noise-boosted names above them — the opposite of the
intent. Given it doesn't achieve the goal and has a demonstrated real cost, the mechanism
was removed from the shipped score entirely (not merely disabled) rather than kept as
dead weight; git history has the full implementation if a future revisit with more
seasons of data (or a better target variable than binary win/loss) looks promising.

Preview regenerated at `docs/nucky_player_ratings_preview.md` (v0.6 header).

### Pipeline integration — wire Components 2 & 3 into training + CI (2026-07-16)

Until now Components 2–3 produced standalone artifacts/previews that the trained
series model and the automated retrain never actually consumed. Closed that gap.

**1. Component 3 → walk-forward roster-strength feature in the series mart.**
`build_player_ratings.compute_player_game_box_z()` / `build_roster_box_z()` (new,
reusable) expose the per-game, role-normalized player `composite_z` aggregated to a
single per-(gameid, team) `roster_box_z` scalar. `build_feature_mart.py` joins it onto
the team-game rows and registers `roster_box_z` in `feature_engineering.TEAM_ROLL_STATS`,
so it flows through the *same* `shift(1)+rolling` machinery as every other stat →
`team/opp/diff_roster_box_z_last{10,20}`, walk-forward safe by construction.
- **Leakage discipline:** uses `composite_z` (pure box-score blend), NOT
  `adjusted_composite_z` — the latter bakes in the win/loss result bonus and would leak
  the label into a training feature. The z-baselines are population mean/std
  normalization constants (not label info), and the rolling `shift(1)` guarantees no
  same-team future game feeds a series' own feature.
- **Coverage fix:** `load_rows()` now takes an optional `years` arg; the mart passes its
  full 24-month+warmup window (not just the ranking's 2025–2026), so `roster_box_z`
  covers 100% of team-game rows instead of 46.9%.

**Controlled A/B (identical mart, `--no-cito`, only difference = the roster feature):**

| Model (XGBoost, full walk-forward) | log-loss | Brier | accuracy |
| --- | --- | --- | --- |
| with `roster_box_z` | **0.5798** | **0.1966** | **0.701** |
| without | 0.5851 | 0.2000 | 0.692 |

A real, correctly-signed improvement on the full feature set (−0.005 log-loss, +0.9pp
acc). After SHAP pruning the two variants are ~neutral (pruning is stochastic and kept
different feature counts), and `roster_box_z` doesn't crack the top-30 SHAP features —
so this is a **mild, non-harmful** additive signal, not a headline mover. Reported at
face value rather than oversold. 5 of its 6 rolling columns survive pruning
(`diff_roster_box_z_last10` was the only drop). Production retrain (with Cito supplement)
holds serve: pruned holdout **log-loss 0.5787 / Brier 0.1969 / acc 0.702**, ship-gate
PASS, no regression vs the prior 0.576/0.196/0.701.

**2. Component 2 → inference artifact, not a pre-series feature.** The champ-matchup
matrix is only meaningful once champions are known, which pre-series prediction isn't —
so forcing it into the series mart makes no sense. Instead `champ_matchups.json` is now
in `export_artifacts.py`'s deploy list (for draft-mode edge scoring / nuckyAI), and
`build_champion_matchups.load_archetypes()` falls back to the static curated file so the
cross-role lift works regardless of pipeline step order.

**3. `player_ratings.json` artifact.** `build_player_ratings.py` now also writes a
machine-readable `player_ratings.json` (top-25 per role with score components), deployed
alongside the rest for the dashboard / nuckyAI to surface current player power rankings.

**4. CI.** `.github/workflows/refresh-data.yml`'s retrain block now runs
`build_champion_matchups.py` + `build_player_ratings.py` before `export_artifacts.py`, so
both refresh automatically on every OE-change-triggered retrain (still non-blocking via
`continue-on-error`).

### Deno consumption + Component 5 live-input removal (2026-07-16)

`mlArtifacts.ts` now imports typed `champ_matchups.json` and `player_ratings.json`
accessors, and `predictionPacket.ts` exposes both to nuckyAI:

- `player_power`: the current active roster's role-based rank, power score, and sample,
  in top/jungle/mid/adc/support order. This is explanation context only; it does not
  double-count the `roster_box_z` signal already learned by the structural model.
- `direct_matchups`: same-role champion-vs-champion games, win rate, and GD@15. Draft
  scoring gets a deliberately small adjustment: observed win-rate edge is shrunk toward
  50% by `games / (games + 20)`, then only 35% of that shrunk edge is applied and averaged
  across resolved roles. This keeps six-game matchups from overpowering team context.

Component 5's live blend is removed:

- `teamStrengthRating()` now reads nucky's `region_strength.json` first and exclusively.
- Live/deploy-time GPR has **0% score weight** and appears only as an explicitly labeled
  external comparison.
- Kalshi no longer anchors or modifies the win probability. `kalshi_edge` compares the
  market against the already-final nucky probability.
- Synthesis instructions explicitly describe the probability as nucky-only and forbid
  implying that GPR/Kalshi changed it.

Focused Deno regression tests cover internal-Elo priority, player-power packet context,
direct matchup evidence, and probability invariance with/without a Kalshi quote.

**Remaining Phase 1 work:** deferred player outcome-regression layer (eye-test
impact signal was tested and rejected earlier); Kalshi closing-line archive once
enough settled markets are stored. Formal scorecard + Component 4 archetype
validation shipped 2026-07-16 — see `docs/nucky_accuracy_scorecard.md` and
`docs/nucky_archetype_validation.md`.

### Component 4 — champion archetype data-validation (2026-07-16)

`scripts/ml/validate_champion_archetypes.py` compares the hand-curated
`champion_archetypes.json` against OE-derived artifacts:

- **Primary roles:** 88.1% agreement with empirical recent/season primary role
  (min 15 games). Mismatches are mostly real flex/meta shifts (Corki ADC, Camille
  support, Ziggs ADC) — nucky already prefers `champ_role_profile` recent role
  facts in draft grounding.
- **Scaling / lane tags vs `champ_scaling.json`:** low agreement (lane_bully
  ~13%, late scaler ~7%). Finding: DPM-tercile / GD@15 flags are too noisy to
  validate kit tags. Curated `scalingCurve`/tags stay authoritative; empirical
  scaling stays supporting evidence only (matches existing Deno prompt guidance).
- **Cross-role interaction lifts:** all 6 curated attacker→defender rules have
  sufficient sample; 3 show positive lift (e.g. mobility_high vs engage +6.1pp).

Ship gate = primary-role usability + cross-role rules present → **PASS**.

### Accuracy scorecard (Component 5 remainder) — 2026-07-16

`scripts/ml/build_accuracy_scorecard.py` runs leakage-free walk-forward OOF
predictions on the production pruned feature set and writes
`docs/nucky_accuracy_scorecard.md` + `accuracy_scorecard.json`:

- Aggregate: **log-loss 0.565 / acc 0.715** vs naive baseline 0.703 / 0.621 — **PASS**
- Slices: by league, patch bucket, confidence bucket
- Offline GPR rank Spearman included as comparison-only benchmark
- Kalshi closing-line section explicitly **blocked** until a historical market archive exists

Both builders are in the CI retrain block (after player ratings, before export).

---

## Product thesis

**nucky is the LoL esports analyst platform** — not a raw-stats clone of gol.gg, and not a lookup chatbot dressed as an analyst like [tabesports.gg](https://tabesports.gg/).

Differentiation stack:

| Layer | What nucky owns | Vs. competitors |
| --- | --- | --- |
| Analyst intelligence | Calibrated nucky-only series prediction + explainable pre-match/draft breakdowns; GPR/Kalshi are comparison benchmarks only | \tab looks up data; gol.gg has no model |
| Analytics depth | Recency hub, identity pages, radars, series/tournament surfaces already ship | \tab Explore is thinner; gol.gg is tables-first |
| Product spine | **nucky** (AI) as the front door + search, present on every data surface | \tab does this well for chat; nucky must match IA, not copy aesthetics |
| Community | Series-page discussion + post-match player scoring | English LoL esports has no dedicated equivalent |
| Live match hub | **Out until reliable live data exists** | Do not ship half-working live |

Hard constraint: marketing nucky as an “intelligent analyst” only tracks if the model’s public accuracy story backs it up. Current ship baseline (~66% series accuracy vs ~59.5% naive; log-loss 0.616 / Brier 0.212) is a real edge, not yet “sharp analyst” trust. Prediction UI is quality-gated.

---

## Decisions locked (2026-07-15)

| Topic | Decision |
| --- | --- |
| Prediction Model tab timing | **Quality-first** — hold the tab until backtesting + accuracy scorecard exist |
| Live Match Hub | **Remove entirely** from nav/routes until a reliable live source is secured |
| Third-party live data (GRID / Bayes / PandaScore Enterprise) | **Stretch goal** — not a relaunch blocker |
| Community hub ambition | **Full v1** (threads + numeric ratings + tags), but sequenced after core |
| Discussion surfaces (v1) | **Series / match pages only** |
| Scoring mechanic | **Both** 1–10 fan ratings and MVP/choke-style tags |
| Moderation at launch | Login + rate limits + word filters + report button (AI assist later) |
| Sequencing | Community **after** analytics/prediction core + IA/nav ship |

---

## Information architecture (target)

Left sidebar:

1. **nucky** — primary product. Chat + entity search (type a player/team/champion/tournament → identity page). Suggested prompts; conversation history may live here or under Chats.
2. **hub** — recency overview (weekly/monthly recaps, standouts). Today’s Overview tab, re-homed.
3. **dashboard** — main analytics Explore (recent series by default; players / teams / champions / matchups). First-class peer to nucky — nucky’s Explore depth is a strength; do not bury it the way \tab buries Explore under chat.
4. **prediction model** — EDGE-terminal-style board: model vs market, confidence, pre-match explainability. Subscription-gated. **Ships only after Phase 1 gate.**
5. **chats** — conversation history / management (if not fully folded into nucky).

Entity pages get contextual **Ask nucky about X** chips (match \tab’s Explore↔AI loop without adopting \tab’s soft rounded SaaS look).

**Visual direction:** keep nucky’s distinct research-terminal identity (mono/gold/sharp language). Raise polish, motion, and clarity. Prefer “\tab interaction clarity + nucky visual identity” over aesthetic convergence. Use design skills (`impeccable`, taste-skill, ui-ux-pro-max) when building UI phases.

---

## Phased roadmap

### Phase 1 — Model quality (gate for everything premium)

Do this before major user-facing rebuild.

- Benchmark nucky probability vs Kalshi closing lines without feeding the market into the model. **Blocked** on historical Kalshi archive (scorecard documents this explicitly).
- Benchmark nucky team/region Elo vs GPR and realized cross-region outcomes. **Done** offline via scorecard GPR section + `compare_power_rating_vs_gpr.py`.
- Fix no-live-market fallback so wrong-favorite misfires (e.g. BLG vs HLE-class failures) do not silently ship. **Addressed** by removing Kalshi from the probability blend (nucky-only scoring); remaining calibration tracked via scorecard confidence buckets.
- Rolling **accuracy scorecard** (log-loss, accuracy, calibration by league / patch / confidence bucket vs naive baseline) — **Shipped** (`docs/nucky_accuracy_scorecard.md`).
- Retrain + deploy discipline remains intentional (human checkpoint before edge deploy).

**Exit criteria:** documented holdout metrics ✅; near-public scorecard ✅; known fallback bugs closed for live market bleed ✅. Deferred: outcome-regression layer; Kalshi CLV archive.

### Phase 2 — IA / nav / nucky-as-spine

- **Marketing landing shipped early (2026-07-17):** `/` is the product landing page (Terminal Editorial); dashboard Overview moved to `/dashboard`. Marketing routes: `/features`, `/pricing`, `/faq`, `/terms`, `/private-policy`.
- New sidebar IA above.
- nucky as chat + smart entity search; `/chat` + `/duo` (split chat|dashboard) + default-page preference (`chat` | `dashboard` | `duo`) for logged-in `/` redirects.
- Ask-nucky entry points on player / team / champion / series / tournament pages.
- Visual / motion pass (counters, chart/radar reveal-on-scroll, premium micro-motion) without generic AI-slop aesthetics.
- **Remove Live Match Hub** from nav, routes, and cross-links.

**Exit criteria:** one coherent shell; AI discoverable from data pages; no live surface visible.

### Phase 3 — Prediction Model tab

Depends on Phase 1 exit.

- Upcoming series ranked by model edge vs market (Kalshi and/or books).
- Pre-match breakdowns explaining the pick (nucky Elo, form, player power, direct matchups, draft/comp style, clutch factors, etc.).
- Track-record / scorecard surface adjacent to picks.
- Subscription gate (costly surface).

**Exit criteria:** gated tab live only with defensible track record; empty or stub UI is not acceptable as “launch.”

### Phase 4 — Community hub v1

Depends on Phases 2–3 (or at least Phase 2) shipping first.

- Threads on **series/match pages only**.
- Post-match **1–10 player ratings** + **tags** (MVP, choke, etc.).
- Auth required; rate limits; word filters; report button.
- Schema + moderation queue treated as a real product surface, not a widget bolt-on.

**Exit criteria:** posting works end-to-end on series pages with basic moderation; abuse path exists.

### Later / stretch

- Paid live data evaluation (GRID / Bayes / PandaScore Enterprise sales motions).
- Live Match Hub rebuild only after a reliable feed exists.
- AI-assisted moderation once volume justifies cost.
- Broader discussion surfaces (players/teams) only after series-only v1 proves engagement.
- Public API / MCP — optional competitive response to \tab, not required for v2 thesis.

---

## Explicit non-goals (near term)

- Matching \tab’s rounded SaaS chrome pixel-for-pixel.
- Shipping Live Match Hub “in development” teasers in primary nav.
- Launching Prediction Model as ungated beta before accuracy work.
- Building community on every entity page in v1.
- Treating “more OE columns” alone as the model upgrade (blend calibration + market + failure modes matter more short-term).

---

## Skill / tooling support for implementation

### How Cursor picks these up

1. **Third-party import (toggle ON):** Settings → Rules, Skills, Subagents → “Include third-party Plugins, Skills, and other configs.” This imports Claude Code user skills from `~/.claude/skills` (taste-skill, impeccable, gpt-tasteskill, playwright-skill, GSD, etc.). They are usable in Cursor agent sessions when this toggle is enabled.
2. **Project skills:** `.cursor/skills/` and `.agents/skills/` (mirrored). Locked via `skills-lock.json` at repo root.
3. **Restart Cursor** (or reload window) after installing new skill folders so Settings rescans them.

### Installed for this repo (2026-07-15)

| Skill / tool | Role for v2 | Location |
| --- | --- | --- |
| taste-skill (`design-taste-frontend`, `gpt-taste`, `high-end-visual-design` / soft, `redesign-existing-projects`) | Anti-slop UI, redesign audit, motion-aware product surfaces | `.agents/skills` + `.cursor/skills` |
| `ui-ux-pro-max` | Searchable design DB (styles, palettes, charts, GSAP presets) — run `scripts/search.py` | same + `uipro` CLI |
| `playwright-skill` + Playwright Chromium | Browser QA / visual checks | same (browsers via `npm run setup`) |
| `nucky-dashboard-motion` | Counters, chart/radar scroll-reveal on top of `src/theme/animations.ts` | project skill |
| `nucky-supabase` | Supabase CLI deploy/migrate conventions for nucky | project skill |
| impeccable (user-level) | Shape / critique / animate / polish | `~/.claude/skills/impeccable` |
| Supabase CLI | `supabase` 2.106.x on PATH | global CLI |

Note: nucky already ships GSAP helpers (`animateCounter`, `animateRadarDraw`, `scrollEntrance*`, `<AnimatedCounter />`, `useScrollReveal`). The motion skill extends those; it does not require a new animation library.

---

## Open questions (defer until phase kickoff)

1. Exact placement of conversation history (`nucky` vs dedicated `chats`).
2. Free vs paid boundaries for nucky chat once the product spine moves to the home surface.
3. Whether the accuracy scorecard is fully public on day one of Phase 3 or Pro-only with a lighter public teaser.
4. Community reputation / anti-brigading rules beyond the strict gate.
5. Whether Hub stays named “hub” or rebrands (e.g. Overview / Pulse).

---

## Related docs

- `docs/nuckyAI_model.md` — model phases, metrics, known limitations
- `docs/CITOAPI.md` — OE + Cito hybrid; live hub deferred
- Competitive canvas: nucky vs \tab analysis (session artifact)
)
