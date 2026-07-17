# Player power ratings preview (v0.6)

> `scripts/ml/build_player_ratings.py` — **current** active tier-1 players only.
> Current team = most recent game. Active = majority of current team's last
> 8 games (by count, not a day window) + not in roster_overrides.json.
> Role-specific stat weights mirror src/lib/playerRadar.ts's role-based radar
> philosophy (laning/efficiency-heavy for top/mid, kill-participation-heavy for
> jungle/support). Includes matchup-pair laning baselines, a gd_trajectory
> (golddiffat25-golddiffat15) phase-transition stat, playmaking/roam-context
> dampening for jungle/mid/support, an asymmetric opponent-quality adjustment,
> a standout-performance bonus in both wins and losses, and a support-only
> bot-lane duo-partner credit. A team-dependency ('impact') signal was tested
> for 'eye-test greats whose stats undersell them' but rejected — see
> `docs/nucky_v2.md` Component 3 v0.6 for why. See that doc for full methodology.

## Top

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Kiin | Gen.G | LCK | 233 (36.5) | +0.357 | +0.086 | +0.443 |
| 2 | Zeus | Hanwha Life Esports | LCK | 222 (47.3) | +0.283 | +0.086 | +0.369 |
| 3 | Naak Nako | Team Vitality | LEC | 100 (17.2) | +0.305 | -0.054 | +0.251 |
| 4 | Bin | Bilibili Gaming | LPL | 298 (61.5) | +0.141 | +0.016 | +0.157 |
| 5 | PerfecT | KT Rolster | LCK | 177 (32.1) | +0.049 | +0.086 | +0.135 |
| 6 | Zika | Weibo Gaming | LPL | 134 (27.6) | +0.079 | +0.016 | +0.096 |
| 7 | Thanatos | Cloud9 | LCS | 110 (20.7) | +0.144 | -0.048 | +0.095 |
| 8 | HOYA | Ninjas in Pyjamas | LPL | 165 (24.4) | +0.072 | +0.016 | +0.088 |
| 9 | Siwoo | Dplus Kia | LCK | 216 (35.8) | -0.006 | +0.086 | +0.080 |
| 10 | Rooster | Shifters | LEC | 45 (11.5) | +0.127 | -0.054 | +0.073 |
| 11 | Flandre | Anyone's Legend | LPL | 259 (33.3) | +0.011 | +0.016 | +0.027 |
| 12 | Breathe | Invictus Gaming | LPL | 177 (19.6) | +0.010 | +0.016 | +0.026 |
| 13 | sheer | LNG Esports | LPL | 154 (13.5) | +0.003 | +0.016 | +0.019 |
| 14 | Gakgos | FlyQuest | LCS | 50 (20.6) | +0.050 | -0.048 | +0.002 |
| 15 | Burdol | LGD Gaming | LPL | 31 (17.8) | -0.021 | +0.016 | -0.005 |

## Jungle

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Kanavi | Hanwha Life Esports | LCK | 258 (47.5) | +0.163 | +0.086 | +0.249 |
| 2 | Canyon | Gen.G | LCK | 233 (36.5) | +0.123 | +0.086 | +0.209 |
| 3 | Xun | Bilibili Gaming | LPL | 266 (60.9) | +0.173 | +0.016 | +0.189 |
| 4 | Lucid | Dplus Kia | LCK | 213 (33.5) | -0.001 | +0.086 | +0.085 |
| 5 | Oner | T1 | LCK | 255 (60.2) | -0.003 | +0.086 | +0.083 |
| 6 | Tarzan | Anyone's Legend | LPL | 259 (33.3) | +0.053 | +0.016 | +0.070 |
| 7 | Croco | LNG Esports | LPL | 103 (13.5) | +0.050 | +0.016 | +0.066 |
| 8 | Razork | Fnatic | LEC | 123 (12.8) | +0.050 | -0.054 | -0.004 |
| 9 | Elyoya | Movistar KOI | LEC | 160 (23.5) | +0.034 | -0.054 | -0.020 |
| 10 | SkewMond | G2 Esports | LEC | 191 (47.1) | +0.031 | -0.054 | -0.023 |
| 11 | Raptor | FearX | LCK | 188 (29.9) | -0.110 | +0.086 | -0.024 |
| 12 | Sponge | Nongshim RedForce | LCK | 159 (25.0) | -0.111 | +0.086 | -0.025 |
| 13 | Cuzz | KT Rolster | LCK | 196 (32.1) | -0.118 | +0.086 | -0.032 |
| 14 | Willer | DRX | LCK | 77 (28.5) | -0.124 | +0.086 | -0.038 |
| 15 | Josedeodo | Team Liquid | LCS | 66 (39.6) | +0.005 | -0.048 | -0.043 |

## Mid

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Chovy | Gen.G | LCK | 233 (36.5) | +0.448 | +0.086 | +0.534 |
| 2 | Zeka | Hanwha Life Esports | LCK | 222 (47.3) | +0.209 | +0.086 | +0.295 |
| 3 | Knight | Bilibili Gaming | LPL | 298 (61.5) | +0.272 | +0.016 | +0.288 |
| 4 | HongQ | JD Gaming | LPL | 146 (38.9) | +0.244 | +0.016 | +0.260 |
| 5 | Bdd | KT Rolster | LCK | 196 (32.1) | +0.118 | +0.086 | +0.204 |
| 6 | DARKWINGS | Sentinels | LCS | 69 (14.5) | +0.248 | -0.048 | +0.200 |
| 7 | Caps | G2 Esports | LEC | 191 (47.1) | +0.250 | -0.054 | +0.196 |
| 8 | Creme | Top Esports | LPL | 278 (44.6) | +0.173 | +0.016 | +0.189 |
| 9 | Heru | ThunderTalk Gaming | LPL | 42 (18.2) | +0.121 | +0.016 | +0.137 |
| 10 | Quid | Team Liquid | LCS | 137 (40.2) | +0.181 | -0.048 | +0.133 |
| 11 | Shanks | Anyone's Legend | LPL | 259 (33.3) | +0.097 | +0.016 | +0.113 |
| 12 | Quad | FlyQuest | LCS | 131 (21.4) | +0.143 | -0.048 | +0.095 |
| 13 | Saint | Lyon Gaming | LCS | 111 (44.5) | +0.142 | -0.048 | +0.094 |
| 14 | BuLLDoG | LNG Esports | LPL | 115 (13.4) | +0.055 | +0.016 | +0.071 |
| 15 | ShowMaker | Dplus Kia | LCK | 216 (35.8) | -0.022 | +0.086 | +0.064 |

## Adc

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Peyz | T1 | LCK | 238 (59.1) | +0.277 | +0.086 | +0.363 |
| 2 | 1xn | LNG Esports | LPL | 137 (13.3) | +0.112 | +0.016 | +0.128 |
| 3 | Gumayusi | Hanwha Life Esports | LCK | 213 (47.6) | +0.036 | +0.086 | +0.122 |
| 4 | Viper | Bilibili Gaming | LPL | 268 (60.8) | +0.074 | +0.016 | +0.091 |
| 5 | Taeyoon | FearX | LCK | 188 (21.6) | -0.007 | +0.086 | +0.079 |
| 6 | Berserker | Lyon Gaming | LCS | 166 (44.7) | +0.117 | -0.048 | +0.069 |
| 7 | Bvoy | Shopify Rebellion | LCS | 87 (10.9) | +0.110 | -0.048 | +0.061 |
| 8 | Ruler | Gen.G | LCK | 233 (36.5) | -0.058 | +0.086 | +0.028 |
| 9 | Zven | Cloud9 | LCS | 110 (20.7) | +0.073 | -0.048 | +0.025 |
| 10 | Elk | Weibo Gaming | LPL | 261 (28.5) | -0.008 | +0.016 | +0.008 |
| 11 | FBI | Dignitas | LCS | 96 (9.4) | +0.051 | -0.048 | +0.003 |
| 12 | Smash | Dplus Kia | LCK | 109 (34.7) | -0.111 | +0.086 | -0.025 |
| 13 | Ahn | ThunderTalk Gaming | LPL | 84 (16.4) | -0.046 | +0.016 | -0.030 |
| 14 | JackeyLove | Top Esports | LPL | 235 (37.7) | -0.049 | +0.016 | -0.033 |
| 15 | Aiming | KT Rolster | LCK | 194 (29.4) | -0.126 | +0.086 | -0.040 |

## Support

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Delight | Hanwha Life Esports | LCK | 219 (45.2) | +0.319 | +0.086 | +0.405 |
| 2 | Duro | Gen.G | LCK | 233 (36.5) | +0.304 | +0.086 | +0.390 |
| 3 | ON | Bilibili Gaming | LPL | 298 (61.5) | +0.297 | +0.016 | +0.313 |
| 4 | Keria | T1 | LCK | 255 (60.2) | +0.164 | +0.086 | +0.250 |
| 5 | Career | Dplus Kia | LCK | 85 (34.7) | +0.133 | +0.086 | +0.219 |
| 6 | Zhuo | Ninjas in Pyjamas | LPL | 152 (24.9) | +0.176 | +0.016 | +0.192 |
| 7 | Kael | Anyone's Legend | LPL | 259 (33.3) | +0.152 | +0.016 | +0.168 |
| 8 | Effort | KT Rolster | LCK | 49 (28.3) | +0.078 | +0.086 | +0.164 |
| 9 | Isles | Lyon Gaming | LCS | 117 (44.5) | +0.199 | -0.048 | +0.150 |
| 10 | Vampire | JD Gaming | LPL | 235 (39.1) | +0.131 | +0.016 | +0.147 |
| 11 | Fleshy | Team Vitality | LEC | 65 (17.2) | +0.137 | -0.054 | +0.083 |
| 12 | MISSING | LNG Esports | LPL | 122 (13.1) | +0.060 | +0.016 | +0.076 |
| 13 | Alvaro | Movistar KOI | LEC | 160 (23.5) | +0.129 | -0.054 | +0.075 |
| 14 | Erha | Team WE | LPL | 145 (37.7) | +0.042 | +0.016 | +0.059 |
| 15 | Cryogen | FlyQuest | LCS | 45 (20.5) | +0.095 | -0.048 | +0.047 |
