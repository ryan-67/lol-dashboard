# Champion archetype validation (Component 4)

> Generated `2026-07-17T07:03:42.648468+00:00` · 172 curated champions

**Ship gate:** PASS (roles usable=True, scaling usable=False, cross-role usable=True)

## Primary role agreement

- Checked: 118 (min 15 games)
- Agreement: **88.1%** (104/118)

| Champion | Curated roles | Empirical primary | Role shift | Games |
| --- | --- | --- | --- | --- |
| Corki | mid | adc | False | 751 |
| Pantheon | support, top, mid | jungle | False | 672 |
| Aatrox | top | jungle | True | 255 |
| Ziggs | mid, support | adc | False | 190 |
| Tristana | adc | mid | False | 110 |
| Dr. Mundo | top | jungle | False | 97 |
| Elise | jungle | support | False | 96 |
| Mel | mid, support | adc | True | 93 |
| Qiyana | mid | jungle | False | 83 |
| Zyra | support | jungle | False | 81 |
| Rek'Sai | jungle | top | False | 78 |
| Malphite | top | jungle | False | 42 |
| Zed | mid | jungle | False | 41 |
| Udyr | jungle | top | False | 26 |

## Scaling / lane-style tag agreement

- **lane_bully ↔ empirical laneBully**: 12.8% (5/39)
- **late/scaling_carry ↔ lateGameScaler**: 7.0% (3/43)
- **early curve ↔ frontLoaded**: 2.3% (1/43)

## Cross-role archetype interaction lifts

- Validated rules: 6/6 (positive lift 3, non-positive 3)

| Attacker | Defender | Lift pp | Games w/ condition |
| --- | --- | --- | --- |
| mobility_high | cc_heavy | -1.4 | 5071 |
| mobility_high | engage | 6.1 | 4933 |
| tank | burst | 1.0 | 3438 |
| poke | dive | -2.0 | 5294 |
| split_push | engage | -3.4 | 986 |
| anti_dive | dive | 1.8 | 3674 |

Hand-curated archetypes remain the draft-style source of truth. Primary-role agreement and cross-role lifts are the ship criteria. Low scaling-tag agreement means nucky should prefer curated scalingCurve/tags for kit identity and treat champ_scaling.json lane/late flags as supporting evidence only.
