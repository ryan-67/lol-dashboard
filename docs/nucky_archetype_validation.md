# Champion archetype validation (Component 4)

> Generated `2026-07-25T06:56:32.310347+00:00` · 172 curated champions

**Ship gate:** PASS (roles usable=True, scaling usable=False, cross-role usable=True)

## Primary role agreement

- Checked: 119 (min 15 games)
- Agreement: **87.4%** (104/119)

| Champion | Curated roles | Empirical primary | Role shift | Games |
| --- | --- | --- | --- | --- |
| Corki | mid | adc | False | 783 |
| Pantheon | support, top, mid | jungle | False | 730 |
| Aatrox | top | jungle | True | 269 |
| Ziggs | mid, support | adc | False | 215 |
| Tristana | adc | top | True | 117 |
| Shen | top | support | True | 114 |
| Mel | mid, support | adc | True | 105 |
| Dr. Mundo | top | jungle | False | 102 |
| Elise | jungle | support | False | 100 |
| Qiyana | mid | jungle | False | 91 |
| Zyra | support | jungle | False | 81 |
| Rek'Sai | jungle | top | False | 80 |
| Malphite | top | jungle | False | 48 |
| Zed | mid | jungle | False | 42 |
| Udyr | jungle | top | False | 27 |

## Scaling / lane-style tag agreement

- **lane_bully ↔ empirical laneBully**: 12.8% (5/39)
- **late/scaling_carry ↔ lateGameScaler**: 8.9% (4/45)
- **early curve ↔ frontLoaded**: 0.0% (0/46)

## Cross-role archetype interaction lifts

- Validated rules: 6/6 (positive lift 3, non-positive 3)

| Attacker | Defender | Lift pp | Games w/ condition |
| --- | --- | --- | --- |
| mobility_high | cc_heavy | -2.0 | 5477 |
| mobility_high | engage | 4.7 | 5326 |
| tank | burst | 1.4 | 3670 |
| poke | dive | -0.6 | 5716 |
| split_push | engage | -0.2 | 1041 |
| anti_dive | dive | 3.7 | 3956 |

Hand-curated archetypes remain the draft-style source of truth. Primary-role agreement and cross-role lifts are the ship criteria. Low scaling-tag agreement means nucky should prefer curated scalingCurve/tags for kit identity and treat champ_scaling.json lane/late flags as supporting evidence only.
